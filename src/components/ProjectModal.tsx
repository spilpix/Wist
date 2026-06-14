import { useState } from 'react'
import { ImagePlus, Pencil, X } from 'lucide-react'
import Modal from './ui/Modal'
import { useI18n } from '../i18n'
import {
  PROJECT_COLORS,
  PROJECT_KINDS,
  PROJECT_STATUSES,
  PROJECT_TOOLS,
  type Project,
  type ProjectKind,
  type ProjectStatus,
} from '../types/models'

export default function ProjectModal({
  project,
  onClose,
  onSaved,
}: {
  project: Project | null
  onClose: () => void
  onSaved: (saved: Project) => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState(project?.name ?? '')
  const [client, setClient] = useState(project?.client ?? '')
  const [kind, setKind] = useState<ProjectKind>(project?.kind ?? 'video')
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'active')
  const [deadline, setDeadline] = useState(project?.deadline ?? '')
  const [tools, setTools] = useState<string[]>(project?.tools ?? [])
  const [color, setColor] = useState<string | null>(project?.color ?? null)
  const [cover, setCover] = useState<string | null>(project?.cover_path ?? null)
  const [description, setDescription] = useState(project?.description ?? '')
  const [saving, setSaving] = useState(false)

  const toggleTool = (tool: string) =>
    setTools((cur) => (cur.includes(tool) ? cur.filter((x) => x !== tool) : [...cur, tool]))

  const pickCover = async () => {
    const src = await window.wist.files.pickImage()
    if (!src) return
    setCover(await window.wist.files.saveCoverFromPath(src))
  }

  const save = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    const data = {
      name: name.trim(),
      client: client.trim() || null,
      kind,
      status,
      deadline: deadline || null,
      tools,
      color,
      cover_path: cover,
      description: description.trim() || null,
    }
    try {
      const saved = project ? await window.wist.projects.update(project.id, data) : await window.wist.projects.create(data)
      onSaved(saved)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={project ? t('project.edit') : t('project.new')} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">{t('project.cover')}</label>
          {cover ? (
            <div className="relative overflow-hidden rounded-lg border border-edge">
              <img src={window.wist.media.fileUrl(cover)} alt="" className="h-28 w-full object-cover" />
              <div className="absolute right-2 top-2 flex gap-1">
                <button
                  type="button"
                  onClick={pickCover}
                  title={t('project.changeCover')}
                  className="rounded-md bg-black/60 p-1.5 text-zinc-100 backdrop-blur-sm transition-colors hover:bg-black/80"
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setCover(null)}
                  title={t('common.delete')}
                  className="rounded-md bg-black/60 p-1.5 text-zinc-100 backdrop-blur-sm transition-colors hover:text-red-400"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={pickCover}
              className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-edge text-zinc-500 transition-colors hover:border-accent hover:text-zinc-300"
            >
              <ImagePlus size={20} />
              <span className="text-xs font-medium">{t('project.addCover')}</span>
            </button>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">{t('project.name')}</label>
          <input
            autoFocus
            className="input"
            placeholder={t('project.namePh')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">{t('project.client')}</label>
            <input className="input" placeholder={t('project.clientPh')} value={client} onChange={(e) => setClient(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">{t('project.deadline')}</label>
            <input type="date" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">{t('project.kind')}</label>
            <select className="select w-full" value={kind} onChange={(e) => setKind(e.target.value as ProjectKind)}>
              {PROJECT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`project.kind.${k}` as 'project.kind.video')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">{t('project.status')}</label>
            <select className="select w-full" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`project.status.${s}` as 'project.status.active')}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">{t('project.tools')}</label>
          <div className="flex flex-wrap gap-1.5">
            {PROJECT_TOOLS.map((tool) => (
              <button
                key={tool}
                type="button"
                onClick={() => toggleTool(tool)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                  tools.includes(tool)
                    ? 'border-accent/50 bg-accent/15 text-accent-bright'
                    : 'border-edge bg-surface text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t(`project.tool.${tool}` as 'project.tool.other')}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">{t('project.color')}</label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setColor(null)}
              className={`h-6 w-6 rounded-full border-2 text-[10px] text-zinc-500 ${color === null ? 'border-white' : 'border-edge'}`}
              title={t('project.colorAuto')}
            >
              ✕
            </button>
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${color === c ? 'border-white' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">{t('project.description')}</label>
          <textarea
            className="input min-h-[72px] resize-y"
            placeholder={t('project.descriptionPh')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-accent" disabled={!name.trim() || saving} onClick={save}>
            {project ? t('common.save') : t('project.create')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
