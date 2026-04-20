# Setto Toolkit

## Project overview

- Maintain a modular desktop developer toolkit built with Electron 31, React 18, and TypeScript 5.5.
- Preserve the existing visual direction: dark UI, Material Design 3 color tokens, and a consistent plugin-based shell.
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

- Preserve the existing dark-first visual language. Do not introduce light-theme assumptions unless explicitly requested.
- Use design tokens from `tailwind.config.ts` and `src/styles/globals.css` instead of hardcoding color or spacing values.
- The shell uses a tab model — plugins open in tabs, not in a single-page replacement. Preserve this mental model.
- Prefer intentional, keyboard-accessible UI. CommandPalette (Ctrl+K) is a first-class navigation surface.
- Copy in the UI is in Spanish unless the task explicitly requires another language.
- Favor patterns that will scale: configurable module visibility, branding params, and feature toggles instead of hardcoded per-tool behavior.

## Known implementation details

- `electron/preload.ts` explicitly allowlists 46 INVOKE channels and 51 SEND/ON channels. Any new IPC channel must be added here or it will be blocked.
- OAuth credentials are embedded into the binary at build time via `electron-vite define`. They are not accessible at runtime from the renderer.
- The Terminal plugin requires native compilation of `node-pty`. On Windows, this needs Python 3 and Visual Studio Build Tools (Desktop C++). Run `npm run rebuild` after `npm install`.
- The `gastos` plugin is a work in progress — it connects to the Notion API and has a local config file (`gastos-notion.local.example.json`).
- `smart-diff` no longer runs AI analysis in the plugin itself — that capability moved to Ticket Resolver (API-only, no CLI dependency).
- Terminal plugin restores multi-session state across app restarts.

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
