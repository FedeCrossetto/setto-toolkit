# Setto Toolkit

## Project overview

- Maintain a modular desktop developer toolkit built with Electron 31, React 18, and TypeScript 5.5.
- Preserve the visual direction defined in `docs/DESIGN.md`: macOS-like, calm, token-driven (light and dark), consistent plugin-based shell.
- Treat the app as a collection of independent developer tools: file editing, code diff, API testing, repo search, snippet management, terminal, and AI-assisted ticket resolution.
- Build toward a production-quality Electron desktop app with polished UX, reliable IPC, and cross-platform behavior (macOS, Windows, Linux).
- Keep the plugin architecture generic so new tools can be added without touching the shell, and so branding or module availability can later be configured per instance.

## Core stack

- Electron entry: `electron/main.ts`
- Renderer entry: `src/main.tsx` → `src/App.tsx`
- Electron 43, React 18, TypeScript 5.5
- Bundler: electron-vite 5 (Vite 7). Main/preload bundle everything except `dependencies` (chokidar, electron-updater, node-pty, ws native helpers); renderer-only packages live in `devDependencies` so they aren't shipped twice in the installer. A new runtime `require` in main must be bundled or added to `dependencies`.
- Renderer chunks: no catch-all `vendor` chunk (it pulled marked/dompurify/fuse into startup); named chunks only for react(-dom)+scheduler, framer-motion+motion-dom/utils, codemirror, xterm, phosphor icons. The `setto-phosphor-weights` Vite plugin strips unused Phosphor weights (`KEPT_PHOSPHOR_WEIGHTS` in `src/core/icons/phosphor-weights.ts`: light/regular/bold/fill; the shim maps thin→light, duotone→regular). Heavy, non-first-paint UI (WhatsNew) is `lazy` in App.tsx. Release steps + future code signing: `docs/RELEASE.md`.
- Plugin registry: `src/core/plugin-registry.ts`
- Global state: React Context + useReducer in `src/core/AppContext.tsx`
- IPC bridge: `electron/preload.ts` (explicit allowlist + per-window role: main passes `additionalArguments: ['--setto-role=main|dock|picker']`; dock/picker only get `DOCK_CHANNELS` / `PICKER_CHANNELS` — a new channel used by `src/dock/**` or the picker must be added there too; no role = only `app:renderer-error`). `electron/core/ipc-guard.ts` (installed before `loadPlugins`) rejects sensitive channels (terminal:*, editor writes/deletes, settings:set/import/export, credentials:reveal/export-csv, backup:*, …) unless `event.sender` is the main window.
- Settings persistence: JSON files in userData (`DatabaseService`: atomic tmp→rename; `readEncryptedJSON` moves unreadable files to `<name>.corrupt-<ts>`), secrets encrypted with safeStorage
- AI providers: OpenAI, Anthropic, Ollama via `fetch` (no SDKs) — abstracted in `electron/core/services/ai.service.ts`
- Fonts: bundled with `@fontsource-variable` (Inter, JetBrains Mono — also aliased as 'JetBrains Mono' in `src/styles/fonts.css`); no Google Fonts / external CSS
- Updates: electron-updater from GitHub Releases (`updater.service.ts`): automatic checks are silent on "no releases"/404/offline; Ajustes → Acerca de → "Buscar actualizaciones" uses `updater:check`
- Styling: Tailwind CSS 4 (`@tailwindcss/postcss`). Theme lives in `src/styles/globals.css` (`@theme`): colors map to the `--c-*` RGB tokens; radius classes map to the app's shape tokens `--r-*` (not `--radius-*`, which is Tailwind's namespace). All app CSS sits inside `@layer utilities` after Tailwind's: unlayered CSS would beat every utility (e.g. the `* { padding: 0 }` reset).
- Tests: Vitest 5 + @vitest/coverage-v8

## Important commands

