import { useEffect, useState } from 'react'
import Modal from '../ui/Modal'
import { toast } from '../../store/toastStore'
import { type SessionChanges } from '../../types/models'
import { useI18n } from '../../i18n'

type TFn = ReturnType<typeof useI18n>['t']

// --- time helpers (shared by the Sessions log and the Focus timer) ---
export function localStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
export function parseStamp(s: string | null): Date | null {
  if (!s) return null
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d
}
export function fmtDuration(sec: number, t: TFn): string {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}${t('hub.hShort')} ${m}${t('hub.mShort')}`
  if (m > 0) return `${m}${t('hub.mShort')}`
  return `${s}${t('hub.sShort')}`
}
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}
export function parseChanges(json: string | null): SessionChanges | null {
  if (!json) return null
  try {
    const c = JSON.parse(json)
    return c && typeof c === 'object' ? c : null
  } catch {
    return null
  }
}

export function changeCounts(c: SessionChanges) {
  return {
    added: c.addedCount ?? c.added.length,
    removed: c.removedCount ?? c.removed.length,
    modified: c.modifiedCount ?? c.modified.length,
  }
}

export function ChangeChips({ c, t }: { c: SessionChanges; t: TFn }) {
  if (!c.scanned) return null
  const n = changeCounts(c)
  const items: Array<[string, number, string]> = [
    ['+', n.added, 'text-success'],
    ['−', n.removed, 'text-danger'],
    ['~', n.modified, 'text-st-onhold'],
  ]
  if (!n.added && !n.removed && !n.modified)
    return <span className="text-[11px] text-zinc-600">{t('hub.noFileChanges')}</span>
  return (
    <div className="flex items-center gap-2">
      {items.map(([sym, num, col]) =>
        num > 0 ? (
          <span key={sym} className={`flex items-center gap-0.5 text-[11px] font-semibold ${col}`}>
            {sym}
            {num}
          </span>
        ) : null
      )}
    </div>
  )
}

export function ChangeList({ title, paths, color }: { title: string; paths: string[]; color: string }) {
  if (!paths.length) return null
  const base = (p: string) => p.split(/[\\/]/).pop() || p
  return (
    <div>
      <div className={`mb-1 text-[11px] font-semibold ${color}`}>
        {title} · {paths.length}
      </div>
      <div className="space-y-0.5">
        {paths.slice(0, 50).map((p) => (
          <div key={p} className="truncate text-xs text-zinc-400" title={p}>
            {base(p)}
          </div>
        ))}
        {paths.length > 50 && <div className="text-[11px] text-zinc-600">+{paths.length - 50}…</div>}
      </div>
    </div>
  )
}

// compose / finish a work session: shows the live file-change preview, a report field
// and the measured minutes, then commits it atomically via endSession. Reused by both
// the Sessions tab (manual / timer stop) and the Focus tab (timer complete).
export function SessionModal({
  projectId,
  initial,
  onClose,
  onSaved,
}: {
  projectId: number
  initial: { durationSeconds: number; startedAt: string | null; title?: string }
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useI18n()
  const [title, setTitle] = useState(initial.title ?? '')
  const [report, setReport] = useState('')
  const [minutes, setMinutes] = useState(Math.max(0, Math.round(initial.durationSeconds / 60)))
  const [preview, setPreview] = useState<SessionChanges | null>(null)
  const [scanning, setScanning] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.wist.projects
      .previewChanges(projectId)
      .then(setPreview)
      .catch(() => setPreview(null))
      .finally(() => setScanning(false))
  }, [projectId])

  const save = async () => {
    setSaving(true)
    try {
      // one atomic call: scan + diff + persist the session row + advance the snapshot
      await window.wist.projects.endSession(projectId, {
        started_at: initial.startedAt,
        duration_seconds: minutes * 60,
        title: title.trim() || null,
        report: report.trim() || null,
      })
      toast(t('hub.sessionSaved'), 'success')
      onSaved()
    } catch {
      toast(t('hub.sessionSaveError'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={t('hub.logSession')} onClose={onClose} width="max-w-xl">
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-zinc-400">{t('hub.sessionTitleLabel')}</label>
            <input
              autoFocus
              className="input"
              placeholder={t('hub.sessionTitlePh')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="w-28">
            <label className="mb-1 block text-xs font-medium text-zinc-400">{t('hub.minutes')}</label>
            <input
              type="number"
              min={0}
              className="input"
              value={minutes}
              onChange={(e) => setMinutes(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">{t('hub.reportLabel')}</label>
          <textarea
            className="input min-h-[160px] resize-y font-mono text-[13px] leading-relaxed"
            placeholder={t('hub.reportPh')}
            value={report}
            onChange={(e) => setReport(e.target.value)}
          />
        </div>

        {/* detected file changes */}
        <div className="rounded-xl border border-edge bg-raised px-3.5 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{t('hub.detectedChanges')}</div>
          {scanning ? (
            <div className="mt-1.5 text-xs text-zinc-500">{t('hub.scanning')}</div>
          ) : !preview || !preview.scanned ? (
            <div className="mt-1.5 text-xs text-zinc-500">{t('hub.noLinkedFolders')}</div>
          ) : preview.added.length || preview.removed.length || preview.modified.length ? (
            <div className="mt-2 flex items-center gap-4">
              <ChangeChips c={preview} t={t} />
              <span className="text-[11px] text-zinc-600">
                {preview.scanned} {t('hub.filesScanned')}
              </span>
            </div>
          ) : (
            <div className="mt-1.5 text-xs text-zinc-500">
              {t('hub.noFileChanges')} · {preview.scanned} {t('hub.filesScanned')}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-accent" disabled={saving} onClick={save}>
            {saving ? t('hub.saving') : t('hub.saveSession')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
