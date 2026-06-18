import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bookmark, Download, Play, Trash2 } from 'lucide-react'
import MomentCard from '../components/MomentCard'
import Chip from '../components/ui/Chip'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import { toast } from '../store/toastStore'
import {
  MOMENT_TAGS,
  MOMENT_TAG_COLORS,
  type Moment,
  type MomentTag,
} from '../types/models'
import { formatDate, formatTimestamp } from '../utils/formatters'
import { useI18n, t as tGlobal } from '../i18n'

export default function Moments() {
  const { t } = useI18n()
  const [moments, setMoments] = useState<Moment[]>([])
  const [loading, setLoading] = useState(true)
  const [tagFilter, setTagFilter] = useState<MomentTag | null>(null)
  const [titleFilter, setTitleFilter] = useState<number | null>(null)
  const [selected, setSelected] = useState<Moment | null>(null)
  const [exporting, setExporting] = useState(false)
  const navigate = useNavigate()

  const load = useCallback(() => {
    setLoading(true)
    window.wist.moments
      .list({})
      .then(setMoments)
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const titles = useMemo(() => {
    const map = new Map<number, string>()
    for (const m of moments) map.set(m.title_id, m.title_name ?? `#${m.title_id}`)
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [moments])

  const visible = useMemo(
    () =>
      moments.filter(
        (m) => (!tagFilter || m.tag === tagFilter) && (!titleFilter || m.title_id === titleFilter)
      ),
    [moments, tagFilter, titleFilter]
  )

  const exportAll = async () => {
    setExporting(true)
    try {
      const res = await window.wist.moments.exportAll()
      if (res) toast(tGlobal('mom.exported', { n: res.exported, dir: res.dir }), 'success')
    } catch (err) {
      toast(String(err), 'error')
    } finally {
      setExporting(false)
    }
  }

  const deleteMoment = async (m: Moment) => {
    await window.wist.moments.remove(m.id)
    setSelected(null)
    load()
  }

  if (loading) return <Spinner />

  return (
    <div className="page">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="page-title !mb-0">{t('nav.moments')}</h1>
        {moments.length > 0 && (
          <button className="btn-ghost" onClick={exportAll} disabled={exporting}>
            <Download size={15} /> {t('mom.exportAll')}
          </button>
        )}
      </div>

      {moments.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          <Chip active={!tagFilter} onClick={() => setTagFilter(null)}>
            {t('common.all')}
          </Chip>
          {MOMENT_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 ${
                tagFilter === tag ? 'text-black' : 'bg-raised text-zinc-400 hover:bg-edge hover:text-zinc-200'
              }`}
              style={tagFilter === tag ? { backgroundColor: MOMENT_TAG_COLORS[tag] } : undefined}
            >
              {t(`tag.${tag}`)}
            </button>
          ))}
          <select
            className="select ml-auto"
            value={titleFilter ?? ''}
            onChange={(e) => setTitleFilter(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{t('mom.allTitles')}</option>
            {titles.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
      )}

      {!visible.length ? (
        <EmptyState
          icon={Bookmark}
          title={moments.length ? t('mom.emptyFiltered') : t('mom.emptyTitle')}
          subtitle={moments.length ? t('mom.emptyFilteredSubtitle') : t('mom.emptySubtitle')}
        />
      ) : (
        <div className="columns-2 gap-4 lg:columns-3 xl:columns-4">
          {visible.map((m) => (
            <MomentCard key={m.id} moment={m} onClick={() => setSelected(m)} />
          ))}
        </div>
      )}

      {selected && (
        <Modal
          title={`${selected.title_name ?? ''}${selected.episode_number != null ? ` · ${t('local.ep')} ${selected.episode_number}` : ''}`}
          onClose={() => setSelected(null)}
          width="max-w-3xl"
        >
          {selected.screenshot_path && (
            <img
              src={window.wist.media.fileUrl(selected.screenshot_path)}
              alt=""
              className="w-full rounded-xl"
            />
          )}
          <div className="mt-4 flex items-center gap-3 text-sm text-zinc-400">
            <span className="font-mono text-zinc-300">{formatTimestamp(selected.timestamp_seconds)}</span>
            {selected.tag && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black/80"
                style={{ backgroundColor: MOMENT_TAG_COLORS[selected.tag] }}
              >
                {t(`tag.${selected.tag}`)}
              </span>
            )}
            <span className="ml-auto text-xs text-zinc-600">{formatDate(selected.created_at)}</span>
          </div>
          {selected.note && (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{selected.note}</p>
          )}
          <div className="mt-6 flex justify-between">
            <button className="btn-danger" onClick={() => deleteMoment(selected)}>
              <Trash2 size={14} /> {t('common.delete')}
            </button>
            {selected.episode_id && (
              <button
                className="btn-accent"
                onClick={() =>
                  navigate(`/player/${selected.episode_id}?t=${Math.floor(selected.timestamp_seconds)}`)
                }
              >
                <Play size={15} className="fill-[#fff]" /> {t('mom.jump')}
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
