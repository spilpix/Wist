import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, GitCommitVertical, Pencil, Plus, Tag, Trash2 } from 'lucide-react'
import Modal from '../ui/Modal'
import ConfirmDialog from '../ui/ConfirmDialog'
import ChipsInput from '../ui/ChipsInput'
import DatePicker from '../ui/DatePicker'
import Select from '../ui/Select'
import MarkdownView from '../MarkdownView'
import { toast } from '../../store/toastStore'
import { PATCH_STATUSES, PATCH_STATUS_COLORS, type PatchStatus, type ProjectPatch } from '../../types/models'
import { useI18n } from '../../i18n'

type TFn = ReturnType<typeof useI18n>['t']

export default function HubPatches({
  projectId,
  accent,
  openSignal,
}: {
  projectId: number
  accent: string
  openSignal?: number // bump to open the "new patch" modal from the hub Add menu
}) {
  const { t, lang } = useI18n()
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US'
  const [patches, setPatches] = useState<ProjectPatch[]>([])
  const [editing, setEditing] = useState<ProjectPatch | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState<ProjectPatch | null>(null)

  const load = useCallback(() => {
    window.wist.projects.patches(projectId).then(setPatches).catch(() => setPatches([]))
  }, [projectId])
  useEffect(() => {
    load()
  }, [load])

  // external "+ Patch" trigger from the hub header
  useEffect(() => {
    if (openSignal) setCreating(true)
  }, [openSignal])

  const remove = async () => {
    if (!confirm) return
    await window.wist.projects.removePatch(confirm.id)
    setConfirm(null)
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">{t('hub.tabPatches')}</h2>
          {patches.length > 0 && <div className="text-[11px] text-zinc-500">{patches.length}</div>}
        </div>
        <button className="btn-accent !py-1.5 text-xs" onClick={() => setCreating(true)}>
          <Plus size={14} /> {t('hub.newPatch')}
        </button>
      </div>

      {!patches.length ? (
        <div className="rounded-xl border-2 border-dashed border-edge px-6 py-14 text-center">
          <GitCommitVertical size={32} className="mx-auto mb-3 text-zinc-600" />
          <div className="text-sm font-medium text-zinc-300">{t('hub.noPatches')}</div>
          <div className="mx-auto mt-1 max-w-md text-xs text-zinc-500">{t('hub.noPatchesHint')}</div>
        </div>
      ) : (
        <div className="relative space-y-3 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-edge">
          {patches.map((p) => (
            <PatchCard
              key={p.id}
              patch={p}
              t={t}
              locale={locale}
              accent={accent}
              onEdit={() => setEditing(p)}
              onDelete={() => setConfirm(p)}
            />
          ))}
        </div>
      )}

      {(creating || editing) && (
        <PatchModal
          projectId={projectId}
          patch={editing}
          t={t}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            load()
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={t('hub.deletePatch')}
          message={t('hub.patchDeleteConfirm')}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={remove}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

function StatusPill({ status, t }: { status: PatchStatus; t: TFn }) {
  const c = PATCH_STATUS_COLORS[status]
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: `${c}26`, color: c }}
    >
      {t(`hub.patchStatus.${status}` as 'hub.patchStatus.released')}
    </span>
  )
}

function PatchCard({
  patch: p,
  t,
  locale,
  accent,
  onEdit,
  onDelete,
}: {
  patch: ProjectPatch
  t: TFn
  locale: string
  accent: string
  onEdit: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const dateStr = p.released_at
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${p.released_at}T00:00:00`))
    : ''
  const hasBody = !!(p.body && p.body.trim())

  return (
    <div className="relative pl-7">
      {/* timeline node */}
      <span
        className="absolute left-0 top-3.5 grid h-3.5 w-3.5 place-items-center rounded-full ring-4 ring-bg"
        style={{ backgroundColor: PATCH_STATUS_COLORS[p.status] }}
      />
      <div className="card overflow-hidden">
        <div className="group flex items-center gap-2.5 px-4 py-3">
          <button onClick={() => hasBody && setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            {hasBody && (
              <ChevronRight size={14} className={`shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-90' : ''}`} />
            )}
            {p.version && (
              <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-300">
                {p.version}
              </span>
            )}
            <span className="truncate text-sm font-medium text-zinc-100">{p.title?.trim() || t('hub.newPatch')}</span>
          </button>
          <StatusPill status={p.status} t={t} />
          {dateStr && <span className="hidden shrink-0 text-[11px] text-zinc-500 sm:inline">{dateStr}</span>}
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button onClick={onEdit} className="rounded-lg p-1.5 text-zinc-500 hover:bg-highlight hover:text-zinc-200" title={t('common.edit')}>
              <Pencil size={13} />
            </button>
            <button onClick={onDelete} className="rounded-lg p-1.5 text-zinc-500 hover:bg-highlight hover:text-danger" title={t('common.delete')}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {p.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pb-3">
            {p.tags.map((tag) => (
              <span key={tag} className="flex items-center gap-1 rounded bg-raised px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                <Tag size={9} /> {tag}
              </span>
            ))}
          </div>
        )}

        {open && hasBody && (
          <div className="border-t border-edge px-5 py-4">
            <MarkdownView content={p.body!} />
          </div>
        )}
      </div>
    </div>
  )
}

