import { useRef, useState } from 'react'
import { Camera, Link2 } from 'lucide-react'
import BarcodeScanner from '../components/BarcodeScanner'
import { BigButton, Chip, Label, Sheet } from '../components/ui'
import { COMERCIOS, GEMINI_MODEL, UBICACIONES } from '../config'
import { useApp } from '../store'
import type { Comercio, InventoryItem } from '../types'
import { useProductResolver } from '../useProduct'
import { addDays, money, norm, num, today, uid } from '../utils'

interface Row {
  descripcion: string
  cantidad: number
  precio_unitario: number // ya con descuento global prorrateado
  ean: string | null
  include: boolean
}

/** Reduce la imagen a un máximo de 1200px y la devuelve como JPEG base64. */
async function compress(file: File, max = 1200): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.8).split(',')[1]
}

const PROMPT = `Sos un lector de tickets de compra de Argentina. Extraé SOLO los productos comprados.
Devolvé un JSON con esta forma exacta:
{"items":[{"descripcion":string,"cantidad":number,"precio_unitario":number}]}
- "precio_unitario" es el precio por unidad en pesos, como número (sin símbolo $, con punto decimal).
- Si una línea dice "2 x 1500", cantidad=2 y precio_unitario=1500.
- Ignorá subtotales, totales, IVA, medios de pago y descuentos globales.
- Si un descuento aparece debajo de un producto, restalo de ese producto.`

