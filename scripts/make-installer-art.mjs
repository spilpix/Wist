// Renders the NSIS installer artwork (welcome/finish sidebar + inner-page header)
// in Bard's dark brand, straight from build/icon.svg so the logo always matches.
// Output: build/installerSidebar.bmp (164×314), build/installerHeader.bmp (150×57),
// build/uninstallerSidebar.bmp — electron-builder auto-picks these by name.
// Usage: node scripts/make-installer-art.mjs
import { Resvg } from '@resvg/resvg-js'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const buildDir = path.join(root, 'build')

// reuse the exact app glyph: strip icon.svg's outer <svg> wrapper so it can be
// nested at any size/position via an inner <svg viewBox="0 0 512 512">
const iconSvg = fs.readFileSync(path.join(buildDir, 'icon.svg'), 'utf8')
const GLYPH = iconSvg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
const glyph = (cx, cy, size) =>
  `<svg x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" viewBox="0 0 512 512">${GLYPH}</svg>`

// ── 24-bit BMP encoder (bottom-up BGR, 4-byte row padding) ───────────────────
// NSIS MUI bitmaps are most reliable as 24-bit BMP with no alpha, so we composite
// every pixel over the dark canvas first.
const BG = [21, 21, 22] // #151516 — a touch darker than the app canvas for contrast
function rgbaToBmp24(width, height, rgba) {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4
  const imgSize = rowSize * height
  const buf = Buffer.alloc(54 + imgSize)
  buf.write('BM', 0)
  buf.writeUInt32LE(54 + imgSize, 2)
  buf.writeUInt32LE(54, 10) // pixel-data offset
  buf.writeUInt32LE(40, 14) // DIB header size
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(height, 22)
  buf.writeUInt16LE(1, 26) // planes
  buf.writeUInt16LE(24, 28) // bits per pixel
  buf.writeUInt32LE(0, 30) // BI_RGB
  buf.writeUInt32LE(imgSize, 34)
  buf.writeInt32LE(2835, 38) // 72 DPI x
  buf.writeInt32LE(2835, 42) // 72 DPI y
  let off = 54
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const a = rgba[i + 3] / 255
      const r = Math.round(rgba[i] * a + BG[0] * (1 - a))
      const g = Math.round(rgba[i + 1] * a + BG[1] * (1 - a))
      const b = Math.round(rgba[i + 2] * a + BG[2] * (1 - a))
      buf[off++] = b
      buf[off++] = g
      buf[off++] = r
    }
    off += rowSize - width * 3 // pad row to a 4-byte boundary
  }
  return buf
}

function renderBmp(svg, width, height, outName) {
  const { pixels } = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render()
  const bmp = rgbaToBmp24(width, height, pixels)
  const file = path.join(buildDir, outName)
  fs.writeFileSync(file, bmp)
  console.log(`wrote ${outName} (${width}×${height}, ${bmp.length} bytes)`)
}

// shared bits ----------------------------------------------------------------
const WORDMARK = 'Bard'
const FONT = `font-family="Segoe UI Semibold, Segoe UI, Arial, sans-serif"`

// ── welcome / finish sidebar (164 × 314) ─────────────────────────────────────
const SIDEBAR_W = 164
const SIDEBAR_H = 314
const sidebar = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIDEBAR_W}" height="${SIDEBAR_H}" viewBox="0 0 ${SIDEBAR_W} ${SIDEBAR_H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#202024"/>
      <stop offset="0.5" stop-color="#191919"/>
      <stop offset="1" stop-color="#151517"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.30" r="0.65">
      <stop offset="0" stop-color="#2F8BE8" stop-opacity="0.30"/>
      <stop offset="1" stop-color="#2F8BE8" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${SIDEBAR_W}" height="${SIDEBAR_H}" fill="url(#bg)"/>
  <rect width="${SIDEBAR_W}" height="${SIDEBAR_H}" fill="url(#glow)"/>
  ${glyph(82, 104, 104)}
  <text x="82" y="208" text-anchor="middle" ${FONT} font-size="30" font-weight="700" fill="#EDEDEC">${WORDMARK}</text>
  <text x="82" y="234" text-anchor="middle" ${FONT} font-size="11" fill="#9A9A97" letter-spacing="0.5">Медиа-хаб · второй мозг</text>
  <g fill="#2F8BE8">
    <circle cx="68" cy="270" r="2.5"/>
    <circle cx="82" cy="270" r="2.5" fill-opacity="0.55"/>
    <circle cx="96" cy="270" r="2.5" fill-opacity="0.28"/>
  </g>
  <rect x="0" y="${SIDEBAR_H - 3}" width="${SIDEBAR_W}" height="3" fill="#2383E1"/>
</svg>`

// ── inner-page header (150 × 57) ─────────────────────────────────────────────
const HEADER_W = 150
const HEADER_H = 57
const header = `
<svg xmlns="http://www.w3.org/2000/svg" width="${HEADER_W}" height="${HEADER_H}" viewBox="0 0 ${HEADER_W} ${HEADER_H}">
  <defs>
    <linearGradient id="hbg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#202024"/>
      <stop offset="1" stop-color="#171718"/>
    </linearGradient>
  </defs>
  <rect width="${HEADER_W}" height="${HEADER_H}" fill="url(#hbg)"/>
  ${glyph(30, 28, 40)}
  <text x="56" y="34" ${FONT} font-size="19" font-weight="700" fill="#EDEDEC">${WORDMARK}</text>
  <rect x="0" y="${HEADER_H - 2}" width="${HEADER_W}" height="2" fill="#2383E1"/>
</svg>`

renderBmp(sidebar, SIDEBAR_W, SIDEBAR_H, 'installerSidebar.bmp')
renderBmp(sidebar, SIDEBAR_W, SIDEBAR_H, 'uninstallerSidebar.bmp')
renderBmp(header, HEADER_W, HEADER_H, 'installerHeader.bmp')
console.log('installer artwork done')
