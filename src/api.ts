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
  if (json && json.status && json.status !== 'ok')
    throw new ServerRejectedError(json.message ?? 'Error del servidor')
}

export interface OFFResult {
  found: boolean
  item: CatalogItem
}

async function fetchFacts(host: string, ean: string): // eslint-disable-next-line @typescript-eslint/no-explicit-any
Promise<Record<string, any> | null> {
  try {
    const res = await fetch(`https://${host}/api/v2/product/${ean}.json`)
    const json = await res.json()
    return json?.status === 1 && json.product ? json.product : null
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
    let p = await fetchFacts('world.openfoodfacts.org', ean)
    let noAlimento = false
    if (!p || !(p.product_name || p.product_name_es)) {
      p = (await fetchFacts('world.openproductsfacts.org', ean)) ?? (await fetchFacts('world.openbeautyfacts.org', ean))
      noAlimento = !!p
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
