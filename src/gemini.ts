import { GEMINI_MODELS } from './config'

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Opts {
  /** Tiempo máximo por intento antes de darlo por colgado. */
  timeoutMs?: number
  /** Modelo preferido (se prueba primero; después sigue la cadena de respaldo). */
  preferred?: string
  /** Avisa qué modelo se está probando. */
  onTry?: (model: string) => void
  /** Avisa el estado ("Gemini está saturado, reintentando… 2/4"). */
  onStatus?: (msg: string) => void
}

/** Esperas entre reintentos de un mismo modelo cuando Google dice "alta demanda". */
const RETRY_DELAYS = [2000, 5000, 10000]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Errores transitorios: 503 / 429 / 500 / 502 / 504 o mensajes de saturación. */
const isTransient = (status: number, msg: string) =>
  [429, 500, 502, 503, 504].includes(status) ||
  /high demand|overloaded|unavailable|try again later|resource.?exhausted|deadline/i.test(msg)

const isRetired = (status: number, msg: string) =>
  status === 404 || /no longer available|not found|not supported|deprecated/i.test(msg)

/** Cadena de modelos: el preferido primero y luego los de respaldo, sin repetir. */
export function modelChain(preferred?: string): string[] {
  return [...new Set([preferred?.trim(), ...GEMINI_MODELS].filter((m): m is string => !!m))]
}

/**
 * Llama a Gemini con modelos de respaldo y reintentos:
 *  - saturación (503/429/500…): reintenta con espera creciente (2, 5 y 10 s) y después pasa al modelo siguiente;
 *  - modelo retirado, sin respuesta a tiempo o error de red: pasa al siguiente;
 *  - error real (clave inválida, pedido mal armado): corta.
 * Pide "thinking" bajo (más rápido y estable); si el modelo no lo acepta (HTTP 400) reintenta sin ese parámetro.
 * Si todo falla, el error detalla qué pasó con cada modelo.
 */
export async function generate(key: string, body: any, opts: Opts = {}): Promise<any> {
  const timeoutMs = opts.timeoutMs ?? 25000
  const notas: string[] = []
  const chain = modelChain(opts.preferred)

  for (let mi = 0; mi < chain.length; mi++) {
    const model = chain[mi]
    opts.onTry?.(model)
    let withThinking = true
    let intento = 0
    const maxIntentos = RETRY_DELAYS.length + 1
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const reqBody = withThinking
        ? { ...body, generationConfig: { ...(body.generationConfig ?? {}), thinkingConfig: { thinkingLevel: 'low' } } }
        : body
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      let status = 0
      let msg = ''
      let net = ''
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody),
            signal: ctrl.signal,
          },
        )
        const json: any = await res.json().catch(() => ({}))
        if (res.ok) return { ...json, _model: model }
        status = res.status
        msg = json?.error?.message ?? `HTTP ${res.status}`
      } catch (e) {
        net = (e as Error)?.name === 'AbortError' ? `sin respuesta en ${Math.round(timeoutMs / 1000)} s` : `error de red (${(e as Error)?.message})`
      } finally {
        clearTimeout(timer)
      }

      if (net) {
        notas.push(`${model}: ${net}`)
        break // siguiente modelo
      }
      // El parámetro de thinking puede no estar soportado: se reintenta igual pero sin él.
      if (status === 400 && withThinking && /thinking|thought/i.test(msg)) {
        withThinking = false
        continue
      }
      if (isRetired(status, msg)) {
        notas.push(`${model}: no disponible`)
        break
      }
      if (isTransient(status, msg)) {
        if (intento < RETRY_DELAYS.length) {
          const wait = RETRY_DELAYS[intento]
          intento++
          opts.onStatus?.(`Gemini está saturado (${model}), reintentando… ${intento}/${maxIntentos - 1}`)
          await sleep(wait)
          opts.onTry?.(model)
          continue
        }
        notas.push(`${model}: saturado (HTTP ${status || '?'}) tras ${maxIntentos} intentos`)
        if (mi < chain.length - 1) opts.onStatus?.(`${model} sigue saturado, probando otro modelo…`)
        break
      }
      // Error real de la API (clave inválida, pedido incorrecto…): no tiene sentido seguir.
      throw new Error(`${model}: ${msg}${notas.length ? ` · antes: ${notas.join(' · ')}` : ''}`)
    }
  }
  throw new Error(notas.join(' · ') || 'Sin respuesta de Gemini')
}

export interface GeminiModelInfo {
  id: string
  nombre: string
}

/** Modelos que la clave puede usar con generateContent (GET /v1beta/models). */
export async function listModels(key: string): Promise<GeminiModelInfo[]> {
  const out: GeminiModelInfo[] = []
  let pageToken = ''
  for (let i = 0; i < 5; i++) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 20000)
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`,
        { signal: ctrl.signal },
      )
      const json: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
      for (const m of json.models ?? []) {
        if ((m.supportedGenerationMethods ?? []).includes('generateContent'))
          out.push({ id: String(m.name).replace(/^models\//, ''), nombre: m.displayName ?? '' })
      }
      pageToken = json.nextPageToken ?? ''
      if (!pageToken) break
    } finally {
      clearTimeout(t)
    }
  }
  return out
}

/** Junta el texto de la respuesta (los modelos nuevos pueden devolver varias partes). */
export function textOf(json: any): string {
  const parts: any[] = json?.candidates?.[0]?.content?.parts ?? []
  return parts
    .filter((p) => typeof p?.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('')
    .trim()
}
