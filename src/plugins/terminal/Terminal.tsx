import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Plus, History, Settings, X, SquareTerminal, AlertTriangle, RefreshCw, ChevronDown, GitCompare, Bot, Activity, StopCircle } from 'lucide-react'
import { useApp } from '../../core/AppContext'
import { useTerminalPrefs } from './hooks/useTerminalPrefs'
import { SessionHistoryPanel } from './SessionHistoryPanel'
import { TerminalSettingsPanel } from './TerminalSettingsPanel'
import { TERMINAL_THEMES } from './themes'
import '@xterm/xterm/css/xterm.css'

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
  { label: 'Command Prompt',  cmd: 'cmd.exe',         icon: '>' },
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
    <div
      className="mt-1 max-w-md space-y-3 rounded-lg px-3 py-3 text-left"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <p className="text-[12px] font-semibold" style={{ color: 'rgb(var(--c-on-surface))' }}>
        Cómo hacer que funcione
      </p>
      <ol className="list-decimal space-y-2 pl-4 text-[11px] leading-snug" style={{ color: 'rgba(255,255,255,0.75)' }}>
        <li>
          <strong className="text-white/90">Windows:</strong> instalá{' '}
          <strong>Python 3</strong> (en el instalador marcá <em>Add to PATH</em>) y las{' '}
          <strong>Visual Studio Build Tools</strong> con la carga{' '}
          <strong>«Desktop development with C++»</strong> (no hace falta Visual Studio completo).
        </li>
        <li>
          Abrí una terminal en la <strong>carpeta raíz del repo</strong> y ejecutá:{' '}
          <code
            className="rounded px-1.5 py-0.5 font-mono text-[10px]"
            style={{ background: 'rgba(255,255,255,0.1)' }}
          >
            npm run rebuild
          </code>
          {' '}
          (recompila <code className="font-mono text-[10px]">node-pty</code> para tu Node/Electron).
        </li>
        <li>
          Cerrá la app y volvé a ejecutar <code className="rounded px-1 font-mono text-[10px]" style={{ background: 'rgba(255,255,255,0.1)' }}>npm run dev</code> o abrí el ejecutable de nuevo.
        </li>
      </ol>
      <p className="text-[10px] leading-snug" style={{ color: 'rgba(255,255,255,0.4)' }}>
        Si no usás el Terminal integrado, podés ignorar esto: el resto de la app funciona sin <code className="font-mono">node-pty</code>.
      </p>
    </div>
  )
}

function Row({ label, value, color }: { label: string; value: string; color?: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[11px]" style={{ color: 'rgb(var(--c-on-surface-variant))' }}>{label}</span>
      <span className="text-[11px] font-medium" style={{ color: color ?? 'rgb(var(--c-on-surface))' }}>{value}</span>
    </div>
  )
}

