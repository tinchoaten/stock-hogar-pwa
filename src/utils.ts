const pad = (n: number) => String(n).padStart(2, '0')

export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const today = () => toISO(new Date())

/** Parsea 'YYYY-MM-DD' (o un ISO completo) como fecha local, a mediodía. */
export function parseDate(s: string): Date | null {
  if (!s) return null
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

export function addDays(iso: string, n: number): string {
  const d = parseDate(iso) ?? new Date()
  d.setDate(d.getDate() + n)
  return toISO(d)
}

export function addMonths(iso: string, n: number): string {
  const d = parseDate(iso) ?? new Date()
  d.setMonth(d.getMonth() + n)
  return toISO(d)
}

/** Días hasta la fecha (negativo si ya venció). null si no hay fecha. */
export function daysUntil(iso: string): number | null {
  const d = parseDate(iso)
  if (!d) return null
  const t = parseDate(today())!
  return Math.round((d.getTime() - t.getTime()) / 86400000)
}

/** Compatibilidad: 'En Stock' (valor viejo) se muestra como 'Cerrado'. */
export const estadoLabel = (e: string) => (e === 'En Stock' || !e ? 'Cerrado' : e === 'Baja' ? 'Consumido' : e)

/** Los booleanos de la planilla pueden llegar como true, "TRUE", "SI", 1… */
export const truthy = (v: unknown) =>
  v === true || v === 1 || /^(true|si|sí|1|x|yes)$/i.test(String(v ?? '').trim())

export const uid = () =>
  `it_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export const num = (v: unknown, fallback = 0): number => {
  if (typeof v === 'number') return isFinite(v) ? v : fallback
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return isFinite(n) ? n : fallback
}

export const money = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

let audioCtx: AudioContext | null = null

/** Beep sintetizado con AudioContext. */
export function beep(freq = 1000, ms = 120) {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioCtx = audioCtx ?? new Ctx()
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.value = 0.2
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + ms / 1000)
  } catch {
    /* sin audio, no es crítico */
  }
}

export function vibrate(ms = 40) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* noop */
  }
}

export const TIPO_LIMPIEZA = 'Limpieza/Hogar'

/** ¿Es un producto de limpieza / hogar / higiene (no alimento)? */
export const esLimpieza = (categoria?: string) =>
  /limpieza|hogar|higiene|detergente|lavandina|jabon|esponja|bazar|cleaning|household|hygiene/.test(norm(categoria ?? ''))

/** 0 en dias_vida_util_cerrado = "sin vencimiento" (no confundir con celda vacía). */
export function sinVencimiento(c?: { dias_vida_util_cerrado?: unknown } | null): boolean {
  if (!c) return false
  const raw = c.dias_vida_util_cerrado
  return raw !== '' && raw !== null && raw !== undefined && Number(raw) === 0
}

/** Días de vida útil cerrado; null = no vence. */
export function vidaCerrada(c?: { dias_vida_util_cerrado?: unknown } | null): number | null {
  if (!c) return 180
  if (sinVencimiento(c)) return null
  return num(c.dias_vida_util_cerrado, 180) || 180
}

/** Vida útil estimada según categoría de Open Food Facts. */
export function shelfLifeFor(categoria: string): { cerrado: number; abierto: number } {
  const c = norm(categoria)
  if (esLimpieza(c)) return { cerrado: 730, abierto: 730 }
  if (/lacte|leche|yogur|queso|manteca|crema|dairy|milk|cheese|yogurt/.test(c))
    return { cerrado: 20, abierto: 5 }
  if (/carne|pollo|fiambre|embutido|pescado|meat|fish|sausage/.test(c))
    return { cerrado: 10, abierto: 3 }
  if (/fruta|verdura|vegetal|fruit|vegetable/.test(c)) return { cerrado: 7, abierto: 3 }
  if (/congelad|frozen|helado/.test(c)) return { cerrado: 180, abierto: 30 }
  if (/bebida|gaseosa|jugo|agua|beverage|drink|soda/.test(c)) return { cerrado: 120, abierto: 7 }
  return { cerrado: 180, abierto: 60 } // almacén / default
}
