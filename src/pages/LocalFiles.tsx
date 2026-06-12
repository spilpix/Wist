import { useMemo, useState } from 'react'
import { FilePlus2, FolderOpen, FolderSearch, HardDrive, X } from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import { toast } from '../store/toastStore'
import { parseFilename, similarity } from '../utils/filenameParser'
import { TITLE_TYPES, type ParsedFile, type Title, type TitleType } from '../types/models'
import { useI18n, t as tGlobal, tn as tnGlobal } from '../i18n'

interface FileRow extends ParsedFile {
  include: boolean
}

interface Group {
  key: string
  suggestedTitle: string
  matchTitleId: number | 'new'
  newType: TitleType
  files: FileRow[]
}

function buildGroups(files: ParsedFile[], library: Title[]): Group[] {
  const byTitle = new Map<string, ParsedFile[]>()
  for (const f of files) {
    const key = f.parsedTitle.toLowerCase()
    if (!byTitle.has(key)) byTitle.set(key, [])
    byTitle.get(key)!.push(f)
  }
  return [...byTitle.entries()].map(([key, groupFiles]) => {
    const suggested = groupFiles[0].parsedTitle
    let best: Title | null = null
    let bestScore = 0
    for (const t of library) {
      const score = Math.max(similarity(suggested, t.title), similarity(suggested, t.original_title ?? ''))
      if (score > bestScore) {
        bestScore = score
        best = t
      }
    }
    return {
      key,
      suggestedTitle: suggested,
      matchTitleId: best && bestScore >= 0.5 ? best.id : ('new' as const),
      newType: 'anime' as TitleType,
      files: groupFiles
        .sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0))
        .map((f) => ({ ...f, include: true })),
    }
  })
}

