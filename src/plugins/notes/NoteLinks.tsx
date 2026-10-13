import { ArrowUpRight, Link, Plus } from 'lucide-react'
import type { NoteMeta } from './types'

const norm = (s: string): string => s.trim().toLowerCase()

/** Nota cuyo título coincide (sin distinguir mayúsculas). */
export function findByTitle(notes: NoteMeta[], title: string): NoteMeta | undefined {
  const t = norm(title)
  return notes.find((n) => norm(n.title) === t)
}

/** Notas que enlazan a `note` con [[su título]]. */
export function backlinksOf(notes: NoteMeta[], note: NoteMeta): NoteMeta[] {
  const t = norm(note.title)
  return notes.filter((n) => n.id !== note.id && n.links.some((l) => norm(l) === t))
}

/**
 * Convierte [[Título]] / [[Título|texto]] en enlaces para la vista previa. El
 * resultado pasa después por marked + DOMPurify (que conserva data-*).
 */
export function linkifyWikiLinks(md: string): string {
  const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
  return md.replace(/\[\[([^[\]\n|]{1,120})(?:\|([^[\]\n]*))?\]\]/g, (_m, title: string, alias?: string) =>
    `<a href="#" class="note-link" data-note-link="${esc(title.trim())}">${esc((alias ?? title).trim())}</a>`)
}

/** Pie de la nota: a qué notas enlaza y quién la menciona. */
export function NoteLinks({ note, notes, onOpenTitle }: {
  note: NoteMeta
  notes: NoteMeta[]
  /** Abre (o crea, si no existe) la nota con ese título. */
  onOpenTitle: (title: string) => void
}): JSX.Element | null {
  const back = backlinksOf(notes, note)
  if (note.links.length === 0 && back.length === 0) {
    return (
      <p className="t-caption text-on-surface-variant/70 px-12 pb-6">
        Tip: enlazá otra nota escribiendo <code className="font-mono">[[Título]]</code> y etiquetá con <code className="font-mono">#etiqueta</code>.
      </p>
    )
  }
  return (
    <div className="px-12 pb-8 pt-2 flex flex-col gap-3">
      {note.links.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="t-caption font-semibold uppercase tracking-[0.06em] text-on-surface-variant/70 mr-1">Enlaza a</span>
          {note.links.map((title) => {
            const exists = !!findByTitle(notes, title)
            return (
              <button
                key={title}
                type="button"
                onClick={() => onOpenTitle(title)}
                title={exists ? 'Abrir nota' : 'No existe: clic para crearla'}
                className={`inline-flex items-center gap-1 h-6 px-2 rounded-md t-footnote transition-colors ${
                  exists ? 'bg-primary/10 text-primary hover:bg-primary/[0.16]' : 'bg-on-surface/[0.05] text-on-surface-variant hover:bg-on-surface/[0.09] border border-dashed border-[var(--hairline-strong)]'
                }`}
              >
                {exists ? <Link size={11} /> : <Plus size={11} />}
                {title}
              </button>
            )
          })}
        </div>
      )}
      {back.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="t-caption font-semibold uppercase tracking-[0.06em] text-on-surface-variant/70 mr-1">Mencionada en</span>
          {back.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onOpenTitle(n.title)}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-md t-footnote bg-on-surface/[0.05] text-on-surface hover:bg-on-surface/[0.09] transition-colors"
            >
              <ArrowUpRight size={11} className="text-on-surface-variant" />
              {n.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
