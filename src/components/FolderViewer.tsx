import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Eye, FileText, Folder, FolderOpen, Image as ImageIcon } from 'lucide-react'
import Modal from './ui/Modal'
import Spinner from './ui/Spinner'
import { useI18n } from '../i18n'

type Entry = { name: string; path: string; isDir: boolean }

const IMG_RE = /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i

/**
 * Browse a folder's contents entirely inside Bard — navigate subfolders, preview
 * images, open files in their app, drag files out to other programs. No Explorer.
 */
export default function FolderViewer({ root, onClose }: { root: { path: string; label: string }; onClose: () => void }) {
  const { t } = useI18n()
  const [cur, setCur] = useState(root.path)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback((dir: string) => {
    setLoading(true)
    window.wist.fs
      .listDir(dir)
      .then((e) => setEntries(e))
      .catch(() => setEntries([])) // a failed listing must never hang the spinner forever
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load(cur)
  }, [cur, load])

  // breadcrumb segments relative to the hub-linked root
  const rel = cur.slice(root.path.length).split(/[\\/]/).filter(Boolean)
  const crumbAt = (i: number) => root.path + (i < 0 ? '' : ['', ...rel.slice(0, i + 1)].join('\\'))

  return (
    <Modal title={root.label} onClose={onClose} width="max-w-2xl">
      <div className="flex flex-col" style={{ height: '60vh' }}>
        {/* breadcrumb */}
        <div className="mb-3 flex flex-wrap items-center gap-0.5 text-[13px] text-zinc-400">
          <button onClick={() => setCur(crumbAt(-1))} className="rounded px-2 py-0.5 font-medium text-white transition-colors hover:bg-highlight">
            {root.label}
          </button>
          {rel.map((seg, i) => {
            const last = i === rel.length - 1
            return (
              <span key={i} className="flex items-center gap-0.5">
                <ChevronRight size={14} className="text-zinc-700" />
                <button
                  onClick={() => setCur(crumbAt(i))}
                  className={`rounded px-2 py-0.5 transition-colors ${last ? 'font-medium text-white' : 'hover:bg-highlight hover:text-zinc-100'}`}
                >
                  {seg}
                </button>
              </span>
            )
          })}
        </div>

        {/* contents */}
        <div className="card flex-1 divide-y divide-edge overflow-y-auto">
          {loading ? (
            <div className="grid h-full place-items-center">
              <Spinner />
            </div>
          ) : !entries.length ? (
            <div className="grid h-full place-items-center px-6 text-center text-sm text-zinc-600">{t('hub.emptyFolder')}</div>
          ) : (
            entries.map((en) => {
              const isImg = !en.isDir && IMG_RE.test(en.name)
              const Icon = en.isDir ? Folder : isImg ? ImageIcon : FileText
              return (
                <div
                  key={en.path}
                  draggable
                  onDragStart={(e) => {
                    e.preventDefault()
                    window.wist.projects.dragOut([en.path])
                  }}
                  onClick={() => (en.isDir ? setCur(en.path) : window.wist.vault.open(en.path))}
                  className="group flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-highlight"
                  title={t('hub.dragOutHint')}
                >
                  {isImg ? (
                    <img
                      src={window.wist.media.fileUrl(en.path)}
                      alt=""
                      loading="lazy"
                      draggable={false}
                      className="h-9 w-9 shrink-0 rounded-lg border border-edge object-cover"
                    />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-raised text-zinc-400">
                      <Icon size={17} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-200 group-hover:text-white">{en.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      window.wist.shell.showItemInFolder(en.path)
                    }}
                    className="shrink-0 rounded-lg p-1.5 text-zinc-500 opacity-0 transition-all hover:text-zinc-200 group-hover:opacity-100"
                    title={t('project.reveal')}
                  >
                    <Eye size={15} />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </Modal>
  )
}
