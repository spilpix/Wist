import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import Modal from './ui/Modal'
import ChipsInput from './ui/ChipsInput'
import { toast } from '../store/toastStore'
import {
  TITLE_STATUSES,
  TITLE_TYPES,
  type Title,
  type TitleStatus,
  type TitleType,
} from '../types/models'
import { useI18n, t as tGlobal } from '../i18n'

interface Props {
  existing?: Title | null
  onSaved: (title: Title) => void
  onClose: () => void
}

export default function AddTitleModal({ existing, onSaved, onClose }: Props) {
  const { t } = useI18n()
  const [title, setTitle] = useState(existing?.title ?? '')
  const [originalTitle, setOriginalTitle] = useState(existing?.original_title ?? '')
  const [type, setType] = useState<TitleType>(existing?.type ?? 'anime')
  const [status, setStatus] = useState<TitleStatus>(existing?.status ?? 'planned')
  const [totalEpisodes, setTotalEpisodes] = useState(existing?.total_episodes ?? 12)
  const [year, setYear] = useState<string>(existing?.year ? String(existing.year) : '')
  const [rating, setRating] = useState<number | null>(existing?.rating ?? null)
  const [genres, setGenres] = useState<string[]>(existing?.genres ?? [])
  const [tags, setTags] = useState<string[]>(existing?.tags ?? [])
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [coverPath, setCoverPath] = useState<string | null>(existing?.cover_path ?? null)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const pickCover = async () => {
    const src = await window.wist.files.pickImage()
    if (src) setCoverPath(await window.wist.files.saveCoverFromPath(src))
  }

  const onDropCover = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file || !file.type.startsWith('image/')) return
    const bytes = await file.arrayBuffer()
    setCoverPath(await window.wist.files.saveCoverFromBytes(file.name, bytes))
  }

  const save = async () => {
    if (!title.trim()) {
      toast(tGlobal('modal.titleRequired'), 'error')
      return
    }
    setSaving(true)
    try {
      const payload: Partial<Title> = {
        title: title.trim(),
        original_title: originalTitle.trim() || null,
        type,
        status,
        total_episodes: type === 'movie' ? 1 : Math.max(1, totalEpisodes),
        year: year ? parseInt(year, 10) : null,
        rating,
        genres,
        tags,
        notes: notes.trim() || null,
        cover_path: coverPath,
      }
      const saved = existing
        ? await window.wist.titles.update(existing.id, payload)
        : await window.wist.titles.create(payload)
      toast(
        existing ? tGlobal('modal.titleUpdated') : tGlobal('modal.titleAdded', { title: saved.title }),
        'success'
      )
      onSaved(saved)
      onClose()
    } catch (err) {
      toast(String(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={existing ? t('modal.editTitle') : t('modal.addTitle')} onClose={onClose} width="max-w-2xl">
      <div className="grid grid-cols-[180px_1fr] gap-6">
        {/* cover */}
        <div>
          <div
            className={`relative aspect-[2/3] overflow-hidden rounded-xl border-2 border-dashed transition-colors ${
              dragOver ? 'border-accent bg-accent/10' : 'border-edge bg-raised'
            }`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDropCover}
          >
            {coverPath ? (
              <img src={window.wist.media.fileUrl(coverPath)} className="h-full w-full object-cover" alt="cover" />
            ) : (
              <button
                onClick={pickCover}
                className="flex h-full w-full flex-col items-center justify-center gap-2 text-zinc-600 transition-colors hover:text-zinc-400"
              >
                <ImagePlus size={28} />
                <span className="px-3 text-center text-xs">{t('modal.dropCover')}</span>
              </button>
            )}
          </div>
          {coverPath && (
            <div className="mt-2 flex gap-2">
              <button className="btn-ghost flex-1 !py-1.5 text-xs" onClick={pickCover}>
                {t('common.replace')}
              </button>
              <button className="btn-ghost !px-2.5 !py-1.5" onClick={() => setCoverPath(null)}>
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>

        {/* fields */}
        <div className="space-y-3.5">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">{t('modal.title')}</label>
            <input ref={titleRef} className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">{t('modal.originalTitle')}</label>
            <input className="input" value={originalTitle} onChange={(e) => setOriginalTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">{t('modal.type')}</label>
              <select className="select w-full" value={type} onChange={(e) => setType(e.target.value as TitleType)}>
                {TITLE_TYPES.map((v) => (
                  <option key={v} value={v}>{t(`type.${v}`)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">{t('modal.status')}</label>
              <select className="select w-full" value={status} onChange={(e) => setStatus(e.target.value as TitleStatus)}>
                {TITLE_STATUSES.map((v) => (
                  <option key={v} value={v}>{t(`status.${v}`)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">
                {type === 'book' ? t('modal.chapters') : t('modal.episodes')}
              </label>
              <input
                type="number"
                min={1}
                className="input"
                value={type === 'movie' ? 1 : totalEpisodes}
                disabled={type === 'movie'}
                onChange={(e) => setTotalEpisodes(parseInt(e.target.value, 10) || 1)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">{t('modal.year')}</label>
              <input
                type="number"
                className="input"
                placeholder="2024"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">{t('modal.rating')}</label>
              <select
                className="select w-full"
                value={rating ?? ''}
                onChange={(e) => setRating(e.target.value ? parseInt(e.target.value, 10) : null)}
              >
                <option value="">—</option>
                {Array.from({ length: 10 }, (_, i) => 10 - i).map((n) => (
                  <option key={n} value={n}>★ {n}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">{t('modal.genres')}</label>
            <ChipsInput value={genres} onChange={setGenres} placeholder={t('modal.genrePlaceholder')} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">{t('modal.tags')}</label>
            <ChipsInput value={tags} onChange={setTags} placeholder={t('modal.tagPlaceholder')} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">{t('modal.notes')}</label>
            <textarea
              className="input min-h-[70px] resize-y"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('modal.notesPlaceholder')}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn-accent" onClick={save} disabled={saving}>
          {existing ? t('modal.saveChanges') : t('modal.addToLibrary')}
        </button>
      </div>
    </Modal>
  )
}
