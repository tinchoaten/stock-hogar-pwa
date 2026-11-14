import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { beep, vibrate } from '../utils'

interface Props {
  onScan: (ean: string) => void
  /** Si es false, se ignoran las lecturas (la cámara sigue encendida). */
  enabled?: boolean
  height?: number
}

/** Lector continuo EAN-13 con cámara trasera. */
export default function BarcodeScanner({ onScan, enabled = true, height = 220 }: Props) {
  const idRef = useRef(`reader-${Math.random().toString(36).slice(2, 8)}`)
  const onScanRef = useRef(onScan)
  const enabledRef = useRef(enabled)
  const last = useRef({ code: '', at: 0 })
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [manual, setManual] = useState('')
  onScanRef.current = onScan
  enabledRef.current = enabled

  const handle = (raw: string) => {
    const code = raw.length === 12 ? `0${raw}` : raw // UPC-A = EAN-13 con un 0 adelante
    const now = Date.now()
    if (!enabledRef.current) return
    if (code === last.current.code && now - last.current.at < 2500) return
    last.current = { code, at: now }
    beep()
    vibrate()
    onScanRef.current(code)
  }

  useEffect(() => {
    const scanner = new Html5Qrcode(idRef.current, {
      verbose: false,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
      ],
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    })
    let started = false
    let cancelled = false
    scanner
      .start(
        { facingMode: 'environment' },
        {
          fps: 15,
          // Zona de lectura ancha: un EAN-13 es largo y bajo, y una caja chica lo recorta.
          qrbox: (w: number, h: number) => {
            const width = Math.floor(w * 0.9)
            return { width, height: Math.floor(Math.min(h * 0.7, width * 0.55)) }
          },
          // Sin aspectRatio: en iPhone en vertical fuerza una resolución baja y borrosa.
          videoConstraints: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        },
        (text) => handle(text),
        () => undefined,
      )
      .then(() => {
        started = true
        if (cancelled) {
          void scanner.stop().then(() => scanner.clear())
          return
        }
        try {
          const s = scanner.getRunningTrackSettings()
          setInfo(`Cámara activa ${s.width ?? '?'}×${s.height ?? '?'}`)
        } catch {
          setInfo('Cámara activa')
        }
        // Enfoque continuo (iOS lo ignora si no lo soporta).
        scanner
          .applyVideoConstraints({ advanced: [{ focusMode: 'continuous' }] } as unknown as MediaTrackConstraints)
          .catch(() => undefined)
      })
      .catch((e: unknown) => setErr(`No se pudo abrir la cámara: ${String(e)}`))
    return () => {
      cancelled = true
      if (started) void scanner.stop().then(() => scanner.clear()).catch(() => undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <div
        id={idRef.current}
        className="w-full overflow-hidden rounded-2xl bg-black"
        style={{ minHeight: height }}
      />
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
      {info && !err && (
        <p className="mt-1 text-center text-xs text-slate-500">
          {info} · Acercá el código a 15–20 cm, con buena luz y sin reflejos
        </p>
      )}
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (manual.trim()) {
            handle(manual.trim())
            setManual('')
          }
        }}
      >
        <input
          inputMode="numeric"
          value={manual}
          onChange={(e) => setManual(e.target.value.replace(/\D/g, ''))}
          placeholder="O escribí el código EAN"
          className="min-w-0 flex-1 rounded-xl bg-slate-800 px-3 py-3 text-base"
        />
        <button className="rounded-xl bg-slate-700 px-4 py-3 font-semibold active:bg-slate-600">
          Buscar
        </button>
      </form>
    </div>
  )
}
