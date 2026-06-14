import { useState } from 'react'
import { ImagePlus, Plus, X } from 'lucide-react'
import Modal from './ui/Modal'
import ChipsInput from './ui/ChipsInput'
import ProjectCover from './ProjectCover'
import { useI18n } from '../i18n'
import {
  COVER_TEMPLATES,
  PROJECT_COLORS,
  PROJECT_KIND_SUGGESTIONS,
  PROJECT_STATUSES,
  PROJECT_TOOL_SUGGESTIONS,
  type Project,
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
  const [showClient, setShowClient] = useState(!!project?.client)
  const [kind, setKind] = useState(project?.kind ?? '')
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'active')
  const [deadline, setDeadline] = useState(project?.deadline ?? '')
  const [tools, setTools] = useState<string[]>(project?.tools ?? [])
  const [color, setColor] = useState<string | null>(project?.color ?? null)
  const [cover, setCover] = useState<string | null>(project?.cover_path ?? null)
  const [description, setDescription] = useState(project?.description ?? '')
  const [saving, setSaving] = useState(false)

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
      client: showClient ? client.trim() || null : null,
      kind: kind.trim(),
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
        {/* cover — preset gradient templates or an uploaded image */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">{t('project.cover')}</label>
          {cover && (
            <ProjectCover cover={cover} className="mb-2 h-24 w-full rounded-lg border border-edge">
              <button
                type="button"
                onClick={() => setCover(null)}
                title={t('common.delete')}
                className="absolute right-2 top-2 rounded-md bg-black/60 p-1.5 text-zinc-100 backdrop-blur-sm transition-colors hover:text-red-400"
              >
                <X size={13} />
              </button>
            </ProjectCover>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={pickCover}
              title={t('project.addCover')}
              className="flex h-7 w-9 items-center justify-center rounded-md border border-dashed border-edge text-zinc-500 transition-colors hover:border-accent hover:text-zinc-300"
            >
              <ImagePlus size={14} />
            </button>
            {COVER_TEMPLATES.map((tpl) => {
              const val = `gradient:${tpl.id}`
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => setCover(val)}
                  title={t('project.coverTemplate')}
                  className={`h-7 w-9 rounded-md border transition-transform hover:scale-105 ${cover === val ? 'border-accent ring-1 ring-accent' : 'border-edge'}`}
                  style={{ backgroundImage: tpl.css }}
                />
              )
            })}
          </div>
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
            <label className="mb-1 block text-xs font-medium text-zinc-400">{t('project.kind')}</label>
            <input
              className="input"
              list="project-kind-suggestions"
              placeholder={t('project.kindPh')}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            />
            <datalist id="project-kind-suggestions">
              {PROJECT_KIND_SUGGESTIONS.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">{t('project.deadline')}</label>
            <input type="date" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          {!showClient && (
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setShowClient(true)}
                className="flex items-center gap-1.5 py-2 text-sm text-zinc-500 transition-colors hover:text-accent-bright"
              >
                <Plus size={14} /> {t('project.addClient')}
              </button>
            </div>
          )}
        </div>

        {showClient && (
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">{t('project.client')}</label>
            <div className="flex gap-2">
              <input className="input" placeholder={t('project.clientPh')} value={client} onChange={(e) => setClient(e.target.value)} />
              <button
                type="button"
                onClick={() => {
                  setClient('')
                  setShowClient(false)
                }}
                title={t('common.delete')}
                className="btn-ghost shrink-0 !px-3"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">{t('project.tools')}</label>
          <ChipsInput value={tools} onChange={setTools} placeholder={t('project.toolsPh')} />
          {!tools.length && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {PROJECT_TOOL_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTools([s])}
                  className="rounded-md bg-raised px-2 py-0.5 text-[11px] text-zinc-500 transition-colors hover:text-zinc-200"
                >
                  + {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">{t('project.color')}</label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setColor(null)}
              className={`h-6 w-6 rounded-full border-2 text-[10px] text-zinc-500 ${color === null ? 'border-accent' : 'border-edge'}`}
              title={t('project.colorAuto')}
            >
              ✕
            </button>
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${color === c ? 'border-accent' : 'border-transparent'}`}
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
