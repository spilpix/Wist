// Build a tiny throwaway music library to validate the scanner/tag-parser/UI.
//  testmusic/Nova Wave/Neon Album/01 First Light.wav  (playable PCM, NO tags → fallback)
//  testmusic/Nova Wave/Neon Album/02 Afterglow.wav
//  testmusic/Nova Wave/Neon Album/cover.png           (sidecar album cover)
//  testmusic/The Embers/Singles/Ember.mp3             (ID3v2.3 tags + embedded APIC cover)
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, 'testmusic')
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

function wav(seconds, freq) {
  const sr = 8000
  const n = sr * seconds
  const b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8)
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36); b.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / sr) * 6000), 44 + i * 2)
  return b
}

// ID3v2.3 text frame (UTF-8) / APIC frame
function textFrame(id, value) {
  const data = Buffer.concat([Buffer.from([0x03]), Buffer.from(value, 'utf8')]) // 0x03 = UTF-8
  const h = Buffer.alloc(10)
  h.write(id, 0, 'latin1'); h.writeUInt32BE(data.length, 4)
  return Buffer.concat([h, data])
}
function apicFrame(png) {
  const data = Buffer.concat([
    Buffer.from([0x00]), // latin1
    Buffer.from('image/png\0', 'latin1'),
    Buffer.from([0x03]), // front cover
    Buffer.from('\0', 'latin1'), // empty description
    png,
  ])
  const h = Buffer.alloc(10)
  h.write('APIC', 0, 'latin1'); h.writeUInt32BE(data.length, 4)
  return Buffer.concat([h, data])
}
function synchsafe(n) {
  return Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f])
}
function mp3WithTags() {
  const frames = Buffer.concat([
    textFrame('TIT2', 'Ember'),
    textFrame('TPE1', 'The Embers'),
    textFrame('TALB', 'Singles'),
    textFrame('TPE2', 'The Embers'),
    textFrame('TCON', 'Indie'),
    textFrame('TRCK', '1'),
    textFrame('TYER', '2024'),
    apicFrame(PNG),
  ])
  const header = Buffer.concat([Buffer.from('ID3', 'latin1'), Buffer.from([0x03, 0x00, 0x00]), synchsafe(frames.length)])
  const fakeAudio = Buffer.alloc(2048) // not decodable, but the scanner only reads tags
  return Buffer.concat([header, frames, fakeAudio])
}

fs.rmSync(root, { recursive: true, force: true })
const album = path.join(root, 'Nova Wave', 'Neon Album')
fs.mkdirSync(album, { recursive: true })
fs.writeFileSync(path.join(album, '01 First Light.wav'), wav(2, 392))
fs.writeFileSync(path.join(album, '02 Afterglow.wav'), wav(2, 523))
fs.writeFileSync(path.join(album, 'cover.png'), PNG)

const singles = path.join(root, 'The Embers', 'Singles')
fs.mkdirSync(singles, { recursive: true })
fs.writeFileSync(path.join(singles, 'Ember.mp3'), mp3WithTags())

console.log('wrote test library to', root)