export default function LocalFiles() {
  const { t, tn } = useI18n()
  const [groups, setGroups] = useState<Group[]>([])
  const [library, setLibrary] = useState<Title[]>([])
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)

  const totalFiles = useMemo(
    () => groups.reduce((acc, g) => acc + g.files.filter((f) => f.include).length, 0),
    [groups]
  )

  const ingest = async (paths: string[]) => {
    if (!paths.length) {
      toast(tGlobal('local.noNewFiles'))
      return
    }
    const [lib, existing] = await Promise.all([
      window.wist.titles.list({}),
      window.wist.files.existingPaths(),
    ])
    const known = new Set(existing.map((p) => p.toLowerCase()))
    const fresh = paths.filter((p) => !known.has(p.toLowerCase()))
    if (!fresh.length) {
      toast(tGlobal('local.allKnown'))
      return
    }
    setLibrary(lib)
    setGroups(buildGroups(fresh.map(parseFilename), lib))
  }

  const pickFiles = async () => {
    setBusy(true)
    try {
      await ingest(await window.wist.files.pickVideos())
    } finally {
      setBusy(false)
    }
  }

  const pickFolder = async () => {
    setBusy(true)
    try {
      const folder = await window.wist.files.pickFolder()
      if (folder) await ingest(await window.wist.files.listVideosInFolder(folder))
    } finally {
      setBusy(false)
    }
  }

  const scanFolders = async () => {
    setBusy(true)
    try {
      await ingest(await window.wist.files.scanMediaFolders())
    } finally {
      setBusy(false)
    }
  }

  const updateGroup = (key: string, patch: Partial<Group>) =>
    setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, ...patch } : g)))

  const updateFile = (key: string, path: string, patch: Partial<FileRow>) =>
    setGroups((gs) =>
      gs.map((g) =>
        g.key === key
          ? { ...g, files: g.files.map((f) => (f.path === path ? { ...f, ...patch } : f)) }
          : g
      )
    )

  const doImport = async () => {
    setImporting(true)
    try {
      const payload = groups
        .map((g) => ({
          titleId: g.matchTitleId === 'new' ? undefined : g.matchTitleId,
          newTitle: g.matchTitleId === 'new' ? { title: g.suggestedTitle, type: g.newType } : undefined,
          episodes: g.files
            .filter((f) => f.include)
            .map((f) => ({ path: f.path, episode: f.episode, season: f.season })),
        }))
        .filter((g) => g.episodes.length > 0)
      const res = await window.wist.files.importEpisodes(payload)
      toast(
        tGlobal('local.imported', { n: res.createdEpisodes }) +
          (res.createdTitles ? tGlobal('local.importedTitles', { n: res.createdTitles }) : ''),
        'success'
      )
      setGroups([])
    } catch (err) {
      toast(String(err), 'error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">{t('nav.localFiles')}</h1>

      <div className="mb-8 flex gap-2">
        <button className="btn-accent" onClick={pickFiles} disabled={busy}>
          <FilePlus2 size={15} /> {t('local.addFiles')}
        </button>
        <button className="btn-ghost" onClick={pickFolder} disabled={busy}>
          <FolderOpen size={15} /> {t('local.addFolder')}
        </button>
        <button className="btn-ghost" onClick={scanFolders} disabled={busy} title={t('local.scanTooltip')}>
          <FolderSearch size={15} /> {t('local.scan')}
        </button>
      </div>

      {busy && <Spinner label={t('local.scanning')} />}

      {!busy && !groups.length && (
        <EmptyState
          icon={HardDrive}
          title={t('local.emptyTitle')}
          subtitle={t('local.emptySubtitle')}
        />
      )}

      {groups.length > 0 && (
        <>
          <div className="mb-4 text-sm text-zinc-400">
            {t('local.confirmMapping')}
          </div>
          <div className="space-y-5">
            {groups.map((g) => (
              <div key={g.key} className="card overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 border-b border-edge/60 bg-raised/50 px-4 py-3">
                  <input
                    className="input !w-64"
                    value={g.suggestedTitle}
                    onChange={(e) => updateGroup(g.key, { suggestedTitle: e.target.value })}
                  />
                  <span className="text-xs text-zinc-600">→</span>
                  <select
                    className="select"
                    value={g.matchTitleId}
                    onChange={(e) =>
                      updateGroup(g.key, {
                        matchTitleId: e.target.value === 'new' ? 'new' : Number(e.target.value),
                      })
                    }
                  >
                    <option value="new">{t('local.createNew')}</option>
                    {library.map((t) => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                  {g.matchTitleId === 'new' && (
                    <select
                      className="select"
                      value={g.newType}
                      onChange={(e) => updateGroup(g.key, { newType: e.target.value as TitleType })}
                    >
                      {TITLE_TYPES.map((v) => (
                        <option key={v} value={v}>{t(`type.${v}`)}</option>
                      ))}
                    </select>
                  )}
                  <span className="ml-auto text-xs text-zinc-600">
                    {tn('count.files', g.files.filter((f) => f.include).length)}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {g.files.map((f) => (
                      <tr key={f.path} className={`border-b border-edge/30 last:border-0 ${f.include ? '' : 'opacity-40'}`}>
                        <td className="w-10 px-4 py-2">
                          <input
                            type="checkbox"
                            checked={f.include}
                            onChange={(e) => updateFile(g.key, f.path, { include: e.target.checked })}
                            className="accent-[var(--accent)]"
                          />
                        </td>
                        <td className="max-w-0 truncate px-2 py-2 text-zinc-400" title={f.path}>
                          {f.fileName}
                        </td>
                        <td className="w-28 px-2 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-zinc-600">{t('local.ep')}</span>
                            <input
                              type="number"
                              min={0}
                              className="input !w-16 !px-2 !py-1"
                              value={f.episode ?? ''}
                              placeholder="—"
                              onChange={(e) =>
                                updateFile(g.key, f.path, {
                                  episode: e.target.value ? parseInt(e.target.value, 10) : null,
                                })
                              }
                            />
                          </div>
                        </td>
                        <td className="w-24 px-2 py-2">
                          {f.season != null && (
                            <span className="text-xs text-zinc-600">{t('local.seasonN', { n: f.season })}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          <div className="sticky bottom-0 mt-6 flex items-center justify-end gap-2 border-t border-edge/60 bg-bg/95 py-4">
            <button className="btn-ghost" onClick={() => setGroups([])}>
              <X size={15} /> {t('common.cancel')}
            </button>
            <button className="btn-accent" onClick={doImport} disabled={importing || totalFiles === 0}>
              {t('local.import', { files: tnGlobal('count.files', totalFiles) })}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
