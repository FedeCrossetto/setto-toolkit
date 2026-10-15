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
- Bundler: electron-vite 2.3 (Vite 5 for renderer, esbuild for main/preload)
- Plugin registry: `src/core/plugin-registry.ts`
- Global state: React Context + useReducer in `src/core/AppContext.tsx`
- IPC bridge: `electron/preload.ts` (explicit allowlist, 46 INVOKE + 51 SEND channels)
- Settings persistence: electron-store 11 with safeStorage encryption
- AI providers: OpenAI 4.47, Anthropic SDK, Ollama — abstracted in `electron/core/services/ai.service.ts`
- Styling: Tailwind CSS 3.4 with custom MD3 token palette in `tailwind.config.ts`
- Tests: Vitest 2.0 + @vitest/coverage-v8

## Important commands

- Install deps: `npm install`
- Start dev server: `npm run dev`
- Build bundles: `npm run build`
- Package installers: `npm run package`
- Run tests: `npm test`
- Tests in watch mode: `npm run test:watch`
- Tests with coverage: `npm run test:coverage`
- Rebuild native modules: `npm run rebuild` (required on Windows for node-pty)
- Regenerate app icons: `npm run icons:build`

## Architecture map

- `electron/main.ts`: Electron lifecycle, BrowserWindow creation, IPC handler registration
- `electron/preload.ts`: Allowlist-based IPC bridge; unknown channels throw `Error: IPC blocked`
- `electron/core/plugin-loader.ts`: Dynamically loads each plugin's handler module
- `electron/core/services/ai.service.ts`: Multi-provider AI abstraction (OpenAI / Anthropic / Ollama)
- `electron/core/services/settings.service.ts`: Encrypted CRUD for all user settings via safeStorage
- `electron/core/services/auth.service.ts`: OAuth 2.0 PKCE flows for Google, GitHub, and GitLab
- `src/App.tsx`: Shell layout — renders TitleBar, Sidebar, TabBar, and active plugin component
- `src/core/AppContext.tsx`: Global app state and reducer (open tabs, active plugin, theme, etc.)
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
- Pre/post request scripts in API Lab run inside `vm.runInNewContext` with a 2-second timeout.
- OAuth Client IDs (`GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID`, `GITLAB_CLIENT_ID`) are compiled from `.env` at build time and never committed to the repo.
- Do not log secrets. Use `logger.ts` debug level only, and never include credential values in log output.

## UX and product constraints

- Follow `docs/DESIGN.md`. Both light and dark themes must look right.
- Use design tokens from `tailwind.config.ts` and `src/styles/globals.css` instead of hardcoding color or spacing values.
- The shell uses a tab model — plugins open in tabs, not in a single-page replacement. Preserve this mental model.
- Prefer intentional, keyboard-accessible UI. CommandPalette (Ctrl+K) is a first-class navigation surface.
- Copy in the UI is in Spanish unless the task explicitly requires another language.
- Favor patterns that will scale: configurable module visibility, branding params, and feature toggles instead of hardcoded per-tool behavior.

## Known implementation details

