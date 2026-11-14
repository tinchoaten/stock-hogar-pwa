import type { CatalogItem, DB, Payload } from './types'
import { shelfLifeFor, TIPO_LIMPIEZA } from './utils'

export async function fetchAll(url: string): Promise<DB> {
  const res = await fetch(url, { redirect: 'follow' })
  const json = await res.json()
  if (json?.status !== 'ok' || !json.data) throw new Error(json?.message ?? 'Respuesta inválida')
  const d = json.data
  return {
    catalogo: d.catalogo ?? [],
    reglasHogar: d.reglasHogar ?? [],
    inventario: d.inventario ?? [],
    diccionario: d.diccionario ?? [],
    listaCompras: d.listaCompras ?? [],
  }
}

/** El servidor respondió, pero rechazó el cambio: reintentar no sirve. */
export class ServerRejectedError extends Error {}

/** POST con text/plain para evitar el preflight CORS de Apps Script. */
export async function postPayload(url: string, payload: Payload): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json().catch(() => null)
  // Sin JSON con `status` (página de error de Google, lock vencido, cuota…) no hay confirmación:
  // se trata como error transitorio para que el cambio siga en la cola y se reintente.
  if (!json || typeof json.status !== 'string')
    throw new Error('Respuesta inválida del servidor (no es JSON)')
  if (json.status !== 'ok') throw new ServerRejectedError(json.message ?? 'Error del servidor')
}

export interface OFFResult {
  found: boolean
  item: CatalogItem
}

async function fetchFacts(host: string, ean: string): // eslint-disable-next-line @typescript-eslint/no-explicit-any
Promise<Record<string, any> | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 3500)
    try {
      const res = await fetch(`https://${host}/api/v2/product/${ean}.json`, { signal: ctrl.signal })
      const json = await res.json()
      return json?.status === 1 && json.product ? json.product : null
    } finally {
      clearTimeout(t)
    }
  } catch {
    return null
  }
}

/**
 * Busca el EAN en Open Food Facts y, si no está, en Open Products Facts y Open Beauty Facts
 * (productos que no son comida). Arma un ítem de catálogo con vida útil estimada.
 */
export async function lookupOpenFoodFacts(ean: string): Promise<OFFResult> {
  const blank: CatalogItem = {
    ean,
    nombre: '',
    marca: '',
    categoria: '',
    dias_vida_util_cerrado: 180,
    dias_vida_util_abierto: 60,
    ultimo_precio: 0,
    sin_tacc: false,
  }
  try {
    // Las tres bases se consultan a la vez, cada una con tope de 3,5 s; Open Food Facts tiene prioridad.
    const foodP = fetchFacts('world.openfoodfacts.org', ean)
    const prodsP = fetchFacts('world.openproductsfacts.org', ean)
    const beautyP = fetchFacts('world.openbeautyfacts.org', ean)
    const named = (x: Record<string, any> | null) => !!x && !!(x.product_name || x.product_name_es)
    const food = await foodP
    // Si es un alimento conocido no se espera a las otras bases (Open Products Facts suele ser muy lenta).
    const [prods, beauty] = named(food) ? [null, null] : await Promise.all([prodsP, beautyP])
    let p: Record<string, any> | null = named(food) ? food : null
    let noAlimento = false
    if (!p) {
      p = named(prods) ? prods : named(beauty) ? beauty : (food ?? prods ?? beauty)
      noAlimento = !!p && p !== food
    }
    if (!p) return { found: false, item: blank }
    const categoria: string = String(
      (p.categories ?? '').split(',').map((s: string) => s.trim()).filter(Boolean).pop() ?? '',
    )
    const tags: string[] = [...(p.labels_tags ?? []), ...(p.allergens_tags ?? [])]
    const sinTacc =
      (p.labels_tags ?? []).some((t: string) => /gluten-free|sin-gluten|sin-tacc/.test(t)) &&
      !tags.some((t) => /en:gluten$/.test(t) && (p.allergens_tags ?? []).includes(t))
    const life = noAlimento ? { cerrado: 730, abierto: 730 } : shelfLifeFor(`${p.categories ?? ''} ${categoria}`)
    return {
      found: true,
      item: {
        ...blank,
        nombre: String(p.product_name_es || p.product_name || '').trim(),
        marca: String(p.brands ?? '').split(',')[0].trim(),
        categoria: noAlimento ? TIPO_LIMPIEZA : categoria,
        dias_vida_util_cerrado: life.cerrado,
        dias_vida_util_abierto: life.abierto,
        sin_tacc: noAlimento ? false : sinTacc,
      },
    }
  } catch {
    return { found: false, item: blank }
  }
}