- Install deps: `npm install`
- Start dev server: `npm run dev`
- Build bundles: `npm run build`
- Package installers: `npm run package` (local, `--publish never`)
- Release: bump `version` in package.json + CHANGELOG.md, commit, `git tag vX.Y.Z && git push origin vX.Y.Z` → `.github/workflows/release.yml` builds on Windows and publishes the installer to GitHub Releases (the auto-updater feed). Never publish from a dev machine.
- Dev builds don't register global shortcuts (they'd steal the installed app's); `SETTO_DEV_SHORTCUTS=1 npm run dev` to test them
- Run tests: `npm test`
- Tests in watch mode: `npm run test:watch`
- Tests with coverage: `npm run test:coverage`
- Rebuild native modules: `npm run rebuild` (required on Windows for node-pty)
- Change the logo (app, icons, splash, dock): `npm run logo:set -- "path/to/image.jpg"`; only regenerate icons from the current master: `npm run icons:build`

## Architecture map

- `electron/main.ts`: Electron lifecycle, BrowserWindow creation, IPC handler registration
- `electron/preload.ts`: Allowlist-based IPC bridge; unknown channels throw `Error: IPC blocked`
- `electron/core/plugin-loader.ts`: Dynamically loads each plugin's handler module
- `electron/core/services/ai.service.ts`: Multi-provider AI abstraction (OpenAI / Anthropic / Ollama)
- `electron/core/services/settings.service.ts`: Encrypted CRUD for all user settings via safeStorage
- `electron/core/services/auth.service.ts`: OAuth 2.0 PKCE flows for Google, GitHub, and GitLab
- `src/App.tsx`: Shell layout — renders TopBar, Sidebar and the active module (recent ones stay mounted, hidden)
- `src/core/AppContext.tsx`: Global app state and reducer (mounted modules LRU, active module, theme, onboarding, etc.)
- `src/core/plugin-registry.ts`: Single source of truth listing all registered plugins
- `src/core/types.ts`: Shared types — AppState, PluginManifest, Tab, Settings
- `src/plugins/<name>/index.ts`: Each plugin's manifest and lazy-loaded component
- `electron/plugins/<name>/handlers.ts`: Each plugin's IPC handlers (file I/O, API calls, etc.)

## Plugin architecture

Every plugin has two layers that must stay in sync.

**Frontend** — `src/plugins/<name>/index.ts`:
```typescript
export const myPlugin: PluginManifest = {
  id: 'my-plugin',
  name: 'My Plugin',
  description: 'What it does',
  icon: 'lucide-icon-name',
  component: lazy(() => import('./MyPlugin')),
  keywords: ['relevant', 'terms']
}
```
Register in `src/core/plugin-registry.ts`.

**Backend** — `electron/plugins/<name>/handlers.ts`:
```typescript
export function registerHandlers() {
  ipcMain.handle('my-plugin:action', async (_event, ...args) => {
    return result
  })
}
```
Register in `electron/core/plugin-loader.ts`.

**Preload** — every new IPC channel must be added to the explicit allowlist in `electron/preload.ts`. Channel naming convention: `plugin-id:action` in kebab-case.

Use `src/plugins/_template/` as the starting point for new plugins.

## Security constraints

- The renderer never has direct Node access. All system calls go through the IPC bridge.
- API keys are stored encrypted and never returned in plaintext — responses use the sentinel `__CONFIGURED__` to confirm a key is set.
- Path validation in `file-editor/handlers.ts` blocks traversal attacks, null bytes, and access outside allowed directories.
- Pre/post request scripts in API Lab (`script-runner.ts`, async) run in a fresh `worker_threads` Worker per run (`resourceLimits`, empty env, hard kill after 2 s) inside a `vm` context with `codeGeneration: { strings: false, wasm: false }`; only JSON strings cross the boundary.
- Markdown preview (`MarkdownPreview.tsx` + `markdown-safety.ts`, used by Editor and Notes) never loads remote resources: remote `img` → "Cargar imagen remota" button (main downloads via `app:fetch-remote-image`, `electron/core/remote-image.ts`, returns a data: URL); iframes/video/audio/srcset and remote `url()` in styles are stripped. CSP `img-src` has no generic `https:` — only `'self' data: blob: setto-capture:` + favicon/avatar hosts (google s2 favicons/gstatic, googleusercontent, GitHub/GitLab/Bitbucket/gravatar avatars), in both main.ts and index.html.
- OAuth Client IDs (`GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID`, `GITLAB_CLIENT_ID`) are compiled from `.env` at build time and never committed to the repo.
- Do not log secrets. Use `logger.ts` debug level only, and never include credential values in log output.

