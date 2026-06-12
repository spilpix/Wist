# Wist

Personal media hub for Windows — like Obsidian for notes, but for everything you watch: local anime, movies, cartoons, series, plus YouTube channels and playlists. One dark, quiet place to track, discover and relive it all. Everything stays on your machine: SQLite database, PNG screenshots, no cloud, no accounts.

UI is fully bilingual — **Russian / English**. The language follows the system locale on first launch and can be switched in Settings → Appearance.

📘 Полная документация на русском: [ДОКУМЕНТАЦИЯ.md](ДОКУМЕНТАЦИЯ.md)

## Stack

Electron 33 · React 18 · TypeScript · Vite · better-sqlite3 · Tailwind CSS · Zustand · React Router 6 · Recharts · electron-store

## Run it

```sh
npm install     # native modules build against Electron's ABI via .npmrc — no compiler needed
npm run dev     # Vite dev server + Electron with hot reload
```

Other scripts:

```sh
npm run typecheck   # tsc over renderer + main process
npm run build       # typecheck + production bundles (dist/ + dist-electron/)
npm run icon        # regenerate build/icon.png + icon.ico from build/icon.svg
npm run dist        # build + package the NSIS installer via electron-builder → release/Wist Setup <version>.exe
node scripts/test-parser.mjs        # filename-parser test cases (bundle first: npx esbuild src/utils/filenameParser.ts --bundle --format=esm --outfile=scripts/parser-bundle.mjs)
npx electron scripts/smoke-db.cjs   # verify better-sqlite3 loads inside Electron
```

The installer (`release/Wist Setup 0.1.0.exe`) is bilingual (en/ru), lets you pick the install directory, and embeds the app icon. `build.npmRebuild` is `false` because node_modules already holds Electron-ABI prebuilds (see the `.npmrc` note below).

> `.npmrc` pins `runtime=electron` / `target=33.2.0` so `npm install` downloads better-sqlite3's **prebuilt Electron binary** instead of compiling for your system Node. If you bump the Electron version in `package.json`, update `target` to match.

## Optional external tools

- **yt-dlp** — fetches YouTube channel/playlist video lists (no API key). `winget install yt-dlp`, or set an explicit path in Settings.
- **mpv** — fallback for files the built-in player can't decode (e.g. HEVC/10-bit). `winget install mpv`, or set the path in Settings.

## Player engine note

The original idea called for embedding mpv (mpv.js / node-mpv). mpv.js relies on the long-removed Pepper plugin API and node-mpv controls a *separate* OS window, which would break the in-app overlay UI (moment capture, timeline dots, subtitle menu). Wist therefore plays files with Chromium's built-in media engine — H.264/VP9/AV1 in mp4/mkv/webm play fine, frame-accurate screenshots come straight from the video element — and offers one-click **Open in mpv** for anything Chromium can't decode.

## Data locations

| What | Where |
| --- | --- |
| Database | `%APPDATA%/wist/wist.db` |
| Settings | `%APPDATA%/wist/settings.json` |
| Covers | `%APPDATA%/wist/covers/` |
| Screenshots | `%APPDATA%/wist/screenshots/` (configurable in Settings) |

## Layout

```
electron/        main process: window, media:// streaming protocol, settings
  db/            SQLite schema, migrations and queries (better-sqlite3)
  ipc/           IPC handlers: files, data export, yt-dlp, subtitles (SRT/ASS → VTT)
  preload.ts     contextBridge — renderer talks to the DB only through window.wist
src/
  pages/         Home, Library, TitleDetail, Player, Moments, Statistics, Settings, …
  components/    sidebar, cards, heatmap, modals
  store/         Zustand stores (settings, library, toasts)
  i18n/          en/ru dictionaries + useI18n hook (Intl.PluralRules for Russian plurals)
  utils/         filename parser (5+ release-naming patterns), formatters
  types/         shared models + window.wist API contract
build/           icon.svg (source) → generated icon.png / icon.ico (npm run icon)
scripts/         make-icon.mjs, parser tests, DB smoke test
```