function PatchModal({
  projectId,
  patch,
  t,
  onClose,
  onSaved,
}: {
  projectId: number
  patch: ProjectPatch | null
  t: TFn
  onClose: () => void
  onSaved: () => void
}) {
  const [version, setVersion] = useState(patch?.version ?? '')
  const [title, setTitle] = useState(patch?.title ?? '')
  const [status, setStatus] = useState<PatchStatus>(patch?.status ?? 'released')
  const [date, setDate] = useState(patch?.released_at ?? '')
  const [tags, setTags] = useState<string[]>(patch?.tags ?? [])
  const [body, setBody] = useState(patch?.body ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (saving) return
    setSaving(true)
    const data = {
      version: version.trim() || null,
      title: title.trim() || null,
      status,
      released_at: date || null,
      tags,
      body: body.trim() || null,
    }
    try {
      if (patch) await window.wist.projects.updatePatch(patch.id, data)
      else await window.wist.projects.createPatch(projectId, data)
      onSaved()
    } catch {
      toast(t('hub.sessionSaveError'), 'error')
      setSaving(false)
    }
  }

  return (
    <Modal title={patch ? t('hub.editPatch') : t('hub.newPatch')} onClose={onClose} width="max-w-xl">
      <div className="space-y-4">
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">{t('hub.patchVersion')}</label>
            <input className="input font-mono" placeholder={t('hub.patchVersionPh')} value={version} onChange={(e) => setVersion(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">{t('hub.patchTitleLabel')}</label>
            <input autoFocus className="input" placeholder={t('hub.patchTitlePh')} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">{t('hub.patchStatusLabel')}</label>
            <Select
              className="w-full"
              value={status}
              options={PATCH_STATUSES.map((s) => ({ value: s, label: t(`hub.patchStatus.${s}` as 'hub.patchStatus.released') }))}
              onChange={(v) => setStatus(v as PatchStatus)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">{t('hub.patchDate')}</label>
            <DatePicker value={date} onChange={setDate} placeholder={t('hub.patchDate')} />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">{t('hub.patchTags')}</label>
          <ChipsInput value={tags} onChange={setTags} placeholder={t('project.toolsPh')} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">{t('hub.patchBody')}</label>
          <textarea
            className="input min-h-[150px] resize-y font-mono text-[13px] leading-relaxed"
            placeholder={t('hub.patchBodyPh')}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-accent" disabled={saving} onClick={save}>
            {t('hub.savePatch')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
