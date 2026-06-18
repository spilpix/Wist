import { db } from './database'

type DB = ReturnType<typeof db>

// ───────────────────────────────────────────────────────────────────────────
// Demo content seed (used ONLY by the "Testing Bard" build — see main.ts).
// Fills every module with a coherent, realistic dataset so the app can be shown
// off end-to-end: a media library + episodes + moments + watch history, a notes
// vault, a kanban of tasks, creative hubs (sections / assets / changelog / work
// log), Miro-style canvases, a local music library, a file vault and favorites.
// Runs once, against the isolated WistTesting database, only when it's empty.
// ───────────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
/** A Date `days` ago at h:m (negative days → the future). */
const at = (days: number, h = 10, m = 0) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(h, m, 0, 0)
  return d
}
const ago = (days: number, h = 10, m = 0) => fmt(at(days, h, m))
const agoDay = (days: number) => ago(days).slice(0, 10)
const future = (days: number, h = 15, m = 0) => ago(-days, h, m)
const futureDay = (days: number) => future(days).slice(0, 10)
const j = (arr: string[]) => JSON.stringify(arr)
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]

/** Frame the saved camera so a board opens centered, assuming a ~1180×740 board. */
function viewportFor(nodes: Array<{ x: number; y: number; w: number; h: number }>) {
  const xs = nodes.flatMap((n) => [n.x, n.x + n.w])
  const ys = nodes.flatMap((n) => [n.y, n.y + n.h])
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY)
  const W = 1180, H = 740, p = 90
  const k = Math.max(0.25, Math.min((W - p * 2) / bw, (H - p * 2) / bh, 1.15))
  return { x: (W - bw * k) / 2 - minX * k, y: (H - bh * k) / 2 - minY * k, k: Math.round(k * 1000) / 1000 }
}

/** True if the seed actually ran (an empty database). */
export function seedDemoContent(): boolean {
  const d = db()
  const c = d
    .prepare(
      `SELECT (SELECT COUNT(*) FROM titles) AS titles, (SELECT COUNT(*) FROM projects) AS projects,
              (SELECT COUNT(*) FROM notes) AS notes, (SELECT COUNT(*) FROM canvases) AS canvases,
              (SELECT COUNT(*) FROM tasks) AS tasks, (SELECT COUNT(*) FROM tracks) AS tracks`
    )
    .get() as Record<string, number>
  if (c.titles || c.projects || c.notes || c.canvases || c.tasks || c.tracks) return false

  d.transaction(() => seedAll(d))()
  return true
}

