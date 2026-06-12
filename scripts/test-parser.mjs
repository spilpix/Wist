// Quick assertion suite for the filename parser (run: node scripts/test-parser.mjs after esbuild bundle)
import { parseFilename, similarity } from './parser-bundle.mjs'

const cases = [
  ['[SubsPlease] Frieren - 14 (1080p) [ABCD1234].mkv', 'Frieren', 14, null],
  ['Breaking.Bad.S02E07.720p.BluRay.mkv', 'Breaking Bad', 7, 2],
  ['Naruto - Episode 14.mp4', 'Naruto', 14, null],
  ['Bleach_ep14.mkv', 'Bleach', 14, null],
  ['Avatar 1x05.avi', 'Avatar', 5, 1],
  ['One Piece - 1071v2 [WEB 1080p].mkv', 'One Piece', 1071, null],
  ['Spirited Away (2001).mkv', 'Spirited Away', null, null],
  ['Steins Gate 23.mkv', 'Steins Gate', 23, null],
  ['[Erai-raws] Oshi no Ko - 11 [1080p][Multiple Subtitle].mkv', 'Oshi no Ko', 11, null],
  ['show.name.s01e02.x264.mp4', 'show name', 2, 1],
]

let failed = 0
for (const [file, title, ep, season] of cases) {
  const r = parseFilename(file)
  const ok = r.parsedTitle === title && r.episode === ep && (season === null || r.season === season)
  if (!ok) {
    failed++
    console.log('FAIL', file, '→', JSON.stringify(r), 'expected', { title, ep, season })
  }
}
const sim = similarity('Frieren Beyond Journeys End', 'Frieren: Beyond Journey\'s End')
if (sim < 0.7) {
  failed++
  console.log('FAIL similarity', sim)
}
console.log(failed === 0 ? 'PARSER_OK all cases passed' : `PARSER_FAILED ${failed} case(s)`)
process.exit(failed === 0 ? 0 : 1)
