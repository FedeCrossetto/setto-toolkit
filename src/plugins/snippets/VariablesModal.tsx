import { useEffect, useMemo, useState } from 'react'
import { Copy, SquareTerminal } from 'lucide-react'
import { Modal } from '../../core/components/Modal'
import { Field } from '../../core/components/Form'
import { initialValues, parseVariables, renderTemplate } from './template'
import type { Snippet } from './types'

const STORAGE_PREFIX = 'snippets.vars.'

export function loadRemembered(id: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + id)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export function saveRemembered(id: string, values: Record<string, string>): void {
  try { localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(values)) } catch { /* sin storage */ }
}

export type VariablesMode = 'copy' | 'run'

/** Fill-in form for `{{variables}}` before copying or running a snippet. */
export function VariablesModal({
  snippet,
  content,
  mode,
  onClose,
  onSubmit,
}: {
  snippet: Snippet | null
  /** Text to render (snippet content, possibly without images) */
  content: string
  mode: VariablesMode
  onClose: () => void
  onSubmit: (rendered: string) => void
}): JSX.Element {
  const vars = useMemo(() => parseVariables(content), [content])
  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => {
    if (snippet) setValues(initialValues(vars, loadRemembered(snippet.id)))
  }, [snippet, vars])

  const rendered = renderTemplate(content, values)

  const submit = (): void => {
    if (!snippet) return
    saveRemembered(snippet.id, values)
    onSubmit(rendered)
  }

  return (
    <Modal
      open={!!snippet}
      onClose={onClose}
      width={480}
      title="Completá las variables"
      subtitle={snippet?.title}
      footer={
        <>
          <button className="ui-btn ui-btn-outline" onClick={onClose}>Cancelar</button>
          <button className="ui-btn ui-btn-primary" onClick={submit}>
            {mode === 'run' ? <SquareTerminal size={14} /> : <Copy size={14} />}
            {mode === 'run' ? 'Ejecutar' : 'Copiar'}
          </button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3 pt-1"
        onSubmit={(e) => { e.preventDefault(); submit() }}
      >
        {vars.map((v, i) => (
          <Field key={v.name} label={v.name} hint={v.defaultValue ? `Por defecto: ${v.defaultValue}` : undefined}>
            <input
              autoFocus={i === 0}
              className="ui-input w-full"
              value={values[v.name] ?? ''}
              placeholder={v.defaultValue ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [v.name]: e.target.value }))}
            />
          </Field>
        ))}
        <div className="flex flex-col gap-1.5">
          <span className="t-footnote font-medium text-on-surface-variant">Vista previa</span>
          <pre className="t-footnote font-mono text-on-surface bg-on-surface/[0.04] hairline rounded-md px-3 py-2 max-h-40 overflow-auto whitespace-pre-wrap break-words">
            {rendered}
          </pre>
        </div>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  )
}
