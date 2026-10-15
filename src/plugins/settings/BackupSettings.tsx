import { useEffect, useState } from 'react'
import { Download, FolderOpen, RotateCcw, ShieldCheck, Upload } from 'lucide-react'
import { SettingsGroup, SettingsRow, Toggle } from '../../core/components/Form'
import { Modal } from '../../core/components/Modal'
import { useToast } from '../../core/components/Toast'

/**
 * Ajustes → Respaldo: todos los datos (gastos, claves, conexiones, snippets,
 * notas, ajustes) en un archivo cifrado con una contraseña tuya. Se restaura en
 * esta u otra PC. Ver electron/core/backup-service.ts.
 */
interface Info { dataMB: number; files: number; capturesMB: number; auto: { dir: string; lastAt: number | null; lastError: string | null } | null }
interface Inspect { createdAt: number; appVersion: string; files: number; captures: number; notes: number }

const cleanErr = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const fmtDate = (ts: number): string => new Date(ts).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })

export function BackupSettings(): JSX.Element {
  const toast = useToast()
  const [info, setInfo] = useState<Info | null>(null)
  const [dialog, setDialog] = useState<'export' | 'restore' | 'auto' | null>(null)

  const load = (): void => { void window.api.invoke<Info>('backup:info').then(setInfo).catch(() => setInfo(null)) }
  useEffect(load, [])

  const autoOn = !!info?.auto
  const disableAuto = async (): Promise<void> => {
    try { await window.api.invoke('backup:auto-set', null); toast.show('Respaldo automático apagado', 'info'); load() } catch (e) { toast.show(cleanErr(e), 'error') }
  }

  return (
    <SettingsGroup id="ajustes-respaldo" title="Respaldo"
      description="Todo lo tuyo en un archivo cifrado con una contraseña: gastos, claves, conexiones, snippets, notas y ajustes."
      footer="Sin la contraseña del respaldo no se puede abrir: guardala en un lugar seguro. La sesión de Google no se incluye.">
      <SettingsRow icon={Download} title="Exportar respaldo"
        description={info ? `${info.files} archivos · ${info.dataMB} MB${info.capturesMB ? ` (+ ${info.capturesMB} MB de capturas, opcional)` : ''}` : 'Calculando…'}>
        <button className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => setDialog('export')}>Exportar…</button>
      </SettingsRow>
      <SettingsRow icon={Upload} title="Restaurar respaldo" description="Reemplaza los datos actuales (antes se guarda una copia) y reinicia Setto.">
        <button className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => setDialog('restore')}>Restaurar…</button>
      </SettingsRow>
      <SettingsRow icon={ShieldCheck} title="Respaldo automático semanal"
        description={autoOn
          ? <>En <span className="font-mono">{info!.auto!.dir}</span> · {info!.auto!.lastError ? <span className="text-error">falló: {info!.auto!.lastError}</span> : info!.auto!.lastAt ? `último ${fmtDate(info!.auto!.lastAt)}` : 'pendiente'} · guarda los últimos 5</>
          : 'Elegí una carpeta (p. ej. OneDrive) y Setto deja ahí un respaldo por semana.'}>
        <div className="flex items-center gap-2">
          {autoOn && (
            <button className="ui-btn ui-btn-ghost ui-btn-sm" title="Hacer uno ahora"
              onClick={() => { void window.api.invoke<{ ok: boolean; error?: string }>('backup:auto-run').then((r) => { toast.show(r.ok ? 'Respaldo guardado' : r.error ?? 'Falló', r.ok ? 'success' : 'error'); load() }) }}>
              <RotateCcw size={12} /> Ahora
            </button>
          )}
          <Toggle checked={autoOn} onChange={(v) => (v ? setDialog('auto') : void disableAuto())} label="Respaldo automático" />
        </div>
      </SettingsRow>

      {dialog === 'export' && <ExportDialog capturesMB={info?.capturesMB ?? 0} onClose={() => setDialog(null)} />}
      {dialog === 'restore' && <RestoreDialog onClose={() => setDialog(null)} />}
      {dialog === 'auto' && <AutoDialog onClose={() => { setDialog(null); load() }} />}
    </SettingsGroup>
  )
}

function PassFields({ pass, setPass, confirm, setConfirm, autoFocus }: { pass: string; setPass: (v: string) => void; confirm?: string; setConfirm?: (v: string) => void; autoFocus?: boolean }): JSX.Element {
  return (
    <div className="flex flex-col gap-2.5">
      <label className="flex flex-col gap-1">
        <span className="t-footnote font-medium text-on-surface">Contraseña del respaldo</span>
        <input type="password" className="ui-input" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus={autoFocus} autoComplete="new-password" />
      </label>
      {setConfirm && (
        <label className="flex flex-col gap-1">
          <span className="t-footnote font-medium text-on-surface">Repetila</span>
          <input type="password" className="ui-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </label>
      )}
    </div>
  )
}

function passError(pass: string, confirm?: string): string | null {
  if (pass.length < 8) return 'Al menos 8 caracteres'
  if (confirm !== undefined && pass !== confirm) return 'Las contraseñas no coinciden'
  return null
}

