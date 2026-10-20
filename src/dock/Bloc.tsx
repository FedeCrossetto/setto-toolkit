import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Copy, Eraser, NotebookPen } from 'lucide-react'
import type { NoteContent, NoteMeta } from '../plugins/notes/types'
import { BLOC_ID, BLOC_SAVE_MS, blocStats, formatStats, recentNotes } from './bloc-utils'

/**
 * Pestaña "Bloc" de la barra: un anotador siempre a mano. Es una nota más
 * (`Bloc.md`) que se crea al escribir por primera vez y se guarda sola
 * (500 ms después de la última tecla, y al plegar la barra).
 *
 * El textarea pide el foco a main al enfocarse (`dock:want-focus`, igual que el
 * buscador): la barra no es "focusable" hasta que hace falta teclado.
 */
export interface BlocHandle {
  /** Escribir al final y enfocar (cuando se tipea con la pestaña activa pero sin foco en el textarea). */
  type: (ch: string) => void
  focus: () => void
  flush: () => Promise<void>
}

interface Props {
  /** La barra está abierta (al abrir se recarga el contenido si no hay cambios sin guardar). */
  expanded: boolean
  say: (msg: string, ms?: number, undo?: () => void) => void
  openMain: (a: { pluginId: string; action?: string; payload?: unknown }) => void
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export const Bloc = forwardRef<BlocHandle, Props>(function Bloc({ expanded, say, openMain }, ref) {
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [recent, setRecent] = useState<NoteMeta[]>([])
  const taRef = useRef<HTMLTextAreaElement>(null)
  const textRef = useRef('')
  /** Lo último escrito a disco (null: el archivo todavía no existe). */
  const savedRef = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Hasta leer el archivo no se guarda nada (si no, lo tipeado pisaría el Bloc). */
  const loadedRef = useRef(false)

  const save = useCallback(async (): Promise<void> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (!loadedRef.current) return
    const value = textRef.current
    if (value === savedRef.current || (savedRef.current === null && !value)) return
    setSaveState('saving')
    try {
      await window.api.invoke('notes:write', BLOC_ID, value)
      savedRef.current = value
      setSaveState(textRef.current === value ? 'saved' : 'idle')
    } catch (e) {
      setSaveState('error')
      say(`No se pudo guardar el Bloc: ${errMsg(e)}`, 4000)
    }
  }, [say])

  const update = (value: string, now = false): void => {
    textRef.current = value
    setText(value)
    setSaveState('idle')
    if (timer.current) clearTimeout(timer.current)
    if (now) void save()
    else timer.current = setTimeout(() => { void save() }, BLOC_SAVE_MS)
  }

  const focusEnd = (): void => {
    const ta = taRef.current
    if (!ta) return
    ta.focus()
    const end = ta.value.length
    ta.setSelectionRange(end, end)
  }

  useImperativeHandle(ref, () => ({
    type: (ch) => { update(textRef.current + ch); requestAnimationFrame(focusEnd) },
    focus: focusEnd,
    flush: save,
  }))

  // El panel se monta al abrir la barra (y al entrar a la pestaña): traer lo guardado y las
  // últimas notas. Lo tipeado antes de que llegue (Ctrl+Alt+D y a escribir) se suma al final.
  useEffect(() => {
    let alive = true
    const done = (content: string | null): void => {
      if (!alive) return
      savedRef.current = content
      const typed = textRef.current
      loadedRef.current = true
      setLoaded(true)
      if (typed) update((content ?? '') + typed)
      else { textRef.current = content ?? ''; setText(content ?? '') }
    }
    window.api.invoke<NoteContent>('notes:read', BLOC_ID).then((r) => done(r.content), () => done(null))
    window.api.invoke<NoteMeta[]>('notes:list').then((l) => { if (alive) setRecent(recentNotes(l)) }, () => undefined)
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Al plegar: guardar ya.
  useEffect(() => { if (!expanded) void save() }, [expanded, save])

  // Con la barra abierta por teclado (Ctrl+Alt+D) la ventana ya tiene el foco: escribir va directo al Bloc.
  useEffect(() => {
    if (!expanded || !loaded) return
    if (document.hasFocus() && document.activeElement === document.body) focusEnd()
    const onFocus = (): void => { if (document.activeElement === document.body) focusEnd() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [expanded, loaded])

  // Guardar lo pendiente si la ventana se cierra o se recarga.
  useEffect(() => {
    const onUnload = (): void => { void save() }
    window.addEventListener('beforeunload', onUnload)
    return () => { window.removeEventListener('beforeunload', onUnload); void save() }
  }, [save])

  const copyAll = async (): Promise<void> => {
    if (!text) { say('El Bloc está vacío'); return }
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Sin foco el portapapeles del navegador falla: pedir el foco y reintentar.
      window.api.send('dock:want-focus')
      await new Promise((r) => setTimeout(r, 80))
      try { await navigator.clipboard.writeText(text) } catch (e) { say(`No se pudo copiar: ${errMsg(e)}`); return }
    }
    say('Bloc copiado')
  }

  const clear = (): void => {
    if (!text) return
    const prev = text
    update('', true)
    say('Bloc limpio', 6000, () => { update(prev, true); requestAnimationFrame(focusEnd) })
  }

  const openInNotes = async (): Promise<void> => {
    if (!loadedRef.current) return
    try {
      // La nota tiene que existir para que Notas la abra.
      if (savedRef.current === null || textRef.current !== savedRef.current) {
        if (timer.current) { clearTimeout(timer.current); timer.current = null }
        await window.api.invoke('notes:write', BLOC_ID, textRef.current)
        savedRef.current = textRef.current
      }
      openMain({ pluginId: 'notes', action: 'open', payload: BLOC_ID })
    } catch (e) { say(errMsg(e)) }
  }

  const stats = useMemo(() => formatStats(blocStats(text)), [text])
  const status = saveState === 'saving' ? 'Guardando…' : saveState === 'saved' ? 'Guardado' : saveState === 'error' ? 'Sin guardar' : ''
  const pill = 'inline-flex items-center gap-1.5 h-7 px-3 rounded-[8px] border border-hairline-strong text-[12px] text-on-surface hover:bg-on-surface/[0.04] disabled:opacity-40 disabled:pointer-events-none transition-colors'

  return (
    <div className="h-full flex flex-col gap-2 px-1.5 pb-1">
      <textarea ref={taRef} value={text} spellCheck={false} aria-label="Bloc"
        placeholder={loaded ? 'Anotá lo que sea: se guarda solo.' : ''}
        onChange={(e) => update(e.target.value)}
        onFocus={() => window.api.send('dock:want-focus')}
        onBlur={() => { void save() }}
        className="flex-1 min-h-[120px] w-full resize-none rounded-[12px] border border-hairline-strong bg-surface px-3 py-2.5 text-[13px] leading-[20px] text-on-surface placeholder:text-on-surface-variant/60 outline-hidden focus:border-primary/40 focus:shadow-[0_0_0_3px_rgb(var(--c-primary)/0.10)] transition-[border-color,box-shadow] duration-200" />

      <div className="flex items-center gap-2 px-0.5 text-[11px] text-on-surface-variant tabular-nums">
        <span className="truncate">{stats}</span>
        {status && <span className={`ml-auto shrink-0 ${saveState === 'error' ? 'text-error' : 'text-on-surface-variant/70'}`}>{status}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={pill} disabled={!text} onClick={() => void copyAll()}><Copy size={13} /> Copiar todo</button>
        <button type="button" className={pill} disabled={!text} onClick={clear}><Eraser size={13} /> Limpiar</button>
        <button type="button" className={pill} onClick={() => void openInNotes()}><ArrowUpRight size={13} /> Abrir en Notas</button>
      </div>

      {recent.length > 0 && (
        <div className="pt-1.5">
          <div className="px-0.5 pb-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-on-surface-variant/80">Notas recientes</div>
          <div className="flex flex-col gap-px">
            {recent.map((n) => (
              <button key={n.id} type="button" title="Abrir en Notas"
                onClick={() => openMain({ pluginId: 'notes', action: 'open', payload: n.id })}
                className="group flex items-center gap-2.5 px-2 py-1.5 rounded-[10px] text-left border border-transparent hover:border-hairline hover:bg-on-surface/[0.03] transition-colors">
                <NotebookPen size={14} className="text-on-surface-variant shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-[12.5px] text-on-surface">{n.title || n.id.replace(/\.md$/i, '')}</span>
                  {n.preview && <span className="block truncate text-[11px] text-on-surface-variant">{n.preview}</span>}
                </span>
                <ArrowUpRight size={13} className="text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})
