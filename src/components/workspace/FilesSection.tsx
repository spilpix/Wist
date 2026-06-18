import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronRight, Download, File as FileIcon, FileImage, FileText, Film, Folder,
  FolderPlus, Music, Trash2, Upload,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { formatSize, timeAgo } from '../../lib/wsUi'
import Spinner from '../ui/Spinner'
import EmptyState from '../ui/EmptyState'
import { toast } from '../../store/toastStore'

const BUCKET = 'workspace-files'

interface SharedFile {
  id: string
  workspace_id: string
  parent_id: string | null
  kind: string // 'folder' | 'file'
  name: string
  storage_path: string | null
  size: number | null
  mime: string | null
  created_by: string | null
  created_at: string
}

function fileIcon(mime: string | null) {
  if (!mime) return FileIcon
  if (mime.startsWith('image/')) return FileImage
  if (mime.startsWith('video/')) return Film
  if (mime.startsWith('audio/')) return Music
  if (mime.includes('pdf') || mime.startsWith('text/')) return FileText
  return FileIcon
}

export default function FilesSection({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const logActivity = useWorkspaceStore((s) => s.logActivity)
  const [items, setItems] = useState<SharedFile[]>([])
  const [loading, setLoading] = useState(true)
  const [path, setPath] = useState<{ id: string | null; name: string }[]>([{ id: null, name: 'Файлы' }])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const cwd = path[path.length - 1].id

  const reload = useCallback(() => {
    supabase.from('shared_files').select('*').eq('workspace_id', workspaceId).order('kind').order('name')
      .then(({ data }) => { setItems(data ?? []); setLoading(false) })
  }, [workspaceId])

  useEffect(() => {
    reload()
    const ch = supabase.channel(`files:${workspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_files', filter: `workspace_id=eq.${workspaceId}` }, reload)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [workspaceId, reload])

  const here = items.filter((i) => i.parent_id === cwd)
  const folders = here.filter((i) => i.kind === 'folder')
  const files = here.filter((i) => i.kind === 'file')

  const newFolder = async () => {
    const name = prompt('Название папки', 'Новая папка')?.trim()
    if (!name) return
    await supabase.from('shared_files').insert({ workspace_id: workspaceId, parent_id: cwd, kind: 'folder', name, created_by: userId })
  }

  const onPickFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    setBusy(true)
    try {
      for (const file of Array.from(list)) {
        const safe = file.name.replace(/[^\w.\-]+/g, '_')
        const storagePath = `${workspaceId}/${crypto.randomUUID()}-${safe}`
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, file, { contentType: file.type || undefined })
        if (upErr) throw upErr
        await supabase.from('shared_files').insert({
          workspace_id: workspaceId, parent_id: cwd, kind: 'file', name: file.name,
          storage_path: storagePath, size: file.size, mime: file.type || null, created_by: userId,
        })
        logActivity('file_upload', `загрузил файл «${file.name}»`)
      }
      toast(`Загружено: ${list.length}`, 'success')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast(`Не удалось загрузить: ${msg}`)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const download = (f: SharedFile) => {
    if (!f.storage_path) return
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(f.storage_path)
    window.open(data.publicUrl, '_blank')
  }

  const remove = async (f: SharedFile) => {
    if (f.kind === 'folder') {
      // delete folder + everything inside (collect descendants)
      const ids = new Set<string>([f.id])
      let changed = true
      while (changed) {
        changed = false
        for (const it of items) if (it.parent_id && ids.has(it.parent_id) && !ids.has(it.id)) { ids.add(it.id); changed = true }
      }
      const paths = items.filter((it) => ids.has(it.id) && it.storage_path).map((it) => it.storage_path!)
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
      await supabase.from('shared_files').delete().in('id', Array.from(ids))
    } else {
      if (f.storage_path) await supabase.storage.from(BUCKET).remove([f.storage_path])
      await supabase.from('shared_files').delete().eq('id', f.id)
    }
  }

  if (loading) return <div className="grid h-full place-items-center"><Spinner /></div>

  return (
    <div className="flex h-full min-w-0 flex-1 animate-fade-in flex-col"
      onDragOver={(e) => { e.preventDefault() }}
      onDrop={(e) => { e.preventDefault(); onPickFiles(e.dataTransfer.files) }}>
      {/* header + breadcrumb */}
      <div className="flex items-center justify-between gap-3 border-b border-edge px-6 py-3">
        <div className="flex min-w-0 items-center gap-1 text-sm">
          {path.map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={13} className="text-zinc-600" />}
              <button
                onClick={() => setPath((p) => p.slice(0, i + 1))}
                className={`truncate ${i === path.length - 1 ? 'font-semibold text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                {seg.name}
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={newFolder} className="btn !px-3 !py-1.5 text-xs"><FolderPlus size={13} /> Папка</button>
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn-accent !px-3 !py-1.5 text-xs">
            <Upload size={13} /> {busy ? 'Загрузка…' : 'Загрузить'}
          </button>
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => onPickFiles(e.target.files)} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {here.length === 0 ? (
          <EmptyState
            icon={Upload}
            title="Пусто"
            subtitle="Перетащи файлы сюда или нажми «Загрузить» — папки делят их по разделам"
            action={
              <div className="flex items-center gap-2">
                <button onClick={newFolder} className="btn !px-4 !py-2 text-sm"><FolderPlus size={14} /> Папка</button>
                <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn-accent !px-4 !py-2 text-sm"><Upload size={14} /> Загрузить</button>
              </div>
            }
          />
        ) : (
          <div className="space-y-1">
            {folders.map((f) => (
              <div key={f.id} className="group flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-raised">
                <button onClick={() => setPath((p) => [...p, { id: f.id, name: f.name }])} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Folder size={18} className="shrink-0 text-accent" />
                  <span className="truncate text-sm text-zinc-200">{f.name}</span>
                </button>
                <button onClick={() => remove(f)} className="hidden text-zinc-600 hover:text-red-400 group-hover:block"><Trash2 size={14} /></button>
              </div>
            ))}
            {files.map((f) => {
              const Icon = fileIcon(f.mime)
              return (
                <div key={f.id} className="group flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-raised">
                  <Icon size={18} className="shrink-0 text-zinc-500" />
                  <button onClick={() => download(f)} className="min-w-0 flex-1 truncate text-left text-sm text-zinc-200 hover:text-accent">{f.name}</button>
                  <span className="text-[11px] text-zinc-600">{formatSize(f.size)}</span>
                  <span className="text-[10px] text-zinc-600">{timeAgo(f.created_at)}</span>
                  <button onClick={() => download(f)} className="hidden text-zinc-500 hover:text-zinc-200 group-hover:block"><Download size={14} /></button>
                  <button onClick={() => remove(f)} className="hidden text-zinc-600 hover:text-red-400 group-hover:block"><Trash2 size={14} /></button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
