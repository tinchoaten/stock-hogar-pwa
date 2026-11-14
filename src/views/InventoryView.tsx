import { useState } from 'react'
import { BigButton, Chip, Label, Sheet } from '../components/ui'
import { isActiveItem, useApp } from '../store'
import { useItemActions } from '../useItemActions'
import { UBICACIONES } from '../config'
import type { InventoryItem } from '../types'
import { daysUntil, estadoLabel, norm, num, truthy, ymd } from '../utils'

const FILTROS = ['Todos', 'Heladera', 'Alacena', 'Freezer']

function semaforo(d: number | null): { color: string; label: string } {
  if (d === null) return { color: '#64748b', label: 'sin fecha' }
  if (d <= 3) return { color: '#dc2626', label: d < 0 ? `venció hace ${-d} d` : d === 0 ? 'vence hoy' : `${d} d` }
  if (d <= 7) return { color: '#eab308', label: `${d} d` }
  return { color: '#16a34a', label: `${d} d` }
}

export default function InventoryView() {
  const { db, activeHome, accent, upsertRule } = useApp()
  const [q, setQ] = useState('')
  const [soloSinTacc, setSoloSinTacc] = useState(false)
  const [editing, setEditing] = useState<InventoryItem | null>(null)
  const catOf = (ean: string) => db.catalogo.find((c) => String(c.ean) === String(ean))
  const acts = useItemActions()
  const [filtro, setFiltro] = useState('Todos')
  const [showMin, setShowMin] = useState(false)
  const reglas = db.reglasHogar
    .filter((r) => r.hogar_id === activeHome)
    .sort((a, b) => String(a.ean).localeCompare(String(b.ean)))

  const items = db.inventario
    .filter((i) => i.hogar_id === activeHome && isActiveItem(i))
    .filter((i) => filtro === 'Todos' || i.ubicacion === filtro)
    .filter((i) => !soloSinTacc || truthy(catOf(i.ean)?.sin_tacc))
    .filter((i) => {
      const t = norm(q)
      if (!t) return true
      const c = catOf(i.ean)
      const hay = norm(`${i.nombre} ${c?.marca ?? ''} ${c?.categoria ?? ''}`)
      return t.split(' ').every((w) => hay.includes(w))
    })
    .sort((a, b) => (a.fecha_vencimiento || '9999').localeCompare(b.fecha_vencimiento || '9999'))

  return (
    <div className="space-y-3 p-3">
      <div className="flex gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, marca o categoría"
          className="min-w-0 flex-1 rounded-xl bg-slate-800 px-3 py-3 text-base"
        />
        <button
          onClick={() => setSoloSinTacc(!soloSinTacc)}
          className="min-h-[48px] shrink-0 rounded-xl px-3 text-sm font-bold"
          style={soloSinTacc ? { background: accent, color: '#fff' } : { background: '#1e293b', color: '#cbd5e1' }}
        >
          Sin TACC
        </button>
      </div>
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

      <button
        onClick={() => setShowMin(!showMin)}
        className="flex min-h-[48px] w-full items-center justify-between rounded-2xl bg-slate-800 px-4 text-sm font-bold"
      >
        <span>Stock mínimo por producto</span>
        <span className="text-slate-400">{showMin ? '▲' : '▼'}</span>
      </button>
      {showMin && (
        <div className="space-y-2">
          {reglas.length === 0 && (
            <p className="text-center text-sm text-slate-400">Todavía no hay productos con regla en {activeHome}.</p>
          )}
          {reglas.map((r) => {
            const nombre =
              db.catalogo.find((c) => String(c.ean) === String(r.ean))?.nombre ||
              db.inventario.find((i) => String(i.ean) === String(r.ean))?.nombre ||
              String(r.ean)
            const stock = db.inventario.filter(
              (i) => i.hogar_id === activeHome && String(i.ean) === String(r.ean) && isActiveItem(i),
            ).length
            const min = num(r.stock_minimo)
            const set = (n: number) =>
              upsertRule({
                hogar_id: r.hogar_id,
                ean: String(r.ean),
                stock_minimo: Math.max(0, n),
                ubicacion_habitual: r.ubicacion_habitual,
              })
            return (
              <div key={String(r.ean)} className="flex items-center gap-2 rounded-2xl bg-slate-800 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{nombre}</p>
                  <p className="text-xs" style={{ color: stock < min ? '#f87171' : '#94a3b8' }}>
                    Tenés {stock} · mínimo {min}
                  </p>
                </div>
                <button
                  onClick={() => set(min - 1)}
                  className="h-11 w-11 rounded-xl bg-slate-700 text-xl font-bold active:scale-95"
                  aria-label="Bajar mínimo"
                >
                  −
                </button>
                <span className="w-6 text-center font-bold">{min}</span>
                <button
                  onClick={() => set(min + 1)}
                  className="h-11 w-11 rounded-xl bg-slate-700 text-xl font-bold active:scale-95"
                  aria-label="Subir mínimo"
                >
                  +
                </button>
              </div>
            )
          })}
        </div>
      )}

      {items.map((i) => {
        const s = semaforo(daysUntil(i.fecha_vencimiento))
        return (
          <div key={i.id_item} className="rounded-2xl bg-slate-800 p-3">
            <div className="flex cursor-pointer items-center gap-3" onClick={() => setEditing(i)}>
              <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: s.color }} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{i.nombre}</p>
                <p className="text-xs text-slate-400">
                  {i.ubicacion} · {estadoLabel(i.estado)} · {ymd(i.fecha_vencimiento) || 'sin vencimiento'}
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

      {editing && <EditItemSheet item={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function EditItemSheet({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const { accent, updateStatus, upsertCatalog, db } = useApp()
  const [venc, setVenc] = useState(ymd(item.fecha_vencimiento))
  const [ubic, setUbic] = useState(item.ubicacion)
  const [precio, setPrecio] = useState(String(num(item.precio_pagado) || ''))

  const guardar = () => {
    const patch: Parameters<typeof updateStatus>[1] = {}
    if (venc !== ymd(item.fecha_vencimiento)) patch.fecha_vencimiento = venc
    if (ubic !== item.ubicacion) patch.ubicacion = ubic
    const p = num(precio)
    if (p !== num(item.precio_pagado)) patch.precio_pagado = p
    if (Object.keys(patch).length) updateStatus(item.id_item, patch)
    if (patch.precio_pagado !== undefined && p > 0) {
      const cat = db.catalogo.find((c) => String(c.ean) === String(item.ean))
      if (cat) upsertCatalog({ ...cat, ultimo_precio: p })
    }
    onClose()
  }

  return (
    <Sheet title={item.nombre} onClose={onClose}>
      <Label>Vencimiento</Label>
      <div className="mb-2 flex">
        <Chip active={!venc} color={accent} onClick={() => setVenc('')}>
          Sin vencimiento
        </Chip>
      </div>
      <input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} className="w-full rounded-xl bg-slate-800 px-3 py-3 text-base" />
      <Label>Ubicación</Label>
      <div className="flex gap-2">
        {UBICACIONES.map((u) => (
          <Chip key={u} active={ubic === u} color={accent} onClick={() => setUbic(u)}>
            {u}
          </Chip>
        ))}
      </div>
      <Label>Precio pagado</Label>
      <input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="$" className="w-full rounded-xl bg-slate-800 px-3 py-3 text-base" />
      <div className="mt-4">
        <BigButton color={accent} onClick={guardar}>
          Guardar cambios
        </BigButton>
      </div>
    </Sheet>
  )
}
