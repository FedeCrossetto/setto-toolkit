import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../AppContext'
import { Modal } from './Modal'
import { SegmentedControl } from './SegmentedControl'
import { useToast } from './Toast'
import type { NoteMeta } from '../../plugins/notes/types'
import { useQuickGasto } from '../../plugins/gastos/useQuickGasto'

/**
 * Quick capture popover (Ctrl+Shift+Space from anywhere, tray menu, or the
 * command palette via `window.dispatchEvent(new CustomEvent('setto:quick-capture'))`).
 * Self-contained: mount once inside the app providers.
 *
 * Event detail / IPC payload: `{ action?: 'capture' | 'new-note', mode?: 'nota' | 'gasto' | 'snippet' }`.
 */
type Mode = 'nota' | 'gasto' | 'snippet'

const MODES: { value: Mode; label: string; pluginId: string }[] = [
  { value: 'gasto', label: 'Gasto', pluginId: 'gastos' },
  { value: 'snippet', label: 'Snippet', pluginId: 'snippets' },
  { value: 'nota', label: 'Nota', pluginId: 'notes' },
]

const PLACEHOLDER: Record<Mode, string> = {
  nota: 'Escribí una idea… se guarda como nota nueva',
  gasto: 'Ej.: 4500 súper efectivo — se guarda directo (sin monto, se abre Gastos)',
  snippet: 'Pegá el código o comando a guardar',
}

const MODE_KEY = 'quick-capture:mode'

interface CaptureRequest { action?: 'capture' | 'new-note'; mode?: Mode }

function readMode(): Mode {
  try {
    const m = localStorage.getItem(MODE_KEY)
    return m === 'nota' || m === 'snippet' ? m : 'gasto'
  } catch {
    return 'gasto'
  }
}

export function QuickCapture(): JSX.Element {
  const { state, dispatch } = useApp()
  const { show: notify } = useToast()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>(readMode)
  // Sólo los modos de módulos activos (p. ej. Notas puede estar oculto)
  const modes = MODES.filter((m) => !state.disabledPlugins.includes(m.pluginId))
  const firstMode = modes[0]?.value ?? 'gasto'
  useEffect(() => {
    if (!modes.some((m) => m.value === mode)) setMode(firstMode)
  }, [modes, mode, firstMode])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const quickGasto = useQuickGasto()

  const handleRequest = useCallback((req?: CaptureRequest) => {
    if (req?.action === 'new-note') {
      dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'notes', action: 'new', payload: {} })
      return
    }
    if (req?.mode) setMode(req.mode)
    setOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [dispatch])

  useEffect(() => {
    const offIpc = window.api.on('app:quick-capture', (payload) => handleRequest(payload as CaptureRequest | undefined))
    const onEvent = (e: Event): void => handleRequest((e as CustomEvent<CaptureRequest | undefined>).detail)
    window.addEventListener('setto:quick-capture', onEvent)
    return () => {
      offIpc()
      window.removeEventListener('setto:quick-capture', onEvent)
    }
  }, [handleRequest])

  useEffect(() => {
    try { localStorage.setItem(MODE_KEY, mode) } catch { /* ignore */ }
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [mode, open])

  const close = useCallback(() => { setOpen(false); setBusy(false) }, [])

  const save = async (): Promise<void> => {
    const value = text.trim()
    if (!value || busy) return
    if (mode === 'nota') {
      setBusy(true)
      try {
        const meta = await window.api.invoke<NoteMeta>('notes:write', null, value)
        notify(`Nota guardada: ${meta.title}`, 'success')
        setText('')
        close()
      } catch (err) {
        notify(`No se pudo guardar la nota: ${err instanceof Error ? err.message : String(err)}`, 'error')
        setBusy(false)
      }
      return
    }
    if (mode === 'gasto') {
      // Se guarda directo con "Deshacer"; sólo abre Gastos si no se entiende el monto.
      setBusy(true)
      const r = await quickGasto(value)
      if (r === 'failed') { setBusy(false); return }
      setText('')
      close()
      return
    } else {
      dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'snippets', action: 'new', payload: { content: text } })
    }
    setText('')
    close()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key !== 'Enter' || e.shiftKey || e.altKey) return
    const multiline = text.includes('\n')
    // Single line: Enter saves. Multiline: Enter adds a line, Ctrl+Enter saves.
    if (e.ctrlKey || e.metaKey || !multiline) {
      e.preventDefault()
      void save()
    }
  }

  const multiline = text.includes('\n')

  return (
    <Modal
      open={open}
      onClose={close}
      width={500}
      title="Captura rápida"
      subtitle="Ctrl+Shift+Espacio desde cualquier lado"
      footer={
        <>
          <span className="t-caption text-on-surface-variant/80 mr-auto flex items-center gap-1.5">
            <kbd className="kbd-chip">{multiline ? 'Ctrl+Enter' : 'Enter'}</kbd>
            guarda
            <kbd className="kbd-chip ml-1.5">Shift+Enter</kbd>
            nueva línea
          </span>
          <button type="button" className="ui-btn ui-btn-outline" onClick={close}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn-primary" onClick={() => { void save() }} disabled={!text.trim() || busy}>
            {mode === 'nota' ? 'Guardar nota' : mode === 'gasto' ? 'Guardar gasto' : 'Crear snippet'}
          </button>
        </>
      }
    >
      <div className="space-y-3 pt-1">
        {modes.length > 1 && <SegmentedControl options={modes} value={mode} onChange={setMode} />}
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={Math.min(8, Math.max(3, text.split('\n').length))}
          placeholder={PLACEHOLDER[mode]}
          aria-label="Texto a capturar"
          spellCheck={mode !== 'snippet'}
          className={`ui-input w-full resize-none rounded-xl px-3.5 py-3 t-callout ${mode === 'snippet' ? 'font-mono text-[13px]' : ''}`}
        />
      </div>
    </Modal>
  )
}
