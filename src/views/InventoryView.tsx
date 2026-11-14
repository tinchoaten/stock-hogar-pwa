import { useState } from 'react'
import { Chip } from '../components/ui'
import { isActiveItem, useApp } from '../store'
import { useItemActions } from '../useItemActions'
import { daysUntil, estadoLabel } from '../utils'

const FILTROS = ['Todos', 'Heladera', 'Alacena', 'Freezer']

function semaforo(d: number | null): { color: string; label: string } {
  if (d === null) return { color: '#64748b', label: 'sin fecha' }
  if (d <= 3) return { color: '#dc2626', label: d < 0 ? `venció hace ${-d} d` : d === 0 ? 'vence hoy' : `${d} d` }
  if (d <= 7) return { color: '#eab308', label: `${d} d` }
  return { color: '#16a34a', label: `${d} d` }
}

export default function InventoryView() {
  const { db, activeHome, accent } = useApp()
  const acts = useItemActions()
  const [filtro, setFiltro] = useState('Todos')

  const items = db.inventario
    .filter((i) => i.hogar_id === activeHome && isActiveItem(i))
    .filter((i) => filtro === 'Todos' || i.ubicacion === filtro)
    .sort((a, b) => (a.fecha_vencimiento || '9999').localeCompare(b.fecha_vencimiento || '9999'))

  return (
    <div className="space-y-3 p-3">
      <div className="flex gap-2">
        {FILTROS.map((f) => (
          <Chip key={f} active={filtro === f} color={accent} onClick={() => setFiltro(f)}>
            {f}
          </Chip>
        ))}
      </div>

      {items.length === 0 && (
        <p className="py-10 text-center text-slate-400">No hay productos en {activeHome}.</p>
      )}

      {items.map((i) => {
        const s = semaforo(daysUntil(i.fecha_vencimiento))
        return (
          <div key={i.id_item} className="rounded-2xl bg-slate-800 p-3">
            <div className="flex items-center gap-3">
              <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: s.color }} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{i.nombre}</p>
                <p className="text-xs text-slate-400">
                  {i.ubicacion} · {estadoLabel(i.estado)} · {i.fecha_vencimiento || 'sin vencimiento'}
                </p>
              </div>
              <span className="text-sm font-bold" style={{ color: s.color }}>
                {s.label}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button
                disabled={i.estado === 'Abierto'}
                onClick={() => acts.abrir(i)}
                className="min-h-[44px] rounded-xl bg-amber-600 text-sm font-bold text-white active:scale-95 disabled:opacity-30"
              >
                Abrir
              </button>
              <button
                disabled={i.ubicacion === 'Freezer'}
                onClick={() => acts.congelar(i)}
                className="min-h-[44px] rounded-xl bg-sky-600 text-sm font-bold text-white active:scale-95 disabled:opacity-30"
              >
                Congelar
              </button>
              <button
                onClick={() => acts.baja(i)}
                className="min-h-[44px] rounded-xl bg-red-600 text-sm font-bold text-white active:scale-95"
              >
                Baja
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
