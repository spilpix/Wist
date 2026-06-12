// Standalone harness: boots the galaxy with mock data, reports WORLD_OK / WORLD_ERR.
import { createGalaxy, type GalaxyData, type GalaxyNode, type GalaxyEdge } from './createGalaxy'
import type { MemoryKind } from '../types/models'

function mock(): GalaxyData {
  const nodes: GalaxyNode[] = []
  const edges: GalaxyEdge[] = []
  const kinds: MemoryKind[] = ['title', 'note', 'moment', 'book', 'journal']

  // titles cluster
  for (let i = 0; i < 14; i++) {
    nodes.push({ id: `t${i}`, kind: i % 5 === 4 ? 'book' : 'title', label: `Тайтл №${i + 1}`, sub: '2024', route: `/title/${i}` })
  }
  // notes linking to titles and each other
  for (let i = 0; i < 10; i++) {
    const id = nodes.length
    nodes.push({ id: `n${i}`, kind: 'note', label: `Мысль о номере ${i + 1}`, sub: null, route: `/notes?open=${i}` })
    edges.push({ a: id, b: i % 14 })
    if (i > 0 && i % 3 === 0) edges.push({ a: id, b: id - 1 })
  }
  // moments attached to titles
  for (let i = 0; i < 12; i++) {
    const id = nodes.length
    nodes.push({ id: `m${i}`, kind: 'moment', label: `Момент ${i + 1}`, sub: 'эпично', route: `/title/${i % 14}` })
    edges.push({ a: id, b: i % 14 })
  }
  // journal chain
  let prev = -1
  for (let i = 0; i < 9; i++) {
    const id = nodes.length
    nodes.push({ id: `j${i}`, kind: 'journal', label: `2026-06-${String(i + 1).padStart(2, '0')}`, sub: 'день', route: '/journal' })
    if (prev >= 0) edges.push({ a: id, b: prev, weak: true })
    prev = id
  }
  // a few orphans (planned titles nobody linked yet)
  for (let i = 0; i < 6; i++) {
    nodes.push({ id: `o${i}`, kind: kinds[i % 5], label: `Одинокая звезда ${i + 1}`, sub: null, route: '/library' })
  }

  return {
    nodes,
    edges,
    kindNames: { moment: 'Момент', title: 'Тайтл', book: 'Книга', note: 'Запись', journal: 'Дневник' },
  }
}

const host = document.getElementById('host') as HTMLDivElement

createGalaxy(host, mock(), {
  navigate: (to) => console.log('NAVIGATE', to),
  tip: () => undefined,
})
  .then(() => console.log('WORLD_OK'))
  .catch((err) => {
    console.error('WORLD_ERR', err?.stack ?? String(err))
    const pre = document.createElement('pre')
    pre.style.color = 'red'
    pre.textContent = String(err?.stack ?? err)
    document.body.appendChild(pre)
  })

window.addEventListener('error', (e) => console.error('WORLD_WINDOW_ERR', e.message, e.filename, e.lineno))
window.addEventListener('unhandledrejection', (e) => console.error('WORLD_REJECTION', String(e.reason?.stack ?? e.reason)))
