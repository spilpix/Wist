import { useState } from 'react'
import { Download, FolderOpen, FolderPlus, Trash2, Upload, X } from 'lucide-react'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Spinner from '../components/ui/Spinner'
import { useSettingsStore } from '../store/settingsStore'
import { toast } from '../store/toastStore'
import type { SubtitleLang } from '../types/models'
import { useI18n, t as tGlobal, type TKey } from '../i18n'

const ACCENT_PRESETS: Array<{ nameKey: TKey; value: string }> = [
  { nameKey: 'set.accent.purple', value: '#7c5cbf' },
  { nameKey: 'set.accent.iris', value: '#6366f1' },
  { nameKey: 'set.accent.teal', value: '#14b8a6' },
  { nameKey: 'set.accent.rose', value: '#f43f5e' },
  { nameKey: 'set.accent.amber', value: '#f59e0b' },
]

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5">
      <div>
        <div className="text-sm text-zinc-200">{label}</div>
        {hint && <div className="mt-0.5 max-w-md text-xs text-zinc-600">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export default function SettingsPage() {
  const { t } = useI18n()
  const { settings, update, load } = useSettingsStore()
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmImport, setConfirmImport] = useState(false)

  if (!settings) return <Spinner />

  const addMediaFolder = async () => {
    const dir = await window.wist.settings.pickDirectory()
    if (dir && !settings.mediaFolders.includes(dir)) {
      update({ mediaFolders: [...settings.mediaFolders, dir] })
    }
  }

  const setScreenshotsDir = async () => {
    const dir = await window.wist.settings.pickDirectory()
    if (dir) update({ screenshotsDir: dir })
  }

  const exportData = async () => {
    const file = await window.wist.data.exportAll()
    if (file) toast(tGlobal('set.exportedTo', { file }), 'success')
  }

  const importData = async () => {
    setConfirmImport(false)
    try {
      const ok = await window.wist.data.importAll()
      if (ok) {
        toast(tGlobal('set.imported'), 'success')
      }
    } catch (err: any) {
      toast(String(err?.message ?? err), 'error')
    }
  }

  const clearHistory = async () => {
    setConfirmClear(false)
    await window.wist.data.clearHistory()
    toast(tGlobal('set.historyCleared'), 'success')
  }

  return (
    <div className="page max-w-3xl">
      <h1 className="page-title">{t('nav.settings')}</h1>

      {/* media folders */}
      <section className="mb-8">
        <h2 className="section-title">{t('set.mediaFolders')}</h2>
        <div className="card px-5 py-2">
          <Row label={t('set.watchedFolders')} hint={t('set.watchedFoldersHint')}>
            <button className="btn-ghost !py-1.5 text-xs" onClick={addMediaFolder}>
              <FolderPlus size={14} /> {t('set.addFolder')}
            </button>
          </Row>
          {settings.mediaFolders.length > 0 && (
            <div className="space-y-1.5 pb-3">
              {settings.mediaFolders.map((folder) => (
                <div key={folder} className="flex items-center gap-2 rounded-lg bg-raised px-3 py-2">
                  <FolderOpen size={14} className="shrink-0 text-zinc-500" />
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{folder}</span>
                  <button
                    className="text-zinc-600 transition-colors hover:text-red-400"
                    onClick={() =>
                      update({ mediaFolders: settings.mediaFolders.filter((f) => f !== folder) })
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-edge/50">
            <Row label={t('set.screenshotsFolder')} hint={settings.screenshotsDir}>
              <button className="btn-ghost !py-1.5 text-xs" onClick={setScreenshotsDir}>
                {t('common.change')}
              </button>
            </Row>
          </div>
        </div>
      </section>

      {/* player */}
      <section className="mb-8">
        <h2 className="section-title">{t('set.player')}</h2>
        <div className="card divide-y divide-edge/50 px-5">
          <Row label={t('set.subLang')}>
            <select
              className="select"
              value={settings.defaultSubtitleLang}
              onChange={(e) => update({ defaultSubtitleLang: e.target.value as SubtitleLang })}
            >
              <option value="ru">{t('set.subRu')}</option>
              <option value="en">{t('set.subEn')}</option>
              <option value="off">{t('common.off')}</option>
            </select>
          </Row>
          <Row label={t('set.autoPlay')}>
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={settings.autoPlayNext}
              onChange={(e) => update({ autoPlayNext: e.target.checked })}
            />
          </Row>
          <Row label={t('set.skipIntro')} hint={t('set.skipIntroHint')}>
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={settings.skipIntroEnabled}
              onChange={(e) => update({ skipIntroEnabled: e.target.checked })}
            />
          </Row>
          <Row label={t('set.ytDlpPath')} hint={t('set.ytDlpHint')}>
            <input
              className="input !w-64"
              placeholder="yt-dlp"
              defaultValue={settings.ytDlpPath}
              onBlur={(e) => update({ ytDlpPath: e.target.value.trim() })}
            />
          </Row>
          <Row label={t('set.mpvPath')} hint={t('set.mpvHint')}>
            <input
              className="input !w-64"
              placeholder="mpv"
              defaultValue={settings.mpvPath}
              onBlur={(e) => update({ mpvPath: e.target.value.trim() })}
            />
          </Row>
        </div>
      </section>

      {/* appearance */}
      <section className="mb-8">
        <h2 className="section-title">{t('set.appearance')}</h2>
        <div className="card divide-y divide-edge/50 px-5">
          <Row label={t('set.theme')}>
            <select
              className="select"
              value={settings.theme}
              onChange={(e) => update({ theme: e.target.value as 'dark' | 'light' | 'system' })}
            >
              <option value="dark">{t('set.themeDark')}</option>
              <option value="light">{t('set.themeLight')}</option>
              <option value="system">{t('set.themeSystem')}</option>
            </select>
          </Row>
          <Row label={t('set.language')}>
            <select
              className="select"
              value={settings.language}
              onChange={(e) => update({ language: e.target.value as 'en' | 'ru' })}
            >
              <option value="en">English</option>
              <option value="ru">Русский</option>
            </select>
          </Row>
          <Row label={t('set.accent')}>
            <div className="flex items-center gap-2">
              {ACCENT_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  title={t(preset.nameKey)}
                  onClick={() => update({ accentColor: preset.value })}
                  className={`h-7 w-7 rounded-full transition-transform hover:scale-110 ${
                    settings.accentColor === preset.value ? 'ring-2 ring-white ring-offset-2 ring-offset-surface' : ''
                  }`}
                  style={{ backgroundColor: preset.value }}
                />
              ))}
              <input
                type="color"
                value={settings.accentColor}
                onChange={(e) => update({ accentColor: e.target.value })}
                className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
                title={t('set.accentCustom')}
              />
            </div>
          </Row>
        </div>
      </section>

      {/* agent API */}
      <section className="mb-8">
        <h2 className="section-title">{t('set.api')}</h2>
        <div className="card divide-y divide-edge/50 px-5">
          <Row label={t('set.apiEnabled')} hint={t('set.apiHint')}>
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={settings.apiEnabled}
              onChange={(e) => update({ apiEnabled: e.target.checked })}
            />
          </Row>
          {settings.apiEnabled && (
            <>
              <Row label={t('set.apiPort')}>
                <input
                  type="number"
                  className="input !w-28"
                  defaultValue={settings.apiPort}
                  onBlur={(e) => {
                    const port = parseInt(e.target.value, 10)
                    if (port > 1024 && port < 65536) update({ apiPort: port })
                  }}
                />
              </Row>
              <Row label={t('set.apiToken')} hint={t('set.apiTokenHint')}>
                <div className="flex items-center gap-2">
                  <code className="max-w-[220px] truncate rounded-lg bg-raised px-2 py-1.5 font-mono text-xs text-zinc-400">
                    {settings.apiToken}
                  </code>
                  <button
                    className="btn-ghost !py-1.5 text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(settings.apiToken)
                      toast(tGlobal('set.apiCopied'), 'success')
                    }}
                  >
                    {t('set.apiCopy')}
                  </button>
                  <button
                    className="btn-ghost !py-1.5 text-xs"
                    onClick={async () => {
                      await window.wist.settings.regenerateApiToken()
                      load()
                    }}
                  >
                    {t('set.apiRegenerate')}
                  </button>
                </div>
              </Row>
              <div className="py-3.5">
                <div className="mb-1.5 text-xs text-zinc-500">{t('set.apiExample')}</div>
                <code className="block overflow-x-auto whitespace-pre rounded-lg bg-raised px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-400">
{`POST http://127.0.0.1:${settings.apiPort}/api/tasks
Authorization: Bearer <token>
{"title": "Deploy finished", "source": "claude"}`}
                </code>
              </div>
            </>
          )}
        </div>
      </section>

      {/* data */}
      <section className="mb-8">
        <h2 className="section-title">{t('set.data')}</h2>
        <div className="card divide-y divide-edge/50 px-5">
          <Row label={t('set.exportData')} hint={t('set.exportHint')}>
            <button className="btn-ghost !py-1.5 text-xs" onClick={exportData}>
              <Download size={14} /> {t('common.export')}
            </button>
          </Row>
          <Row label={t('set.importBackup')} hint={t('set.importHint')}>
            <button className="btn-ghost !py-1.5 text-xs" onClick={() => setConfirmImport(true)}>
              <Upload size={14} /> {t('common.import')}
            </button>
          </Row>
          <Row label={t('set.clearHistory')} hint={t('set.clearHint')}>
            <button className="btn-danger !py-1.5 text-xs" onClick={() => setConfirmClear(true)}>
              <Trash2 size={14} /> {t('set.clear')}
            </button>
          </Row>
        </div>
      </section>

      <div className="pb-4 text-center text-xs text-zinc-700">{t('set.footer', { version: '0.6.1' })}</div>

      {confirmClear && (
        <ConfirmDialog
          title={t('set.clearConfirmTitle')}
          message={t('set.clearConfirmMessage')}
          confirmLabel={t('set.clearConfirmAction')}
          danger
          onConfirm={clearHistory}
          onCancel={() => setConfirmClear(false)}
        />
      )}
      {confirmImport && (
        <ConfirmDialog
          title={t('set.importConfirmTitle')}
          message={t('set.importConfirmMessage')}
          confirmLabel={t('common.import')}
          danger
          onConfirm={importData}
          onCancel={() => setConfirmImport(false)}
        />
      )}
    </div>
  )
}
