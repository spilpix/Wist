import { Image as ImageIcon } from 'lucide-react'
import { MOMENT_TAG_COLORS, type Moment } from '../types/models'
import { formatTimestamp } from '../utils/formatters'
import { useI18n } from '../i18n'

interface Props {
  moment: Moment
  onClick: () => void
}

export default function MomentCard({ moment, onClick }: Props) {
  const { t } = useI18n()
  return (
    <button
      onClick={onClick}
      className="group mb-4 block w-full break-inside-avoid overflow-hidden rounded-xl bg-surface text-left transition-transform duration-150 hover:-translate-y-0.5"
    >
      <div className="relative bg-raised">
        {moment.screenshot_path ? (
          <img
            src={window.wist.media.fileUrl(moment.screenshot_path)}
            alt=""
            loading="lazy"
            className="w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex aspect-video items-center justify-center text-zinc-700">
            <ImageIcon size={28} />
          </div>
        )}
        <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[11px] text-[#e4e4e7]">
          {formatTimestamp(moment.timestamp_seconds)}
        </span>
        {moment.tag && (
          <span
            className="absolute left-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black/80"
            style={{ backgroundColor: MOMENT_TAG_COLORS[moment.tag] }}
          >
            {t(`tag.${moment.tag}`)}
          </span>
        )}
      </div>
      <div className="px-3 py-2.5">
        <div className="truncate text-[13px] font-medium text-zinc-200">
          {moment.title_name}
          {moment.episode_number != null && (
            <span className="text-zinc-500"> · {t('local.ep')} {moment.episode_number}</span>
          )}
        </div>
        {moment.note && <div className="mt-1 line-clamp-3 text-xs leading-relaxed text-zinc-400">{moment.note}</div>}
      </div>
    </button>
  )
}