function ExportDialog({ capturesMB, onClose }: { capturesMB: number; onClose: () => void }): JSX.Element {
  const toast = useToast()
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [withCaptures, setWithCaptures] = useState(false)
  const [busy, setBusy] = useState(false)
  const err = passError(pass, confirm)

  const run = async (): Promise<void> => {
    setBusy(true)
    try {
      const r = await window.api.invoke<{ ok: boolean; canceled?: boolean; path?: string; sizeMB?: number; files?: number }>('backup:export', pass, withCaptures)
      if (r.ok) { toast.show(`Respaldo guardado: ${r.files} archivos, ${r.sizeMB} MB`, 'success'); onClose() }
    } catch (e) { toast.show(cleanErr(e), 'error') }
    setBusy(false)
  }

  return (
    <Modal open onClose={onClose} title="Exportar respaldo" width={420}
      footer={<>
        <button className="ui-btn ui-btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="ui-btn ui-btn-primary" disabled={!!err || busy} onClick={() => void run()}>{busy ? 'Exportando…' : 'Elegir dónde guardar…'}</button>
      </>}>
      <div className="flex flex-col gap-3.5">
        <PassFields pass={pass} setPass={setPass} confirm={confirm} setConfirm={setConfirm} autoFocus />
        {pass && err && <p className="t-caption text-error">{err}</p>}
        {capturesMB > 0 && (
          <label className="flex items-center justify-between gap-3">
            <span className="t-footnote text-on-surface">Incluir capturas <span className="text-on-surface-variant">({capturesMB} MB)</span></span>
            <Toggle checked={withCaptures} onChange={setWithCaptures} label="Incluir capturas" />
          </label>
        )}
      </div>
    </Modal>
  )
}

function RestoreDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const toast = useToast()
  const [file, setFile] = useState<string | null>(null)
  const [pass, setPass] = useState('')
  const [preview, setPreview] = useState<Inspect | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = async (): Promise<void> => {
    const f = await window.api.invoke<string | null>('backup:pick')
    if (f) { setFile(f); setPreview(null); setError(null) }
  }
  const inspect = async (): Promise<void> => {
    if (!file) return
    setBusy(true); setError(null)
    try { setPreview(await window.api.invoke<Inspect>('backup:inspect', file, pass)) } catch (e) { setError(cleanErr(e)) }
    setBusy(false)
  }
  const restore = async (): Promise<void> => {
    if (!file) return
    setBusy(true)
    try {
      await window.api.invoke('backup:restore', file, pass)
      toast.show('Respaldo restaurado: Setto se reinicia…', 'success')
    } catch (e) { setError(cleanErr(e)); setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} title="Restaurar respaldo" width={440}
      footer={<>
        <button className="ui-btn ui-btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
        {preview
          ? <button className="ui-btn ui-btn-primary" disabled={busy} onClick={() => void restore()}>{busy ? 'Restaurando…' : 'Restaurar y reiniciar'}</button>
          : <button className="ui-btn ui-btn-primary" disabled={!file || pass.length < 8 || busy} onClick={() => void inspect()}>{busy ? 'Abriendo…' : 'Abrir'}</button>}
      </>}>
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center gap-2">
          <button className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => void pick()}><FolderOpen size={12} /> Elegir archivo…</button>
          <span className="t-footnote text-on-surface-variant truncate font-mono" title={file ?? undefined}>{file ? file.split(/[\\/]/).pop() : 'Ningún archivo'}</span>
        </div>
        {file && !preview && <PassFields pass={pass} setPass={(v) => { setPass(v); setError(null) }} autoFocus />}
        {error && <p className="t-footnote text-error">{error}</p>}
        {preview && (
          <div className="rounded-lg bg-on-surface/[0.04] px-3 py-2.5 flex flex-col gap-1">
            <p className="t-body text-on-surface font-medium">Respaldo del {fmtDate(preview.createdAt)}</p>
            <p className="t-footnote text-on-surface-variant">{preview.files} archivos{preview.notes ? ` · ${preview.notes} notas` : ''}{preview.captures ? ` · ${preview.captures} capturas` : ''} · Setto {preview.appVersion}</p>
            <p className="t-footnote text-warning mt-1">Reemplaza los datos actuales. Antes se guarda una copia de lo que hay ahora, y después Setto se reinicia.</p>
          </div>
        )}
      </div>
    </Modal>
  )
}

function AutoDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const toast = useToast()
  const [dir, setDir] = useState<string | null>(null)
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const err = passError(pass, confirm)

  const save = async (): Promise<void> => {
    if (!dir) return
    setBusy(true)
    try {
      const r = await window.api.invoke<{ ok: boolean; error?: string; path?: string }>('backup:auto-set', { dir, pass })
      toast.show(r.ok ? 'Respaldo automático activado: ya se guardó el primero' : r.error ?? 'No se pudo', r.ok ? 'success' : 'error')
      onClose()
    } catch (e) { toast.show(cleanErr(e), 'error'); setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} title="Respaldo automático" width={440}
      footer={<>
        <button className="ui-btn ui-btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="ui-btn ui-btn-primary" disabled={!dir || !!err || busy} onClick={() => void save()}>{busy ? 'Guardando…' : 'Activar'}</button>
      </>}>
      <div className="flex flex-col gap-3.5">
        <p className="t-footnote text-on-surface-variant">Una vez por semana Setto guarda un respaldo cifrado en esta carpeta y conserva los últimos 5. La contraseña queda guardada cifrada en esta PC para poder hacerlo solo.</p>
        <div className="flex items-center gap-2">
          <button className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => { void window.api.invoke<string | null>('backup:auto-pick-dir').then((d) => { if (d) setDir(d) }) }}>
            <FolderOpen size={12} /> Elegir carpeta…
          </button>
          <span className="t-footnote text-on-surface-variant truncate font-mono" title={dir ?? undefined}>{dir ?? 'Ninguna'}</span>
        </div>
        <PassFields pass={pass} setPass={setPass} confirm={confirm} setConfirm={setConfirm} />
        {pass && err && <p className="t-caption text-error">{err}</p>}
      </div>
    </Modal>
  )
}
