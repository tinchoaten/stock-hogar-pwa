// Genera los íconos PNG de la PWA sin dependencias externas.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function png(size) {
  const bg = [5, 150, 105]
  const fg = [255, 255, 255]
  const raw = Buffer.alloc((size * 3 + 1) * size)
  // Zona segura (maskable): el dibujo ocupa el 56% central.
  const x0 = size * 0.22
  const x1 = size * 0.78
  const y0 = size * 0.26
  const y1 = size * 0.74
  const bars = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1]
  const bw = (x1 - x0) / bars.length
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      let col = bg
      if (x >= x0 && x < x1 && y >= y0 && y < y1) {
        const i = Math.min(bars.length - 1, Math.floor((x - x0) / bw))
        if (bars[i]) col = fg
      }
      const o = y * (size * 3 + 1) + 1 + x * 3
      raw[o] = col[0]
      raw[o + 1] = col[1]
      raw[o + 2] = col[2]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public', { recursive: true })
writeFileSync('public/pwa-192.png', png(192))
writeFileSync('public/pwa-512.png', png(512))
writeFileSync('public/apple-touch-icon.png', png(180))
console.log('Íconos generados')
