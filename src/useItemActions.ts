import { useApp, type ItemPatch } from './store'
import type { InventoryItem } from './types'
import { addDays, num, sinVencimiento, today } from './utils'

/** Acciones de un toque sobre un ítem de inventario, todas con "Deshacer". */
export function useItemActions() {
  const { db, updateStatus, transferItem, showToast } = useApp()

  const diasAbierto = (item: InventoryItem) => {
    const c = db.catalogo.find((x) => String(x.ean) === String(item.ean))
    return num(c?.dias_vida_util_abierto, 60) || 60
  }

  const catOf = (item: InventoryItem) => db.catalogo.find((x) => String(x.ean) === String(item.ean))

  /** Aplica el parche y ofrece restaurar los valores anteriores. */
  const withUndo = (item: InventoryItem, patch: ItemPatch, msg: string) => {
    const prev: ItemPatch = {}
    for (const k of Object.keys(patch) as (keyof ItemPatch)[])
      (prev as Record<string, unknown>)[k] = item[k]
    updateStatus(item.id_item, patch)
    showToast(`${msg}: ${item.nombre}`, () => updateStatus(item.id_item, prev))
  }

  return {
    diasAbierto,
    sinVencimiento: (item: InventoryItem) => sinVencimiento(catOf(item)),
    baja: (item: InventoryItem) =>
      withUndo(item, { estado: 'Consumido', fecha_baja: today() }, 'Consumido'),
    abrir: (item: InventoryItem) =>
      withUndo(
        item,
        sinVencimiento(catOf(item))
          ? { estado: 'Abierto', fecha_apertura: today() }
          : {
              estado: 'Abierto',
              fecha_apertura: today(),
              fecha_vencimiento: addDays(today(), diasAbierto(item)),
            },
        'Abierto',
      ),
    congelar: (item: InventoryItem) =>
      withUndo(
        item,
        { ubicacion: 'Freezer', fecha_vencimiento: addDays(today(), 90) },
        'Al freezer',
      ),
    trasladar: (item: InventoryItem, home: string) => {
      const from = item.hogar_id
      transferItem(item.id_item, home)
      showToast(`Trasladado a ${home}: ${item.nombre}`, () => transferItem(item.id_item, from))
    },
  }
}
