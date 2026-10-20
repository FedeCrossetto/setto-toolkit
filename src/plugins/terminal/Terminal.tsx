import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Terminal as XTerminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Plus, History, Settings, X, SquareTerminal, AlertTriangle, RefreshCw, ChevronDown, GitCompare, Bot, Activity, StopCircle } from 'lucide-react'
import { useApp } from '../../core/AppContext'
import { useTerminalPrefs } from './hooks/useTerminalPrefs'
import { SessionHistoryPanel } from './SessionHistoryPanel'
import { TerminalSettingsPanel } from './TerminalSettingsPanel'
import { resolveTerminalTheme } from './themes'
import { presetCodeThemes, useAppearance } from '../../core/hooks/useThemePalette'
import '@xterm/xterm/css/xterm.css'
import { useModulePrimaryAction } from '../../core/module-actions'

type SidePanel = 'history' | 'settings' | null

interface SessionEntry {
  sessionId: string
  shellLabel: string
  shellCmd: string
  container: HTMLDivElement
  xterm: XTerminal
  fitAddon: FitAddon
  cleanup: () => void
  exited: boolean
}

const SHELL_OPTIONS = [
  { label: 'PowerShell',      cmd: 'powershell.exe', icon: '⚡' },
  { label: 'Símbolo del sistema', cmd: 'cmd.exe',     icon: '>' },
  { label: 'PowerShell Core', cmd: 'pwsh.exe',        icon: '⚡' },
  { label: 'Git Bash',        cmd: 'C:\\Program Files\\Git\\bin\\bash.exe', icon: '$' },
]

function isNodePtySetupError(msg: string | null): boolean {
  if (!msg) return false
  const m = msg.toLowerCase()
  return m.includes('node-pty') || m.includes('npm run rebuild') || m.includes('native')
}

/** Pasos para compilar node-pty (Windows + rebuild). */
function TerminalPtySetupSteps(): JSX.Element {
  return (
    <div className="ui-card shadow-none mt-1 max-w-md space-y-3 px-3 py-3 text-left">
      <p className="t-footnote font-semibold text-on-surface">
        Cómo hacer que funcione
      </p>
      <ol className="list-decimal space-y-2 pl-4 t-footnote text-on-surface-variant">
        <li>
          <strong className="text-on-surface">Windows:</strong> instalá{' '}
          <strong>Python 3</strong> (en el instalador marcá <em>Add to PATH</em>) y las{' '}
          <strong>Visual Studio Build Tools</strong> con la carga{' '}
          <strong>«Desktop development with C++»</strong> (no hace falta Visual Studio completo).
        </li>
        <li>
          Abrí una terminal en la <strong>carpeta raíz del repo</strong> y ejecutá:{' '}
          <code className="rounded px-1.5 py-px font-mono t-caption bg-on-surface/6 text-on-surface">
            npm run rebuild
          </code>
          {' '}
          (recompila <code className="font-mono t-caption">node-pty</code> para tu Node/Electron).
        </li>
        <li>
          Cerrá la app y volvé a ejecutar <code className="rounded px-1 font-mono t-caption bg-on-surface/6 text-on-surface">npm run dev</code> o abrí el ejecutable de nuevo.
        </li>
      </ol>
      <p className="t-caption text-on-surface-variant/70">
        Si no usás el Terminal integrado, podés ignorar esto: el resto de la app funciona sin <code className="font-mono">node-pty</code>.
      </p>
    </div>
  )
}

function Row({ label, value, className }: { label: string; value: string; className?: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 t-footnote">
      <span className="text-on-surface-variant">{label}</span>
      <span className={`font-medium tabular-nums ${className ?? 'text-on-surface'}`}>{value}</span>
    </div>
  )
}

/** Token class for the Claude context-usage level. */
function usageTone(pct: number): { text: string; bg: string } {
  if (pct >= 80) return { text: 'text-error!', bg: 'bg-error' }
  if (pct >= 50) return { text: 'text-warning!', bg: 'bg-warning' }
  return { text: 'text-success!', bg: 'bg-success' }
}

