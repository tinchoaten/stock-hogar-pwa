import { useState } from 'react'
import { BigButton, Chip, Label, Sheet } from '../components/ui'
import { isActiveItem, useApp } from '../store'
import { useItemActions } from '../useItemActions'
import { COMERCIOS, UBICACIONES } from '../config'
import type { InventoryItem } from '../types'
import { daysUntil, esLimpieza, estadoLabel, norm, num, sinVencimiento, TIPO_LIMPIEZA, truthy, vidaCerrada, ymd } from '../utils'

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
                Consumido
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
  const { accent, updateStatus, updateMany, removeItems, addInventory, upsertCatalog, showToast, db } = useApp()
  const cat = db.catalogo.find((c) => String(c.ean) === String(item.ean))
  const [nombre, setNombre] = useState(item.nombre)
  const [comercio, setComercio] = useState(item.comercio || '')
  const [venc, setVenc] = useState(ymd(item.fecha_vencimiento))
  const [ubic, setUbic] = useState(item.ubicacion)
  const [precio, setPrecio] = useState(String(num(item.precio_pagado) || ''))

  // Producto (catálogo): vale para todas las unidades de este EAN.
  const [showProd, setShowProd] = useState(false)
  const [pNombre, setPNombre] = useState(cat?.nombre || item.nombre)
  const [pMarca, setPMarca] = useState(cat?.marca ?? '')
  const [pLimpieza, setPLimpieza] = useState(esLimpieza(cat?.categoria))
  const [pSinVenc, setPSinVenc] = useState(sinVencimiento(cat))
  const [pCerrado, setPCerrado] = useState(String(vidaCerrada(cat) ?? 180))
  const [pAbierto, setPAbierto] = useState(String(num(cat?.dias_vida_util_abierto, 60) || 60))
  const [pTacc, setPTacc] = useState(truthy(cat?.sin_tacc))
  const [renombrar, setRenombrar] = useState(true)

  const mismas = db.inventario.filter(
    (i) => i.hogar_id === item.hogar_id && String(i.ean) === String(item.ean) && isActiveItem(i),
  )

  const guardar = () => {
    const patch: Parameters<typeof updateStatus>[1] = {}
    const name = nombre.trim() || item.nombre
    if (name !== item.nombre) patch.nombre = name
    if (comercio !== (item.comercio || '')) patch.comercio = comercio
    if (venc !== ymd(item.fecha_vencimiento)) patch.fecha_vencimiento = venc
    if (ubic !== item.ubicacion) patch.ubicacion = ubic
    const p = num(precio)
    if (p !== num(item.precio_pagado)) patch.precio_pagado = p

    // Catálogo (una sola escritura, junto con el último precio si cambió).
    const pn = pNombre.trim() || cat?.nombre || item.nombre
    const categoria = pLimpieza
      ? TIPO_LIMPIEZA
      : esLimpieza(cat?.categoria)
        ? 'Alimentos'
        : cat?.categoria || 'Alimentos'
    const cerrado = pSinVenc ? 0 : Math.max(1, Math.round(num(pCerrado, 180)))
    const abierto = Math.max(1, Math.round(num(pAbierto, 60)))
    const base = cat ?? {
      ean: String(item.ean),
      nombre: item.nombre,
      marca: '',
      categoria: '',
      dias_vida_util_cerrado: 180,
      dias_vida_util_abierto: 60,
      ultimo_precio: 0,
      sin_tacc: false,
    }
    const nuevoCat = {
      ...base,
      nombre: pn,
      marca: pMarca.trim(),
      categoria,
      dias_vida_util_cerrado: cerrado,
      dias_vida_util_abierto: abierto,
      sin_tacc: pTacc,
      ultimo_precio: patch.precio_pagado !== undefined && p > 0 ? p : base.ultimo_precio,
    }
    const catChanged =
      !cat ||
      nuevoCat.nombre !== cat.nombre ||
      nuevoCat.marca !== (cat.marca ?? '') ||
      nuevoCat.categoria !== cat.categoria ||
      Number(nuevoCat.dias_vida_util_cerrado) !== Number(cat.dias_vida_util_cerrado) ||
      Number(nuevoCat.dias_vida_util_abierto) !== Number(cat.dias_vida_util_abierto) ||
      nuevoCat.sin_tacc !== truthy(cat.sin_tacc) ||
      nuevoCat.ultimo_precio !== base.ultimo_precio
    if (showProd && catChanged) upsertCatalog(nuevoCat)
    else if (patch.precio_pagado !== undefined && p > 0 && cat) upsertCatalog({ ...cat, ultimo_precio: p })

    // Renombrar el producto también renombra las unidades activas de ese EAN (en todos los hogares).
    if (showProd && renombrar && cat && pn !== cat.nombre) {
      const ids = db.inventario
        .filter((i) => String(i.ean) === String(item.ean) && isActiveItem(i) && i.id_item !== item.id_item)
        .map((i) => i.id_item)
      updateMany(ids, { nombre: pn })
      if (patch.nombre === undefined) patch.nombre = pn
    }
    if (Object.keys(patch).length) updateStatus(item.id_item, patch)
    onClose()
  }

  const eliminar = (units: InventoryItem[]) => {
    const msg =
      units.length === 1
        ? `¿Eliminar "${item.nombre}"? Se borra de la planilla y no cuenta en stock, gastos ni desperdicio. (Si se terminó, usá "Consumido".)`
        : `¿Eliminar las ${units.length} unidades de "${item.nombre}" de ${item.hogar_id}? Se borran de la planilla y no cuentan en stock, gastos ni desperdicio.`
    if (!window.confirm(msg)) return
    const copy = units.map((u) => ({ ...u }))
    removeItems(copy.map((u) => u.id_item))
    showToast(`Eliminado${copy.length > 1 ? ` (${copy.length} unidades)` : ''}: ${item.nombre}`, () => addInventory(copy))
    onClose()
  }

  const inp = 'w-full rounded-xl bg-slate-800 px-3 py-3 text-base'
  return (
    <Sheet title={item.nombre} onClose={onClose}>
      <Label>Nombre de esta unidad</Label>
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inp} />
      <Label>Comercio</Label>
      <div className="flex gap-2">
        {COMERCIOS.map((c) => (
          <Chip key={c} active={comercio === c} color={accent} onClick={() => setComercio(c)}>
            {c}
          </Chip>
        ))}
      </div>
      <Label>Vencimiento</Label>
      <div className="mb-2 flex">
        <Chip active={!venc} color={accent} onClick={() => setVenc('')}>
          Sin vencimiento
        </Chip>
      </div>
      <input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} className={inp} />
      <Label>Ubicación</Label>
      <div className="flex gap-2">
        {UBICACIONES.map((u) => (
          <Chip key={u} active={ubic === u} color={accent} onClick={() => setUbic(u)}>
            {u}
          </Chip>
        ))}
      </div>
      <Label>Precio pagado</Label>
      <input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="$" className={inp} />

      <button
        onClick={() => setShowProd(!showProd)}
        className="mt-4 flex min-h-[48px] w-full items-center justify-between rounded-xl bg-slate-800 px-3 text-sm font-bold"
      >
        <span>Datos del producto (todas sus unidades)</span>
        <span className="text-slate-400">{showProd ? '▲' : '▼'}</span>
      </button>
      {showProd && (
        <div className="mt-2 space-y-1 rounded-xl border border-slate-700 p-3">
          <Label>Nombre del producto</Label>
          <input value={pNombre} onChange={(e) => setPNombre(e.target.value)} className={inp} />
          <Label>Marca</Label>
          <input value={pMarca} onChange={(e) => setPMarca(e.target.value)} className={inp} />
          <Label>Tipo</Label>
          <div className="flex gap-2">
            <Chip active={!pLimpieza} color={accent} onClick={() => setPLimpieza(false)}>
              Alimento
            </Chip>
            <Chip active={pLimpieza} color={accent} onClick={() => setPLimpieza(true)}>
              Limpieza / Hogar
            </Chip>
          </div>
          <Label>Vida útil</Label>
          <div className="mb-2 flex gap-2">
            <Chip active={pSinVenc} color={accent} onClick={() => setPSinVenc(!pSinVenc)}>
              No vence nunca
            </Chip>
            <Chip active={pTacc} color={accent} onClick={() => setPTacc(!pTacc)}>
              Sin TACC
            </Chip>
          </div>
          {!pSinVenc && (
            <div className="flex gap-2">
              <label className="min-w-0 flex-1 text-xs text-slate-400">
                Cerrado (días)
                <input inputMode="numeric" value={pCerrado} onChange={(e) => setPCerrado(e.target.value.replace(/\D/g, ''))} className={inp} />
              </label>
              <label className="min-w-0 flex-1 text-xs text-slate-400">
                Abierto (días)
                <input inputMode="numeric" value={pAbierto} onChange={(e) => setPAbierto(e.target.value.replace(/\D/g, ''))} className={inp} />
              </label>
            </div>
          )}
          <label className="mt-2 flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={renombrar} onChange={(e) => setRenombrar(e.target.checked)} className="h-5 w-5" />
            Si cambio el nombre, renombrar también las unidades en stock
          </label>
          <p className="text-xs text-slate-500">Las fechas de las unidades ya cargadas no se tocan.</p>
        </div>
      )}

      <div className="mt-4">
        <BigButton color={accent} onClick={guardar}>
          Guardar cambios
        </BigButton>
      </div>

      <div className="mt-6 space-y-2 border-t border-slate-700 pt-4">
        <p className="text-xs text-slate-400">
          Eliminar borra la fila de la planilla (cargada por error). No es lo mismo que “Consumido”, que la deja en el historial de gastos.
        </p>
        <button
          onClick={() => eliminar([item])}
          className="min-h-[48px] w-full rounded-2xl border border-red-600 font-bold text-red-400 active:scale-[0.98]"
        >
          Eliminar esta unidad
        </button>
        {mismas.length > 1 && (
          <button
            onClick={() => eliminar(mismas)}
            className="min-h-[48px] w-full rounded-2xl border border-red-600 font-bold text-red-400 active:scale-[0.98]"
          >
            Eliminar las {mismas.length} unidades de este producto
          </button>
        )}
      </div>
    </Sheet>
  )
}
