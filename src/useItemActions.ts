import { useApp } from './store'
import type { InventoryItem } from './types'
import { addDays, num, today } from './utils'

/** Acciones de un toque sobre un ítem de inventario. */
export function useItemActions() {
  const { db, updateStatus, transferItem } = useApp()

  const diasAbierto = (item: InventoryItem) => {
    const c = db.catalogo.find((x) => String(x.ean) === String(item.ean))
    return num(c?.dias_vida_util_abierto, 60) || 60
  }

  return {
    diasAbierto,
    baja: (item: InventoryItem) => updateStatus(item.id_item, { estado: 'Consumido', fecha_baja: today() }),
    abrir: (item: InventoryItem) =>
      updateStatus(item.id_item, {
        estado: 'Abierto',
        fecha_apertura: today(),
        fecha_vencimiento: addDays(today(), diasAbierto(item)),
      }),
    congelar: (item: InventoryItem) =>
      updateStatus(item.id_item, {
        ubicacion: 'Freezer',
        fecha_vencimiento: addDays(today(), 90),
      }),
    trasladar: (item: InventoryItem, home: string) => transferItem(item.id_item, home),
  }
}