export function Terminal(): JSX.Element {
  const { state, dispatch } = useApp()
  // Tema completo de la app (Nord, Catppuccin…): con "Sistema" la terminal usa su pareja.
  const appearance = useAppearance()
  const presetTerminal = presetCodeThemes(appearance, state.theme === 'dark')?.terminal ?? null
  const presetTerminalRef = useRef(presetTerminal)
  presetTerminalRef.current = presetTerminal
  const { prefs, savePrefs, loading: prefsLoading } = useTerminalPrefs()
  const [sidePanel, setSidePanel]       = useState<SidePanel>(null)
  const [sessionIds, setSessionIds]     = useState<string[]>([])
  const [activeId, setActiveId]         = useState<string | null>(null)
  const [starting, setStarting]         = useState(false)
  const [errorMsg, setErrorMsg]         = useState<string | null>(null)
  const [exitedIds, setExitedIds]       = useState<Set<string>>(new Set())
  const [customNames, setCustomNames]   = useState<Record<string, string>>({})
  const [editingId, setEditingId]       = useState<string | null>(null)
  const [editValue, setEditValue]       = useState('')
  const [shellPickerOpen, setShellPickerOpen] = useState(false)
  const [pickerPos, setPickerPos]             = useState<{ top: number; left: number } | null>(null)
  const [claudeUsagePct, setClaudeUsagePct]   = useState<number | null>(null)
  const [usageOpen, setUsageOpen]             = useState(false)
  const usageBtnRef                           = useRef<HTMLButtonElement>(null)
  const claudeRunningRef                      = useRef(false)

  const sessionsRef        = useRef<Map<string, SessionEntry>>(new Map())
  const termAreaRef        = useRef<HTMLDivElement>(null)
  const pickerBtnRef       = useRef<HTMLButtonElement>(null)
  const prefsRef           = useRef(prefs)
  const createSessionRef   = useRef<(shell?: string, cwd?: string) => Promise<void>>(async () => {})
  const pendingCommandRef  = useRef<string | null>(null)
  prefsRef.current         = prefs

  useEffect(() => {
    if (!usageOpen) return
    const close = (e: MouseEvent) => {
      if (!usageBtnRef.current?.contains(e.target as Node)) setUsageOpen(false)
    }
    const id = setTimeout(() => document.addEventListener('mousedown', close), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', close) }
  }, [usageOpen])

  // ── Close shell picker on outside click ────────────────────────────────────
  useEffect(() => {
    if (!shellPickerOpen) return
    const close = () => setShellPickerOpen(false)
    // Small delay so the button's own click doesn't immediately close it
    const id = setTimeout(() => document.addEventListener('mousedown', close), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', close) }
  }, [shellPickerOpen])

  // ── Rename helpers ─────────────────────────────────────────────────────────
  const startRename = useCallback((id: string, currentLabel: string) => {
    setEditingId(id)
    setEditValue((prev) => (customNames[id] ?? prev) || currentLabel)
  }, [customNames])

  const commitRename = useCallback(() => {
    setEditingId((id) => {
      if (id) {
        const trimmed = editValue.trim()
        setCustomNames((prev) => ({ ...prev, [id]: trimmed }))
      }
      return null
    })
  }, [editValue])

  const handleRenameKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter')  { e.preventDefault(); commitRename() }
    if (e.key === 'Escape') { setEditingId(null) }
  }

  // ── Switch active tab ──────────────────────────────────────────────────────
  const switchTab = useCallback((id: string) => {
    sessionsRef.current.forEach((s, sid) => {
      s.container.style.visibility  = sid === id ? 'visible' : 'hidden'
      s.container.style.pointerEvents = sid === id ? 'auto' : 'none'
    })
    setActiveId(id)
    setSidePanel(null)
    setTimeout(() => {
      const s = sessionsRef.current.get(id)
      if (s) { try { s.fitAddon.fit() } catch { /* ignore */ } s.xterm.focus() }
    }, 30)
  }, [])

  // ── Tab click: switch if inactive, rename if already active ───────────────
  const handleTabClick = useCallback((id: string, baseLabel: string) => {
    if (editingId) return
    setActiveId((cur) => {
      if (cur === id) {
        // Already active → start rename
        startRename(id, baseLabel)
        return cur
      }
      switchTab(id)
      return id
    })
  }, [editingId, startRename, switchTab])

  // ── Close a tab ────────────────────────────────────────────────────────────
  const closeTab = useCallback(async (id: string) => {
    const s = sessionsRef.current.get(id)
    if (!s) return
    await window.api.invoke('terminal:kill', id).catch(() => {})
    s.cleanup(); s.xterm.dispose(); s.container.remove()
    sessionsRef.current.delete(id)
    setSessionIds((prev) => {
      const next = prev.filter((x) => x !== id)
      setActiveId((cur) => {
        if (cur === id) {
          const newActive = next[next.length - 1] ?? null
          if (newActive) setTimeout(() => switchTab(newActive), 0)
          return newActive
        }
        return cur
      })
      return next
    })
    setExitedIds((prev) => { const s2 = new Set(prev); s2.delete(id); return s2 })
    setCustomNames((prev) => { const n = { ...prev }; delete n[id]; return n })
  }, [switchTab])

  // ── Refresh Claude usage from ~/.claude session files (no terminal command) ─
  const refreshUsage = useCallback(() => {
    void window.api.invoke<number | null>('terminal:claude-usage').then((pct) => {
      if (pct !== null) setClaudeUsagePct(pct)
    }).catch(() => {})
  }, [])

  // ── Create a new session ───────────────────────────────────────────────────
  const createSession = useCallback(async (shell?: string, cwd?: string) => {
    if (!termAreaRef.current) return
    setErrorMsg(null)
    setStarting(true)
    setSidePanel(null)

    const p = prefsRef.current
    const rect  = termAreaRef.current.getBoundingClientRect()
    const charW = p.fontSize * 0.6
    const charH = p.fontSize * 1.2
    const cols  = Math.max(10, Math.floor(rect.width  / charW))
    const rows  = Math.max(4,  Math.floor(rect.height / charH))

    const result = await window.api.invoke<{
      ok: boolean; sessionId?: string; shell?: string; cwd?: string; error?: string
    }>('terminal:create', { cols, rows, shell, cwd })

    if (!result.ok || !result.sessionId) {
      setErrorMsg(result.error ?? 'No se pudo iniciar la sesión de terminal')
      setStarting(false)
      return
    }

    const { sessionId, shell: actualShell } = result
    const shellCmd   = actualShell ?? ''
    const shellLabel = (actualShell ?? 'shell').split(/[/\\]/).pop()?.replace(/\.exe$/i, '') ?? 'shell'

    // Imperative container div for this xterm instance
    const container = document.createElement('div')
    container.style.cssText = 'position:absolute;inset:0;padding:8px;visibility:hidden;pointer-events:none;'
    termAreaRef.current.appendChild(container)

    const themeDef = resolveTerminalTheme(p.theme, presetTerminalRef.current)
    const xterm = new XTerminal({
      theme: themeDef.theme, fontSize: p.fontSize, fontFamily: p.fontFamily,
      cursorStyle: p.cursorStyle, cursorBlink: p.cursorBlink, scrollback: p.scrollback,
      allowTransparency: false, convertEol: false,
    })
    const fitAddon = new FitAddon()
    xterm.loadAddon(fitAddon)
    xterm.loadAddon(new WebLinksAddon())
    xterm.open(container)
    fitAddon.fit()

    // ── Clipboard shortcuts ──────────────────────────────────────────────────
    xterm.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true

      // Ctrl+C con selección → copiar (sin mandar SIGINT)
      if (event.ctrlKey && event.key === 'c' && xterm.hasSelection()) {
        navigator.clipboard.writeText(xterm.getSelection()).catch(() => {})
        return false
      }

      // Ctrl+T → nueva sesión
      if (event.ctrlKey && event.key === 't') {
        void createSessionRef.current()
        return false
      }

      return true
    })

    const inputDispose  = xterm.onData((data) => window.api.send('terminal:input', { sessionId, data }))
    const resizeDispose = xterm.onResize(({ cols, rows }) => window.api.send('terminal:resize', { sessionId, cols, rows }))

    const offData = window.api.on('terminal:data', (payload: unknown) => {
      const p2 = payload as { sessionId: string; chunk: string }
      if (p2.sessionId === sessionId) xterm.write(p2.chunk)
    })
    const offExit = window.api.on('terminal:exit', (payload: unknown) => {
      const p2 = payload as { sessionId: string; exitCode: number | null }
      if (p2.sessionId === sessionId) {
        xterm.writeln(`\r\n\x1b[2m[El proceso terminó con código ${p2.exitCode ?? 0}]\x1b[0m`)
        const entry = sessionsRef.current.get(sessionId)
        if (entry) entry.exited = true
        setExitedIds((prev) => new Set([...prev, sessionId]))
      }
    })

    const ro = new ResizeObserver(() => { try { fitAddon.fit() } catch { /* ignore */ } })
    ro.observe(container)

    sessionsRef.current.set(sessionId, {
      sessionId, shellLabel, shellCmd, container, xterm, fitAddon, exited: false,
      cleanup: () => { offData(); offExit(); inputDispose.dispose(); resizeDispose.dispose(); ro.disconnect() },
    })

    setSessionIds((prev) => [...prev, sessionId])
    setStarting(false)
    setTimeout(() => {
      switchTab(sessionId)
      // If a command was queued (from RUN_IN_TERMINAL), send it once the shell is ready
      if (pendingCommandRef.current) {
        const data = pendingCommandRef.current
        pendingCommandRef.current = null
        setTimeout(() => {
          window.api.send('terminal:input', { sessionId, data: data + '\r' })
        }, 600)
      }
    }, 0)
  }, [switchTab])

  // Keep ref in sync so xterm key handlers can call createSession without stale closures
  createSessionRef.current = createSession

  // ── Restore sessions on mount (or open a single default if none saved) ────
  useEffect(() => {
    if (prefsLoading) return
    void (async () => {
      const startup = await window.api.invoke<{ shell: string; name?: string }[]>('terminal:startup-get')
      if (startup.length > 0) {
        for (const s of startup) {
          await createSession(s.shell || undefined)
          // Restore custom name after the session is created
          if (s.name) {
            setSessionIds((cur) => {
              // The last added session id is cur[cur.length - 1]
              const newId = cur[cur.length - 1]
              if (newId) setCustomNames((prev) => ({ ...prev, [newId]: s.name! }))
              return cur
            })
          }
        }
      } else {
        await createSession()
      }
    })()
    return () => {
      sessionsRef.current.forEach((s, id) => {
        window.api.invoke('terminal:kill', id).catch(() => {})
        s.cleanup(); s.xterm.dispose()
      })
      sessionsRef.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsLoading])

  // ── Persist open sessions so they can be restored on next launch ───────────
  useEffect(() => {
    if (sessionIds.length === 0) {
      void window.api.invoke('terminal:startup-set', [])
      return
    }
    const payload = sessionIds.map((id) => {
      const entry = sessionsRef.current.get(id)
      return {
        shell: entry?.shellCmd ?? '',
        name: customNames[id] ?? undefined,
      }
    })
    void window.api.invoke('terminal:startup-set', payload)
  }, [sessionIds, customNames])

  // ── Consume OPEN_TERMINAL_HERE (from File Editor context menu) ────────────
  useEffect(() => {
    if (!state.terminalTarget) return
    const { cwd } = state.terminalTarget
    dispatch({ type: 'CLEAR_TERMINAL_TARGET' })
    void createSession(undefined, cwd)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.terminalTarget])

  // ── Consume RUN_IN_TERMINAL (from Snippet Manager) ────────────────────────
  useEffect(() => {
    if (!state.terminalCommand) return
    const { content } = state.terminalCommand
    dispatch({ type: 'CLEAR_TERMINAL_TARGET' })
    // If there's a live active session, write directly; otherwise create one then send
    const active = activeId ? sessionsRef.current.get(activeId) : null
    if (active && !active.exited) {
      window.api.send('terminal:input', { sessionId: activeId, data: content + '\r' })
    } else {
      pendingCommandRef.current = content
      void createSession()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.terminalCommand])

  // ── Consume INTERRUPT_TERMINAL (Ctrl+C / stop Claude session) ────────────
  useEffect(() => {
    if (!state.terminalInterrupt) return
    const entry = activeId ? sessionsRef.current.get(activeId) : null
    if (entry && !entry.exited) {
      window.api.send('terminal:input', { sessionId: activeId, data: '\x03' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.terminalInterrupt])

  // ── Ctrl+T shortcut (when xterm is NOT focused) ────────────────────────────
  // When xterm IS focused, attachCustomKeyEventHandler handles Ctrl+T and the
  // DOM event still bubbles to document. Guard against that by checking if the
  // active element is inside an xterm container.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 't') {
        if ((document.activeElement as Element | null)?.closest('.xterm')) return
        e.preventDefault()
        void createSessionRef.current()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // ── Apply prefs to all live instances ─────────────────────────────────────
  // Also re-applied when the app switches light/dark, so "Sistema" and the surface-tinted
  // backgrounds follow along. rAF: let the palette tokens land on :root first.
  const [resolvedTheme, setResolvedTheme] = useState(() => resolveTerminalTheme(prefs.theme, presetTerminal))
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const themeDef = resolveTerminalTheme(prefs.theme, presetTerminal)
      setResolvedTheme(themeDef)
      sessionsRef.current.forEach((s) => {
        s.xterm.options.theme       = themeDef.theme
        s.xterm.options.fontSize    = prefs.fontSize
        s.xterm.options.fontFamily  = prefs.fontFamily
        s.xterm.options.cursorStyle = prefs.cursorStyle
        s.xterm.options.cursorBlink = prefs.cursorBlink
        try { s.fitAddon.fit() } catch { /* ignore */ }
      })
      if (termAreaRef.current) termAreaRef.current.style.background = themeDef.background
    })
    return () => cancelAnimationFrame(raf)
  }, [prefs.theme, prefs.fontSize, prefs.fontFamily, prefs.cursorStyle, prefs.cursorBlink, state.theme, presetTerminal, appearance])

  // ── Auto-refresh usage every 30s while Claude is running ──────────────────
  useEffect(() => {
    const id = setInterval(() => {
      if (claudeRunningRef.current) refreshUsage()
    }, 30_000)
    return () => clearInterval(id)
  }, [refreshUsage])

  // ── Re-fit when side panel closes ─────────────────────────────────────────
  useEffect(() => {
    if (!sidePanel && activeId) {
      setTimeout(() => {
        const s = sessionsRef.current.get(activeId)
        if (s) { try { s.fitAddon.fit() } catch { /* ignore */ } s.xterm.focus() }
      }, 50)
    }
  }, [sidePanel, activeId])

  const themeDef = resolvedTheme

  // ── Deduplicate tab labels ─────────────────────────────────────────────────
  const tabLabels: Record<string, string> = (() => {
    const total: Record<string, number> = {}
    const used:  Record<string, number> = {}
    for (const id of sessionIds) {
      const lbl = sessionsRef.current.get(id)?.shellLabel ?? 'shell'
      total[lbl] = (total[lbl] ?? 0) + 1
    }
    const out: Record<string, string> = {}
    for (const id of sessionIds) {
      const lbl = sessionsRef.current.get(id)?.shellLabel ?? 'shell'
      used[lbl] = (used[lbl] ?? 0) + 1
      out[id]   = (total[lbl] ?? 0) > 1 ? `${lbl} ${used[lbl]}` : lbl
    }
    return out
  })()


  // Barra superior: "Nueva sesión".
  useModulePrimaryAction('terminal', { label: 'Nueva sesión', title: 'Nueva sesión (Ctrl+T)' }, () => { void createSession() })

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface">

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <div className="flex items-stretch shrink-0 h-[42px] hairline-b fl-pane">
        {/* Session tabs — scrollable, NO picker button inside here */}
        <div
          className="flex items-center gap-1 pl-2 flex-1 min-w-0 overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          {sessionIds.map((id) => {
            const isActive  = id === activeId && !sidePanel
            const isExited  = exitedIds.has(id)
            const baseLabel = tabLabels[id] ?? 'shell'
            const label     = customNames[id] || baseLabel
            const isEditing = editingId === id

            return (
              <div
                key={id}
                onClick={() => handleTabClick(id, baseLabel)}
                title={isActive && !isEditing ? 'Clic para renombrar' : undefined}
                className={`group flex items-center gap-1.5 h-[30px] pl-2.5 pr-1.5 shrink-0 select-none rounded-[9px] border t-footnote transition-colors ${
                  isActive ? 'nav-active font-medium' : 'border-transparent hover:bg-on-surface/4'
                } ${
                  isExited ? 'text-on-surface-variant/50' : isActive ? 'text-on-surface' : 'text-on-surface-variant'
                }`}
                style={{
                  cursor: isEditing ? 'default' : 'pointer',
                  maxWidth: 200,
                  minWidth: 96,
                }}
              >
                <SquareTerminal size={12} className="shrink-0 opacity-60" />

                {isEditing ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleRenameKey}
                    onBlur={commitRename}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Nombre de la sesión"
                    className="bg-surface text-on-surface outline-hidden t-footnote min-w-0 flex-1 rounded px-1 shadow-[0_0_0_2px_rgb(var(--c-primary)/0.5)]"
                    style={{ width: 90 }}
                  />
                ) : (
                  <span className="truncate flex-1">{label}</span>
                )}

                {isExited && !isEditing && (
                  <span title="El proceso terminó" className="w-1.5 h-1.5 rounded-full shrink-0 bg-on-surface-variant/50" />
                )}

                {!isEditing && (
                  <button
                    onClick={(e) => { e.stopPropagation(); void closeTab(id) }}
                    title="Cerrar sesión"
                    aria-label="Cerrar sesión"
                    className="opacity-0 group-hover:opacity-100 shrink-0 w-4 h-4 rounded flex items-center justify-center transition-opacity text-on-surface-variant hover:text-on-surface hover:bg-on-surface/8"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            )
          })}

        </div>{/* end scrollable tabs */}

        {/* New session button — OUTSIDE overflow container */}
        <button
          ref={pickerBtnRef}
          onClick={() => {
            if (shellPickerOpen) { setShellPickerOpen(false); return }
            const rect = pickerBtnRef.current?.getBoundingClientRect()
            if (rect) {
              const dropW = 220
              setPickerPos({
                top:  rect.bottom + 4,
                left: Math.max(8, rect.right - dropW),
              })
            }
            setShellPickerOpen(true)
          }}
          disabled={starting}
          title="Nueva sesión (Ctrl+T)"
          aria-label="Nueva sesión"
          className="ui-btn ui-btn-ghost ui-btn-sm self-center mx-1 px-1.5! gap-0.5! shrink-0"
        >
          {starting
            ? <RefreshCw size={13} className="animate-spin" />
            : <><Plus size={14} /><ChevronDown size={11} /></>
          }
        </button>

        {/* Right: Claude buttons + Send to Diff + History + Settings */}
        <div className="flex items-center shrink-0 gap-0.5 pr-2 pl-1 hairline-l">

          {/* ── Button 1: Launch Claude with full permissions ───────────── */}
          <button
            onClick={() => {
              const entry = activeId ? sessionsRef.current.get(activeId) : null
              claudeRunningRef.current = true
              if (!entry || entry.exited) {
                pendingCommandRef.current = 'claude --dangerously-skip-permissions'
                void createSession()
              } else {
                window.api.send('terminal:input', {
                  sessionId: activeId,
                  data: 'claude --dangerously-skip-permissions\r',
                })
              }
              // Fetch usage after Claude has had time to start
              setTimeout(() => refreshUsage(), 5000)
            }}
            title="Abrir Claude Code (con todos los permisos)"
            className="ui-btn ui-btn-ghost ui-btn-sm gap-1! shrink-0"
          >
            <Bot size={14} />
            Claude
          </button>

          {/* ── Button 1b: Stop / Ctrl+C ───────────────────────────────── */}
          <button
            onClick={() => {
              claudeRunningRef.current = false
              const entry = activeId ? sessionsRef.current.get(activeId) : null
              if (entry && !entry.exited) {
                window.api.send('terminal:input', { sessionId: activeId, data: '\x03' })
              }
            }}
            title="Enviar Ctrl+C (interrumpir o salir de Claude)"
            aria-label="Enviar Ctrl+C"
            className="ui-btn ui-btn-ghost ui-btn-icon shrink-0"
          >
            <StopCircle size={14} />
          </button>

          {/* ── Button 2: Claude context usage % ───────────────────────── */}
          <div className="relative shrink-0">
            <button
              ref={usageBtnRef}
              onClick={() => {
                refreshUsage()
                setUsageOpen((o) => !o)
              }}
              title="Uso de la ventana de contexto de Claude (clic para actualizar)"
              className={`ui-btn ui-btn-ghost ui-btn-sm gap-1! tabular-nums ${claudeUsagePct === null ? '' : usageTone(claudeUsagePct).text}`}
            >
              <Activity size={13} />
              {claudeUsagePct !== null ? `${claudeUsagePct}%` : '—'}
            </button>

            {/* Usage popover */}
            <AnimatePresence>
              {usageOpen && claudeUsagePct !== null && (
                <motion.div
                  className="fl-dialog absolute right-0 top-full mt-1 z-9999 py-3 px-4 min-w-[240px]"
                  initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.12, ease: 'easeOut' }}
                >
                  <div className="t-footnote font-semibold text-on-surface mb-0.5">
                    Ventana de contexto de Claude
                  </div>
                  <div className="t-caption mb-2.5 text-on-surface-variant">
                    Porcentaje de contexto usado (dato real de /usage)
                  </div>
                  {(() => {
                    const pct = claudeUsagePct
                    const tone = usageTone(pct)
                    const remaining = 100 - pct
                    return (
                      <>
                        <div className="w-full rounded-full mb-3 bg-on-surface/8" style={{ height: 4 }}>
                          <div className={`rounded-full h-full transition-all ${tone.bg}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Row label="Contexto usado"      value={`${pct}%`}       className={tone.text} />
                          <Row label="Contexto disponible" value={`${remaining}%`} className={remaining <= 20 ? 'text-error' : undefined} />
                        </div>
                      </>
                    )
                  })()}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {/* Send terminal buffer to Smart Diff */}
          {activeId && !sidePanel && (
            <button
              onClick={() => {
                const entry = activeId ? sessionsRef.current.get(activeId) : null
                if (!entry) return
                const buf = entry.xterm.buffer.active
                const lines: string[] = []
                for (let i = 0; i < buf.length; i++) {
                  const line = buf.getLine(i)
                  if (line) lines.push(line.translateToString(true))
                }
                const content = lines.join('\n').trimEnd()
                if (!content) return
                const label = (customNames[activeId] || entry.shellLabel) + '-output'
                dispatch({ type: 'SEND_TO_DIFF', name: label, path: null, content })
              }}
              title="Enviar la salida a Smart Diff"
              aria-label="Enviar la salida a Smart Diff"
              className="ui-btn ui-btn-ghost ui-btn-icon"
            >
              <GitCompare size={14} />
            </button>
          )}
          {(['history', 'settings'] as const).map((panel) => (
            <button
              key={panel}
              onClick={() => setSidePanel((p) => p === panel ? null : panel)}
              title={panel === 'history' ? 'Historial de sesiones' : 'Ajustes de la terminal'}
              aria-label={panel === 'history' ? 'Historial de sesiones' : 'Ajustes de la terminal'}
              aria-pressed={sidePanel === panel}
              className={`ui-btn ui-btn-ghost ui-btn-icon ${sidePanel === panel ? 'bg-on-surface/8! text-on-surface!' : ''}`}
            >
              {panel === 'history' ? <History size={14} /> : <Settings size={14} />}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden flex">

        {/* Terminal area */}
        <div
          ref={termAreaRef}
          className="flex-1 relative overflow-hidden"
          style={{ background: themeDef.background }}
          onClick={() => {
            if (activeId) sessionsRef.current.get(activeId)?.xterm.focus()
          }}
        >
          {sessionIds.length === 0 && !starting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto px-4 py-6 bg-surface">
              {errorMsg ? (
                <>
                  <AlertTriangle size={28} className="text-error" strokeWidth={1.6} />
                  <div className="flex w-full max-w-lg flex-col items-center gap-2">
                    <div className="t-headline text-center text-on-surface">
                      {isNodePtySetupError(errorMsg)
                        ? 'No se pudo iniciar la consola (falta el módulo nativo)'
                        : 'No se pudo iniciar la sesión'}
                    </div>
                    <div className="t-footnote text-center text-on-surface-variant font-mono">
                      {errorMsg}
                    </div>
                    {isNodePtySetupError(errorMsg) && <TerminalPtySetupSteps />}
                    {!isNodePtySetupError(errorMsg) && (
                      <p className="t-caption text-center text-on-surface-variant/70">
                        Revisá la ruta del shell y el directorio de trabajo en el panel de ajustes del Terminal (ícono engranaje).
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => { void createSession() }}
                    className="ui-btn ui-btn-primary mt-2"
                  >
                    Reintentar
                  </button>
                </>
              ) : (
                <>
                  <span className="icon-tile w-12 h-12 rounded-xl"><SquareTerminal size={22} /></span>
                  <span className="t-body text-on-surface-variant">No hay ninguna sesión abierta</span>
                  <button
                    onClick={() => {
                      const rect = pickerBtnRef.current?.getBoundingClientRect()
                      if (rect) setPickerPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - 220) })
                      setShellPickerOpen(true)
                    }}
                    className="ui-btn ui-btn-outline"
                  >
                    <Plus size={14} /> Nueva sesión
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Side panel */}
        {sidePanel && (
          <div
            className="shrink-0 overflow-hidden flex flex-col hairline-l fl-pane"
            style={{ width: 340 }}
          >
            {sidePanel === 'history' && (
              <SessionHistoryPanel onNewSession={() => { setSidePanel(null); void createSession() }} />
            )}
            {sidePanel === 'settings' && (
              <TerminalSettingsPanel prefs={prefs} onChange={(patch) => { void savePrefs(patch) }} />
            )}
          </div>
        )}
      </div>

      {/* Shell picker — fixed position, escapes all overflow:hidden ancestors */}
      <AnimatePresence>
        {shellPickerOpen && pickerPos && (
          <motion.div
            className="ui-menu z-9999"
            style={{ position: 'fixed', top: pickerPos.top, left: pickerPos.left, minWidth: 220 }}
            initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.1, ease: 'easeOut' }}
          >
            <div className="t-section px-2 pt-1 pb-1">
              Nueva sesión
            </div>
            {SHELL_OPTIONS.map((opt) => (
              <button
                key={opt.cmd}
                onMouseDown={(e) => {
                  e.preventDefault()   // prevent outside-click handler from firing first
                  setShellPickerOpen(false)
                  void createSession(opt.cmd)
                }}
                className="ui-menu-item w-full text-left group/item"
              >
                <span className="t-caption w-4 text-center font-mono opacity-60">
                  {opt.icon}
                </span>
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
