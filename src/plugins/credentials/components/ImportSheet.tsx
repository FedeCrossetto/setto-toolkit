import { useEffect, useMemo, useState } from 'react'
import { FileUp } from 'lucide-react'
import { Sheet } from '../../../core/components/Modal'
import { Toggle } from '../../../core/components/Form'
import { Badge } from '../../../core/components/Badge'
import { useToast } from '../../../core/components/Toast'
import type { ImportFormat, ImportPreview } from '../types'
import { credentialsApi, displayHost } from '../data'

const FORMAT_LABEL: Record<ImportFormat, string> = {
  chrome: 'Chrome / Edge',
  bitwarden: 'Bitwarden',
  '1password': '1Password',
  firefox: 'Firefox',
  generic: 'CSV genérico',
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)
}

/** Import from a CSV export. The file is read and parsed in main; the preview carries no passwords. */
export function ImportSheet({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }): JSX.Element {
  const { show: toast } = useToast()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [includeDup, setIncludeDup] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) { setPreview(null); setSelected(new Set()); setIncludeDup(false); setError(null); setBusy(false) }
  }, [open])

  const close = (): void => {
    if (preview) void credentialsApi.importCancel().catch(() => undefined)
    onClose()
  }

  const pick = async (): Promise<void> => {
    setError(null)
    setBusy(true)
    try {
      const r = await credentialsApi.importPick()
      if ('canceled' in r) return
      if ('error' in r) { setError(r.error); return }
      setPreview(r)
      setSelected(new Set(r.rows.filter((x) => !x.duplicate).map((x) => x.index)))
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const setDup = (v: boolean): void => {
    setIncludeDup(v)
    if (!preview) return
    setSelected((cur) => {
      const next = new Set(cur)
      for (const r of preview.rows) if (r.duplicate) { if (v) next.add(r.index); else next.delete(r.index) }
      return next
    })
  }

  const counts = useMemo(() => {
    const rows = preview?.rows ?? []
    return { total: rows.length, dup: rows.filter((r) => r.duplicate).length }
  }, [preview])

  const commit = async (): Promise<void> => {
    if (!preview || !selected.size) return
    setBusy(true)
    try {
      const r = await credentialsApi.importCommit(preview.token, [...selected])
      toast(
        r.queued
          ? `Importadas ${r.imported}. ${r.queued} quedan pendientes de sincronizar.`
          : `Importadas ${r.imported} credenciales`,
        'success', 4000,
      )
      onImported()
      onClose()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      width={560}
      title="Importar contraseñas"
      subtitle="Desde un CSV exportado por Chrome, Edge, Bitwarden, 1Password o Firefox."
      footer={
        <>
          <button className="ui-btn ui-btn-outline" onClick={close}>Cancelar</button>
          {preview && (
            <button className="ui-btn ui-btn-primary" onClick={() => void commit()} disabled={!selected.size || busy}>
              {busy ? 'Importando…' : `Importar ${selected.size}`}
            </button>
          )}
        </>
      }
    >
      {!preview ? (
        <div className="flex flex-col items-start gap-4">
          <ol className="t-body text-on-surface-variant list-decimal pl-5 space-y-1.5">
            <li>Exportá tus contraseñas desde el navegador o el gestor (formato CSV).</li>
            <li>Elegí el archivo acá: se lee en esta computadora y no se sube a ningún lado.</li>
            <li>Revisá la vista previa; las que ya tenés se marcan como duplicadas.</li>
          </ol>
          <button className="ui-btn ui-btn-primary" onClick={() => void pick()} disabled={busy}>
            <FileUp size={14} /> Elegir archivo CSV
          </button>
          <p className="t-footnote text-on-surface-variant">
            Cuando termines, borrá el CSV exportado: tiene las contraseñas sin cifrar.
          </p>
          {error && <p className="t-footnote text-error" role="alert">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="t-body font-medium text-on-surface truncate">{preview.fileName}</span>
            <Badge tone="primary">{FORMAT_LABEL[preview.format]}</Badge>
          </div>
          <p className="t-footnote text-on-surface-variant">
            {counts.total - counts.dup} nuevas · {counts.dup} duplicadas{preview.skipped ? ` · ${preview.skipped} omitidas (no son logins o están vacías)` : ''}
          </p>
          {counts.dup > 0 && (
            <div className="flex items-center justify-between">
              <span className="t-body text-on-surface">Incluir duplicadas</span>
              <Toggle checked={includeDup} onChange={setDup} label="Incluir duplicadas" />
            </div>
          )}
          <div className="bg-surface hairline rounded-xl overflow-hidden">
            <div className="max-h-[52vh] overflow-y-auto divide-y divide-[var(--hairline)]">
              {preview.rows.map((r) => {
                const on = selected.has(r.index)
                return (
                  <label key={r.index} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-on-surface/[0.02]">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={on}
                      onChange={() => setSelected((cur) => {
                        const next = new Set(cur)
                        if (next.has(r.index)) next.delete(r.index)
                        else next.add(r.index)
                        return next
                      })}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block t-body text-on-surface truncate">{r.nombre}</span>
                      <span className="block t-caption text-on-surface-variant truncate">
                        {[r.usuario, displayHost(r.url), r.categoria].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </span>
                    {r.duplicate && <Badge tone="warning">Duplicada</Badge>}
                    {!r.hasPassword && <Badge>Sin contraseña</Badge>}
                  </label>
                )
              })}
            </div>
          </div>
          {error && <p className="t-footnote text-error" role="alert">{error}</p>}
        </div>
      )}
    </Sheet>
  )
}