- `electron/preload.ts` explicitly allowlists 46 INVOKE channels and 51 SEND/ON channels. Any new IPC channel must be added here or it will be blocked.
- OAuth credentials are embedded into the binary at build time via `electron-vite define`. They are not accessible at runtime from the renderer.
- The Terminal plugin requires native compilation of `node-pty`. On Windows, this needs Python 3 and Visual Studio Build Tools (Desktop C++). Run `npm run rebuild` after `npm install`.
- The `gastos` plugin uses Supabase as source of truth (URL + Service Role Key via `gastos:supabase-config-save`, local dev override in `gastos-supabase.local.json`, gitignored). It has recurring bills (`servicios` + `pagos`, one payment per `servicioId-mes`) and variable expenses (`gastos` table, migration `supabase/migrations/002_gastos_variables.sql`). Saves are optimistic with a persisted pending-writes queue (`src/plugins/gastos/sync-queue.ts`), auto-sync after saves and on window focus. `src/plugins/gastos/summary.ts` exposes the month summary used by Inicio.
- Personal credentials live in the `credentials` plugin (still stored through the `gastos:*credencial*` channels); old Gastos "Queries" were migrated once into Snippets (collection "Queries"). Usage (`useCount` + `lastUsedAt`) and favorites are per-computer in `credentials-local.json` (never synced); `credentials:copy-password` / `credentials:copy-username` copy in main, count a use and return `{ ok, usedAt } | { ok:false, error, locked? }`; `credentials:top(limit)` ranks favorites first, then by `usageScore` (`src/plugins/credentials/usage.ts`: log2 of count × 14-day half-life decay). The list defaults to "Más usadas" (sort menu persisted in `localStorage`), pins favorites on top, and the empty detail pane is the "Acceso rápido" grid; usage bumps only refresh hints, the order changes on the next load (no jumping under the cursor). Ctrl+K ranks matches by name tier first, usage as tiebreaker.
- `notes` stores one `.md` per note in `<userData>/notes` (configurable). Global quick capture: `Ctrl+Shift+Space` + tray (`electron/core/quick-capture.ts`).
- Visual rules: `docs/DESIGN.md` (macOS look; tokens for color/radius/borders/shadows in `globals.css` and `useThemePalette.ts`).
- `smart-diff` no longer runs AI analysis in the plugin itself — that capability moved to Ticket Resolver (API-only, no CLI dependency).
- Terminal plugin restores multi-session state across app restarts.
- `utilities` plugin: pure dev tools in `src/plugins/utilities/tools.ts` (JSON, Base64, URL, JWT, UUID, timestamp, regex, hash incl. a pure-JS MD5). Its Ctrl+K provider (`order: -1`) detects pasted JWT/JSON/timestamps/Base64 and goes first. Clipboard history lives in main memory only (`electron/core/clipboard-history.ts`); Credentials calls `ignoreClipboardText` so secrets never enter it.
- Native notifications: renderer decides what to notify (`src/core/notify.ts` → `app:notify`), main shows them (`electron/core/notifications.ts`); click → `app:notification-click` opens the plugin. Gastos due-date reminders (`gastos/reminders.ts`, due day per service in `GastosPrefs.diasVencimiento`, local only) and note reminders (`notes/reminders.ts`, localStorage). Setting `app.close_to_tray` makes the X hide the window.
- Global snippet picker: `Ctrl+Alt+V` (fallbacks in `electron/core/snippet-picker.ts`) opens a transparent window rendering `SnippetPicker` (`main.tsx` checks `#snippet-picker`; each window dynamic-imports only its root — App / SnippetPicker / Dock — so the small windows don't load the whole app; the picker is destroyed after 5 min hidden); auto-paste simulates Ctrl+V via `wscript` SendKeys (osascript / xdotool elsewhere). Setting `snippets.auto_paste`.
- Notes: `NoteMeta` carries `links` ([[Título]]) and `tags` (#tag), extracted in `notes-utils.ts` by `notes:list`. Preview turns [[…]] into `a[data-note-link]`.
- Appearance = `{ preset, palette, surface, darkStyle }` in one store (`useAppearance` / `setAppearance` / `previewAppearance` in `src/core/hooks/useThemePalette.ts`, persisted in `app:appearance` + `app:palette`). Non-Setto presets (`src/core/themes/presets.ts`) bring their own surfaces and drive the Editor ("Tema de la app" family) and Terminal ("Sistema") via `presetCodeThemes`. Theme changes add `.theme-transition` to <html> for ~250 ms. Ctrl+K group "Apariencia" (`src/core/search-appearance.ts`), Ctrl+Shift+L toggles light/dark.
- `captures` plugin: main polls the clipboard for images (`electron/plugins/captures/handlers.ts`), dedupes by pixel sha1, saves PNG + JPEG thumb (`thumbs/`) + `captures.json` in `<userData>/captures`. Source app/window comes from a tiny C# exe compiled on first use with Windows' own `csc.exe` (`FG_HELPER_SOURCE` in `electron/core/win-helper.ts`, ~17 MB vs ~80 MB for PowerShell; falls back to PowerShell if it can't compile/run). OCR uses a PowerShell worker (WinRT) started on demand and closed after 90 s idle. Both speak JSON lines over stdin/stdout (`LineWorker`). Search/sort/paging/facets run in main (`queryCaptures`, `captures:query`); the gallery only receives `CaptureLite` (no OCR/note) and pages of 60. Settings (`captures.*`: auto, keep_days, max_mb, notify, exclude_apps) via `captures:settings`. Images are served to the renderer via the privileged `setto-capture://img/<file>` protocol (CORS on, so the canvas annotator can export); it's in both CSPs (main.ts + index.html). Annotations are saved as a NEW capture (`annotatedFrom`). Drag out uses `webContents.startDrag` (`captures:start-drag`).
- Smart clipboard: pure logic in `src/core/clip-utils.ts` (kind detection, `isSensitive`/`redactSecrets`, paste transforms: SQL IN, Jira/Markdown table…) and `src/core/clip-actions.ts` (per-kind actions). Main keeps text history in `electron/core/clipboard-history.ts` (sensitive entries never leave main unmasked and expire in 60 s; pinned ones persisted encrypted with safeStorage in `clipboard-pins.json`; paste-in-sequence queue). Global shortcuts in `electron/core/clipboard-actions.ts`: Ctrl+Alt+Shift+V pastes next in the queue, Ctrl+Alt+T copies the OCR text of the clipboard image. The Ctrl+Alt+V floating window (`SnippetPicker.tsx`) now lists clips + captures + snippets; it opens modules in the main window via `app:open-in-main`. Captures filtered by ticket show `TicketPanel` (Jira/Markdown evidence comment via `ticket-comment.ts`; image names = `uniqueExportNames`, same as export).
- Module `captures` is shown as **Portapapeles** with tabs Imágenes (captures) and Texto (`TextClips.tsx`: clipboard text by category via `clipCategory`; code shown with `CodeViewer`). Main persists the last 20 non-sensitive clips encrypted (`clipboard-recent.json`) besides pinned ones. Intent `captures/text` opens the Texto tab.
- SQL Server connections (Conexiones → Bases de datos): `src/plugins/connections/sql.ts` (types + connection-string helpers, tested) and `electron/plugins/sql-connections/handlers.ts` (`sql:*`). Profiles in encrypted `sql-connections.json`; the password never reaches the renderer. Test = PowerShell + System.Data.SqlClient (ships with Windows, named instances, Windows auth), connection string via stdin. `sql:copy` writes server / ADO.NET / sqlcmd to the clipboard (with password: cleared after 60 s). Also in Ctrl+K.
- Dock context: main remembers the last external foreground app (`lastExternal`, from the fullscreen poller) and sends it as `context` in `dock:state`; `src/dock/context.ts` maps it to suggestions (SSMS → SQL snippets/clips, VS/Code → code, ticket in the title → that ticket, Teams/Outlook → captures).
- Floating edge bar ("dock"): `electron/core/dock.ts` + `src/dock/Dock.tsx` (`#dock`). Non-focusable so a click pastes into the app in front (`dock:paste` → simulatePaste); becomes focusable only for its search box. Hidden while the foreground window is fullscreen (win-helper `fg` returns `full`). Settings `app.dock`, `app.dock_side` (right|left, toggled from the panel header via `dock:set-side`), shortcut Ctrl+Alt+D (forces it over a fullscreen app until the app changes). The transparent window is always bigger than what's visible (collapsed 72x120 for a 46x56 pill; panel gets `pad` sent in `dock:state`) so CSS shadows fit entirely inside — a shadow clipped by the window bounds shows as a gray rectangle on white backgrounds. Collapsed tab: drag along the edge (`dock:move`, clamped to the work area, snaps to the middle within 14 px, main echoes `dock:drag` for the guide; height saved in `app.dock_y`), double-click → `dock:move-reset` (glides to the middle), opens on click or when the pointer rests 280 ms; new clips send `dock:bump` with the kind (badge in the kind color + bounce). Panel: tabs Copiado/Capturas/Snippets/Tickets/Claves, kind-colored cards, bottom preview (hover 450 ms or arrows) with transforms/actions, keyboard when opened with the shortcut (arrows, Enter, 1–9, Tab, type-to-search, Esc). Claves = `credentials:top(8)` (search over `credentials:list({localOnly})`); Enter/click copies the password in main (`credentials:copy-password`, 30 s auto-clear), Shift+Enter the user; locked PIN → "Abrir Setto para desbloquear" (`app:open-in-main` credentials/open); passwords never reach the dock. No Windows acrylic: DWM paints it as a rectangle (setShape leaves jagged corners) and turning it off makes the transparent window opaque; the rounded panel is pure CSS. Auto-collapse is driven from main by polling the cursor position (`watchCursor`), not DOM mouseleave. Expanding resizes first and then notifies; collapsing notifies first and shrinks after 240 ms so the panel's exit animation can play.
- Optional Notes/Snippets sync (`electron/core/services/sync.service.ts`, setting `sync.notes_snippets`): table `setto_sync` from `supabase/migrations/003_setto_sync.sql`; three-way merge with a per-item base hash in `<userData>/sync-state.json` (`sync-plan.ts`, tested). Note conflicts keep both versions; the base of uploads is only updated after Supabase confirms.
- File editor preserves each file's encoding (UTF-8, UTF-8 BOM, UTF-16 LE/BE, Windows-1252 — `electron/plugins/file-editor/encoding.ts`) and EOL (CRLF/LF); in memory content is always `\n`. Saving to Windows-1252 fails (never replaces) on unmappable chars. Every save snapshots the previous disk bytes to `<userData>/editor-history` (50 per file, 200 MB total, autosaves coalesced within 60 s). Autosave defaults to on: prefs are migrated once to `autoSave: true` (marker `autoSaveMigrated`), so users who had it off must turn it off again once.

## Files to inspect first for common tasks

- IPC issues: `electron/preload.ts`, `electron/core/plugin-loader.ts`, `electron/core/ipc-registry.ts`
- Plugin not loading: `src/core/plugin-registry.ts`, `electron/core/plugin-loader.ts`
- Visual changes: `tailwind.config.ts`, `src/styles/globals.css`, `src/core/components/`
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