export function Terminal(): JSX.Element {
  const { state, dispatch } = useApp()
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
      setErrorMsg(result.error ?? 'Failed to start terminal session')
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

    const themeDef = TERMINAL_THEMES[p.theme] ?? TERMINAL_THEMES['dark']
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
        xterm.writeln(`\r\n\x1b[2m[Process exited with code ${p2.exitCode ?? 0}]\x1b[0m`)
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
  useEffect(() => {
    const themeDef = TERMINAL_THEMES[prefs.theme] ?? TERMINAL_THEMES['dark']
    sessionsRef.current.forEach((s) => {
      s.xterm.options.theme       = themeDef.theme
      s.xterm.options.fontSize    = prefs.fontSize
      s.xterm.options.fontFamily  = prefs.fontFamily
      s.xterm.options.cursorStyle = prefs.cursorStyle
      s.xterm.options.cursorBlink = prefs.cursorBlink
      try { s.fitAddon.fit() } catch { /* ignore */ }
    })
    if (termAreaRef.current) termAreaRef.current.style.background = themeDef.background
  }, [prefs.theme, prefs.fontSize, prefs.fontFamily, prefs.cursorStyle, prefs.cursorBlink])

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

  const themeDef = TERMINAL_THEMES[prefs.theme] ?? TERMINAL_THEMES['dark']

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
      out[id]   = total[lbl] > 1 ? `${lbl} ${used[lbl]}` : lbl
    }
    return out
  })()

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)' }}
    >

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <div
        className="flex items-center flex-shrink-0 gap-1.5 px-2"
        style={{
          height: 44,
          minHeight: 44,
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          background: 'rgb(var(--c-surface))',
          borderRadius: '12px 12px 0 0',
        }}
      >
        {/* Session tabs — scrollable, NO picker button inside here */}
        <div
          className="flex items-center flex-1 min-w-0 gap-1 overflow-x-auto"
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
                title={isActive && !isEditing ? 'Click to rename' : undefined}
                className="group flex items-center gap-1.5 px-2.5 flex-shrink-0 rounded-lg select-none transition-all"
                style={{
                  height: 30,
                  cursor: isEditing ? 'default' : 'pointer',
                  background: isActive
                    ? 'rgb(var(--c-primary) / 0.12)'
                    : 'rgb(var(--c-surface-container))',
                  color: isExited
                    ? 'rgb(var(--c-on-surface-variant) / 0.4)'
                    : isActive
                      ? 'rgb(var(--c-primary-light))'
                      : 'rgb(var(--c-on-surface-variant))',
                  border: isActive
                    ? '1px solid rgb(var(--c-primary) / 0.3)'
                    : '1px solid rgb(var(--c-outline-variant) / 0.5)',
                  maxWidth: 180,
                  minWidth: 72,
                }}
              >
                <SquareTerminal size={11} className="flex-shrink-0 opacity-60" />

                {isEditing ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleRenameKey}
                    onBlur={commitRename}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-transparent outline-none text-[12px] font-medium min-w-0 flex-1"
                    style={{ color: 'rgb(var(--c-primary-light))', width: 80 }}
                  />
                ) : (
                  <span className="text-[12px] font-medium truncate flex-1">{label}</span>
                )}

                {isExited && !isEditing && (
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'rgb(var(--c-outline))' }} />
                )}

                {!isEditing && (
                  <button
                    onClick={(e) => { e.stopPropagation(); void closeTab(id) }}
                    className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-4 h-4 rounded flex items-center justify-center transition-all hover:bg-black/[0.1]"
                    style={{ color: 'rgb(var(--c-on-surface-variant))' }}
                  >
                    <X size={9} />
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
          title="New terminal session"
          className="flex items-center gap-0.5 px-2 h-7 rounded-lg transition-colors disabled:opacity-40 flex-shrink-0"
          style={{
            color: 'rgb(var(--c-on-surface-variant))',
            background: 'rgb(var(--c-surface-container))',
            border: '1px solid rgb(var(--c-outline-variant) / 0.5)',
          }}
        >
          {starting
            ? <RefreshCw size={11} className="animate-spin" />
            : <><Plus size={11} /><ChevronDown size={10} /></>
          }
        </button>

        {/* Right: Claude buttons + Send to Diff + History + Settings */}
        <div className="flex items-center flex-shrink-0 gap-1">

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
            title="Launch Claude Code (full permissions)"
            className="flex items-center gap-1 px-2 h-7 rounded-lg text-[11px] font-semibold transition-colors flex-shrink-0"
            style={{
              color: 'rgb(var(--c-on-primary))',
              background: 'linear-gradient(135deg, rgb(var(--c-primary)), rgb(var(--c-secondary)))',
            }}
          >
            <Bot size={12} />
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
            title="Send Ctrl+C (interrupt / exit Claude)"
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors flex-shrink-0"
            style={{
              color: 'rgb(var(--c-error))',
              background: 'rgb(var(--c-surface-container))',
              border: '1px solid rgb(var(--c-error) / 0.3)',
            }}
          >
            <StopCircle size={12} />
          </button>

          {/* ── Button 2: Claude context usage % ───────────────────────── */}
          <div className="relative flex-shrink-0">
            <button
              ref={usageBtnRef}
              onClick={() => {
                refreshUsage()
                setUsageOpen((o) => !o)
              }}
              title="Claude context window usage (click to refresh)"
              className="flex items-center gap-1 px-2 h-7 rounded-lg text-[11px] font-medium transition-colors"
              style={{
                color: claudeUsagePct === null
                  ? 'rgb(var(--c-on-surface-variant))'
                  : claudeUsagePct >= 80 ? 'rgb(var(--c-error))'
                  : claudeUsagePct >= 50 ? '#f59e0b'
                  : 'rgb(74 222 128)',
                background: 'rgb(var(--c-surface-container))',
                border: '1px solid rgb(var(--c-outline-variant) / 0.5)',
              }}
            >
              <Activity size={11} />
              {claudeUsagePct !== null ? `${claudeUsagePct}%` : '—'}
            </button>

            {/* Usage popover */}
            {usageOpen && claudeUsagePct !== null && (
              <div
                className="absolute right-0 top-full mt-1 z-[9999] rounded-xl shadow-2xl py-3 px-4 min-w-[220px]"
                style={{
                  background: 'rgb(var(--c-surface-container-high))',
                  border: '1px solid rgb(var(--c-outline-variant))',
                }}
              >
                <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'rgb(var(--c-on-surface-variant))' }}>
                  Claude Context Window
                </div>
                <div className="text-[10px] mb-2.5" style={{ color: 'rgb(var(--c-on-surface-variant) / 0.6)' }}>
                  Porcentaje de contexto usado — dato real de /usage
                </div>
                {(() => {
                  const pct = claudeUsagePct
                  const barColor = pct >= 80 ? 'rgb(var(--c-error))' : pct >= 50 ? '#f59e0b' : 'rgb(74 222 128)'
                  const remaining = 100 - pct
                  return (
                    <>
                      <div className="w-full rounded-full mb-3" style={{ height: 5, background: 'rgb(var(--c-outline-variant) / 0.4)' }}>
                        <div className="rounded-full h-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Row label="Context used"      value={`${pct}%`}       color={barColor} />
                        <Row label="Context remaining" value={`${remaining}%`} color={remaining <= 20 ? 'rgb(var(--c-error))' : undefined} />
                      </div>
                    </>
                  )
                })()}
              </div>
            )}
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
              title="Send output to Smart Diff"
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'rgb(var(--c-on-surface-variant))', background: 'transparent', border: '1px solid transparent' }}
            >
              <GitCompare size={14} />
            </button>
          )}
          {(['history', 'settings'] as const).map((panel) => (
            <button
              key={panel}
              onClick={() => setSidePanel((p) => p === panel ? null : panel)}
              title={panel === 'history' ? 'Session history' : 'Terminal settings'}
              className="p-1.5 rounded-lg transition-colors"
              style={{
                color: sidePanel === panel ? 'rgb(var(--c-primary-light))' : 'rgb(var(--c-on-surface-variant))',
                background: sidePanel === panel ? 'rgb(var(--c-primary) / 0.1)' : 'transparent',
                border: `1px solid ${sidePanel === panel ? 'rgb(var(--c-primary) / 0.3)' : 'transparent'}`,
              }}
            >
              {panel === 'history' ? <History size={14} /> : <Settings size={14} />}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden flex" style={{ borderRadius: '0 0 12px 12px' }}>

        {/* Terminal area */}
        <div
          ref={termAreaRef}
          className="flex-1 relative overflow-hidden"
          style={{ background: themeDef.background, borderRadius: sidePanel ? 0 : '0 0 12px 12px' }}
          onClick={() => {
            if (activeId) sessionsRef.current.get(activeId)?.xterm.focus()
          }}
        >
          {sessionIds.length === 0 && !starting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto px-4 py-6">
              {errorMsg ? (
                <>
                  <AlertTriangle size={28} style={{ color: '#f87171' }} />
                  <div className="flex w-full max-w-lg flex-col items-center gap-2">
                    <div className="text-[13px] text-center font-medium" style={{ color: '#f87171' }}>
                      {isNodePtySetupError(errorMsg)
                        ? 'No se pudo iniciar la consola (falta el módulo nativo)'
                        : 'No se pudo iniciar la sesión'}
                    </div>
                    <div className="text-[11px] text-center leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                      {errorMsg}
                    </div>
                    {isNodePtySetupError(errorMsg) && <TerminalPtySetupSteps />}
                    {!isNodePtySetupError(errorMsg) && (
                      <p className="text-[10px] text-center" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        Revisá la ruta del shell y el directorio de trabajo en el panel de ajustes del Terminal (ícono engranaje).
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => { void createSession() }}
                    className="mt-2 px-4 py-1.5 rounded-lg text-[12px] font-medium"
                    style={{ background: 'rgb(var(--c-primary))', color: '#fff' }}
                  >
                    Reintentar
                  </button>
                </>
              ) : (
                <>
                  <SquareTerminal size={28} style={{ color: 'rgba(255,255,255,0.15)' }} />
                  <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.3)' }}>No active session</span>
                  <button
                    onClick={() => setShellPickerOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium"
                    style={{ background: 'rgb(var(--c-primary))', color: '#fff' }}
                  >
                    <Plus size={12} /> New Session
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Side panel */}
        {sidePanel && (
          <div
            className="flex-shrink-0 overflow-hidden flex flex-col"
            style={{
              width: 340,
              borderLeft: '1px solid rgba(255,255,255,0.07)',
              background: 'rgb(var(--c-surface))',
              borderRadius: '0 0 12px 0',
            }}
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
      {shellPickerOpen && pickerPos && (
        <div
          className="rounded-xl shadow-2xl z-[9999]"
          style={{
            position: 'fixed',
            top: pickerPos.top,
            left: pickerPos.left,
            background: 'rgb(var(--c-surface-container-high))',
            border: '1px solid rgb(var(--c-outline-variant))',
            minWidth: 220,
          }}
        >
          <div
            className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: 'rgb(var(--c-on-surface-variant))' }}
          >
            New Session
          </div>
          {SHELL_OPTIONS.map((opt) => (
            <button
              key={opt.cmd}
              onMouseDown={(e) => {
                e.preventDefault()   // prevent outside-click handler from firing first
                setShellPickerOpen(false)
                void createSession(opt.cmd)
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-[13px] text-left transition-colors hover:bg-black/[0.06]"
              style={{ color: 'rgb(var(--c-on-surface))' }}
            >
              <span className="text-[11px] w-4 text-center font-mono" style={{ color: 'rgb(var(--c-on-surface-variant))' }}>
                {opt.icon}
              </span>
              {opt.label}
            </button>
          ))}
          <div className="h-1.5" />
        </div>
      )}
    </div>
  )
}
