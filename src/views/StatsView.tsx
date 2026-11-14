import { useMemo, useState } from 'react'
import { Chip, Label } from '../components/ui'
import { COMERCIOS } from '../config'
import { useApp } from '../store'
import type { InventoryItem } from '../types'
import { money, norm, num, parseDate } from '../utils'

const monthKey = (iso: string): string => {
  const d = parseDate(iso)
  return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : ''
}

const monthName = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`

interface Inflacion {
  ean: string
  nombre: string
  primero: number
  ultimo: number
  desde: string
  hasta: string
  variacion: number
}

export default function StatsView() {
  const { db, settings, accent } = useApp()
  const [scope, setScope] = useState<string>('__global')
  const [q, setQ] = useState('')

  const items = useMemo(
    () => db.inventario.filter((i) => scope === '__global' || i.hogar_id === scope),
    [db.inventario, scope],
  )

  const nowKey = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()
  const prevKey = shiftMonth(nowKey, -1)

  const gasto = (key: string, filter?: (i: InventoryItem) => boolean) =>
    items
      .filter((i) => monthKey(i.fecha_ingreso) === key && (!filter || filter(i)))
      .reduce((s, i) => s + num(i.precio_pagado), 0)

  const totalActual = gasto(nowKey)
  const totalPrev = gasto(prevKey)
  const delta = totalPrev > 0 ? ((totalActual - totalPrev) / totalPrev) * 100 : null

  const porComercio = [...COMERCIOS.map((c) => String(c)), 'Otros'].map((c) => {
    const match = (i: InventoryItem) =>
      c === 'Otros' ? !COMERCIOS.some((x) => x === i.comercio) : i.comercio === c
    return { comercio: c, actual: gasto(nowKey, match), prev: gasto(prevKey, match) }
  })
  const maxCom = Math.max(1, ...porComercio.flatMap((c) => [c.actual, c.prev]))

  // Inflación personal: primera vs. última compra de cada producto con precio.
  const inflacion = useMemo<Inflacion[]>(() => {
    const por = new Map<string, InventoryItem[]>()
    for (const i of items) {
      if (num(i.precio_pagado) <= 0 || !parseDate(i.fecha_ingreso)) continue
      por.set(String(i.ean), [...(por.get(String(i.ean)) ?? []), i])
    }
    const out: Inflacion[] = []
    for (const [ean, list] of por) {
      list.sort((a, b) => parseDate(a.fecha_ingreso)!.getTime() - parseDate(b.fecha_ingreso)!.getTime())
      const first = list[0]
      const last = list[list.length - 1]
      if (first.fecha_ingreso.slice(0, 10) === last.fecha_ingreso.slice(0, 10))
        continue // una sola fecha de compra: no hay variación medible
      const p0 = num(first.precio_pagado)
      const p1 = num(last.precio_pagado)
      out.push({
        ean,
        nombre: db.catalogo.find((c) => String(c.ean) === ean)?.nombre || last.nombre || ean,
        primero: p0,
        ultimo: p1,
        desde: first.fecha_ingreso.slice(0, 10),
        hasta: last.fecha_ingreso.slice(0, 10),
        variacion: ((p1 - p0) / p0) * 100,
      })
    }
    return out.sort((a, b) => b.variacion - a.variacion)
  }, [items, db.catalogo])

  const nq = norm(q)
  const inflFiltrada = (nq ? inflacion.filter((x) => norm(x.nombre).includes(nq)) : inflacion).slice(0, nq ? 20 : 10)
  const variacionPromedio = inflacion.length
    ? inflacion.reduce((s, x) => s + x.variacion, 0) / inflacion.length
    : null

  // Aprovechamiento: dado de baja después de vencer = desperdicio; antes o el mismo día = a tiempo.
  const bajas = items.filter((i) => i.estado === 'Consumido' || i.estado === 'Baja' || i.fecha_baja)
  const conFechas = bajas.filter((i) => parseDate(i.fecha_baja) && parseDate(i.fecha_vencimiento))
  const desperdicio = conFechas.filter(
    (i) => parseDate(i.fecha_baja)!.getTime() > parseDate(i.fecha_vencimiento)!.getTime(),
  ).length
  const aTiempo = conFechas.length - desperdicio
  const aprov = conFechas.length ? (aTiempo / conFechas.length) * 100 : null

  return (
    <div className="space-y-3 p-3">
      <div className="flex gap-2 overflow-x-auto">
        <Chip active={scope === '__global'} color={accent} onClick={() => setScope('__global')}>
          Global
        </Chip>
        {settings.homes.map((h) => (
          <Chip key={h} active={scope === h} color={accent} onClick={() => setScope(h)}>
            {h}
          </Chip>
        ))}
      </div>

      <section className="rounded-2xl p-4 text-white" style={{ background: accent }}>
        <p className="text-sm capitalize opacity-90">Gastado en {monthName(nowKey)}</p>
        <p className="text-3xl font-extrabold">{money(totalActual)}</p>
        <p className="mt-1 text-sm opacity-90">
          Mes anterior ({monthName(prevKey)}): {money(totalPrev)}
          {delta !== null && ` · ${pct(delta)}`}
        </p>
      </section>

      <section className="rounded-2xl bg-slate-800 p-3">
        <Label>Gasto por comercio (mes actual vs. anterior)</Label>
        <div className="space-y-3">
          {porComercio.map((c) => {
            const share = totalActual > 0 ? (c.actual / totalActual) * 100 : 0
            return (
              <div key={c.comercio}>
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">{c.comercio}</span>
                  <span>
                    {money(c.actual)} <span className="text-slate-400">({share.toFixed(0)}%)</span>
                  </span>
                </div>
                <div className="mt-1 h-3 rounded-full bg-slate-700">
                  <div className="h-3 rounded-full" style={{ width: `${(c.actual / maxCom) * 100}%`, background: accent }} />
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-700">
                  <div className="h-2 rounded-full bg-slate-500" style={{ width: `${(c.prev / maxCom) * 100}%` }} />
                </div>
                <p className="text-xs text-slate-400">Mes anterior: {money(c.prev)}</p>
              </div>
            )
          })}
        </div>
      </section>

      <section className="rounded-2xl bg-slate-800 p-3">
        <Label>Inflación personal</Label>
        {variacionPromedio !== null && (
          <p className="mb-2 text-sm">
            Variación promedio de {inflacion.length} productos: <b>{pct(variacionPromedio)}</b>
          </p>
        )}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar un producto"
          className="mb-2 w-full rounded-xl bg-slate-900 px-3 py-3 text-base"
        />
        {inflFiltrada.length === 0 && (
          <p className="text-sm text-slate-400">
            Hace falta comprar un producto en dos fechas distintas, con precio, para medir su variación.
          </p>
        )}
        <div className="space-y-2">
          {inflFiltrada.map((x) => (
            <div key={x.ean} className="flex items-center gap-3 rounded-xl bg-slate-900 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{x.nombre}</p>
                <p className="text-xs text-slate-400">
                  {money(x.primero)} ({x.desde}) → {money(x.ultimo)} ({x.hasta})
                </p>
              </div>
              <span
                className="text-sm font-extrabold"
                style={{ color: x.variacion > 0 ? '#f87171' : x.variacion < 0 ? '#4ade80' : '#94a3b8' }}
              >
                {pct(x.variacion)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-slate-800 p-3">
        <Label>Aprovechamiento vs. desperdicio</Label>
        {aprov === null ? (
          <p className="text-sm text-slate-400">Todavía no hay productos dados de baja con fecha de vencimiento.</p>
        ) : (
          <>
            <p className="text-3xl font-extrabold" style={{ color: aprov >= 80 ? '#4ade80' : aprov >= 60 ? '#facc15' : '#f87171' }}>
              {aprov.toFixed(0)}% aprovechado
            </p>
            <div className="mt-2 flex h-4 overflow-hidden rounded-full bg-slate-700">
              <div style={{ width: `${aprov}%`, background: '#16a34a' }} />
              <div style={{ width: `${100 - aprov}%`, background: '#dc2626' }} />
            </div>
            <p className="mt-2 text-sm text-slate-300">
              {aTiempo} consumidos a tiempo · {desperdicio} dados de baja ya vencidos
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Se considera desperdicio un producto dado de baja después de su fecha de vencimiento.
            </p>
          </>
        )}
      </section>
    </div>
  )
}
