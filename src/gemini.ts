import { GEMINI_MODELS } from './config'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Llama a Gemini probando los modelos en orden. Si Google retira un modelo
 * ("no longer available", 404…) pasa automáticamente al siguiente.
 */
export async function generate(key: string, body: unknown): Promise<any> {
  let lastErr: Error = new Error('Sin respuesta de Gemini')
  for (const model of GEMINI_MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )
    const json: any = await res.json().catch(() => ({}))
    if (res.ok) return { ...json, _model: model }
    const msg: string = json?.error?.message ?? `HTTP ${res.status}`
    lastErr = new Error(msg)
    const retirado = res.status === 404 || /no longer available|not found|not supported|deprecated/i.test(msg)
    if (!retirado) throw lastErr
  }
  throw lastErr
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
