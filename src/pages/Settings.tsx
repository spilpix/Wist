import { useEffect, useState } from 'react'
import pkg from '../../package.json'
import {
  Brain,
  Database,
  Download,
  FolderOpen,
  FolderPlus,
  Languages,
  Monitor,
  MonitorPlay,
  Moon,
  Palette,
  Plug,
  RefreshCw,
  RotateCcw,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Spinner from '../components/ui/Spinner'
import { useSettingsStore } from '../store/settingsStore'
import { toast } from '../store/toastStore'
import type { SubtitleLang, UpdateStatus } from '../types/models'
import { useI18n, t as tGlobal, type TKey } from '../i18n'

const ACCENT_PRESETS: Array<{ nameKey: TKey; value: string }> = [
  { nameKey: 'set.accent.brand', value: '' }, // Notion blue #2383E1 (both themes)
  { nameKey: 'set.accent.amber', value: '#e67d22' },
  { nameKey: 'set.accent.crail', value: '#c15f3c' },
  { nameKey: 'set.accent.teal', value: '#3a8a8a' },
  { nameKey: 'set.accent.blue', value: '#7aa8c4' },
  { nameKey: 'set.accent.rose', value: '#c47a7a' },
]

type Cat = 'appearance' | 'player' | 'media' | 'api' | 'brain' | 'data'

const CATEGORIES: Array<{ id: Cat; icon: typeof Palette; key: TKey }> = [
  { id: 'appearance', icon: Palette, key: 'set.appearance' },
  { id: 'player', icon: MonitorPlay, key: 'set.player' },
  { id: 'media', icon: FolderOpen, key: 'set.mediaFolders' },
  { id: 'api', icon: Plug, key: 'set.api' },
  { id: 'brain', icon: Brain, key: 'set.brain' },
  { id: 'data', icon: Database, key: 'set.data' },
]

// a content panel in the right pane: a big heading + its setting cards
function Panel({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="animate-fade-in">
      <h2 className="text-[1.5rem] font-bold tracking-tight text-white">{title}</h2>
      {desc && <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">{desc}</p>}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="card divide-y divide-edge px-5">{children}</div>
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5">
      <div className="min-w-0">
        <div className="text-sm text-zinc-200">{label}</div>
        {hint && <div className="mt-0.5 max-w-md text-xs text-zinc-600">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

// auto-update status + a manual "check now" / "restart to update" control
function UpdatesCard({ t }: { t: (key: TKey, params?: Record<string, string | number>) => string }) {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  useEffect(() => {
    window.wist.updates.status().then(setStatus).catch(() => undefined)
    return window.wist.updates.onStatus(setStatus)
  }, [])
  const busy = status.state === 'checking' || status.state === 'downloading'
  const hint =
    status.state === 'checking'
      ? t('set.updChecking')
      : status.state === 'available'
        ? t('set.updAvailable', { v: status.version })
        : status.state === 'downloading'
          ? t('set.updDownloading', { p: status.percent })
          : status.state === 'ready'
            ? t('set.updReady', { v: status.version })
            : status.state === 'none'
              ? t('set.updNone')
              : status.state === 'error'
                ? t('set.updError')
                : t('set.updIdle')
  return (
    <Card>
      <Row label={t('set.updTitle')} hint={hint}>
        {status.state === 'ready' ? (
          <button className="btn-accent !py-1.5 text-xs" onClick={() => window.wist.updates.install()}>
            <RotateCcw size={14} /> {t('set.updRestart')}
          </button>
        ) : (
          <button
            className="btn-ghost !py-1.5 text-xs"
            disabled={busy}
            onClick={() => {
              setStatus({ state: 'checking' })
              window.wist.updates.check().then(setStatus).catch(() => undefined)
            }}
          >
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> {t('set.updCheck')}
          </button>
        )}
      </Row>
    </Card>
  )
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[38px] rounded-full transition-colors duration-200 ${checked ? 'bg-accent' : 'bg-zinc-800'}`}
    >
      <span
        className="absolute top-[3px] h-4 w-4 rounded-full bg-[#fff] shadow-[0_1px_2px_rgb(0_0_0/0.3)] transition-all duration-200"
        style={{ left: checked ? 19 : 3 }}
      />
    </button>
  )
}

const segCls = (active: boolean) =>
  `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
    active ? 'bg-card text-white' : 'text-zinc-500 hover:text-zinc-200'
  }`

export default function SettingsPage() {
  const { t } = useI18n()
  const { settings, update, load } = useSettingsStore()
  const [cat, setCat] = useState<Cat>('appearance')
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmImport, setConfirmImport] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [confirmClearDb, setConfirmClearDb] = useState(false)
  const [brainPath, setBrainPath] = useState('')
  const [brainStats, setBrainStats] = useState<Awaited<ReturnType<typeof window.wist.brain.stats>> | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.wist.brain.folder().then(setBrainPath).catch(() => undefined)
    window.wist.brain.stats().then(setBrainStats).catch(() => undefined)
  }, [])

  if (!settings) return <Spinner />

  const addMediaFolder = async () => {
    const dir = await window.wist.settings.pickDirectory()
    if (dir && !settings.mediaFolders.includes(dir)) update({ mediaFolders: [...settings.mediaFolders, dir] })
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
      if (ok) toast(tGlobal('set.imported'), 'success')
    } catch (err: any) {
      toast(String(err?.message ?? err), 'error')
    }
  }
  const clearHistory = async () => {
    setConfirmClear(false)
    await window.wist.data.clearHistory()
    toast(tGlobal('set.historyCleared'), 'success')
  }
  const syncBrain = async () => {
    setBusy(true)
    try {
      const r = await window.wist.brain.sync()
      setBrainPath(r.dir)
      window.wist.brain.stats().then(setBrainStats).catch(() => undefined)
      toast(tGlobal('set.brainSynced', { n: r.records }), 'success')
    } catch (err: any) {
      toast(String(err?.message ?? err), 'error')
    } finally {
      setBusy(false)
    }
  }
  const restoreBrain = async () => {
    setConfirmRestore(false)
    setBusy(true)
    try {
      const r = await window.wist.brain.restore()
      toast(tGlobal('set.brainRestored', { n: r.restored }), 'success')
      setTimeout(() => window.location.reload(), 700)
    } catch (err: any) {
      toast(String(err?.message ?? err), 'error')
      setBusy(false)
    }
  }
  const changeBrainFolder = async () => {
    const dir = await window.wist.settings.pickDirectory()
    if (dir) {
      await update({ brainFolder: dir })
      setBrainPath(dir)
    }
  }
  const clearDatabase = async () => {
    setConfirmClearDb(false)
    await window.wist.data.clearDatabase()
    toast(tGlobal('set.dbCleared'), 'success')
    setTimeout(() => window.location.reload(), 600)
  }

  const THEMES: Array<{ id: 'dark' | 'light' | 'system'; icon: typeof Moon; key: TKey }> = [
    { id: 'dark', icon: Moon, key: 'set.themeDark' },
    { id: 'light', icon: Sun, key: 'set.themeLight' },
    { id: 'system', icon: Monitor, key: 'set.themeSystem' },
  ]

  return (
    <div className="flex h-full">
      {/* left category nav (Obsidian-style, inline — not a separate window) */}
      <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-edge px-3 py-6">
        <h1 className="mb-4 px-2 text-[15px] font-bold tracking-tight text-white">{t('nav.settings')}</h1>
        <nav className="space-y-0.5">
          {CATEGORIES.map(({ id, icon: Icon, key }) => (
            <button
              key={id}
              onClick={() => setCat(id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] font-medium transition-colors ${
                cat === id ? 'bg-sidebar-active text-zinc-100' : 'text-zinc-400 hover:bg-highlight hover:text-zinc-100'
              }`}
            >
              <Icon size={16} className={cat === id ? 'text-zinc-200' : 'text-zinc-500'} /> {t(key)}
            </button>
          ))}
        </nav>
        <div className="mt-auto px-2 pt-6 text-[11px] text-zinc-600">{t('set.footer', { version: pkg.version })}</div>
      </aside>

      {/* right content pane — centered, no wasted right-hand air */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-10 py-9">
          {cat === 'appearance' && (
            <Panel title={t('set.appearance')} desc={t('set.appearanceDesc')}>
              <Card>
                <Row label={t('set.theme')}>
                  <div className="flex gap-[3px] rounded-lg border border-edge bg-field p-[3px]">
                    {THEMES.map(({ id, icon: Icon, key }) => (
                      <button key={id} onClick={() => update({ theme: id })} className={segCls(settings.theme === id)}>
                        <Icon size={14} /> {t(key)}
                      </button>
                    ))}
                  </div>
                </Row>
                <Row label={t('set.language')}>
                  <div className="flex gap-[3px] rounded-lg border border-edge bg-field p-[3px]">
                    {([
                      { id: 'en', label: 'English' },
                      { id: 'ru', label: 'Русский' },
                    ] as const).map(({ id, label }) => (
                      <button key={id} onClick={() => update({ language: id })} className={segCls(settings.language === id)}>
                        <Languages size={14} /> {label}
                      </button>
                    ))}
                  </div>
                </Row>
                <Row label={t('set.accent')}>
                  <div className="flex items-center gap-2">
                    {ACCENT_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        title={t(preset.nameKey)}
                        onClick={() => update({ accentColor: preset.value })}
                        className={`h-7 w-7 rounded-full transition-transform hover:scale-110 ${
                          settings.accentColor === preset.value ? 'ring-2 ring-accent ring-offset-2 ring-offset-card' : ''
                        }`}
                        style={preset.value ? { backgroundColor: preset.value } : { backgroundImage: 'linear-gradient(135deg, var(--accent), rgb(var(--accent-hover-rgb)))' }}
                      />
                    ))}
                    <label className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-edge text-zinc-500" title={t('set.accentCustom')}>
                      +
                      <input
                        type="color"
                        value={settings.accentColor || getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2383e1'}
                        onChange={(e) => update({ accentColor: e.target.value })}
                        className="absolute h-0 w-0 opacity-0"
                      />
                    </label>
                  </div>
                </Row>
              </Card>
            </Panel>
          )}

          {cat === 'player' && (
            <Panel title={t('set.player')} desc={t('set.playerDesc')}>
              <Card>
                <Row label={t('set.subLang')}>
                  <select className="select" value={settings.defaultSubtitleLang} onChange={(e) => update({ defaultSubtitleLang: e.target.value as SubtitleLang })}>
                    <option value="ru">{t('set.subRu')}</option>
                    <option value="en">{t('set.subEn')}</option>
                    <option value="off">{t('common.off')}</option>
                  </select>
                </Row>
                <Row label={t('set.autoPlay')}>
                  <Switch checked={settings.autoPlayNext} onChange={(v) => update({ autoPlayNext: v })} />
                </Row>
                <Row label={t('set.skipIntro')} hint={t('set.skipIntroHint')}>
                  <Switch checked={settings.skipIntroEnabled} onChange={(v) => update({ skipIntroEnabled: v })} />
                </Row>
                <Row label={t('set.ytDlpPath')} hint={t('set.ytDlpHint')}>
                  <input className="input !w-64" placeholder="yt-dlp" defaultValue={settings.ytDlpPath} onBlur={(e) => update({ ytDlpPath: e.target.value.trim() })} />
                </Row>
                <Row label={t('set.mpvPath')} hint={t('set.mpvHint')}>
                  <input className="input !w-64" placeholder="mpv" defaultValue={settings.mpvPath} onBlur={(e) => update({ mpvPath: e.target.value.trim() })} />
                </Row>
              </Card>
            </Panel>
          )}

          {cat === 'media' && (
            <Panel title={t('set.mediaFolders')} desc={t('set.mediaDesc')}>
              <Card>
                <Row label={t('set.watchedFolders')} hint={t('set.watchedFoldersHint')}>
                  <button className="btn-ghost !py-1.5 text-xs" onClick={addMediaFolder}>
                    <FolderPlus size={14} /> {t('set.addFolder')}
                  </button>
                </Row>
                {settings.mediaFolders.length > 0 && (
                  <div className="space-y-1.5 py-3">
                    {settings.mediaFolders.map((folder) => (
                      <div key={folder} className="flex items-center gap-2 rounded-lg bg-raised px-3 py-2">
                        <FolderOpen size={14} className="shrink-0 text-zinc-500" />
                        <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{folder}</span>
                        <button className="text-zinc-600 transition-colors hover:text-danger" onClick={() => update({ mediaFolders: settings.mediaFolders.filter((f) => f !== folder) })}>
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <Row label={t('set.screenshotsFolder')} hint={settings.screenshotsDir}>
                  <button className="btn-ghost !py-1.5 text-xs" onClick={setScreenshotsDir}>
                    {t('common.change')}
                  </button>
                </Row>
              </Card>
            </Panel>
          )}

          {cat === 'api' && (
            <Panel title={t('set.api')} desc={t('set.apiDesc')}>
              <Card>
                <Row label={t('set.apiEnabled')} hint={t('set.apiHint')}>
                  <Switch checked={settings.apiEnabled} onChange={(v) => update({ apiEnabled: v })} />
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
                        <code className="max-w-[200px] truncate rounded-lg bg-raised px-2 py-1.5 font-mono text-xs text-zinc-400">{settings.apiToken}</code>
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
              </Card>
            </Panel>
          )}

          {cat === 'brain' && (
            <Panel title={t('set.brain')} desc={t('set.brainDesc')}>
              <Card>
                <Row label={t('set.brainFolder')} hint={brainPath || t('set.brainFolderHint')}>
                  <div className="flex items-center gap-2">
                    <button className="btn-ghost !py-1.5 text-xs" onClick={() => window.wist.brain.open()}>
                      <FolderOpen size={14} /> {t('set.brainOpen')}
                    </button>
                    <button className="btn-ghost !py-1.5 text-xs" onClick={changeBrainFolder}>
                      {t('common.change')}
                    </button>
                  </div>
                </Row>
                {brainStats && (
                  <Row label={t('set.brainContents')} hint={t('set.brainContentsHint')}>
                    <span className="max-w-xs text-right text-xs text-zinc-500">
                      {t('set.brainSummary', { titles: brainStats.titles, tasks: brainStats.tasks, done: brainStats.tasksDone, notes: brainStats.notes })}
                    </span>
                  </Row>
                )}
                <Row label={t('set.brainSync')} hint={t('set.brainSyncHint')}>
                  <button className="btn-ghost !py-1.5 text-xs" onClick={syncBrain} disabled={busy}>
                    <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> {t('set.brainSyncBtn')}
                  </button>
                </Row>
                <Row label={t('set.brainRestore')} hint={t('set.brainRestoreHint')}>
                  <button className="btn-ghost !py-1.5 text-xs" onClick={() => setConfirmRestore(true)} disabled={busy}>
                    <RotateCcw size={14} /> {t('set.brainRestoreBtn')}
                  </button>
                </Row>
              </Card>
            </Panel>
          )}

          {cat === 'data' && (
            <Panel title={t('set.data')} desc={t('set.dataDesc')}>
              <UpdatesCard t={t} />
              <Card>
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
              </Card>
              <Card>
                <Row label={t('set.clearHistory')} hint={t('set.clearHint')}>
                  <button className="btn-danger !py-1.5 text-xs" onClick={() => setConfirmClear(true)}>
                    <Trash2 size={14} /> {t('set.clear')}
                  </button>
                </Row>
                <Row label={t('set.clearDb')} hint={t('set.clearDbHint')}>
                  <button className="btn-danger !py-1.5 text-xs" onClick={() => setConfirmClearDb(true)}>
                    <Trash2 size={14} /> {t('set.clearDbBtn')}
                  </button>
                </Row>
              </Card>
            </Panel>
          )}
        </div>
      </div>

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
      {confirmRestore && (
        <ConfirmDialog
          title={t('set.restoreConfirmTitle')}
          message={t('set.restoreConfirmMessage')}
          confirmLabel={t('set.brainRestoreBtn')}
          danger
          onConfirm={restoreBrain}
          onCancel={() => setConfirmRestore(false)}
        />
      )}
      {confirmClearDb && (
        <ConfirmDialog
          title={t('set.clearDbConfirmTitle')}
          message={t('set.clearDbConfirmMessage')}
          confirmLabel={t('set.clearDbBtn')}
          danger
          onConfirm={clearDatabase}
          onCancel={() => setConfirmClearDb(false)}
        />
      )}
    </div>
  )
}