function seedAll(d: DB) {
  // ─────────────────────────── LIBRARY: titles ──────────────────────────────
  const T: Record<string, number> = {}
  const insTitle = d.prepare(
    `INSERT INTO titles (title, original_title, type, status, rating, total_episodes, reading_progress, year, genres, tags, notes, date_added, date_started, date_finished)
     VALUES (@title,@orig,@type,@status,@rating,@total,@progress,@year,@genres,@tags,@notes,@added,@started,@finished)`
  )
  type TSpec = {
    key: string; title: string; orig?: string; type: string; status: string; rating?: number
    total: number; progress?: number; year?: number; genres: string[]; tags?: string[]; notes?: string
    added: number; started?: number; finished?: number
    eps?: { count: number; watched: number; durMin?: number; continueEp?: number; continuePos?: number }
  }
  const titles: TSpec[] = [
    { key: 'aot', title: 'Атака титанов', orig: 'Shingeki no Kyojin', type: 'anime', status: 'completed', rating: 9, total: 25, year: 2013, genres: ['Экшен', 'Драма', 'Фэнтези', 'Постапокалипсис'], tags: ['титаны', 'must-watch'], notes: 'Финал — один из сильнейших в индустрии.', added: 420, started: 90, finished: 60, eps: { count: 25, watched: 25, durMin: 24 } },
    { key: 'jjk', title: 'Магическая битва', orig: 'Jujutsu Kaisen', type: 'anime', status: 'watching', rating: 9, total: 24, year: 2020, genres: ['Экшен', 'Сёнэн', 'Сверхъестественное'], tags: ['сёнэн'], added: 120, started: 95, eps: { count: 24, watched: 14, durMin: 24, continueEp: 15, continuePos: 480 } },
    { key: 'frieren', title: 'Фрирен: Провожающая в последний путь', orig: 'Sousou no Frieren', type: 'anime', status: 'watching', rating: 10, total: 28, year: 2023, genres: ['Фэнтези', 'Приключения', 'Драма'], tags: ['любимое'], added: 75, started: 70, eps: { count: 28, watched: 20, durMin: 24, continueEp: 21, continuePos: 300 } },
    { key: 'fmab', title: 'Стальной алхимик: Братство', orig: 'Fullmetal Alchemist: Brotherhood', type: 'anime', status: 'completed', rating: 10, total: 26, year: 2009, genres: ['Приключения', 'Фэнтези', 'Драма'], added: 500, finished: 210, eps: { count: 26, watched: 26, durMin: 24 } },
    { key: 'opm', title: 'Ванпанчмен', orig: 'One Punch Man', type: 'anime', status: 'completed', rating: 8, total: 12, year: 2015, genres: ['Экшен', 'Комедия', 'Пародия'], added: 360, finished: 300, eps: { count: 12, watched: 12, durMin: 24 } },
    { key: 'demon', title: 'Клинок, рассекающий демонов', orig: 'Kimetsu no Yaiba', type: 'anime', status: 'watching', rating: 8, total: 26, year: 2019, genres: ['Экшен', 'Фэнтези'], added: 140, started: 100, eps: { count: 26, watched: 10, durMin: 24, continueEp: 11, continuePos: 720 } },

    { key: 'inception', title: 'Начало', orig: 'Inception', type: 'movie', status: 'completed', rating: 9, total: 1, year: 2010, genres: ['Фантастика', 'Триллер'], added: 200, finished: 45, eps: { count: 1, watched: 1, durMin: 148 } },
    { key: 'interstellar', title: 'Интерстеллар', orig: 'Interstellar', type: 'movie', status: 'completed', rating: 10, total: 1, year: 2014, genres: ['Фантастика', 'Драма'], notes: 'Монтаж сцены стыковки + Циммер = эталон.', added: 180, finished: 30, eps: { count: 1, watched: 1, durMin: 169 } },
    { key: 'parasite', title: 'Паразиты', orig: '기생충', type: 'movie', status: 'completed', rating: 9, total: 1, year: 2019, genres: ['Драма', 'Триллер'], added: 220, finished: 150, eps: { count: 1, watched: 1, durMin: 132 } },
    { key: 'dune2', title: 'Дюна: Часть вторая', orig: 'Dune: Part Two', type: 'movie', status: 'completed', rating: 8, total: 1, year: 2024, genres: ['Фантастика', 'Приключения'], added: 40, finished: 20, eps: { count: 1, watched: 1, durMin: 166 } },
    { key: 'blade', title: 'Бегущий по лезвию 2049', orig: 'Blade Runner 2049', type: 'movie', status: 'planned', total: 1, year: 2017, genres: ['Фантастика', 'Драма'], added: 10 },

    { key: 'bb', title: 'Во все тяжкие', orig: 'Breaking Bad', type: 'series', status: 'completed', rating: 10, total: 24, year: 2008, genres: ['Драма', 'Криминал', 'Триллер'], added: 470, finished: 250, eps: { count: 24, watched: 24, durMin: 47 } },
    { key: 'got', title: 'Игра престолов', orig: 'Game of Thrones', type: 'series', status: 'completed', rating: 8, total: 24, year: 2011, genres: ['Фэнтези', 'Драма'], notes: 'Кроме финального сезона.', added: 460, finished: 320, eps: { count: 24, watched: 24, durMin: 55 } },
    { key: 'stranger', title: 'Очень странные дела', orig: 'Stranger Things', type: 'series', status: 'watching', rating: 8, total: 25, year: 2016, genres: ['Фантастика', 'Хоррор', 'Драма'], added: 110, started: 80, eps: { count: 25, watched: 18, durMin: 50, continueEp: 19, continuePos: 900 } },
    { key: 'firefly', title: 'Светлячок', orig: 'Firefly', type: 'series', status: 'on_hold', rating: 9, total: 14, year: 2002, genres: ['Фантастика', 'Вестерн'], added: 130, started: 120, eps: { count: 14, watched: 6, durMin: 44 } },

    { key: 'arcane', title: 'Аркейн', orig: 'Arcane', type: 'cartoon', status: 'completed', rating: 10, total: 18, year: 2021, genres: ['Фэнтези', 'Драма', 'Боевик'], tags: ['анимация', 'эталон'], notes: 'Эталон анимации и монтажа. Разобрать покадрово.', added: 90, finished: 15, eps: { count: 18, watched: 18, durMin: 40 } },
    { key: 'gravity', title: 'Гравити Фолз', orig: 'Gravity Falls', type: 'cartoon', status: 'completed', rating: 9, total: 20, year: 2012, genres: ['Приключения', 'Мистика', 'Комедия'], added: 340, finished: 180, eps: { count: 20, watched: 20, durMin: 22 } },
    { key: 'rick', title: 'Рик и Морти', orig: 'Rick and Morty', type: 'cartoon', status: 'watching', rating: 8, total: 20, year: 2013, genres: ['Фантастика', 'Комедия'], added: 150, started: 60, eps: { count: 20, watched: 12, durMin: 22, continueEp: 13, continuePos: 360 } },

    { key: 'b1984', title: '1984', orig: 'Nineteen Eighty-Four', type: 'book', status: 'completed', rating: 9, total: 24, progress: 24, year: 1949, genres: ['Антиутопия', 'Классика'], added: 130, finished: 90 },
    { key: 'bdune', title: 'Дюна', orig: 'Dune', type: 'book', status: 'completed', rating: 10, total: 48, progress: 48, year: 1965, genres: ['Фантастика'], added: 200, finished: 120 },
    { key: 'bcrime', title: 'Преступление и наказание', orig: 'Crime and Punishment', type: 'book', status: 'on_hold', total: 40, progress: 14, year: 1866, genres: ['Классика', 'Драма'], added: 60, started: 40 },
    { key: 'bthinking', title: 'Думай медленно… решай быстро', orig: 'Thinking, Fast and Slow', type: 'book', status: 'watching', total: 38, progress: 13, year: 2011, genres: ['Психология', 'Нон-фикшн'], added: 50, started: 35 },
    { key: 'batlas', title: 'Атлант расправил плечи', orig: 'Atlas Shrugged', type: 'book', status: 'planned', total: 52, progress: 0, year: 1957, genres: ['Философия', 'Роман'], added: 5 },

    { key: 'arzamas', title: 'Arzamas · История культуры', type: 'youtube', status: 'watching', rating: 8, total: 10, year: 2024, genres: ['Образование', 'История'], added: 25, started: 20, eps: { count: 10, watched: 4, durMin: 18 } },
  ]

  const insEp = d.prepare(
    `INSERT INTO episodes (title_id, episode_number, season, name, file_path, duration_seconds, watched, watch_date, watch_position_seconds)
     VALUES (?,?,1,?,?,?,?,?,?)`
  )
  for (const s of titles) {
    const id = Number(
      insTitle.run({
        title: s.title, orig: s.orig ?? null, type: s.type, status: s.status, rating: s.rating ?? null,
        total: s.total, progress: s.progress ?? 0, year: s.year ?? null, genres: j(s.genres), tags: j(s.tags ?? []),
        notes: s.notes ?? null, added: ago(s.added, 9, 0),
        started: s.started != null ? ago(s.started, 20, 0) : null,
        finished: s.finished != null ? ago(s.finished, 22, 0) : null,
      }).lastInsertRowid
    )
    T[s.key] = id
    if (!s.eps) continue
    const { count, watched, durMin = 24, continueEp, continuePos } = s.eps
    const dur = durMin * 60
    for (let i = 1; i <= count; i++) {
      const isWatched = i <= watched
      const isContinue = i === continueEp
      // earlier episodes watched longer ago; the last few cluster near "now"
      const whenDays = Math.max(1, (s.started ?? s.added) - Math.round(((s.started ?? s.added) - 2) * (i / count)))
      insEp.run(
        id, i, s.type === 'movie' ? null : `Серия ${i}`,
        isContinue ? `C:\\Media\\${s.type}\\${s.key}\\E${pad(i)}.mkv` : null,
        dur,
        isWatched ? 1 : 0,
        isWatched ? ago(whenDays, 21, 0) : isContinue ? ago(Math.max(1, (s.started ?? s.added) - count), 21, 30) : null,
        isContinue ? (continuePos ?? Math.round(dur * 0.4)) : 0
      )
    }
  }

  // ─────────────────────────── watch history (stats) ────────────────────────
  // Spread sessions across the last ~150 days; force the last 12 days for a streak.
  const watchPool = ['aot', 'jjk', 'frieren', 'fmab', 'demon', 'interstellar', 'inception', 'dune2', 'bb', 'got', 'stranger', 'arcane', 'rick', 'gravity', 'parasite']
    .map((k) => T[k])
    .filter(Boolean)
  const insSession = d.prepare(
    'INSERT INTO watch_sessions (title_id, episode_id, started_at, ended_at, duration_seconds) VALUES (?,NULL,?,?,?)'
  )
  for (let day = 150; day >= 0; day--) {
    const active = day <= 12 || Math.random() < 0.45
    if (!active) continue
    const n = 1 + (Math.random() < 0.35 ? 1 : 0)
    for (let s = 0; s < n; s++) {
      const dur = 1200 + Math.floor(Math.random() * 2700) // 20–65 min
      const start = at(day, 19 + s, Math.floor(Math.random() * 50))
      insSession.run(pick(watchPool), fmt(start), fmt(new Date(start.getTime() + dur * 1000)), dur)
    }
  }

  // ─────────────────────────── moments ──────────────────────────────────────
  const insMoment = d.prepare(
    'INSERT INTO moments (title_id, episode_id, timestamp_seconds, screenshot_path, note, tag, created_at) VALUES (?,NULL,?,NULL,?,?,?)'
  )
  const moments: Array<[string, number, string, string, number]> = [
    ['arcane', 1340, 'Сцена на мосту — цвет и свет на максимум.', 'beautiful', 16],
    ['arcane', 2210, '«Powder…» — мурашки от монтажа и музыки.', 'epic', 18],
    ['frieren', 640, 'Воспоминание о Химмеле под звездопадом.', 'sad', 22],
    ['aot', 1100, 'Подвал. Вся правда наконец раскрыта.', 'important', 30],
    ['aot', 300, 'Первый полёт на УПМ — восторг.', 'beautiful', 55],
    ['interstellar', 5400, 'Сцена стыковки — ритм монтажа идеальный.', 'epic', 28],
    ['jjk', 1450, 'Гипервыброс. Анимация уровня кино.', 'epic', 40],
    ['bb', 1980, '«I am the one who knocks.»', 'epic', 70],
    ['gravity', 600, 'Зус и его мнение о людях — в голос.', 'funny', 120],
    ['dune2', 4200, 'Поездка на черве — дюны во весь экран.', 'beautiful', 19],
  ]
  for (const [key, ts, note, tag, dDays] of moments) {
    if (T[key]) insMoment.run(T[key], ts, note, tag, ago(dDays, 21, 15))
  }

  // ─────────────────────────── HUBS (projects) ──────────────────────────────
  const P: Record<string, number> = {}
  const insProject = d.prepare(
    `INSERT INTO projects (name, client, kind, status, color, cover_path, deadline, tools, description, pinned, sort, created_at, updated_at)
     VALUES (@name,@client,@kind,@status,@color,@cover,@deadline,@tools,@desc,@pinned,@sort,@created,@updated)`
  )
  const projects = [
    { key: 'retro', name: 'Ретроспектива года 2025', client: null, kind: 'Видео · Монтаж', status: 'active', color: '#e67d22', cover: 'gradient:tangerine', deadline: futureDay(14), tools: ['DaVinci Resolve', 'After Effects'], desc: 'Большой итоговый ролик за год: лучшие моменты, релизы и личные итоги. ~8 минут, динамичный монтаж.', pinned: 1, sort: 0, created: 40, updated: 1 },
    { key: 'channel', name: 'YouTube-канал', client: null, kind: 'Видео', status: 'active', color: '#7aa8c4', cover: 'gradient:ocean', deadline: null, tools: ['Premiere Pro', 'Photoshop'], desc: 'Контент-план и продакшн роликов: разборы аниме, кинообзоры, туториалы по монтажу.', pinned: 1, sort: 1, created: 300, updated: 3 },
    { key: 'reel', name: 'Шоурил 2026', client: null, kind: 'Моушн', status: 'idea', color: '#a87dc4', cover: 'gradient:grape', deadline: futureDay(60), tools: ['After Effects', 'Cinema 4D'], desc: 'Демо-ролик моушн-работ для портфолио. Собрать лучшие анимации за два года.', pinned: 0, sort: 2, created: 20, updated: 6 },
    { key: 'city3d', name: '3D-сцена «Ночной город»', client: null, kind: '3D', status: 'review', color: '#3a8a8a', cover: 'gradient:forest', deadline: futureDay(9), tools: ['Blender', 'DaVinci Resolve'], desc: 'Кинематографичная 3D-сцена: неон, дождь, отражения на асфальте.', pinned: 0, sort: 3, created: 50, updated: 7 },
    { key: 'site', name: 'Портфолио-сайт', client: null, kind: 'Дизайн · Веб', status: 'active', color: '#6fb06f', cover: 'gradient:peach', deadline: futureDay(30), tools: ['Figma', 'React'], desc: 'Личный сайт-портфолио с галереей работ и встроенным плеером.', pinned: 0, sort: 4, created: 15, updated: 4 },
    { key: 'wedding', name: 'Свадебный клип — Анна и Иван', client: 'Анна и Иван', kind: 'Монтаж', status: 'done', color: '#c47a7a', cover: 'gradient:dusk', deadline: agoDay(30), tools: ['DaVinci Resolve'], desc: 'Коммерческий монтаж свадебного клипа: 4 минуты + тизер для соцсетей.', pinned: 0, sort: 5, created: 120, updated: 35 },
  ]
  for (const p of projects) {
    P[p.key] = Number(
      insProject.run({
        name: p.name, client: p.client, kind: p.kind, status: p.status, color: p.color, cover: p.cover,
        deadline: p.deadline, tools: j(p.tools), desc: p.desc, pinned: p.pinned, sort: p.sort,
        created: ago(p.created, 11, 0), updated: ago(p.updated, 16, 30),
      }).lastInsertRowid
    )
  }

  // sections + assets for the hero hub (retro), plus light assets elsewhere
  const insSection = d.prepare('INSERT INTO project_sections (project_id, name, sort, created_at) VALUES (?,?,?,?)')
  const insAsset = d.prepare(
    'INSERT INTO project_assets (project_id, kind, path, url, label, sort, section_id, created_at) VALUES (?,?,?,?,?,?,?,?)'
  )
  const S: Record<string, number> = {}
  const retroSections = ['Исходники', 'Графика', 'Музыка', 'Экспорт']
  retroSections.forEach((name, i) => {
    S[name] = Number(insSection.run(P.retro, name, i, ago(38 - i, 12, 0)).lastInsertRowid)
  })
  let aSort = 0
  const asset = (pid: number, kind: string, path: string | null, url: string | null, label: string, section: number | null) =>
    insAsset.run(pid, kind, path, url, label, aSort++, section, ago(20, 12, 0))
  asset(P.retro, 'folder', 'C:\\Media\\2025\\Записи_экрана', null, 'Записи экрана', S['Исходники'])
  asset(P.retro, 'folder', 'C:\\Media\\2025\\B-roll', null, 'B-roll и перебивки', S['Исходники'])
  asset(P.retro, 'file', 'C:\\Media\\2025\\хронология_года.md', null, 'Хронология года.md', S['Исходники'])
  asset(P.retro, 'url', null, 'https://www.figma.com/file/retro2025-titles', 'Макеты титров (Figma)', S['Графика'])
  asset(P.retro, 'file', 'C:\\Media\\2025\\Графика\\титры.aep', null, 'титры.aep', S['Графика'])
  asset(P.retro, 'url', null, 'https://soundcloud.com/artist/cinematic-intro', 'Трек для интро (SoundCloud)', S['Музыка'])
  asset(P.retro, 'file', 'C:\\Media\\2025\\Музыка\\bgm_main.flac', null, 'bgm_main.flac', S['Музыка'])
  asset(P.retro, 'folder', 'C:\\Media\\2025\\Экспорт', null, 'Готовые рендеры', S['Экспорт'])
  asset(P.retro, 'url', null, 'https://youtube.com/watch?v=retro2024', 'Прошлогодняя ретроспектива (референс)', null)
  asset(P.channel, 'url', null, 'https://docs.google.com/spreadsheets/d/content-plan', 'Контент-план (таблица)', null)
  asset(P.channel, 'folder', 'C:\\Media\\Канал\\Обложки', null, 'Обложки роликов', null)
  asset(P.reel, 'url', null, 'https://www.artstation.com/saved/motion-ref', 'Референсы моушна (ArtStation)', null)
  asset(P.city3d, 'folder', 'C:\\3D\\NightCity', null, 'Проект Blender', null)
  asset(P.city3d, 'url', null, 'https://www.pinterest.com/board/neon-city', 'Мудборд: неон (Pinterest)', null)
  asset(P.site, 'url', null, 'https://www.figma.com/file/portfolio-2026', 'Дизайн сайта (Figma)', null)

  // changelog (patches) for the hero hub
  const insPatch = d.prepare(
    'INSERT INTO project_patches (project_id, version, title, body, status, tags, released_at, sort, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
  )
  const patches = [
    { v: 'v1.0', t: 'Финальный рендер', b: '- Финальный экспорт в 4K (H.265)\n- Цветокор + финальное сведение звука\n- Загружено как приватное на проверку', st: 'planned', tags: ['релиз'], rel: futureDay(13) },
    { v: 'v0.3', t: 'Звук и цветокор', b: '- Подложена музыка под весь хронометраж\n- Чистка шумов в озвучке\n- Базовый цветокор по всем сценам', st: 'released', tags: ['звук', 'цвет'], rel: agoDay(4) },
    { v: 'v0.2', t: 'Первая сборка', b: '- Собран черновой монтаж по раскадровке\n- Тайминг ~9 минут (нужно резать до 8)', st: 'released', tags: ['монтаж'], rel: agoDay(12) },
    { v: 'v0.1', t: 'Раскадровка и структура', b: '- Сценарий и блоки ролика\n- Отобраны исходники по папкам', st: 'released', tags: ['препрод'], rel: agoDay(30) },
  ]
  patches.forEach((p, i) => insPatch.run(P.retro, p.v, p.t, p.b, p.st, j(p.tags), p.rel, i, ago(30 - i * 5, 12, 0)))

  // work log (sessions) for the hero hub
  const insPSession = d.prepare(
    'INSERT INTO project_sessions (project_id, started_at, ended_at, duration_seconds, title, report, changes_json, created_at) VALUES (?,?,?,?,?,?,?,?)'
  )
  const psession = (dDays: number, hrs: number, title: string, report: string, changes: object) => {
    const start = at(dDays, 14, 0)
    const end = new Date(start.getTime() + hrs * 3600 * 1000)
    insPSession.run(P.retro, fmt(start), fmt(end), Math.round(hrs * 3600), title, report, JSON.stringify(changes), fmt(end))
  }
  psession(12, 3.5, 'Сборка блока «Лучшие моменты»', 'Собрал хайлайты по 12 тайтлам, выстроил ритм под бит. Осталось подрезать на ~20 секунд.', { added: ['highlights_v2.drp', 'broll_selects.mp4'], modified: ['timeline_main.drp'], removed: [], scanned: 142 })
  psession(4, 2, 'Цветокоррекция', 'Прошёл базовый цветокор по всем сценам, выровнял экспозицию записей экрана.', { added: ['LUT_warm.cube'], modified: ['timeline_main.drp', 'grade_nodes.drp'], removed: ['broll_old.mp4'], scanned: 138 })
  psession(1, 1.5, 'Звук и сведение', 'Подложил основную музыку, почистил шум в озвучке, расставил акценты.', { added: ['voiceover_clean.wav'], modified: ['timeline_main.drp'], removed: [], scanned: 140 })

  // ─────────────────────────── NOTES (Obsidian-style) ───────────────────────
  const F: Record<string, number> = {}
  const insFolder = d.prepare('INSERT INTO note_folders (name, parent_id, sort, created_at) VALUES (?,?,?,?)')
  F['video'] = Number(insFolder.run('Идеи для видео', null, 0, ago(300, 10, 0)).lastInsertRowid)
  F['reviews'] = Number(insFolder.run('Разборы и рецензии', null, 1, ago(280, 10, 0)).lastInsertRowid)
  F['study'] = Number(insFolder.run('Учёба', null, 2, ago(250, 10, 0)).lastInsertRowid)
  F['code'] = Number(insFolder.run('Программирование', F['study'], 0, ago(240, 10, 0)).lastInsertRowid)
  F['diary'] = Number(insFolder.run('Дневник', null, 3, ago(200, 10, 0)).lastInsertRowid)
  F['quotes'] = Number(insFolder.run('Цитаты', null, 4, ago(150, 10, 0)).lastInsertRowid)

  const N: Record<string, number> = {}
  const insNote = d.prepare(
    `INSERT INTO notes (title, content, tags, linked_title_id, project_id, folder_id, pinned, source, created_at, updated_at)
     VALUES (@title,@content,@tags,@linked,@project,@folder,@pinned,'user',@created,@updated)`
  )
  const note = (o: { key?: string; title: string; content: string; tags?: string[]; linked?: number | null; project?: number | null; folder?: number | null; pinned?: number; created: number; updated: number }) => {
    const id = Number(
      insNote.run({
        title: o.title, content: o.content, tags: j(o.tags ?? []), linked: o.linked ?? null, project: o.project ?? null,
        folder: o.folder ?? null, pinned: o.pinned ?? 0, created: ago(o.created, 10, 0), updated: ago(o.updated, 14, 0),
      }).lastInsertRowid
    )
    if (o.key) N[o.key] = id
    return id
  }
  note({ title: 'Сценарий: Ретроспектива 2025', folder: F['video'], project: P.retro, pinned: 1, tags: ['видео', 'сценарий'], created: 35, updated: 2, content: '# Ретроспектива 2025\n\nХронометраж: **~8 минут**. Тон — тёплый, личный.\n\n## Структура\n1. Интро (0:00–0:30) — крючок, лучший кадр года\n2. Лучшие моменты — нарезка под бит\n3. Топ-5 релизов года\n4. Личные итоги\n5. Планы на 2026\n6. Аутро + призыв подписаться\n\n> Главное — не отчёт, а ощущение года.\n\n#видео #сценарий' })
  note({ title: 'Идеи роликов на квартал', folder: F['video'], pinned: 1, tags: ['идеи'], created: 60, updated: 5, content: '## Что снять\n- [ ] Разбор монтажа «Аркейн» покадрово\n- [ ] Почему «Фрирен» — это про время\n- [x] Как я организую второй мозг\n- [ ] Туториал: цветокор за 10 минут\n- [ ] Топ-10 саундтреков для монтажа\n\n#идеи #контент' })
  note({ key: 'arcaneReview', title: 'Разбор: монтаж «Аркейн»', folder: F['reviews'], linked: T.arcane, tags: ['монтаж', 'анимация'], created: 14, updated: 8, content: '# Монтаж «Аркейн»\n\nЧто делает сцены такими сильными:\n- **Ритм** склеек точно под музыку\n- Смелые переходы по форме и цвету\n- Камера живёт, а не просто показывает\n\nРазобрать сцену на мосту покадрово для ролика. #монтаж #анимация' })
  note({ title: 'Почему «Фрирен» — это про время', folder: F['reviews'], linked: T.frieren, tags: ['аниме', 'эссе'], created: 20, updated: 12, content: 'Сериал о том, что ценность мгновения понимаешь только потом.\n\n> «Я хочу узнать о людях больше.»\n\nТемп повествования сам становится приёмом. #аниме #эссе' })
  note({ title: 'Рецензия: Интерстеллар', folder: F['reviews'], linked: T.interstellar, tags: ['кино'], created: 30, updated: 20, content: '**10/10.** Наука, эмоция и монтаж в одном.\n\nСцена стыковки — лучший пример того, как ритм монтажа и музыка создают напряжение. #кино' })
  note({ key: 'react', title: 'React: хуки — конспект', folder: F['code'], tags: ['react', 'frontend'], created: 18, updated: 15, content: '## useEffect\nЗапускается после рендера. Чисти за собой:\n\n```js\nuseEffect(() => {\n  const id = setInterval(tick, 1000)\n  return () => clearInterval(id)\n}, [])\n```\n\n`useMemo` — кэш значения, `useCallback` — кэш функции. #react #frontend' })
  note({ title: 'TypeScript: дженерики', folder: F['code'], tags: ['typescript'], created: 22, updated: 18, content: 'Дженерик — это параметр типа.\n\n```ts\nfunction first<T>(arr: T[]): T | undefined {\n  return arr[0]\n}\n```\n\nИспользуй `extends` для ограничений. #typescript' })
  note({ title: 'Цветокоррекция в DaVinci — пайплайн', folder: F['study'], tags: ['davinci', 'цвет'], created: 12, updated: 6, content: '1. Баланс белого\n2. Экспозиция (waveform)\n3. Контраст\n4. Saturation\n5. Творческий грейд (LUT)\n6. Виньетка/зерно\n\nРаботать в нодах, не на клипах. #davinci #цвет' })
  note({ title: 'Список книг на 2026', folder: F['study'], tags: ['книги'], created: 25, updated: 25, content: '- [ ] Атлант расправил плечи\n- [ ] Цена цивилизации\n- [x] Думай медленно… решай быстро (в процессе)\n- [ ] Гёдель, Эшер, Бах\n\n#книги' })
  note({ title: 'Цитаты из «Дюны»', folder: F['quotes'], linked: T.bdune, tags: ['цитаты'], created: 40, updated: 40, content: '> Страх убивает разум.\n\n> Тот, кто способен разрушить вещь, властвует над ней.\n\n> Без перемен нет жизни. #цитаты' })
  note({ title: 'Дневник · итоги недели', folder: F['diary'], tags: ['дневник'], created: 7, updated: 1, content: 'Продуктивная неделя: собрал черновик ретроспективы и закрыл цветокор.\n\nЭнергии было много по утрам. Спорт 3 раза.\n\nНа следующей — озвучка и финальный экспорт.' })
  note({ title: 'Сетап рабочего места', tags: ['сетап', 'железо'], created: 35, updated: 35, content: '## Текущий сетап\n- CPU: Ryzen 9, 64 ГБ RAM\n- 2 монитора, один в портрете под тайминги\n- SSD под кэш проектов\n\nХочу добавить колор-панель. #сетап #железо' })
  note({ title: 'Идея: серия про второй мозг', folder: F['video'], project: P.channel, tags: ['идеи', 'pkm'], created: 9, updated: 9, content: 'Серия роликов о том, как вести второй мозг: заметки, граф связей, проекты.\n\nПоказать на примере Bard. #идеи #pkm' })
  note({ title: 'Музыка для роликов (лицензии)', folder: F['video'], tags: ['музыка'], created: 11, updated: 11, content: 'Источники без проблем с авторскими:\n- Epidemic Sound (подписка)\n- Artlist\n- YouTube Audio Library\n\nДля ретроспективы — лицензия Epidemic. #музыка' })
  note({ key: 'goals', title: 'Цели на месяц', pinned: 1, tags: ['цели'], created: 30, updated: 3, content: '## Июнь\n- [ ] Выпустить ретроспективу года\n- [ ] 2 ролика на канал\n- [x] Закрыть свадебный заказ\n- [ ] Свёрстать главную портфолио\n- [ ] Дочитать «Думай медленно»\n\n#цели' })

  // ─────────────────────────── TASKS (kanban) ───────────────────────────────
  const TK: Record<string, number> = {}
  const insTask = d.prepare(
    `INSERT INTO tasks (title, note, done, status, priority, due_date, remind_at, reminded, tags, project_id, linked_title_id, source, created_at, completed_at, position)
     VALUES (@title,@note,@done,@status,@priority,@due,@remind,0,@tags,@project,@linked,'user',@created,@completed,0)`
  )
  const task = (o: { key?: string; title: string; note?: string; status: string; priority?: string; due?: string | null; remind?: string | null; tags?: string[]; project?: number | null; linked?: number | null; created: number; completed?: number }) => {
    const done = o.status === 'done' ? 1 : 0
    const id = Number(
      insTask.run({
        title: o.title, note: o.note ?? null, done, status: o.status, priority: o.priority ?? 'none',
        due: o.due ?? null, remind: o.remind ?? null, tags: j(o.tags ?? []), project: o.project ?? null,
        linked: o.linked ?? null, created: ago(o.created, 9, 30),
        completed: done ? ago(o.completed ?? 1, 18, 0) : null,
      }).lastInsertRowid
    )
    if (o.key) TK[o.key] = id
    return id
  }
  task({ key: 'highlights', title: 'Смонтировать блок «Лучшие моменты»', note: '≈ 90 секунд, динамичный, под бит.', status: 'doing', priority: 'high', due: futureDay(3), tags: ['монтаж'], project: P.retro, created: 12 })
  task({ title: 'Записать голос за кадром', status: 'todo', priority: 'high', tags: ['озвучка'], project: P.retro, created: 8 })
  task({ title: 'Цветокор финальной сцены', status: 'todo', tags: ['цвет'], project: P.retro, created: 6 })
  task({ title: 'Экспорт 4K и загрузка', status: 'todo', due: futureDay(13), project: P.retro, created: 5 })
  task({ title: 'Свести музыку под ритм', status: 'doing', tags: ['звук'], project: P.retro, created: 4 })
  task({ key: 'plan', title: 'Контент-план на январь', status: 'doing', priority: 'high', due: futureDay(5), project: P.channel, created: 10 })
  task({ title: 'Снять ролик про второй мозг', status: 'todo', tags: ['съёмка'], project: P.channel, created: 9 })
  task({ title: 'Обновить обложки плейлистов', status: 'done', project: P.channel, created: 14, completed: 2 })
  task({ key: 'neon', title: 'Собрать референсы неона', status: 'doing', tags: ['3d', 'референсы'], project: P.city3d, created: 11 })
  task({ title: 'Настроить пресет рендера', status: 'todo', project: P.city3d, created: 7 })
  task({ title: 'Свёрстать главную страницу', status: 'todo', tags: ['вёрстка'], project: P.site, created: 6 })
  task({ title: 'Дизайн галереи работ', status: 'doing', project: P.site, created: 5 })
  task({ title: 'Досмотреть «Магическую битву»', status: 'todo', priority: 'low', tags: ['аниме'], linked: T.jjk, created: 6 })
  task({ title: 'Дочитать «Преступление и наказание»', status: 'doing', tags: ['книги'], linked: T.bcrime, created: 8 })
  task({ title: 'Созвон с клиентом по правкам', status: 'todo', priority: 'high', due: futureDay(1), remind: future(1, 11, 0), tags: ['встреча'], created: 3 })
  task({ title: 'Бэкап всех проектов на SSD', status: 'done', tags: ['рутина'], created: 5, completed: 1 })
  task({ title: 'Купить лицензию на музыку (Epidemic)', status: 'done', tags: ['покупки'], created: 9, completed: 4 })
  task({ title: 'Сдать свадебный клип клиенту', status: 'done', project: P.wedding, created: 40, completed: 32 })

  // task comments (shown in the detail peek)
  const insComment = d.prepare('INSERT INTO task_comments (task_id, body, created_at) VALUES (?,?,?)')
  insComment.run(TK.highlights, 'Нашёл идеальный бит для нарезки — 124 BPM.', ago(6, 12, 0))
  insComment.run(TK.highlights, 'Переходы по цвету между сценами Аркейн и Фрирен смотрятся отлично.', ago(3, 15, 0))
  insComment.run(TK.plan, 'Первый ролик месяца — разбор «Аркейн».', ago(7, 10, 0))
  insComment.run(TK.neon, 'Сохранил доску в Pinterest, добавил в ассеты хаба.', ago(9, 16, 0))

  // ─────────────────────────── CANVASES (Miro-style) ────────────────────────
  const C: Record<string, number> = {}
  const insCanvas = d.prepare('INSERT INTO canvases (name, data, created_at, updated_at) VALUES (?,?,?,?)')
  const saveCanvas = (key: string, name: string, nodes: any[], edges: any[], createdDays: number, updatedDays: number) => {
    const data = { nodes, edges, viewport: viewportFor(nodes), guides: [] }
    C[key] = Number(insCanvas.run(name, JSON.stringify(data), ago(createdDays, 12, 0), ago(updatedDays, 17, 0)).lastInsertRowid)
  }

  const shape = (id: string, x: number, y: number, w: number, h: number, text: string, fill: string, extra: object = {}) =>
    ({ id, type: 'shape', shape: 'roundRect', x, y, w, h, text, fill, stroke: 'transparent', textColor: '#ffffff', fontSize: 16, bold: true, align: 'center', radius: 14, ...extra })
  const ellipse = (id: string, x: number, y: number, w: number, h: number, text: string, fill: string) =>
    ({ id, type: 'shape', shape: 'ellipse', x, y, w, h, text, fill, stroke: 'transparent', textColor: '#ffffff', fontSize: 15, bold: true, align: 'center' })
  const sticky = (id: string, x: number, y: number, text: string, fill = '#FCE7A1') =>
    ({ id, type: 'sticky', x, y, w: 200, h: 120, text, fill, textColor: '#2b2417', fontSize: 13, align: 'left', author: 'Эрадж' })
  const textNode = (id: string, x: number, y: number, text: string, fontSize = 26) =>
    ({ id, type: 'text', x, y, w: 360, h: 44, text, fontSize, bold: true, textColor: '#e9e7e2', align: 'left', autoWidth: false })
  const edge = (id: string, from: string, to: string, o: object = {}) =>
    ({ id, from, to, type: 'straight', arrow: 'end', color: '#8a8278', width: 2, ...o })

  // 1) Vertical script flow
  ;{
    const cols = ['#e67d22', '#7aa8c4', '#6fb06f', '#a87dc4', '#c9a96b', '#c47a7a']
    const labels = ['🎬 Интро · 0:00–0:30', 'Лучшие моменты года', 'Топ-5 релизов', 'Личные итоги', 'Планы на 2026', '🙌 Аутро · подписка']
    const nodes: any[] = [textNode('t1', 60, -90, 'Сценарий ролика')]
    const edges: any[] = []
    labels.forEach((lab, i) => nodes.push(shape(`s${i}`, 120, i * 150, 280, 88, lab, cols[i])))
    for (let i = 0; i < labels.length - 1; i++) edges.push(edge(`e${i}`, `s${i}`, `s${i + 1}`, { fromAnchor: 'b', toAnchor: 't' }))
    nodes.push(sticky('k1', 480, 40, 'Крючок: лучший кадр года + вопрос зрителю.'))
    nodes.push(sticky('k2', 480, 340, 'Здесь нужна музыка с нарастанием → переход на итоги.', '#BFE3C9'))
    nodes.push(sticky('k3', 480, 640, 'CTA: подписка + ссылка на прошлую ретроспективу.', '#CFE0F3'))
    saveCanvas('script', 'Сценарий: Ретроспектива 2025', nodes, edges, 34, 2)
  }

  // 2) Radial content map
  {
    const center = ellipse('c', 440, 300, 220, 130, 'Контент 2026', '#e67d22')
    const branches = [
      ellipse('b1', 80, 60, 200, 96, 'Аниме-разборы', '#7aa8c4'),
      ellipse('b2', 800, 70, 200, 96, 'Кинообзоры', '#6fb06f'),
      ellipse('b3', 880, 320, 200, 96, 'Туториалы: монтаж', '#a87dc4'),
      ellipse('b4', 760, 560, 200, 96, 'Влоги', '#c9a96b'),
      ellipse('b5', 120, 560, 200, 96, 'Реакции', '#c47a7a'),
      ellipse('b6', 0, 320, 200, 96, 'Shorts / клипы', '#3a8a8a'),
    ]
    const nodes: any[] = [center, ...branches,
      sticky('m1', 60, -90, 'Аркейн · Фрирен · JJK — есть готовые заметки.'),
      sticky('m2', 900, 470, 'Влоги: процесс монтажа за кадром.', '#BFE3C9'),
    ]
    const edges = branches.map((b, i) => edge(`r${i}`, 'c', b.id, { type: 'curve', arrow: 'none', color: '#6a6660', width: 2 }))
    saveCanvas('map', 'Карта контента канала', nodes, edges, 50, 6)
  }

  // 3) Mood board: colour + style
  {
    const palette = [
      ['#0E1A2B', 'Глубокий синий'], ['#E67D22', 'Тёплый акцент'], ['#7AA8C4', 'Холодный голубой'],
      ['#1C2B22', 'Тёмно-зелёный'], ['#C9A96B', 'Песок'], ['#A87DC4', 'Неон-фиолет'],
    ]
    const nodes: any[] = [textNode('t', 40, -80, 'Мудборд: цвет и стиль')]
    palette.forEach((p, i) => {
      const x = 40 + (i % 3) * 230, y = Math.floor(i / 3) * 200
      nodes.push({ id: `c${i}`, type: 'shape', shape: 'roundRect', x, y, w: 200, h: 130, text: '', fill: p[0], stroke: 'transparent', radius: 16 })
      nodes.push({ id: `cl${i}`, type: 'text', x: x + 6, y: y + 138, w: 190, h: 24, text: p[1], fontSize: 13, textColor: '#cbc8c2', align: 'left', autoWidth: false })
    })
    nodes.push(sticky('s1', 730, 0, 'Стиль: кинематографично, мягкое зерно, тёплые тени.'))
    nodes.push(sticky('s2', 730, 200, 'Шрифты: Inter (текст) + контрастный гротеск для титров.', '#CFE0F3'))
    saveCanvas('mood', 'Мудборд: цвет и стиль', nodes, [], 45, 9)
  }

  // 4) Horizontal editing pipeline
  {
    const steps = ['Импорт', 'Черновой монтаж', 'Звук', 'Цветокор', 'Графика / титры', 'Экспорт']
    const cols = ['#7aa8c4', '#e67d22', '#a87dc4', '#6fb06f', '#c9a96b', '#c47a7a']
    const nodes: any[] = [textNode('t', 0, -80, 'Воркфлоу монтажа')]
    const edges: any[] = []
    steps.forEach((s, i) => nodes.push(shape(`p${i}`, i * 210, 0, 180, 90, s, cols[i])))
    for (let i = 0; i < steps.length - 1; i++) edges.push(edge(`e${i}`, `p${i}`, `p${i + 1}`, { fromAnchor: 'r', toAnchor: 'l' }))
    nodes.push(sticky('a1', 180, 160, 'Бэкап исходников сразу при импорте.'))
    nodes.push(sticky('a2', 620, -190, 'Звук делаю до цвета — иначе перетайминг.', '#BFE3C9'))
    nodes.push(sticky('a3', 1050, 160, 'Пресет экспорта: 4K, H.265, 2-pass.', '#CFE0F3'))
    saveCanvas('pipeline', 'Воркфлоу монтажа', nodes, edges, 60, 11)
  }

  // ─────────────────────────── MUSIC (local library) ────────────────────────
  const insTrack = d.prepare(
    `INSERT INTO tracks (path, title, artist, album, album_artist, genre, year, track_no, disc_no, duration_seconds, cover_path, liked, play_count, last_played, added_at)
     VALUES (@path,@title,@artist,@album,@album_artist,@genre,@year,@track_no,1,@dur,NULL,@liked,@plays,@last,@added)`
  )
  type Alb = { artist: string; album: string; genre: string; year: number; tracks: Array<[string, number, boolean?, number?]> }
  const albums: Alb[] = [
    { artist: 'Hans Zimmer', album: 'Interstellar (OST)', genre: 'Soundtrack', year: 2014, tracks: [['Cornfield Chase', 132, true, 41], ['Day One', 240, false, 12], ['No Time for Caution', 245, true, 33], ['Stay', 380, false, 8]] },
    { artist: 'Joe Hisaishi', album: 'Spirited Away (OST)', genre: 'Soundtrack', year: 2001, tracks: [["One Summer's Day", 200, true, 27], ['The Name of Life', 220, false, 9], ['Reprise', 230, false, 6]] },
    { artist: 'Daft Punk', album: 'Random Access Memories', genre: 'Electronic', year: 2013, tracks: [['Get Lucky', 369, true, 52], ['Instant Crush', 337, false, 18], ['Lose Yourself to Dance', 353, false, 11]] },
    { artist: 'The Weeknd', album: 'After Hours', genre: 'Pop', year: 2020, tracks: [['Blinding Lights', 200, true, 47], ['Save Your Tears', 215, false, 21], ['In Your Eyes', 238, false, 14]] },
    { artist: 'Radiohead', album: 'OK Computer', genre: 'Rock', year: 1997, tracks: [['Paranoid Android', 383, false, 7], ['No Surprises', 229, true, 19], ['Karma Police', 264, false, 13]] },
    { artist: 'Кино', album: 'Группа крови', genre: 'Рок', year: 1988, tracks: [['Группа крови', 285, true, 38], ['Спокойная ночь', 366, false, 10], ['Война', 240, false, 5]] },
    { artist: 'Chillhop', album: 'Late Night Study', genre: 'Lo-Fi', year: 2022, tracks: [['Rainy Tokyo', 150, false, 22], ['Coffee & Code', 165, true, 64], ['Midnight Train', 170, false, 16], ['Slow Morning', 160, false, 9]] },
  ]
  const trackId: Record<string, number> = {}
  for (const a of albums) {
    a.tracks.forEach(([title, dur, liked, plays], i) => {
      const path = `C:\\Music\\${a.artist}\\${a.album}\\${pad(i + 1)} - ${title}.flac`
      const id = Number(
        insTrack.run({
          path, title, artist: a.artist, album: a.album, album_artist: a.artist, genre: a.genre, year: a.year,
          track_no: i + 1, dur, liked: liked ? 1 : 0, plays: plays ?? 0,
          last: (plays ?? 0) > 0 ? ago(Math.floor(Math.random() * 30) + 1, 22, 0) : null,
          added: ago(120, 12, 0),
        }).lastInsertRowid
      )
      trackId[title] = id
    })
  }

  // music playlists
  const insMPlaylist = d.prepare('INSERT INTO music_playlists (name, created_at) VALUES (?,?)')
  const insMPT = d.prepare('INSERT INTO music_playlist_tracks (playlist_id, track_id, sort) VALUES (?,?,?)')
  const playlist = (name: string, days: number, trackTitles: string[]) => {
    const pid = Number(insMPlaylist.run(name, ago(days, 12, 0)).lastInsertRowid)
    trackTitles.forEach((t, i) => trackId[t] && insMPT.run(pid, trackId[t], i))
  }
  playlist('Для монтажа', 90, ['Cornfield Chase', 'No Time for Caution', "One Summer's Day", 'The Name of Life', 'Rainy Tokyo', 'Midnight Train'])
  playlist('Фокус · глубокая работа', 60, ['Coffee & Code', 'Slow Morning', 'No Surprises', 'Day One', 'Reprise'])
  playlist('Драйв', 30, ['Get Lucky', 'Blinding Lights', 'Instant Crush', 'Save Your Tears', 'Группа крови'])

  // external playlist links (Музыка → плейлисты-ссылки)
  const insPlaylist = d.prepare('INSERT INTO playlists (title, url, service, cover_path, notes, created_at) VALUES (?,?,?,NULL,?,?)')
  insPlaylist.run('Synthwave Mix', 'https://open.spotify.com/playlist/synthwave', 'spotify', 'Драйвовый ретро-вейв для вечернего монтажа.', ago(80, 12, 0))
  insPlaylist.run('Аниме OST', 'https://music.youtube.com/playlist?list=anime-ost', 'youtube', 'Лучшие саундтреки из аниме.', ago(70, 12, 0))
  insPlaylist.run('Работа без слов', 'https://music.yandex.ru/users/x/playlists/instrumental', 'yandex', 'Инструментал для концентрации.', ago(40, 12, 0))

  // ─────────────────────────── FILE VAULT ───────────────────────────────────
  const insVFolder = d.prepare("INSERT INTO vault_files (name, path, size, kind, parent_id, created_at) VALUES (?,'',0,'folder',?,?)")
  const insVFile = d.prepare('INSERT INTO vault_files (name, path, size, kind, parent_id, created_at) VALUES (?,?,?,?,?,?)')
  const vfolder = (name: string, parent: number | null, days: number) => Number(insVFolder.run(name, parent, ago(days, 12, 0)).lastInsertRowid)
  const vfile = (name: string, kind: string, size: number, parent: number | null, days: number) =>
    insVFile.run(name, `C:\\Vault\\${name}`, size, kind, parent, ago(days, 12, 0))
  const vProjects = vfolder('Проекты', null, 200)
  const vRetro = vfolder('Ретроспектива 2025', vProjects, 40)
  vfile('таймлайн.drp', 'doc', 2_400_000, vRetro, 5)
  vfile('превью_4k.png', 'image', 8_900_000, vRetro, 4)
  vfile('финал_4k.mp4', 'video', 1_840_000_000, vRetro, 2)
  vfolder('Шоурил', vProjects, 20)
  const vWed = vfolder('Свадьба · Анна и Иван', vProjects, 120)
  vfile('свадебный_клип.mp4', 'video', 920_000_000, vWed, 35)
  const vRefs = vfolder('Референсы', null, 150)
  vfile('неон_мудборд.jpg', 'image', 3_200_000, vRefs, 30)
  vfile('композиция.png', 'image', 1_900_000, vRefs, 28)
  vfile('палитра.png', 'image', 850_000, vRefs, 25)
  const vMusic = vfolder('Музыка для видео', null, 100)
  vfile('epic_intro.flac', 'audio', 41_000_000, vMusic, 20)
  vfile('lofi_bg.mp3', 'audio', 7_300_000, vMusic, 18)
  const vDocs = vfolder('Документы', null, 130)
  vfile('договор_свадьба.pdf', 'doc', 320_000, vDocs, 40)
  vfile('смета_проекта.xlsx', 'doc', 64_000, vDocs, 22)
  vfile('архив_2024.zip', 'archive', 5_600_000_000, null, 60)
  vfile('брендбук.pdf', 'doc', 4_100_000, null, 45)

  // ─────────────────────────── FAVORITES (pin anything) ─────────────────────
  const insFav = d.prepare(
    'INSERT INTO favorites (kind, ref, label, sublabel, cover_path, route, sort, created_at) VALUES (?,?,?,?,?,?,?,?)'
  )
  let favSort = 0
  const fav = (kind: string, ref: number | string, label: string, route: string | null, sub: string | null = null) =>
    insFav.run(kind, String(ref), label, sub, null, route, favSort++, ago(10 - favSort, 12, 0))
  fav('project', P.retro, 'Ретроспектива года 2025', `/project/${P.retro}`)
  fav('canvas', C.script, 'Сценарий: Ретроспектива 2025', `/canvas/${C.script}`)
  fav('title', T.arcane, 'Аркейн', `/title/${T.arcane}`)
  fav('note', N.goals, 'Цели на месяц', `/notes?open=${N.goals}`)
  fav('task', TK.highlights, 'Смонтировать блок «Лучшие моменты»', '/tasks')
  if (trackId['Get Lucky']) fav('track', trackId['Get Lucky'], 'Get Lucky', '/music', 'Daft Punk')
  fav('route', '/music', 'Музыка', '/music')
}