## UX and product constraints

- Follow `docs/DESIGN.md`. Both light and dark themes must look right.
- Use design tokens from `src/styles/globals.css` (`@theme` + `:root`) instead of hardcoding color or spacing values.
- Single-module navigation: the sidebar is the navigation, the top bar shows only the current module (no tabs). The last 6 modules stay mounted (LRU in `src/core/navigation.ts`; dirty and `keepAlive` modules are never unmounted). Ctrl+1…9 / Ctrl+` / Ctrl+Tab (not in the Editor). See `docs/DESIGN.md` → Navegación.
- Deleting: single item = immediate + toast "Deshacer" (`useUndo`); bulk/irreversible = `useConfirm`.
- Prefer intentional, keyboard-accessible UI. CommandPalette (Ctrl+K) is a first-class navigation surface.
- Copy in the UI is in Spanish unless the task explicitly requires another language.
- Favor patterns that will scale: configurable module visibility, branding params, and feature toggles instead of hardcoded per-tool behavior.

## Known implementation details

- `electron/preload.ts` explicitly allowlists 46 INVOKE channels and 51 SEND/ON channels. Any new IPC channel must be added here or it will be blocked.
- Only public OAuth identifiers are embedded at build time via `electron-vite define` (Google desktop client id/secret — non-confidential by Google's definition — and GitHub/GitLab client ids). Never define service keys there: the repo and the installer are public. Supabase URL/key are configured per user (Conexiones → Supabase, encrypted). The release workflow fails if `out/main/main.js` contains a JWT.
- The Terminal plugin requires native compilation of `node-pty`. On Windows, this needs Python 3 and Visual Studio Build Tools (Desktop C++). Run `npm run rebuild` after `npm install`.
- The `gastos` plugin uses Supabase as source of truth (URL + Service Role Key via `gastos:supabase-config-save`, local dev override in `gastos-supabase.local.json`, gitignored). It has recurring bills (`servicios` + `pagos`, one payment per `servicioId-mes`) and variable expenses (`gastos` table, migration `supabase/migrations/002_gastos_variables.sql`). Saves are optimistic with a persisted pending-writes queue (`src/plugins/gastos/sync-queue.ts`, tested): a successful direct write drops queued writes for the same entity (`dropSuperseded`), `flushQueue` + `settleQueue` only remove what was sent/rejected from the CURRENT queue (writes enqueued meanwhile survive), validation rejections are discarded with a toast (`classifyWriteError`); auto-sync after saves and on window focus. Supabase reads paginate with `.range()` (`selectAll`), every request has a 12 s timeout (`fetchWithTimeout` in `supabase-client.ts`), and the remote version is `max(updated_at)#table=count,…` so deletes are detected. Config comes only from Settings or `gastos-supabase.local.json` (no env vars). `gastos:load` returns `credenciales: []` and the service never attaches passwords (Claves reads the vault in main; `gastosStorage.loadCredenciales()` is the metadata-only load). `gastos:summary(mes)` is the light month query (+ cache fallback, statuses ok/offline/error/not-configured) used by `summary.ts` → Inicio and the dock. Writes from outside the module (Ctrl+Shift+Space capture, Inicio) go through `direct-write.ts` (delegates to the mounted store, else writes/enqueues itself) via `useQuickGasto` (parser + learning, saves directly with `useUndo`; opens Gastos only when there's no amount); `setto:gastos-changed` refreshes Inicio.
- Gastos budgets + recurring: per-category budgets in `GastosPrefs.presupuestosCategoria` (shared main cache; total stays in `presupuesto`); pure math in `analytics.ts` (`budgetProgress`, warning ≥ 80 %, error > 100 %, used by main's `gastos:summary` → `presupuestosEnRiesgo` for Inicio) + `budgets.ts` (alerts). Recurring rules in `GastosPrefs.recurrentes`; pure engine `recurrence.ts` (stable ids `rec-<ruleId>-<yyyy-mm-dd>`, `hasta` = generated-through marker so deleted/undone instances never return, 3-month catch-up, `parseRecurrence` for "todos los meses"); `recurrence-runner.ts` serializes read-modify-write of rules and runs the engine via `writeGastos` from Gastos and Inicio (`useRecurrentesAuto`, toast with Deshacer). Not run from the dock window (separate window → its direct writes could race the mounted store's queue). Tests: `budgets-recurrence.test.ts`.
- Personal credentials live in the `credentials` plugin (still stored through the `gastos:*credencial*` channels); old Gastos "Queries" were migrated once into Snippets (collection "Queries"). Usage (`useCount` + `lastUsedAt`) and favorites are per-computer in `credentials-local.json` (never synced); `credentials:copy-password` / `credentials:copy-username` copy in main, count a use and return `{ ok, usedAt } | { ok:false, error, locked? }`; `credentials:top(limit)` ranks favorites first, then by `usageScore` (`src/plugins/credentials/usage.ts`: log2 of count × 14-day half-life decay). The list defaults to "Más usadas" (sort menu persisted in `localStorage`), pins favorites on top, and the empty detail pane is the "Acceso rápido" grid; usage bumps only refresh hints, the order changes on the next load (no jumping under the cursor). Ctrl+K ranks matches by name tier first, usage as tiebreaker.
- `notes` stores one `.md` per note in `<userData>/notes` (configurable). Global quick capture: `Ctrl+Shift+Space` + tray (`electron/core/quick-capture.ts`).
- Visual rules: `docs/DESIGN.md` (macOS look; tokens for color/radius/borders/shadows in `globals.css` and `useThemePalette.ts`).
- "Líneas finas" helpers (end of `globals.css`): `.icon-tile` (neutral white tile, hairline, gray icon — use instead of `bg-selected text-primary` / gradient tiles; `EmptyState`, `SettingsRow`, `KpiCard` use it) and `.stat-cell` (hairline cell instead of gray fill). Active item in inner lists = `.nav-active` (Ajustes index, Utilidades). Card headers: gray 15px icon + `t-callout font-semibold`, no icon tile.
- More "líneas finas" helpers (Diseño B block, end of `globals.css`, unlayered — add `!` to utilities that must override them): `.fl-pane` (inner side panel = `--c-sidebar`), `.fl-row` (30px list row; add `.nav-active` when selected), `.fl-section` (11px uppercase header, flex), `.fl-toolbar` (42px + hairline-b), `.fl-chip` (thin-bordered pill, `.is-on` when active), `.fl-search` (white search box on a gray pane), `.fl-dialog` (white, hairline, soft shadow, 14px — Modal/Sheet/Ctrl+K/QuickOpen/FindInFiles/toasts). Selection inside a white dialog = `bg-on-surface/[0.045]` + hairline, not `bg-selected`.
- `smart-diff` no longer runs AI analysis in the plugin itself — that capability moved to Ticket Resolver (API-only, no CLI dependency).
- Terminal plugin restores multi-session state across app restarts.
- `utilities` plugin: pure dev tools in `src/plugins/utilities/tools.ts` (JSON, Base64, URL, JWT, UUID, timestamp, regex, hash incl. a pure-JS MD5). Its Ctrl+K provider (`order: -1`) detects pasted JWT/JSON/timestamps/Base64 and goes first. Clipboard history lives in main memory only (`electron/core/clipboard-history.ts`); Credentials calls `ignoreClipboardText` so secrets never enter it.
- Native notifications: renderer decides what to notify (`src/core/notify.ts` → `app:notify`), main shows them (`electron/core/notifications.ts`); click → `app:notification-click` opens the plugin. Gastos due-date reminders (`gastos/reminders.ts`, due day per service in `GastosPrefs.diasVencimiento`, local only) and note reminders (`notes/reminders.ts`, localStorage). Setting `app.close_to_tray` makes the X hide the window.
- Global snippet picker: `Ctrl+Alt+V` (fallbacks in `electron/core/snippet-picker.ts`) opens a transparent window rendering `SnippetPicker` (`main.tsx` checks `#snippet-picker`; each window dynamic-imports only its root — App / SnippetPicker / Dock — so the small windows don't load the whole app; the picker is destroyed after 5 min hidden); auto-paste simulates Ctrl+V via `wscript` SendKeys (osascript / xdotool elsewhere). Setting `snippets.auto_paste`.
- Notes: `NoteMeta` carries `links` ([[Título]]) and `tags` (#tag), extracted in `notes-utils.ts` by `notes:list`. Preview turns [[…]] into `a[data-note-link]`.
- Appearance = `{ preset, palette, surface, darkStyle }` in one store (`useAppearance` / `setAppearance` / `previewAppearance` in `src/core/hooks/useThemePalette.ts`, persisted in `app:appearance` + `app:palette`). Non-Setto presets (`src/core/themes/presets.ts`) bring their own surfaces and drive the Editor ("Tema de la app" family) and Terminal ("Sistema") via `presetCodeThemes`. Theme changes add `.theme-transition` to <html> for ~250 ms. Ctrl+K group "Apariencia" (`src/core/search-appearance.ts`), Ctrl+Shift+L toggles light/dark.
- `captures` plugin: main polls the clipboard for images (`electron/plugins/captures/handlers.ts`), dedupes by pixel sha1, saves PNG + JPEG thumb (`thumbs/`) + `captures.json` in `<userData>/captures`. Source app/window comes from a tiny C# exe compiled on first use with Windows' own `csc.exe` (`FG_HELPER_SOURCE` in `electron/core/win-helper.ts`, ~17 MB vs ~80 MB for PowerShell; falls back to PowerShell if it can't compile/run). OCR uses a PowerShell worker (WinRT) started on demand and closed after 90 s idle. Both speak JSON lines over stdin/stdout (`LineWorker`). Search/sort/paging/facets run in main (`queryCaptures`, `captures:query`); the gallery only receives `CaptureLite` (no OCR/note) and pages of 60. Settings (`captures.*`: auto, keep_days, max_mb, notify, exclude_apps) via `captures:settings`. Images are served to the renderer via the privileged `setto-capture://img/<file>` protocol (CORS on, so the canvas annotator can export); it's in both CSPs (main.ts + index.html). Annotations are saved as a NEW capture (`annotatedFrom`). Drag out uses `webContents.startDrag` (`captures:start-drag`).
- Smart clipboard: pure logic in `src/core/clip-utils.ts` (kind detection, `isSensitive`/`redactSecrets`, paste transforms: SQL IN, Jira/Markdown table…) and `src/core/clip-actions.ts` (per-kind actions). Main keeps text history in `electron/core/clipboard-history.ts` (sensitive entries never leave main unmasked and expire in 60 s; pinned ones persisted encrypted with safeStorage in `clipboard-pins.json`; paste-in-sequence queue). Global shortcuts in `electron/core/clipboard-actions.ts`: Ctrl+Alt+Shift+V pastes next in the queue, Ctrl+Alt+T copies the OCR text of the clipboard image. The Ctrl+Alt+V floating window (`SnippetPicker.tsx`) now lists clips + captures + snippets; it opens modules in the main window via `app:open-in-main`. Captures filtered by ticket show `TicketPanel` (Jira/Markdown evidence comment via `ticket-comment.ts`; image names = `uniqueExportNames`, same as export).
- Tickets module (`src/plugins/tickets`, main `electron/plugins/tickets/handlers.ts`): pure key extraction/index in `src/plugins/tickets/logic.ts` (regex `[A-Z][A-Z0-9]+-\d+` with a prefix blocklist for UTF-8/SHA-256/ISO-8859…; recent-file paths only match keys already known, case-insensitive). Main builds `tickets:list` / `tickets:get` from per-source caches keyed by mtime (captures.json, the encrypted clipboard pins/recent files — sensitive clips are never persisted and are re-filtered with `isSensitive` —, each note file, snippets.json, `editor.recentFiles`); pinned/manual keys and titles in setting `tickets.meta`. Export = `<dir>/<KEY>/` with PNGs named by `uniqueExportNames` (capture ticket forced to the key, same as the evidence comment) + `<KEY>.md`. Ctrl+K provider `src/plugins/tickets/search.ts`. The AI module `ticket-resolver` is now named "Resolver con IA".
- Unified clipboard search: `clipboard:search(query, {kinds, limit})` (in `electron/core/clipboard-history.ts`, also in `DOCK_CHANNELS`) ranks non-sensitive text clips + captures (OCR, note, ticket, title, app, window; the captures plugin plugs in via `setCaptureSearchSource`, prepared docs cached per capture and dropped on `touch`) with the pure `src/plugins/captures/clip-search.ts` (tested; phrase > all words > fuzzy, + field weight + recency; snippet + highlight ranges on the original text). Used by the dock search (chips Todo/Texto/Capturas, Alt+Enter = `captures:copy-ocr`), `TextClips` and the Ctrl+K clipboard provider (captures only when the match is in OCR/note). OCR order lives in `electron/plugins/captures/ocr-queue.ts` (tested): new captures first after 1.5 s, old ones without OCR backfilled 45 s after start at 2/min (6/min when the system is idle ≥ 30 s), so the PowerShell worker still idles out when the queue is empty.
- Module `captures` is shown as **Portapapeles** with tabs Imágenes (captures) and Texto (`TextClips.tsx`: clipboard text by category via `clipCategory`; code shown with `CodeViewer`). Main persists the last 20 non-sensitive clips encrypted (`clipboard-recent.json`) besides pinned ones. Intent `captures/text` opens the Texto tab.
- Backup (Ajustes → Respaldo): `electron/core/backup.ts` (pure, tested) + `backup-service.ts` (`backup:*`). Data files are made portable (safeStorage-encrypted `ENCV1:`, clipboard `{v,enc,data}` and `enc:` values in settings.json are decrypted), bundled with the main window's localStorage, gzipped and sealed with scrypt + AES-256-GCM using the user's passphrase (`.settobackup`). Restore (`backup-restore.ts`, tested) writes entries re-encrypted for this PC into `.restore-staging-<ts>/`, keeps only paths `collectFiles` recognizes, validates JSON, then renames the current data set into `restore-backup-<ts>/` (files missing from the backup are thus removed; captures only count if the backup has any) and moves the staged files in, rolling back on any error; then it restores localStorage and relaunches with `app.exit` (no will-quit flushes). Weekly auto-backup to a chosen folder keeps the last 5 (config in encrypted `backup-auto.json`, excluded from backups). `SETTO_NO_RELAUNCH` skips the relaunch in tests.
- Consultas (`src/plugins/sql-runner`, id `sql-runner`): SQL against the saved SQL Server profiles. `sql:query` runs in main (`electron/plugins/sql-connections/query-runner.ts`: PowerShell + System.Data.SqlClient, batches split on `GO` like SSMS, multiple result sets, PRINT messages, error line mapped back to the editor line, cancel = kill the process). Read-only mode (default) wraps everything in a transaction that is rolled back. Tabs autosave (`sql-tabs.json`, encrypted) and closing one keeps it in `closed` (Ctrl+Shift+T reopens); every run goes to `sql-history.json`. "Comparar" runs the same query on two profiles and diffs by the first N key columns (`compareSets`, default query = GENERAL_PARAMS). All `sql:query*`/tabs/history channels are main-window only (ipc-guard). Object explorer (`ObjectExplorer.tsx`) reads the catalog through `sql:meta` (databases / objects / children / definition; SQL in `sql-meta.ts`, no history). A failure while connecting returns `phase: 'connect'`; `connectionProblem()` classifies it as `auth` or `server` and `ConnectionFixDialog` asks for the new password/IP, tests, saves the profile and retries.
- SQL Server connections (Conexiones → Bases de datos): `src/plugins/connections/sql.ts` (types + connection-string helpers, tested) and `electron/plugins/sql-connections/handlers.ts` (`sql:*`). Profiles in encrypted `sql-connections.json`; the password never reaches the renderer. Test = PowerShell + System.Data.SqlClient (ships with Windows, named instances, Windows auth), connection string via stdin. `sql:copy` writes server / ADO.NET / sqlcmd to the clipboard (with password: cleared after 60 s). Also in Ctrl+K.
- Dock context: main remembers the last external foreground app (`lastExternal`, from the fullscreen poller) and sends it as `context` in `dock:state`; `src/dock/context.ts` maps it to suggestions (SSMS → SQL snippets/clips, VS/Code → code, ticket in the title → that ticket, Teams/Outlook → captures).
- Dock "Bloc" tab (`src/dock/Bloc.tsx`, pure helpers in `src/dock/bloc-utils.ts`, tested): a scratch note stored as the regular note `Bloc.md` via `notes:read`/`notes:write` (works with the Notas module disabled; created on first write, autosave 500 ms debounce + on blur/collapse/unmount; nothing is saved until the file was read, and keys typed before that are appended). The panel remounts on every open, so it reloads each time. With Bloc active, the dock keydown handler only handles Esc/Tab and forwards typed chars to the textarea; the textarea asks `dock:want-focus` like the search box. "Abrir en Notas" = `app:open-in-main` notes/open `Bloc.md` (OPEN_WITH_INTENT re-enables the plugin). Footer flash takes an optional undo ("Deshacer"). `dock:open(tab)` (send) opens the dock focused on a tab: main passes it once as `tab` in `dock:state` (consumed by the invoke if the window is still loading). Ctrl+K: `blocSearchProvider` in `src/plugins/notes/search.ts` has no `pluginId` on purpose (providers with one are skipped while Notas is hidden); if the dock is off it opens `Bloc.md` in Notas. `.kbd-chip` sets `display` unlayered, so it beats `hidden`/`group-hover:hidden` — the dock's index badge copies its look with utilities instead.
- Floating edge bar ("dock"): `electron/core/dock.ts` + `src/dock/Dock.tsx` (`#dock`). Non-focusable so a click pastes into the app in front (`dock:paste` → simulatePaste); becomes focusable only for its search box. Hidden while the foreground window is fullscreen (win-helper `fg` returns `full`). Settings `app.dock`, `app.dock_side` (right|left, toggled from the panel header via `dock:set-side`), shortcut Ctrl+Alt+D (forces it over a fullscreen app until the app changes). The transparent window is always bigger than what's visible (collapsed 72x120 for a 46x56 pill; panel gets `pad` sent in `dock:state`) so CSS shadows fit entirely inside — a shadow clipped by the window bounds shows as a gray rectangle on white backgrounds. Collapsed tab: drag along the edge (`dock:move`, clamped to the work area, snaps to the middle within 14 px, main echoes `dock:drag` for the guide; height saved in `app.dock_y`), double-click → `dock:move-reset` (glides to the middle), opens on click or when the pointer rests 280 ms; new clips send `dock:bump` with the kind (badge in the kind color + bounce). Panel: tabs Copiado/Capturas/Snippets/Tickets/Claves, kind-colored cards, bottom preview (hover 450 ms or arrows) with transforms/actions, keyboard when opened with the shortcut (arrows, Enter, 1–9, Tab, type-to-search, Esc). Claves = `credentials:top(8)` (search over `credentials:list({localOnly})`); Enter/click copies the password in main (`credentials:copy-password`, 30 s auto-clear), Shift+Enter the user; locked PIN → "Abrir Setto para desbloquear" (`app:open-in-main` credentials/open); passwords never reach the dock. No Windows acrylic: DWM paints it as a rectangle (setShape leaves jagged corners) and turning it off makes the transparent window opaque; the rounded panel is pure CSS. Auto-collapse is driven from main by polling the cursor position (`watchCursor`), not DOM mouseleave. Expanding resizes first and then notifies; collapsing notifies first and shrinks after 240 ms so the panel's exit animation can play.
- Claves local mode (`electron/plugins/credentials/handlers.ts` `isLocalMode`): no Supabase URL/key or `app.local_only = '1'` → status `local`, saves/deletes only touch the vault + cache (nothing queued or retried), UI shows "Solo en esta computadora" (`src/plugins/credentials/local-mode.ts`). Single-item deletes (Claves, Snippets, Capturas, Texto) use `useUndo` + `useSoftDelete` (`src/core/soft-delete.ts`): hidden at once, the real delete commits ~10 s later or on unmount. Intent `credentials/copy-password` opens Claves, asks the PIN and copies (used by Ctrl+K and the dock when locked). Picker/dock text pastes restore the previous clipboard text (`electron/core/paste-restore.ts`); `simulatePaste` falls back wscript → PowerShell SendKeys → notification. The dock opens on the cursor's display and loads tabs in parallel (Gastos via `gastos:summary`, throttled 60 s, 3 s timeout). Editor Ctrl+K marks missing recents via `editor:exists` (if present).
- Claves end-to-end password sync (opt-in, `electron/plugins/credentials/e2e-*.ts`, tested in `e2e.test.ts`): scrypt (N=2^15, r=8, p=1, 16-byte salt) → AES-256-GCM blobs `v1:salt:iv:tag:ct` in `credenciales.password_e2e` (AAD = credential id; payload `{p,t}` where `t` = when the password was set, so "newer wins" ignores metadata edits; a local password with no timestamp that differs from the remote one is never overwritten: it becomes `e2e: 'conflict'` and the user picks via `credentials:e2e-resolve` local|remote|undo); `vault_meta` ('default': salt, kdf, check_value) verifies the master password. Needs `supabase/migrations/004_credenciales_sync.sql` (renderer copy in `src/plugins/credentials/e2e-migration.ts`, kept equal by a test; missing → state `migration-missing`). Master password / key never reach the renderer or Supabase; the key lives in memory with the PIN minutes (sliding on explicit use), dropped on lock, blur timeout, suspend and lock-screen; "Recordar en esta computadora" stores it in `credentials-e2e-key.vault` (safeStorage). Per-PC state in `credentials-e2e.json` (HMAC hashes of the last agreeing local/remote pair → item `e2e: synced|local|remote`). `syncList` calls `e2e.refresh()` (merge if unlocked, else only blob hashes); saves call `pushOne`. Channels `credentials:e2e-{status,setup,unlock,change,disable,lock,remember}`; UI `components/SyncSheet.tsx`.
- Optional Notes/Snippets sync (`electron/core/services/sync.service.ts`, setting `sync.notes_snippets`): table `setto_sync` from `supabase/migrations/003_setto_sync.sql`; three-way merge with a per-item base hash in `<userData>/sync-state.json` (`sync-plan.ts`, tested). Note conflicts keep both versions; the base of uploads is only updated after Supabase confirms.
- File editor preserves each file's encoding (UTF-8, UTF-8 BOM, UTF-16 LE/BE, Windows-1252 — `electron/plugins/file-editor/encoding.ts`) and EOL (CRLF/LF); in memory content is always `\n`. Saving to Windows-1252 fails (never replaces) on unmappable chars. Every save snapshots the previous disk bytes to `<userData>/editor-history` (50 per file, 200 MB total, autosaves coalesced within 60 s). Autosave defaults to on: prefs are migrated once to `autoSave: true` (marker `autoSaveMigrated`), so users who had it off must turn it off again once.

## Files to inspect first for common tasks

- IPC issues: `electron/preload.ts`, `electron/core/plugin-loader.ts`, `electron/core/ipc-registry.ts`
- Plugin not loading: `src/core/plugin-registry.ts`, `electron/core/plugin-loader.ts`
- Visual changes: `src/styles/globals.css`, `src/core/components/`
- Settings or credentials: `electron/core/services/settings.service.ts`, `electron/plugins/settings/handlers.ts`
- AI integration: `electron/core/services/ai.service.ts`
- Auth flows: `electron/core/services/auth.service.ts`, `electron/plugins/auth/handlers.ts`
- File editor issues: `electron/plugins/file-editor/handlers.ts`
- Build or packaging: `electron.vite.config.ts`, `package.json` build section

## Working style

- Make focused edits that fit the existing codebase instead of broad rewrites.
- Read the relevant files before making changes.
- Prefer small, verifiable changes. Run `npm run typecheck` (via `tsc --noEmit`) after non-trivial TypeScript edits.
- When adding a plugin or IPC channel, update all three registration points: plugin-registry, plugin-loader, and preload allowlist.
- Flag clearly if a feature depends on missing backend wiring, native modules, or environment variables.
- When introducing behavior that could vary per client or deployment, prefer a configurable shape over a hardcoded value.

## Approach

- Think before acting.
- Read existing files before writing code.
- Be concise in output but thorough in reasoning.
- Prefer editing over rewriting whole files.
- Do not re-read files you have already read unless the file may have changed.
- Test your code before declaring done.
- No sycophantic openers or closing fluff.
- Keep solutions simple and direct.
- User instructions always override this file.
