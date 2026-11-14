import { addDays, addMonths, norm, today } from './utils'

const WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30,
}

const toNum = (s: string): number | null => {
  if (/^\d+([.,]\d+)?$/.test(s)) return parseFloat(s.replace(',', '.'))
  return WORDS[s] ?? null
}

export interface VoiceResult {
  cantidad?: number
  precio?: number
  vencimiento?: string
}

/** Interpreta frases como "3 unidades precio 1500 vence en 2 semanas". */
export function parseVoice(raw: string): VoiceResult {
  const t = norm(raw).replace(/\bmil\b/g, '000')
  const out: VoiceResult = {}

  const venc = t.match(/(?:vence|vencimiento)?\s*en\s+(\w+)\s+(dias?|semanas?|mes(?:es)?)/)
  if (venc) {
    const n = toNum(venc[1])
    if (n !== null) {
      const u = venc[2]
      out.vencimiento = u.startsWith('dia')
        ? addDays(today(), n)
        : u.startsWith('semana')
          ? addDays(today(), n * 7)
          : addMonths(today(), n)
    }
  }
  const fecha = t.match(/(\d{1,2}) (?:de )?(\d{1,2})(?: (?:de )?(\d{2,4}))?/)
  if (!out.vencimiento && /venc/.test(t) && fecha) {
    const d = Number(fecha[1])
    const m = Number(fecha[2])
    let y = fecha[3] ? Number(fecha[3]) : new Date().getFullYear()
    if (y < 100) y += 2000
    out.vencimiento = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  const precio = t.match(/(?:precio|pague|pagué|sale|cuesta|\$)\s*(?:de\s+)?(\d+(?:[.,]\d+)?)/)
  if (precio) out.precio = parseFloat(precio[1].replace(',', '.'))
  else {
    const pesos = t.match(/(\d+(?:[.,]\d+)?)\s*pesos/)
    if (pesos) out.precio = parseFloat(pesos[1].replace(',', '.'))
  }

  const cant = t.match(/(?:(\w+)\s+unidades?|cantidad\s+(?:de\s+)?(\w+)|x\s*(\w+))/)
  const c = cant ? toNum(cant[1] ?? cant[2] ?? cant[3]) : null
  if (c !== null && c > 0) out.cantidad = Math.round(c)
  else {
    const first = t.match(/^(\w+)\b/)
    const n = first ? toNum(first[1]) : null
    if (n !== null && n > 0 && n <= 48) out.cantidad = Math.round(n)
  }
  return out
}

type SR = {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
}

export function speechSupported(): boolean {
  const w = window as unknown as Record<string, unknown>
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition)
}

export function listen(
  onText: (t: string) => void,
  onEnd: () => void,
  onError: (e: string) => void,
) {
  const w = window as unknown as Record<string, new () => SR>
  const Rec = w.SpeechRecognition ?? w.webkitSpeechRecognition
  const r = new Rec()
  r.lang = 'es-AR'
  r.interimResults = false
  r.maxAlternatives = 1
  r.onresult = (e) => onText(e.results[0][0].transcript)
  r.onerror = (e) => onError(e.error)
  r.onend = onEnd
  r.start()
}
