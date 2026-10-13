import { useEffect, useState } from 'react'
import { ClipboardText, Copy, Download, ExternalLink, FileText, Images, NotebookPen, Ticket, X } from 'lucide-react'
import { Modal } from '../../core/components/Modal'
import { SegmentedControl } from '../../core/components/SegmentedControl'
import { Toggle } from '../../core/components/Form'
import { useToast } from '../../core/components/Toast'
import type { ClipView } from '../../core/clip-utils'
import type { NoteMeta } from '../notes/types'
import { buildTicketComment, type CommentFormat, type TicketMaterial } from './ticket-comment'
import type { CaptureEntry, CaptureQueryResult } from './types'

/**
 * "Todo lo de un ticket": al filtrar Capturas por un ticket, muestra cuántas
 * capturas, notas y textos copiados lo mencionan, y arma el comentario de
 * evidencia para Jira (con las imágenes nombradas igual que al exportarlas).
 */
export function TicketPanel({ ticket, onOpenNote, onClear }: { ticket: string; onOpenNote: (id: string) => void; onClear: () => void }): JSX.Element {
  const toast = useToast()
  const [ids, setIds] = useState<string[]>([])
  const [notes, setNotes] = useState<NoteMeta[]>([])
  const [clips, setClips] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<CommentFormat>('jira')
  const [withOcr, setWithOcr] = useState(true)
  const [material, setMaterial] = useState<TicketMaterial | null>(null)

  useEffect(() => {
    const key = ticket.toLowerCase()
    void window.api.invoke<CaptureQueryResult>('captures:query', { ticket, sort: 'old', limit: 500 }).then((r) => setIds(r.items.map((x) => x.id)), () => setIds([]))
    void window.api.invoke<NoteMeta[]>('notes:list').then((list) => setNotes(list.filter((n) =>
      [n.title, n.preview, ...(n.tags ?? []), ...(n.links ?? [])].some((s) => s.toLowerCase().includes(key)))), () => setNotes([]))
    void window.api.invoke<ClipView[]>('clipboard:history').then((list) => setClips(list.filter((c) => !c.sensitive && c.text.toLowerCase().includes(key) && c.text.trim().toLowerCase() !== key).map((c) => c.text)), () => setClips([]))
  }, [ticket])

  const build = async (): Promise<void> => {
    // El detalle completo (nota + OCR) sólo se pide al armar el comentario.
    const caps = (await Promise.all(ids.slice(0, 40).map((id) => window.api.invoke<CaptureEntry>('captures:get', id).catch(() => null))))
      .filter((c): c is CaptureEntry => !!c)
    setMaterial({ ticket, captures: caps, notes: notes.map((n) => n.title), clips })
    setOpen(true)
  }

  const text = material ? buildTicketComment(material, format, withOcr) : ''

  const openJira = async (): Promise<void> => {
    const base = await window.api.invoke<string | null>('settings:get', 'ticket-resolver.jira_url').catch(() => null)
    if (!base) { toast.show('Configurá la URL de Jira en Tickets → Ajustes', 'error'); return }
    window.open(`${base.replace(/\/+$/, '')}/browse/${ticket}`, '_blank', 'noopener')
  }

  return (
    <>
      <div className="mx-6 mb-3 flex items-center gap-3 rounded-xl hairline bg-surface px-4 py-2.5 flex-wrap">
        <Ticket size={16} className="text-primary shrink-0" />
        <span className="t-body font-semibold text-on-surface font-mono">{ticket}</span>
        <span className="t-footnote text-on-surface-variant flex items-center gap-3">
          <span className="flex items-center gap-1"><Images size={12} /> {ids.length} captura{ids.length === 1 ? '' : 's'}</span>
          {notes.length > 0 && (
            <button type="button" className="flex items-center gap-1 hover:text-on-surface" onClick={() => onOpenNote(notes[0]!.id)} title={notes.map((n) => n.title).join(', ')}>
              <NotebookPen size={12} /> {notes.length} nota{notes.length === 1 ? '' : 's'}
            </button>
          )}
          {clips.length > 0 && <span className="flex items-center gap-1"><ClipboardText size={12} /> {clips.length} copiado{clips.length === 1 ? '' : 's'}</span>}
        </span>
        <span className="flex-1" />
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => void openJira()}><ExternalLink size={12} /> Jira</button>
        <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" disabled={!ids.length}
          onClick={() => { void window.api.invoke<{ count?: number }>('captures:export', ids).then((r) => { if (r.count) toast.show(`Exportadas ${r.count} imágenes`, 'success') }) }}>
          <Download size={12} /> Exportar imágenes
        </button>
        <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={!ids.length} onClick={() => void build()}>
          <FileText size={12} /> Armar comentario
        </button>
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={onClear} aria-label="Quitar el filtro de ticket" title="Ver todas"><X size={13} /></button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Comentario de evidencia — ${ticket}`}
        subtitle="Pegalo en Jira y adjuntá las imágenes exportadas: los nombres coinciden."
        width={720}
        footer={
          <>
            <button type="button" className="ui-btn ui-btn-outline mr-auto"
              onClick={() => { void window.api.invoke<{ count?: number }>('captures:export', ids).then((r) => { if (r.count) toast.show(`Exportadas ${r.count} imágenes`, 'success') }) }}>
              <Download size={13} /> Exportar imágenes
            </button>
            <button type="button" className="ui-btn ui-btn-outline" onClick={() => setOpen(false)}>Cerrar</button>
            <button type="button" className="ui-btn ui-btn-primary"
              onClick={() => { void navigator.clipboard.writeText(text).then(() => toast.show('Comentario copiado', 'success')) }}>
              <Copy size={13} /> Copiar comentario
            </button>
          </>
        }
      >
        <div className="flex items-center gap-4 mb-3">
          <SegmentedControl<CommentFormat> value={format} onChange={setFormat}
            options={[{ value: 'jira', label: 'Jira (wiki)' }, { value: 'md', label: 'Markdown' }]} />
          <label className="flex items-center gap-2 t-footnote text-on-surface-variant">
            Incluir texto de las imágenes
            <Toggle checked={withOcr} onChange={setWithOcr} label="Incluir texto de las imágenes" />
          </label>
        </div>
        <textarea readOnly value={text} className="ui-input w-full h-[46vh] font-mono text-[12px] leading-5 resize-none" />
      </Modal>
    </>
  )
}
