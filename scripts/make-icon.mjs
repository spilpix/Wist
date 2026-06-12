// Renders build/icon.svg to PNGs and bundles a multi-size Windows .ico.
// Usage: node scripts/make-icon.mjs
import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const buildDir = path.join(root, 'build')
const svg = fs.readFileSync(path.join(buildDir, 'icon.svg'), 'utf8')

const sizes = [16, 24, 32, 48, 64, 128, 256, 512]
const icoSources = []

for (const size of sizes) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
  const file = path.join(buildDir, `icon-${size}.png`)
  fs.writeFileSync(file, png)
  if (size <= 256) icoSources.push(file)
  console.log(`rendered ${path.basename(file)} (${png.length} bytes)`)
}

// electron-builder also accepts a 512px PNG (used for Linux targets if ever needed)
fs.copyFileSync(path.join(buildDir, 'icon-512.png'), path.join(buildDir, 'icon.png'))

const ico = await pngToIco(icoSources)
fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico)
console.log(`wrote icon.ico (${ico.length} bytes, ${icoSources.length} sizes)`)
