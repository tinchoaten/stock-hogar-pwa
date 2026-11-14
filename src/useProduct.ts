import { useCallback } from 'react'
import { lookupOpenFoodFacts } from './api'
import { useApp } from './store'
import type { CatalogItem } from './types'

/**
 * Resuelve un EAN: catálogo local primero, Open Food Facts después.
 * Si OFF lo encuentra, lo guarda en el catálogo (UPSERT_CATALOG).
 * Si no, devuelve un ítem vacío con found=false para completarlo a mano.
 */
export function useProductResolver() {
  const { db, upsertCatalog } = useApp()
  return useCallback(
    async (ean: string): Promise<{ item: CatalogItem; found: boolean }> => {
      const local = db.catalogo.find((c) => String(c.ean) === ean)
      if (local) return { item: local, found: true }
      const r = await lookupOpenFoodFacts(ean)
      if (r.found && r.item.nombre) upsertCatalog(r.item)
      return r
    },
    [db.catalogo, upsertCatalog],
  )
}
