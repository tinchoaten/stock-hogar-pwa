import { GEMINI_MODELS } from './config'

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Opts {
  /** Tiempo máximo por modelo antes de pasar al siguiente. */
  timeoutMs?: number
  /** Avisa qué modelo se está probando (para mostrarlo en pantalla). */
  onTry?: (model: string) => void
}

/**
 * Llama a Gemini probando los modelos en orden. Pasa al siguiente si Google retiró el modelo
 * ("no longer available", 404…) o si no responde a tiempo. Si todos fallan, el error detalla
 * qué pasó con cada uno.
 */
export async function generate(key: string, body: unknown, opts: Opts = {}): Promise<any> {
  const timeoutMs = opts.timeoutMs ?? 25000
  const notas: string[] = []
  let lastErr: Error | null = null

  for (const model of GEMINI_MODELS) {
    opts.onTry?.(model)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        },
      )
      const json: any = await res.json().catch(() => ({}))
      if (res.ok) return { ...json, _model: model }
      const msg: string = json?.error?.message ?? `HTTP ${res.status}`
      lastErr = new Error(msg)
      const retirado = res.status === 404 || /no longer available|not found|not supported|deprecated/i.test(msg)
      if (!retirado) throw lastErr
      notas.push(`${model}: no disponible`)
    } catch (e) {
      if (e === lastErr) throw e // error real de la API (clave inválida, cuota…): no tiene sentido reintentar
      const timedOut = (e as Error)?.name === 'AbortError'
      notas.push(`${model}: ${timedOut ? `sin respuesta en ${Math.round(timeoutMs / 1000)} s` : `error de red (${(e as Error)?.message})`}`)
      lastErr = new Error(notas.join(' · '))
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(notas.join(' · ') || lastErr?.message || 'Sin respuesta de Gemini')
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