export default function ReceiptScannerView() {
  const { settings, db, accent, activeHome, linkAlias, addInventory, upsertCatalog, upsertRule } = useApp()
  const resolve = useProductResolver()
  const fileRef = useRef<HTMLInputElement>(null)
  const [comercio, setComercio] = useState<Comercio>('Supermercado')
  const [descuento, setDescuento] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [linking, setLinking] = useState<number | null>(null)

  const matchAlias = (desc: string): string | null => {
    const n = norm(desc)
    const hit = db.diccionario.find((a) => norm(a.alias_ticket) === n)
    return hit ? String(hit.ean_asociado) : null
  }

  const procesar = async (file: File) => {
    if (!settings.geminiKey) {
      setMsg('Falta cargar la GEMINI_API_KEY en Ajustes.')
      return
    }
    setBusy(true)
    setMsg('Comprimiendo y leyendo el ticket con IA…')
    setRows([])
    try {
      const b64 = await compress(file)
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${settings.geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              { parts: [{ text: PROMPT }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }] },
            ],
            generationConfig: { responseMimeType: 'application/json', temperature: 0 },
          }),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
      const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
      const parsed = JSON.parse(text)
      const list: { descripcion: string; cantidad: number; precio_unitario: number }[] = Array.isArray(
        parsed,
      )
        ? parsed
        : (parsed.items ?? [])
      const factor = 1 - Math.min(100, Math.max(0, num(descuento))) / 100
      const next: Row[] = list
        .filter((i) => i.descripcion)
        .map((i) => {
          const ean = matchAlias(i.descripcion)
          return {
            descripcion: String(i.descripcion),
            cantidad: Math.max(1, Math.round(num(i.cantidad, 1))),
            precio_unitario: Math.round(num(i.precio_unitario) * factor * 100) / 100,
            ean,
            include: !!ean,
          }
        })
      setRows(next)
      setMsg(next.length ? '' : 'No se detectaron productos. Probá con otra foto.')
    } catch (e) {
      setMsg(`Error al leer el ticket: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const vincular = async (idx: number, ean: string) => {
    const row = rows[idx]
    const r = await resolve(ean)
    if (!r.found || !r.item.nombre) {
      upsertCatalog({ ...r.item, nombre: row.descripcion })
    }
    linkAlias({ alias_ticket: row.descripcion, comercio, ean_asociado: ean })
    setRows((rs) => rs.map((x, i) => (i === idx ? { ...x, ean, include: true } : x)))
    setLinking(null)
  }

  const cargar = () => {
    const items: InventoryItem[] = []
    for (const r of rows) {
      if (!r.include || !r.ean) continue
      const cat = db.catalogo.find((c) => String(c.ean) === r.ean)
      const rule = db.reglasHogar.find((x) => x.hogar_id === activeHome && String(x.ean) === r.ean)
      const ubic = UBICACIONES.find((u) => u === rule?.ubicacion_habitual) ?? 'Alacena'
      const vida = num(cat?.dias_vida_util_cerrado, 180) || 180
      for (let k = 0; k < r.cantidad; k++) {
        items.push({
          id_item: uid(),
          hogar_id: activeHome,
          ean: r.ean,
          nombre: cat?.nombre || r.descripcion,
          fecha_ingreso: today(),
          fecha_vencimiento: addDays(today(), vida),
          ubicacion: ubic,
          estado: 'Cerrado',
          fecha_apertura: '',
          fecha_baja: '',
          precio_pagado: r.precio_unitario,
          comercio,
        })
      }
      if (cat) upsertCatalog({ ...cat, ultimo_precio: r.precio_unitario })
      if (!rule)
        upsertRule({ hogar_id: activeHome, ean: r.ean, stock_minimo: 1, ubicacion_habitual: ubic })
    }
    if (items.length) addInventory(items)
    setMsg(`Se cargaron ${items.length} unidades en ${activeHome}.`)
    setRows([])
  }

  const total = rows.filter((r) => r.include).reduce((s, r) => s + r.cantidad * r.precio_unitario, 0)

  return (
    <div className="space-y-3 p-3">
      <Label>Comercio</Label>
      <div className="flex gap-2">
        {COMERCIOS.map((c) => (
          <Chip key={c} active={comercio === c} color={accent} onClick={() => setComercio(c)}>
            {c}
          </Chip>
        ))}
      </div>

      <Label>% Descuento / Reintegro global (opcional)</Label>
      <input
        inputMode="decimal"
        value={descuento}
        onChange={(e) => setDescuento(e.target.value)}
        placeholder="Ej: 20"
        className="w-full rounded-xl bg-slate-800 px-3 py-3 text-base"
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void procesar(f)
          e.target.value = ''
        }}
      />
      <BigButton color={accent} disabled={busy} onClick={() => fileRef.current?.click()}>
        <span className="flex items-center justify-center gap-2">
          <Camera size={22} /> {busy ? 'Procesando…' : 'Fotografiar ticket'}
        </span>
      </BigButton>
      {msg && <p className="rounded-xl bg-slate-800 p-3 text-center text-sm">{msg}</p>}

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="rounded-2xl bg-slate-800 p-3">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={r.include}
                  disabled={!r.ean}
                  onChange={(e) =>
                    setRows((rs) => rs.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))
                  }
                  className="mt-1 h-6 w-6"
                />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold">
                    {r.ean ? db.catalogo.find((c) => String(c.ean) === r.ean)?.nombre || r.descripcion : r.descripcion}
                  </p>
                  <p className="text-xs text-slate-400">
                    {r.cantidad} × {money(r.precio_unitario)}
                    {r.ean ? ` · EAN ${r.ean}` : ' · producto nuevo'}
                  </p>
                </div>
                {!r.ean && (
                  <button
                    onClick={() => setLinking(i)}
                    className="flex min-h-[44px] items-center gap-1 rounded-xl px-3 text-sm font-bold text-white"
                    style={{ background: accent }}
                  >
                    <Link2 size={16} /> Vincular EAN
                  </button>
                )}
              </div>
            </div>
          ))}
          <p className="text-right text-sm text-slate-300">Total a cargar: {money(total)}</p>
          <BigButton color={accent} onClick={cargar} disabled={!rows.some((r) => r.include)}>
            Cargar al inventario de {activeHome}
          </BigButton>
        </div>
      )}

      {linking !== null && (
        <Sheet title={`Escaneá el envase: ${rows[linking]?.descripcion}`} onClose={() => setLinking(null)}>
          <BarcodeScanner onScan={(ean) => void vincular(linking, ean)} />
        </Sheet>
      )}
    </div>
  )
}
