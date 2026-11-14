import { useState } from 'react'
import { Mic, Plus } from 'lucide-react'
import BarcodeScanner from '../components/BarcodeScanner'
import { BigButton, Chip, Label, Sheet } from '../components/ui'
import { COMERCIOS, UBICACIONES } from '../config'
import { isActiveItem, useApp } from '../store'
import type { CatalogItem, Comercio, InventoryItem, Ubicacion } from '../types'
import { useItemActions } from '../useItemActions'
import { useProductResolver } from '../useProduct'
import {
  addDays,
  addMonths,
  daysUntil,
  esLimpieza,
  estadoLabel,
  norm,
  num,
  sinVencimiento,
  TIPO_LIMPIEZA,
  today,
  uid,
  vidaCerrada,
  ymd,
} from '../utils'
import { listen, parseVoice, speechSupported } from '../voice'

type Mode = 'ingreso' | 'salida'

export default function ScannerView() {
  const { accent, activeHome, db, stockOf, addInventory, upsertRule, updateStatus, showToast } = useApp()
  const resolve = useProductResolver()
  const [mode, setMode] = useState<Mode>('ingreso')
  const [burst, setBurst] = useState(false)
  const [burstComercio, setBurstComercio] = useState<Comercio>('Supermercado')

  /** Ráfaga: suma +1 con los datos habituales del producto, sin formulario. */
  const addOne = (item: CatalogItem) => {
    const rule = db.reglasHogar.find((r) => r.hogar_id === activeHome && String(r.ean) === item.ean)
    const prev = [...db.inventario]
      .reverse()
      .find((i) => i.hogar_id === activeHome && String(i.ean) === item.ean)
    const ubicacion = rule?.ubicacion_habitual || prev?.ubicacion || 'Alacena'
    const precio = num(item.ultimo_precio) || num(prev?.precio_pagado)
    const id = uid()
    addInventory([
      {
        id_item: id,
        hogar_id: activeHome,
        ean: item.ean,
        nombre: item.nombre,
        fecha_ingreso: today(),
        fecha_vencimiento: vidaCerrada(item) === null ? '' : addDays(today(), vidaCerrada(item) ?? 180),
        ubicacion,
        estado: 'Cerrado',
        fecha_apertura: '',
        fecha_baja: '',
        precio_pagado: precio,
        comercio: burstComercio,
      },
    ])
    if (!rule) upsertRule({ hogar_id: activeHome, ean: item.ean, stock_minimo: 1, ubicacion_habitual: ubicacion })
    const total = stockOf(activeHome, item.ean).length + 1
    showToast(`+1 ${item.nombre} (ahora ${total})`, () =>
      updateStatus(id, { estado: 'Consumido', fecha_baja: today() }),
    )
  }
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [product, setProduct] = useState<CatalogItem | null>(null)
  const [needsData, setNeedsData] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)

  const onScan = async (ean: string) => {
    setBusy(true)
    setMsg(`Buscando ${ean}…`)
    const r = await resolve(ean)
    setBusy(false)
    setMsg('')
    if (mode === 'salida' && stockOf(activeHome, ean).length === 0) {
      setMsg(`${r.item.nombre || ean}: no hay stock en ${activeHome}.`)
      return
    }
    if (mode === 'ingreso' && burst && r.found && r.item.nombre) {
      addOne(r.item)
      return
    }
    setNeedsData(!r.found || !r.item.nombre)
    setProduct(r.item)
  }

  const close = () => {
    setProduct(null)
    setMsg('')
  }

  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-800 p-1.5">
        {(['ingreso', 'salida'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`min-h-[56px] rounded-xl text-base font-bold transition active:scale-95 ${
              mode === m ? 'text-white' : 'text-slate-400'
            }`}
            style={mode === m ? { background: m === 'ingreso' ? accent : '#475569' } : undefined}
          >
            {m === 'ingreso' ? 'Modo Ingreso (Compra)' : 'Modo Salida / Abierto'}
          </button>
        ))}
      </div>

      {mode === 'ingreso' && (
        <div className="space-y-2">
          <button
            onClick={() => setBurst(!burst)}
            className="flex min-h-[48px] w-full items-center justify-between rounded-2xl bg-slate-800 px-4"
          >
            <span className="text-sm font-bold">Ráfaga: sumar +1 sin preguntar</span>
            <span className="relative h-7 w-12 rounded-full transition" style={{ background: burst ? accent : '#475569' }}>
              <span className="absolute top-1 h-5 w-5 rounded-full bg-white transition-all" style={{ left: burst ? 24 : 4 }} />
            </span>
          </button>
          {burst && (
            <div className="flex gap-2">
              {COMERCIOS.map((c) => (
                <Chip key={c} active={burstComercio === c} color={accent} onClick={() => setBurstComercio(c)}>
                  {c}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}

      <BarcodeScanner onScan={onScan} enabled={!product && !busy && !manualOpen} />
      {mode === 'ingreso' && (
        <button
          onClick={() => setManualOpen(true)}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-600 text-sm font-semibold text-slate-300 active:scale-[0.98]"
        >
          <Plus size={18} /> Agregar producto sin código (esponjas, paños…)
        </button>
      )}
      {msg && <p className="rounded-xl bg-slate-800 p-3 text-center text-sm">{msg}</p>}
      <p className="text-center text-xs text-slate-500">
        {db.inventario.filter((i) => i.hogar_id === activeHome && isActiveItem(i)).length}{' '}
        productos en stock en {activeHome}
      </p>

      {manualOpen && (
        <SinCodigoSheet
          onClose={() => setManualOpen(false)}
          onPick={(item, isNew) => {
            setManualOpen(false)
            setNeedsData(isNew)
            setProduct(item)
            setMode('ingreso')
          }}
        />
      )}
      {product && mode === 'ingreso' && (
        <IngresoSheet product={product} needsData={needsData} onClose={close} />
      )}
      {product && mode === 'salida' && <SalidaSheet product={product} onClose={close} />}
    </div>
  )
}

function IngresoSheet({
  product,
  needsData,
  onClose,
}: {
  product: CatalogItem
  needsData: boolean
  onClose: () => void
}) {
  const { db, activeHome, accent, addInventory, upsertCatalog, upsertRule } = useApp()
  const rule = db.reglasHogar.find((r) => r.hogar_id === activeHome && String(r.ean) === product.ean)
  const [tipo, setTipo] = useState<'alimento' | 'limpieza'>(esLimpieza(product.categoria) ? 'limpieza' : 'alimento')
  const [sinVenc, setSinVenc] = useState(sinVencimiento(product))
  const vidaCerrado = vidaCerrada(product) ?? (esLimpieza(product.categoria) ? 730 : 180)

  const [nombre, setNombre] = useState(product.nombre)
  const [comercio, setComercio] = useState<Comercio>('Supermercado')
  const [cantidad, setCantidad] = useState(1)
  const [precio, setPrecio] = useState(String(num(product.ultimo_precio) || ''))
  const [ubicacion, setUbicacion] = useState<Ubicacion>(
    (UBICACIONES.find((u) => u === rule?.ubicacion_habitual) ?? 'Alacena') as Ubicacion,
  )
  const [venc, setVenc] = useState(addDays(today(), vidaCerrado))
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')

  const dictar = () => {
    if (!speechSupported()) {
      setHeard('Este navegador no soporta dictado por voz.')
      return
    }
    setListening(true)
    setHeard('Escuchando…')
    listen(
      (text) => {
        setHeard(`“${text}”`)
        const r = parseVoice(text)
        if (r.cantidad) setCantidad(r.cantidad)
        if (r.precio) setPrecio(String(r.precio))
        if (r.vencimiento) setVenc(r.vencimiento)
      },
      () => setListening(false),
      (e) => setHeard(`Error de voz: ${e}`),
    )
  }

  const cambiarTipo = (t: 'alimento' | 'limpieza') => {
    setTipo(t)
    setVenc(addDays(today(), t === 'limpieza' ? 730 : esLimpieza(product.categoria) ? 180 : (vidaCerrada(product) ?? 180)))
  }

  const guardar = () => {
    const p = num(precio)
    const name = nombre.trim() || product.ean
    const fecha_ingreso = today()
    const items: InventoryItem[] = Array.from({ length: cantidad }, () => ({
      id_item: uid(),
      hogar_id: activeHome,
      ean: product.ean,
      nombre: name,
      fecha_ingreso,
      fecha_vencimiento: sinVenc ? '' : venc,
      ubicacion,
      estado: 'Cerrado',
      fecha_apertura: '',
      fecha_baja: '',
      precio_pagado: p,
      comercio,
    }))
    addInventory(items)
    const categoria =
      tipo === 'limpieza' ? TIPO_LIMPIEZA : esLimpieza(product.categoria) ? 'Alimentos' : product.categoria
    const diasCerrado = sinVenc
      ? 0
      : tipo === 'limpieza'
        ? 730
        : esLimpieza(product.categoria)
          ? 180
          : (vidaCerrada(product) ?? 180)
    const diasAbierto =
      tipo === 'limpieza' ? 730 : esLimpieza(product.categoria) ? 60 : num(product.dias_vida_util_abierto, 60)
    const catChanged =
      categoria !== product.categoria || diasCerrado !== Number(product.dias_vida_util_cerrado)
    if (needsData || catChanged || p !== num(product.ultimo_precio) || name !== product.nombre) {
      upsertCatalog({
        ...product,
        nombre: name,
        categoria,
        dias_vida_util_cerrado: diasCerrado,
        dias_vida_util_abierto: diasAbierto,
        ultimo_precio: p || num(product.ultimo_precio),
      })
    }
    if (!rule) {
      upsertRule({ hogar_id: activeHome, ean: product.ean, stock_minimo: 1, ubicacion_habitual: ubicacion })
    }
    onClose()
  }

  return (
    <Sheet title={product.nombre || `EAN ${product.ean}`} onClose={onClose}>
      {product.marca && <p className="text-sm text-slate-400">{product.marca}</p>}
      {needsData && (
        <>
          <Label>No está en la base: ponele nombre</Label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre del producto"
            className="w-full rounded-xl bg-slate-800 px-3 py-3 text-base"
          />
        </>
      )}

      <Label>Tipo de producto</Label>
      <div className="flex gap-2">
        <Chip active={tipo === 'alimento'} color={accent} onClick={() => cambiarTipo('alimento')}>
          Alimento
        </Chip>
        <Chip active={tipo === 'limpieza'} color={accent} onClick={() => cambiarTipo('limpieza')}>
          Limpieza / Hogar
        </Chip>
      </div>

      <Label>Comercio</Label>
      <div className="flex gap-2">
        {COMERCIOS.map((c) => (
          <Chip key={c} active={comercio === c} color={accent} onClick={() => setComercio(c)}>
            {c}
          </Chip>
        ))}
      </div>

      <Label>Cantidad</Label>
      <div className="flex gap-2">
        {[1, 2, 3, 6].map((n) => (
          <Chip key={n} active={cantidad === n} color={accent} onClick={() => setCantidad(n)}>
            +{n}
          </Chip>
        ))}
      </div>

      <Label>Precio unitario pagado</Label>
      <input
        inputMode="decimal"
        value={precio}
        onChange={(e) => setPrecio(e.target.value)}
        placeholder="$"
        className="w-full rounded-xl bg-slate-800 px-3 py-3 text-base"
      />

      <Label>Ubicación</Label>
      <div className="flex gap-2">
        {UBICACIONES.map((u) => (
          <Chip key={u} active={ubicacion === u} color={accent} onClick={() => setUbicacion(u)}>
            {u}
          </Chip>
        ))}
      </div>

      <Label>Vencimiento</Label>
      <button
        onClick={() => setSinVenc(!sinVenc)}
        className="mb-2 flex min-h-[48px] w-full items-center justify-between rounded-xl bg-slate-800 px-3 text-sm font-semibold"
      >
        <span>Sin vencimiento (no avisar)</span>
        <span className="relative h-7 w-12 rounded-full transition" style={{ background: sinVenc ? accent : '#475569' }}>
          <span className="absolute top-1 h-5 w-5 rounded-full bg-white transition-all" style={{ left: sinVenc ? 24 : 4 }} />
        </span>
      </button>
      {sinVenc ? (
        <p className="rounded-xl bg-slate-800 p-3 text-center text-sm text-slate-400">Este producto no vence.</p>
      ) : (
        <>
      <div className="flex gap-2">
        <Chip onClick={() => setVenc(addDays(today(), 7))}>+7d</Chip>
        <Chip onClick={() => setVenc(addDays(today(), 15))}>+15d</Chip>
        <Chip onClick={() => setVenc(addMonths(today(), 1))}>+1m</Chip>
        <Chip onClick={() => setVenc(addMonths(today(), 6))}>+6m</Chip>
      </div>
      <input
        type="date"
        value={venc}
        onChange={(e) => setVenc(e.target.value)}
        className="mt-2 w-full rounded-xl bg-slate-800 px-3 py-3 text-base"
      />
        </>
      )}

      <button
        onClick={dictar}
        className={`mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-slate-600 font-semibold ${
          listening ? 'animate-pulse bg-red-600 text-white' : 'bg-slate-800'
        }`}
      >
        <Mic size={20} /> Dictar cantidad, precio y vencimiento
      </button>
      {heard && <p className="mt-1 text-center text-xs text-slate-400">{heard}</p>}

      <div className="mt-4">
        <BigButton onClick={guardar} color={accent}>
          Guardar {cantidad} en {activeHome}
        </BigButton>
      </div>
    </Sheet>
  )
}

function SalidaSheet({ product, onClose }: { product: CatalogItem; onClose: () => void }) {
  const { activeHome, accent, stockOf, settings } = useApp()
  const acts = useItemActions()
  const [pickHome, setPickHome] = useState(false)
  const items = stockOf(activeHome, product.ean) // ya ordenado por vencimiento (FIFO)
  const [picked, setPicked] = useState('')
  // Por defecto: la que ya está abierta; si no hay, la que vence primero.
  const item = items.find((i) => i.id_item === picked) ?? items.find((i) => i.estado === 'Abierto') ?? items[0]
  const distintas = new Set(items.map((i) => `${i.fecha_vencimiento}|${i.estado}|${i.ubicacion}`)).size > 1
  const others = settings.homes.filter((h) => h !== activeHome)

  if (!item) {
    return (
      <Sheet title={product.nombre} onClose={onClose}>
        <p>No hay stock de este producto en {activeHome}.</p>
      </Sheet>
    )
  }
  const dias = daysUntil(item.fecha_vencimiento)
  const run = (fn: () => void) => {
    fn()
    onClose()
  }

  return (
    <Sheet title={item.nombre || product.nombre} onClose={onClose}>
      {items.length > 1 && distintas ? (
        <>
          <p className="text-sm text-slate-300">
            Tenés {items.length} unidades, ¿cuál estás modificando?
          </p>
          <div className="mt-2 space-y-2">
            {items.map((i) => {
              const d = daysUntil(i.fecha_vencimiento)
              const sel = i.id_item === item.id_item
              return (
                <button
                  key={i.id_item}
                  onClick={() => setPicked(i.id_item)}
                  className={`flex min-h-[52px] w-full items-center justify-between rounded-xl border-2 px-3 text-left text-sm ${
                    sel ? 'bg-slate-800' : 'border-transparent bg-slate-800/60'
                  }`}
                  style={sel ? { borderColor: accent } : undefined}
                >
                  <span>
                    <span className="font-bold">{estadoLabel(i.estado)}</span> · {i.ubicacion}
                  </span>
                  <span className="text-slate-400">
                    {ymd(i.fecha_vencimiento) || 'sin fecha'}
                    {d !== null && ` (${d < 0 ? `venció hace ${-d} d` : `${d} d`})`}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-400">
          {items.length} en stock · {item.ubicacion} · {estadoLabel(item.estado)}
          {dias !== null && ` · vence en ${dias} d`}
        </p>
      )}
      <div className="mt-4 space-y-2">
        <BigButton color="#dc2626" onClick={() => run(() => acts.baja(item))}>
          Se Terminó (Basura)
        </BigButton>
        <BigButton color="#d97706" onClick={() => run(() => acts.abrir(item))}>
          {acts.sinVencimiento(item) ? 'Lo Abrí Hoy' : `Lo Abrí Hoy (+${acts.diasAbierto(item)} días)`}
        </BigButton>
        <BigButton color="#0284c7" onClick={() => run(() => acts.congelar(item))}>
          Pasar a Freezer (+90d)
        </BigButton>
        <BigButton color={accent} onClick={() => setPickHome(true)} disabled={!others.length}>
          Trasladar a otro Hogar
        </BigButton>
      </div>
      {pickHome && (
        <div className="mt-3 flex gap-2">
          {others.map((h) => (
            <Chip key={h} onClick={() => run(() => acts.trasladar(item, h))}>
              → {h}
            </Chip>
          ))}
        </div>
      )}
    </Sheet>
  )
}

/** Productos sin código de barras: se identifican con un código propio SC-<nombre>. */
function SinCodigoSheet({
  onPick,
  onClose,
}: {
  onPick: (item: CatalogItem, isNew: boolean) => void
  onClose: () => void
}) {
  const { db, accent } = useApp()
  const [nombre, setNombre] = useState('')
  const existentes = db.catalogo.filter((c) => String(c.ean).startsWith('SC-'))

  const continuar = () => {
    const name = nombre.trim()
    if (!name) return
    const ean = 'SC-' + norm(name).replace(/ /g, '-').slice(0, 40)
    const prev = db.catalogo.find((c) => String(c.ean) === ean)
    if (prev) return onPick(prev, false)
    onPick(
      {
        ean,
        nombre: name,
        marca: '',
        categoria: TIPO_LIMPIEZA,
        dias_vida_util_cerrado: 0, // 0 = no vence
        dias_vida_util_abierto: 730,
        ultimo_precio: 0,
        sin_tacc: false,
      },
      true,
    )
  }

  return (
    <Sheet title="Producto sin código" onClose={onClose}>
      {existentes.length > 0 && (
        <>
          <Label>Ya cargados</Label>
          <div className="flex flex-wrap gap-2">
            {existentes.map((c) => (
              <button
                key={String(c.ean)}
                onClick={() => onPick(c, false)}
                className="min-h-[44px] rounded-xl bg-slate-800 px-3 text-sm font-semibold active:scale-95"
              >
                {c.nombre}
              </button>
            ))}
          </div>
        </>
      )}
      <Label>Nombre del producto</Label>
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Ej: Esponja de cocina"
        className="w-full rounded-xl bg-slate-800 px-3 py-3 text-base"
        autoFocus
      />
      <p className="mt-1 text-xs text-slate-500">
        Si repetís el mismo nombre, se suma al mismo producto. Para dar de baja usá la pestaña Stock.
      </p>
      <div className="mt-4">
        <BigButton color={accent} onClick={continuar} disabled={!nombre.trim()}>
          Continuar
        </BigButton>
      </div>
    </Sheet>
  )
}
