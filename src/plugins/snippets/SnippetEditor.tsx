import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Field, Toggle } from '../../core/components/Form'
import type { SnippetCollection, SnippetLanguage } from './types'
import { LANGUAGES, LANG_LABEL } from './langs'
import { IMAGE_MARKER_RE } from './SnippetViewer'

export interface SnippetFormState {
  title: string
  language: SnippetLanguage
  content: string
  tags: string[]
  description: string
  pinned: boolean
  collectionId: string | null
  /** Short placeholder id → data URL, so the textarea doesn't show base64 */
  images: Record<string, string>
}

export function emptyForm(partial: Partial<SnippetFormState> = {}): SnippetFormState {
  return { title: '', language: 'plaintext', content: '', tags: [], description: '', pinned: false, collectionId: null, images: {}, ...partial }
}

/** Replace full data URLs with `![img:N]` placeholders for editing. */
export function collapseImages(content: string): { content: string; images: Record<string, string> } {
  const images: Record<string, string> = {}
  let counter = 0
  const collapsed = content.replace(new RegExp(IMAGE_MARKER_RE.source, 'g'), (_m, dataUrl: string) => {
    const id = `img-${++counter}`
    images[id] = dataUrl
    return `![img:${id}]`
  })
  return { content: collapsed, images }
}

/** Inverse of collapseImages. */
export function expandImages(content: string, images: Record<string, string>): string {
  return content.replace(/!\[img:([^\]]+)\]/g, (m, id: string) => (images[id] ? `![](${images[id]})` : m))
}

export function SnippetEditor({
  form,
  setForm,
  collections,
  isNew,
  onSave,
  onCancel,
}: {
  form: SnippetFormState
  setForm: React.Dispatch<React.SetStateAction<SnippetFormState>>
  collections: SnippetCollection[]
  isNew: boolean
  onSave: () => void
  onCancel: () => void
}): JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [tagInput, setTagInput] = useState('')
  const canSave = !!form.title.trim() && !!form.content.trim()

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (!textareaRef.current || textareaRef.current.offsetParent === null) return
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key === 's')) {
        e.preventDefault()
        if (canSave) onSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [canSave, onSave])

  const addTag = (): void => {
    const t = tagInput.trim().toLowerCase()
    if (t && !form.tags.includes(t)) setForm((f) => ({ ...f, tags: [...f.tags, t] }))
    setTagInput('')
  }

  const insertImage = (dataUrl: string): void => {
    const id = 'img-' + Math.random().toString(36).slice(2, 7)
    const marker = `![img:${id}]`
    const ta = textareaRef.current
    const start = ta ? ta.selectionStart : -1
    const end = ta ? ta.selectionEnd : -1
    setForm((f) => {
      const s = start >= 0 ? start : f.content.length
      const e = end >= 0 ? end : f.content.length
      return { ...f, content: f.content.slice(0, s) + marker + f.content.slice(e), images: { ...f.images, [id]: dataUrl } }
    })
  }

  const loadImageFile = (file: File): void => {
    const reader = new FileReader()
    reader.onload = (e) => insertImage(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handlePaste = (e: React.ClipboardEvent): void => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'))
    if (!item) return
    e.preventDefault()
    const file = item.getAsFile()
    if (file) loadImageFile(file)
  }

  const handleDrop = (e: React.DragEvent): void => {
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) {
      e.preventDefault()
      loadImageFile(file)
    }
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="max-w-3xl mx-auto bg-surface hairline rounded-2xl shadow-sm">
      <div className="pl-6 pr-4 h-14 hairline-b flex items-center gap-2 sticky top-0 z-10 bg-surface rounded-t-2xl">
        <h2 className="t-headline text-on-surface flex-1 truncate">{isNew ? 'Nuevo snippet' : 'Editar snippet'}</h2>
        <button onClick={onCancel} className="ui-btn ui-btn-outline">Cancelar</button>
        <button onClick={onSave} disabled={!canSave} className="ui-btn ui-btn-primary" title="Guardar (Ctrl+S)">Guardar</button>
      </div>

      <div className="px-6 py-6">
        <div className="flex flex-col gap-4">
          <Field label="Título">
            <input
              autoFocus
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Ej.: Cuentas activas por sala"
              className="ui-input w-full"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Lenguaje">
              <select
                value={form.language}
                onChange={(e) => setForm((f) => ({ ...f, language: e.target.value as SnippetLanguage }))}
                className="ui-input w-full"
              >
                {LANGUAGES.map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}
              </select>
            </Field>
            <Field label="Colección">
              <select
                value={form.collectionId ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, collectionId: e.target.value || null }))}
                className="ui-input w-full"
              >
                <option value="">Sin colección</option>
                {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Descripción">
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Opcional: cuándo o para qué se usa"
              className="ui-input w-full"
            />
          </Field>

          <div className="flex flex-col gap-1.5">
            <span className="t-footnote font-medium text-on-surface-variant">Etiquetas</span>
            <div className="ui-input w-full flex flex-wrap items-center gap-1.5 min-h-[32px]">
              {form.tags.map((t) => (
                <span key={t} className="ui-badge inline-flex items-center gap-1 bg-primary/10 text-primary font-medium">
                  {t}
                  <button
                    type="button"
                    aria-label={`Quitar etiqueta ${t}`}
                    onClick={() => setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }))}
                    className="text-primary/70 hover:text-primary"

                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() }
                  if (e.key === 'Backspace' && !tagInput && form.tags.length) {
                    setForm((f) => ({ ...f, tags: f.tags.slice(0, -1) }))
                  }
                }}
                onBlur={addTag}
                placeholder={form.tags.length ? '' : 'Escribí y apretá Enter'}
                className="flex-1 min-w-[120px] bg-transparent outline-none t-body"
              />
            </div>
          </div>

          <Field
            label="Contenido"
            hint={<>Usá <code className="font-mono">{'{{nombre}}'}</code> o <code className="font-mono">{'{{nombre:valor}}'}</code> para variables. Podés pegar o arrastrar imágenes.</>}
          >
            <textarea
              ref={textareaRef}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              onPaste={handlePaste}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              spellCheck={false}
              placeholder="Pegá acá el script, comando o query…"
              className="ui-input w-full font-mono t-footnote resize-y leading-relaxed"
              style={{ minHeight: 260 }}
            />
          </Field>

          <div className="flex items-center justify-between rounded-xl bg-surface-container dark:bg-white/[0.04] px-3.5 py-2.5">
            <span className="t-body text-on-surface">Fijar arriba</span>
            <Toggle checked={form.pinned} onChange={(v) => setForm((f) => ({ ...f, pinned: v }))} label="Fijar snippet" />
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
