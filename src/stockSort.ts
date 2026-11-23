import { parseDate } from './utils.ts'

export type SortKey = 'venc' | 'az' | 'za' | 'nuevos' | 'viejos' | 'precio'

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'venc', label: 'Vencimiento (primero el que vence antes)' },
  { key: 'az', label: 'Nombre A → Z' },
  { key: 'za', label: 'Nombre Z → A' },
  { key: 'nuevos', label: 'Más recientes primero' },
  { key: 'viejos', label: 'Más antiguos primero' },
  { key: 'precio', label: 'Precio: de mayor a menor' },
]

export const SORT_STORAGE_KEY = 'sh.stockSort'
export const SORT_DEFAULT: SortKey = 'venc'

export const isSortKey = (v: unknown): v is SortKey => SORT_OPTIONS.some((o) => o.key === v)

export function loadSort(): SortKey {
  try {
    const v = localStorage.getItem(SORT_STORAGE_KEY)
    return isSortKey(v) ? v : SORT_DEFAULT
  } catch {
    return SORT_DEFAULT
  }
}

export function saveSort(k: SortKey) {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, k)
  } catch {
    /* modo privado: la elección vale solo para esta sesión */
  }
}

interface SortableItem {
  id_item: string
  nombre: string
  fecha_vencimiento: string
  fecha_ingreso: string
  precio_pagado: number | string
}

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true })

const dayOf = (s: string): number | null => {
  const d = parseDate(s)
  return d ? d.getTime() : null
}

/** Momento de creación del id (`it_<Date.now() en base36><azar>`); 0 si no tiene ese formato. */
export function idTime(id: string): number {
  const m = /^it_([0-9a-z]{8})/.exec(String(id))
  return m ? parseInt(m[1], 36) : 0
}

const byName = (a: SortableItem, b: SortableItem): number => {
  const na = String(a.nombre ?? '').trim()
  const nb = String(b.nombre ?? '').trim()
  if (!na || !nb) return na ? -1 : nb ? 1 : 0 // nombres vacíos al final
  return collator.compare(na, nb)
}

/**
 * Ordena (sin mutar) una lista de ítems. El orden es estable: ante empates se respeta
 * el orden de aparición en la planilla (la planilla agrega al final).
 *
 * "Más recientes": día de `fecha_ingreso`; mismo día → hora de creación del `id_item`
 * (es la hora real de alta y sobrevive a reinserciones al deshacer); mismo instante
 * (una tanda "Guardar N") → posición en la planilla, más abajo = más reciente.
 */
export function sortItems<T extends SortableItem>(items: T[], key: SortKey): T[] {
  const pos = new Map<T, number>()
  items.forEach((it, i) => pos.set(it, i))
  const p = (x: T) => pos.get(x) ?? 0

  const recency = (a: T, b: T): number => {
    const da = dayOf(a.fecha_ingreso)
    const db = dayOf(b.fecha_ingreso)
    if (da !== db) {
      if (da === null) return 1 // sin fecha: al final
      if (db === null) return -1
      return db - da
    }
    return idTime(b.id_item) - idTime(a.id_item) || p(b) - p(a)
  }

  const cmp: Record<SortKey, (a: T, b: T) => number> = {
    venc: (a, b) => {
      const da = dayOf(a.fecha_vencimiento)
      const db = dayOf(b.fecha_vencimiento)
      if (da === db) return byName(a, b)
      if (da === null) return 1 // sin vencimiento: al final
      if (db === null) return -1
      return da - db
    },
    az: (a, b) => byName(a, b) || recency(a, b),
    za: (a, b) => {
      const na = String(a.nombre ?? '').trim()
      const nb = String(b.nombre ?? '').trim()
      if (!na || !nb) return byName(a, b) || recency(a, b)
      return collator.compare(nb, na) || recency(a, b)
    },
    nuevos: recency,
    viejos: (a, b) => {
      const da = dayOf(a.fecha_ingreso)
      const db = dayOf(b.fecha_ingreso)
      if (da !== db) {
        if (da === null) return 1
        if (db === null) return -1
        return da - db
      }
      return idTime(a.id_item) - idTime(b.id_item) || p(a) - p(b)
    },
    precio: (a, b) => {
      const pa = Number(a.precio_pagado) || 0
      const pb = Number(b.precio_pagado) || 0
      return pb - pa || byName(a, b)
    },
  }

  return items
    .slice()
    .sort((a, b) => cmp[key](a, b) || p(a) - p(b))
}
