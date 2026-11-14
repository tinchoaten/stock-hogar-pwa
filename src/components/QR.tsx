import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

/** Código QR en SVG (fondo blanco para que lo lean las cámaras). */
export default function QR({ text }: { text: string }) {
  const svg = useMemo(() => {
    try {
      const q = qrcode(0, 'L')
      q.addData(text)
      q.make()
      return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
    } catch {
      return ''
    }
  }, [text])

  if (!svg) return <p className="text-sm text-red-400">El link es demasiado largo para un QR.</p>
  return (
    <div
      className="mx-auto w-full max-w-[280px] rounded-2xl bg-white p-3 [&_svg]:h-auto [&_svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
