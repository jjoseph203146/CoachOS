/**
 * Generates the PWA icon set as real PNG files.
 *
 * The mark is the CoachOS avatar shape from the design: an ink field (#171918)
 * with the accent-green ring (#3FA66B) used throughout the app. Written with
 * Node's built-in zlib so the build needs no image dependencies.
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../public/icons')
mkdirSync(outDir, { recursive: true })

const INK = [23, 25, 24]
const GREEN = [63, 166, 107]
const SHELL = [247, 247, 243]

function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = crc32.table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
  }
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function png(size, { maskable }) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  const cx = size / 2
  const cy = size / 2
  // Maskable icons must keep their art inside the safe zone (80% of the box).
  const scale = maskable ? 0.8 : 1
  const ringOuter = size * 0.34 * scale
  const ringInner = size * 0.22 * scale
  const dotR = size * 0.085 * scale

  let pos = 0
  for (let y = 0; y < size; y++) {
    raw[pos++] = 0 // filter type: none
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5
      const dy = y - cy + 0.5
      const dist = Math.sqrt(dx * dx + dy * dy)

      let color = INK
      if (dist <= ringOuter && dist >= ringInner) color = GREEN
      // A single dot in the ring's mouth, echoing the tab-bar accent.
      const ddx = x - (cx + ringOuter * 0.72)
      const ddy = y - (cy - ringOuter * 0.72)
      if (Math.sqrt(ddx * ddx + ddy * ddy) <= dotR) color = SHELL

      raw[pos++] = color[0]
      raw[pos++] = color[1]
      raw[pos++] = color[2]
      raw[pos++] = 255
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-192.png', 192, true],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
  ['favicon-32.png', 32, false],
]

for (const [name, size, maskable] of targets) {
  writeFileSync(resolve(outDir, name), png(size, { maskable }))
  console.log('wrote', name, `${size}x${size}`)
}
