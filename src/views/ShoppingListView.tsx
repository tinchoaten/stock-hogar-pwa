import { useEffect, useMemo, useState } from 'react'
import { isActiveItem, useApp } from '../store'
import type { ShoppingItem } from '../types'
import { money, num } from '../utils'

interface Line {
  ean: string
  nombre: string
  faltante: number
  precio: number
  barato: string
  /** Hogares que aportan al faltante: [hogar, cantidad]. */
  partes: [string, number][]
}

const SIN_COMERCIO = 'Sin comercio definido'

export default function ShoppingListView() {
  const { db, activeHome, accent, settings, toggleShopping, sync, upsertRule, showToast } = useApp()
  const [unificada, setUnificada] = useState(false)

  // Mientras esta vista está abierta, refresca cada 25 s para ver lo que tachan los demás.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void sync(true)
    }, 25000)
    return () => clearInterval(t)
  }, [sync])

  const lines = useMemo<Line[]>(() => {
    const homes = unificada ? settings.homes : [activeHome]
    const map = new Map<string, Line>()
    for (const r of db.reglasHogar) {
      if (!homes.includes(r.hogar_id)) continue
      const ean = String(r.ean)
      const stock = db.inventario.filter(
        (i) => i.hogar_id === r.hogar_id && String(i.ean) === ean && isActiveItem(i),
      ).length
      const falta = Math.max(0, num(r.stock_minimo) - stock)
      if (!falta) continue
      const cat = db.catalogo.find((c) => String(c.ean) === ean)
      // Comercio más barato: el de la compra de menor precio unitario en el historial del inventario.
      const compras = db.inventario
        .filter((i) => String(i.ean) === ean && num(i.precio_pagado) > 0 && i.comercio)
        .sort((a, b) => num(a.precio_pagado) - num(b.precio_pagado))
      const l = map.get(ean) ?? {
        ean,
        nombre: String(cat?.nombre ?? '') || db.inventario.find((i) => String(i.ean) === ean)?.nombre || ean,
        faltante: 0,
        precio: num(cat?.ultimo_precio) || num(compras[0]?.precio_pagado),
        barato: compras[0]?.comercio ?? '',
        partes: [],
      }
      l.faltante += falta
      l.partes.push([r.hogar_id, falta])
      map.set(ean, l)
    }
    return [...map.values()].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)))
  }, [db, activeHome, unificada, settings.homes])

  const comprado = (l: Line) =>
    l.partes.every(([h]) =>
      db.listaCompras.some((x) => x.hogar_id === h && String(x.ean) === l.ean && x.comprado),
    )

  const toggle = (l: Line) => {
    const nuevo = !comprado(l)
    for (const [h, n] of l.partes) {
      const item: ShoppingItem = {
        hogar_id: h,
        ean: l.ean,
        nombre: l.nombre,
        cantidad_sugerida: n,
        ultimo_precio: l.precio,
        comercio_mas_barato: l.barato,
        comprado: nuevo,
      }
      toggleShopping(item)
    }
  }

  /** "No volver a comprar": stock mínimo 0 en los hogares de la línea (se puede deshacer). */
  const quitar = (l: Line) => {
    if (!window.confirm(`¿Sacar "${l.nombre}" de la lista de compras? Dejará de aparecer (queda con stock mínimo 0; lo podés volver a subir en Stock → Stock mínimo).`)) return
    const prev = l.partes
      .map(([h]) => db.reglasHogar.find((r) => r.hogar_id === h && String(r.ean) === l.ean))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => ({ ...r, ean: String(r.ean) }))
    for (const r of prev) upsertRule({ ...r, stock_minimo: 0 })
    showToast(`Sacado de la lista: ${l.nombre}`, () => {
      for (const r of prev) upsertRule(r)
    })
  }

  const pendientes = lines.filter((l) => !comprado(l))
  const total = pendientes.reduce((s, l) => s + l.faltante * l.precio, 0)

  const enviarWhatsApp = async () => {
    const grupos = new Map<string, Line[]>()
    for (const l of pendientes) {
      const k = l.barato || SIN_COMERCIO
      grupos.set(k, [...(grupos.get(k) ?? []), l])
    }
    const orden = [...grupos.keys()].sort((a, b) =>
      a === SIN_COMERCIO ? 1 : b === SIN_COMERCIO ? -1 : a.localeCompare(b),
    )
    const out: string[] = [
      unificada
        ? `🛒 *Compra unificada* (${settings.homes.join(' + ')})`
        : `🛒 *Lista de compras – ${activeHome}*`,
    ]
    for (const k of orden) {
      out.push('', `*${k}*`)
      for (const l of grupos.get(k)!) {
        const costo = l.precio ? ` (~${money(l.faltante * l.precio)})` : ''
        const detalle =
          unificada && l.partes.length > 1 ? ` [${l.partes.map(([h, n]) => `${h}: ${n}`).join(', ')}]` : ''
        out.push(`[ ] ${l.faltante} x ${l.nombre}${costo}${detalle}`)
      }
    }
    out.push('', `💰 *Total estimado: ${money(total)}*`)
    const text = out.join('\n')
    if (navigator.share) {
      try {
        await navigator.share({ text })
      } catch {
        /* canceló */
      }
      return
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  return (
    <div className="space-y-3 p-3">
      <button
        onClick={() => setUnificada(!unificada)}
        className="flex min-h-[56px] w-full items-center justify-between rounded-2xl bg-slate-800 px-4"
      >
        <span className="font-bold">Compra Unificada (todos los hogares)</span>
        <span
          className="relative h-8 w-14 rounded-full transition"
          style={{ background: unificada ? accent : '#475569' }}
        >
          <span
            className="absolute top-1 h-6 w-6 rounded-full bg-white transition-all"
            style={{ left: unificada ? 28 : 4 }}
          />
        </span>
      </button>

      <div className="rounded-2xl p-4 text-white" style={{ background: accent }}>
        <p className="text-sm opacity-90">Presupuesto estimado pendiente</p>
        <p className="text-3xl font-extrabold">{money(total)}</p>
      </div>

      <button
        onClick={() => void enviarWhatsApp()}
        disabled={pendientes.length === 0}
        className="min-h-[52px] w-full rounded-2xl bg-emerald-600 text-base font-bold text-white active:scale-[0.98] disabled:opacity-40"
      >
        📲 Enviar por WhatsApp
      </button>

      {lines.length === 0 && (
        <p className="py-8 text-center text-slate-400">
          Nada bajo el stock mínimo{unificada ? '' : ` en ${activeHome}`}.
        </p>
      )}

      {lines.map((l) => {
        const done = comprado(l)
        return (
          <div key={l.ean} className="flex items-stretch gap-2">
          <button
            onClick={() => toggle(l)}
            className={`flex min-h-[64px] min-w-0 flex-1 items-center gap-3 rounded-2xl bg-slate-800 p-3 text-left active:scale-[0.99] ${
              done ? 'opacity-50' : ''
            }`}
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 text-sm text-white"
              style={{ borderColor: accent, background: done ? accent : 'transparent' }}
            >
              {done ? '✓' : ''}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block truncate font-semibold ${done ? 'line-through' : ''}`}>{l.nombre}</span>
              <span className="block text-xs text-slate-400">
                Faltan {l.faltante}
                {unificada && l.partes.length > 1 ? ` (${l.partes.map(([h, n]) => `${h}: ${n}`).join(', ')})` : ''}
                {l.barato ? ` · más barato en ${l.barato}` : ''}
              </span>
            </span>
            <span className="text-sm font-bold">{l.precio ? money(l.faltante * l.precio) : '—'}</span>
          </button>
          <button
            onClick={() => quitar(l)}
            className="w-14 shrink-0 rounded-2xl bg-slate-800 text-lg text-red-400 active:scale-95"
            aria-label={`Sacar ${l.nombre} de la lista`}
          >
            🗑
          </button>
          </div>
        )
      })}
    </div>
  )
}
