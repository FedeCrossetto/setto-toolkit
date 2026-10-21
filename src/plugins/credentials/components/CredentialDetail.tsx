import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine, Check, CloudCheck, CloudUpload, Copy, ExternalLink, Eye, EyeOff, Monitor, Pencil, ShieldAlert, Star, Trash2, TriangleAlert, Wand2,
} from 'lucide-react'
import { Field } from '../../../core/components/Form'
import { CopyGlyph, Pop, useFlash } from '../../../core/components/Pop'
import { Badge } from '../../../core/components/Badge'
import { useToast } from '../../../core/components/Toast'
import type { Credential, CredentialDraft, SecretResult } from '../types'
import { absoluteUrl, copyToClipboard, credentialsApi, displayHost, relativeTime } from '../data'
import { usageHint } from '../usage'
import { E2E_ITEM_LABEL } from '../e2e-view'
import { estimateStrength } from '../strength'
import { Avatar } from './Avatar'
import { StrengthMeter } from './StrengthMeter'
import { PasswordGenerator } from './PasswordGenerator'

export const REVEAL_MS = 20_000

export type WithSecret = <T>(fn: () => Promise<SecretResult<T>>) => Promise<({ ok: true } & T) | null>

const SECTION = 'px-6 pb-2 pt-2 t-section'

function RowCopy({ value, label, secret = false }: { value: string; label: string; secret?: boolean }): JSX.Element {
  const { show: toast } = useToast()
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        copyToClipboard(value, secret)
          .then(() => { setDone(true); setTimeout(() => setDone(false), 1500) })
          .catch(() => toast('No se pudo copiar al portapapeles', 'error'))
      }}
      className="ui-btn ui-btn-ghost ui-btn-icon rounded-lg"
      title={label}
      aria-label={label}
    >
      {done ? <Check size={14} className="fx-pop text-success" /> : <Copy size={14} />}
    </button>
  )
}

function DetailRow({ label, children, actions }: { label: string; children: React.ReactNode; actions?: React.ReactNode }): JSX.Element {
  return (
    <div className="group flex items-center gap-4 px-6 py-2.5 min-h-[50px] hover:bg-on-surface/2.5 transition-colors">
      <span className="w-24 shrink-0 t-footnote font-medium text-on-surface-variant">{label}</span>
      <div className="flex-1 min-w-0 t-body text-on-surface">{children}</div>
      {actions && <div className="flex items-center gap-0.5 shrink-0 opacity-70 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">{actions}</div>}
    </div>
  )
}

// ── View ──────────────────────────────────────────────────────────────────────

export function CredentialView({
  c, favorite, usage, score, reusedWith, weak, withSecret,
  onEdit, onDelete, onToggleFavorite, onCopyPassword, onCopyUser, onOpenAndCopy, onOpenSync, onResolveConflict,
}: {
  c: Credential
  favorite: boolean
  usage: { useCount: number; lastUsedAt?: number }
  score?: number
  reusedWith: string[]
  weak: boolean
  withSecret: WithSecret
  onEdit: () => void
  onDelete: () => void
  onToggleFavorite: () => void
  onCopyPassword: () => void
  onCopyUser: () => void
  onOpenAndCopy: () => void
  /** Opens "Sincronizar contraseñas" (per-item status chip / password only in the cloud). */
  onOpenSync?: () => void
  /** Sync conflict: keep this PC's password or take the synced one. */
  onResolveConflict?: (choice: 'local' | 'remote') => void
}): JSX.Element {
  const [revealed, setRevealed] = useState<string | null>(null)
  const [left, setLeft] = useState(0)
  const [pwdCopied, flashPwd] = useFlash()
  const [userCopied, flashUser] = useFlash()

  // Auto-hide after 20 s, with a visible countdown.
  useEffect(() => {
    if (revealed === null) return
    const until = Date.now() + REVEAL_MS
    setLeft(Math.ceil(REVEAL_MS / 1000))
    const t = setInterval(() => {
      const s = Math.ceil((until - Date.now()) / 1000)
      if (s <= 0) { setRevealed(null); clearInterval(t) } else setLeft(s)
    }, 250)
    return () => clearInterval(t)
  }, [revealed])

  const toggleReveal = async (): Promise<void> => {
    if (revealed !== null) { setRevealed(null); return }
    const r = await withSecret(() => credentialsApi.reveal(c.id))
    if (r) setRevealed(r.password)
  }

  const shownScore = revealed !== null ? estimateStrength(revealed).score : score
  const host = displayHost(c.url)

  return (
    <article className="bg-surface hairline rounded-2xl overflow-hidden">
      <header className="flex items-start gap-4 px-6 pt-6 pb-4">
        <Avatar name={c.nombre} url={c.url} user={c.usuario} size={52} />
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="t-title2 text-on-surface truncate">{c.nombre}</h1>
            <button
              onClick={onToggleFavorite}
              className={`ui-btn ui-btn-ghost ui-btn-icon rounded-lg shrink-0 ${favorite ? 'text-primary' : 'text-on-surface-variant'}`}
              title={favorite ? 'Quitar de favoritas' : 'Marcar como favorita'}
              aria-label={favorite ? 'Quitar de favoritas' : 'Marcar como favorita'}
              aria-pressed={favorite}
            >
              <Pop active={favorite}><Star size={16} weight={favorite ? 'fill' : 'regular'} /></Pop>
            </button>
          </div>
          <div className="flex items-center gap-2 mt-1 min-w-0 flex-wrap">
            {c.url && (
              <a href={absoluteUrl(c.url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 t-footnote text-primary hover:underline truncate">
                {host} <ExternalLink size={12} /> <span className="sr-only">Abrir sitio</span>
              </a>
            )}
            {c.categoria && <Badge>{c.categoria}</Badge>}
            {c.pending && (
              <span className="inline-flex items-center gap-1 t-caption text-warning" title="Guardada en esta computadora; se sube cuando haya conexión">
                <CloudUpload size={12} /> Pendiente de sincronizar
              </span>
            )}
            {c.e2e && (
              <button
                type="button"
                onClick={onOpenSync}
                className={`inline-flex items-center gap-1 t-caption rounded-[6px] hairline px-2 py-0.5 hover:bg-on-surface/4 transition-colors ${
                  c.e2e === 'synced' ? 'text-success' : c.e2e === 'remote' ? 'text-primary' : c.e2e === 'conflict' ? 'text-warning' : 'text-on-surface-variant'
                }`}
                title={E2E_ITEM_LABEL[c.e2e].hint}
              >
                {c.e2e === 'synced' ? <CloudCheck size={12} /> : c.e2e === 'remote' ? <ArrowDownToLine size={12} />
                  : c.e2e === 'conflict' ? <TriangleAlert size={12} /> : <Monitor size={12} />}
                {E2E_ITEM_LABEL[c.e2e].label}
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onDelete} className="ui-btn ui-btn-ghost ui-btn-icon rounded-lg hover:text-error" title="Eliminar (Supr)" aria-label="Eliminar">
            <Trash2 size={16} />
          </button>
          <button onClick={onEdit} className="ui-btn ui-btn-outline"><Pencil size={13} /> Editar</button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 px-6 pb-6">
        <button onClick={() => { onCopyPassword(); flashPwd() }} disabled={!c.hasPassword} className="ui-btn ui-btn-primary" title="Copiar contraseña (Enter)">
          <CopyGlyph copied={pwdCopied} size={13} className={pwdCopied ? 'text-current!' : ''} /> {pwdCopied ? 'Copiada' : 'Copiar contraseña'}
        </button>
        <button onClick={() => { onCopyUser(); flashUser() }} disabled={!c.usuario} className="ui-btn ui-btn-outline" title="Copiar usuario (Shift+Enter)">
          <CopyGlyph copied={userCopied} size={13} /> {userCopied ? 'Copiado' : 'Copiar usuario'}
        </button>
        {c.url && c.hasPassword && (
          <button onClick={onOpenAndCopy} className="ui-btn ui-btn-ghost">
            <ExternalLink size={13} /> Abrir sitio y copiar contraseña
          </button>
        )}
      </div>

      <div className={SECTION}>Acceso</div>
      <div className="hairline-t divide-y divide-(--hairline)">
        <DetailRow label="Usuario" actions={c.usuario ? <RowCopy value={c.usuario} label="Copiar usuario" /> : undefined}>
          {c.usuario ? <span className="select-all break-all">{c.usuario}</span> : <span className="text-on-surface-variant">—</span>}
        </DetailRow>

        <DetailRow
          label="Contraseña"
          actions={c.hasPassword ? (
            <>
              {revealed !== null && <span className="t-caption tabular-nums text-on-surface-variant mr-1" title="Se oculta sola">{left} s</span>}
              <button
                onClick={() => void toggleReveal()}
                className="ui-btn ui-btn-ghost ui-btn-icon rounded-lg"
                title={revealed !== null ? 'Ocultar' : 'Mostrar'}
                aria-label={revealed !== null ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {revealed !== null ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button onClick={onCopyPassword} className="ui-btn ui-btn-ghost ui-btn-icon rounded-lg" title="Copiar contraseña" aria-label="Copiar contraseña">
                <Copy size={14} />
              </button>
            </>
          ) : undefined}
        >
          {c.hasPassword ? (
            <div className="flex flex-col gap-1.5 py-1">
              <span className={`break-all ${revealed !== null ? 'font-mono t-footnote select-all' : 'select-none tracking-[0.2em] text-on-surface-variant'}`}>
                {revealed !== null ? revealed : '••••••••••••'}
              </span>
              {shownScore !== undefined && <StrengthMeter score={shownScore} />}
            </div>
          ) : (
            c.e2e === 'remote' ? (
              <button type="button" onClick={onOpenSync} className="t-body text-primary hover:underline text-left">
                Guardada desde otra computadora — desbloqueá la sincronización para traerla
              </button>
            ) : (
              <span className="text-on-surface-variant" title="No hay contraseña guardada en esta computadora">Sin contraseña</span>
            )
          )}
        </DetailRow>

        {c.e2e === 'conflict' && (
          <div className="flex flex-col gap-2.5 px-6 py-3 bg-warning/6">
            <div className="flex items-start gap-2.5">
              <TriangleAlert size={15} className="text-warning mt-px shrink-0" />
              <p className="t-footnote text-on-surface">
                La contraseña de esta computadora no coincide con la sincronizada y no se sabe cuál es más nueva.
                No se cambió nada: elegí cuál queda.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 pl-[25px]">
              <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => onResolveConflict?.('local')}>Usar la de esta PC</button>
              <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => onResolveConflict?.('remote')}>Usar la sincronizada</button>
            </div>
          </div>
        )}

        {(reusedWith.length > 0 || weak) && (
          <div className="flex items-start gap-2.5 px-6 py-3 bg-warning/6">
            <ShieldAlert size={15} className="text-warning mt-px shrink-0" />
            <p className="t-footnote text-on-surface">
              {reusedWith.length > 0 && <>La misma contraseña se usa en {reusedWith.join(', ')}. </>}
              {weak && 'Es una contraseña débil. '}
              Conviene cambiarla.
            </p>
          </div>
        )}

        <DetailRow
          label="Sitio web"
          actions={c.url ? (
            <>
              <RowCopy value={c.url} label="Copiar URL" />
              <a href={absoluteUrl(c.url)} target="_blank" rel="noreferrer" className="ui-btn ui-btn-ghost ui-btn-icon rounded-lg" title="Abrir sitio" aria-label="Abrir sitio">
                <ExternalLink size={14} />
              </a>
            </>
          ) : undefined}
        >
          {c.url ? <span className="break-all">{c.url}</span> : <span className="text-on-surface-variant">—</span>}
        </DetailRow>

        <DetailRow label="Categoría">
          {c.categoria ? c.categoria : <span className="text-on-surface-variant">—</span>}
        </DetailRow>
      </div>

      {c.notas && (
        <>
          <div className={`${SECTION} pt-4`}>Notas</div>
          <div className="hairline-t px-6 pt-3 pb-5">
            <div className="group relative rounded-xl bg-surface-container dark:bg-white/4 px-4 py-3 pr-12 t-body text-on-surface whitespace-pre-wrap wrap-break-word">
              {c.notas}
              <div className="absolute top-1.5 right-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                <RowCopy value={c.notas} label="Copiar notas" />
              </div>
            </div>
          </div>
        </>
      )}

      <footer className="hairline-t px-6 py-3 t-caption text-on-surface-variant">
        {usageHint(usage.useCount, relativeTime(usage.lastUsedAt)) || 'Todavía no la usaste desde acá'}
      </footer>
    </article>
  )
}

// ── Edit (inline) ─────────────────────────────────────────────────────────────

export function CredentialEditor({
  initial, categories, nextOrden, nameOf, onCancel, onSave,
}: {
  /** null = new credential */
  initial: Credential | null
  categories: string[]
  nextOrden: number
  nameOf: (id: string) => string | undefined
  onCancel: () => void
  onSave: (draft: CredentialDraft) => Promise<boolean>
}): JSX.Element {
  const [nombre, setNombre] = useState(initial?.nombre ?? '')
  const [usuario, setUsuario] = useState(initial?.usuario ?? '')
  const [password, setPassword] = useState('')
  const [dirty, setDirty] = useState(!initial)
  const [locked, setLocked] = useState(false)
  const [url, setUrl] = useState(initial?.url ?? '')
  const [categoria, setCategoria] = useState(initial?.categoria ?? '')
  const [notas, setNotas] = useState(initial?.notas ?? '')
  const [showPass, setShowPass] = useState(false)
  const [genOpen, setGenOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reused, setReused] = useState<string[]>([])
  const formRef = useRef<HTMLFormElement>(null)

  // Load the current password for editing (no PIN prompt here: if locked, it stays "sin cambios").
  useEffect(() => {
    if (!initial?.hasPassword) return
    let alive = true
    credentialsApi.reveal(initial.id)
      .then((r) => { if (!alive) return; if (r.ok) setPassword(r.password); else setLocked(true) })
      .catch(() => { if (alive) setLocked(true) })
    return () => { alive = false }
  }, [initial])

  // Duplicate-password warning (compared in main against the vault).
  useEffect(() => {
    if (!password) { setReused([]); return }
    const t = setTimeout(() => {
      credentialsApi.checkReuse(password, initial?.id)
        .then((ids) => setReused(ids.map((id) => nameOf(id) ?? '').filter(Boolean)))
        .catch(() => setReused([]))
    }, 350)
    return () => clearTimeout(t)
  }, [password, initial, nameOf])

  const strength = password ? estimateStrength(password) : null

  const submit = async (e?: React.FormEvent): Promise<void> => {
    e?.preventDefault()
    if (!nombre.trim() || saving) return
    setSaving(true)
    const ok = await onSave({
      id: initial?.id ?? crypto.randomUUID(),
      nombre: nombre.trim(),
      usuario: usuario.trim(),
      ...(dirty ? { password } : {}),
      url: url.trim() || undefined,
      categoria: categoria.trim() || undefined,
      notas: notas.trim() || undefined,
      orden: initial?.orden ?? nextOrden,
    })
    if (!ok) setSaving(false)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 's' || e.key === 'Enter')) { e.preventDefault(); void submit() }
    else if (e.key === 'Escape' && !genOpen) { e.preventDefault(); onCancel() }
  }

  return (
    <article className="bg-surface hairline rounded-2xl shadow-sm">
      <header className="flex items-center gap-4 px-6 pt-6 pb-4">
        <Avatar name={nombre || '?'} url={url} user={usuario} size={56} />
        <div className="flex-1 min-w-0">
          <h1 className="t-title2 text-on-surface truncate">{initial ? 'Editar credencial' : 'Nueva credencial'}</h1>
          <p className="t-footnote text-on-surface-variant mt-0.5">Ctrl+S guarda · Esc cancela</p>
        </div>
      </header>
      <form ref={formRef} onSubmit={(e) => void submit(e)} onKeyDown={onKeyDown} className="flex flex-col gap-4 px-6 pb-5">
        <Field label="Sitio o servicio">
          <input autoFocus className="ui-input w-full" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Jira, VPN, SQL QA" maxLength={200} />
        </Field>
        <Field label="Usuario o email">
          <input className="ui-input w-full" value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="usuario@dominio.com" autoComplete="off" maxLength={500} />
        </Field>
        <Field label="Contraseña">
          <div className="relative">
            <div className="ui-input w-full flex items-center gap-1 py-0 pr-1">
              <input
                className="flex-1 min-w-0 bg-transparent outline-hidden py-[5px] font-mono"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setDirty(true) }}
                placeholder={locked && !dirty ? 'Sin cambios (bloqueada) — escribí para reemplazarla' : ''}
                autoComplete="new-password"
                maxLength={500}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="ui-btn ui-btn-ghost ui-btn-icon"
                aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                title={showPass ? 'Ocultar' : 'Mostrar'}
              >
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                type="button"
                onClick={() => setGenOpen((v) => !v)}
                className="ui-btn ui-btn-ghost ui-btn-icon"
                aria-label="Generar contraseña"
                title="Generar contraseña"
                aria-expanded={genOpen}
              >
                <Wand2 size={14} />
              </button>
            </div>
            {genOpen && (
              <PasswordGenerator
                onClose={() => setGenOpen(false)}
                onUse={(pwd) => { setPassword(pwd); setDirty(true); setShowPass(true) }}
              />
            )}
          </div>
          {strength && (
            <div className="mt-2 flex flex-col gap-1">
              <StrengthMeter score={strength.score} />
              {strength.warnings[0] && <p className="t-caption text-on-surface-variant">{strength.warnings[0]}</p>}
            </div>
          )}
          {reused.length > 0 && (
            <p className="mt-1.5 flex items-center gap-1.5 t-caption text-warning">
              <ShieldAlert size={12} /> Ya usás esta contraseña en {reused.join(', ')}.
            </p>
          )}
        </Field>
        <Field label="URL">
          <input className="ui-input w-full" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" maxLength={2000} />
        </Field>
        <Field label="Categoría" hint="Opcional. Agrupa la lista (Trabajo, Personal…).">
          <input className="ui-input w-full" value={categoria} onChange={(e) => setCategoria(e.target.value)} list="credential-categories" placeholder="Trabajo" maxLength={100} />
          <datalist id="credential-categories">
            {categories.map((cat) => <option key={cat} value={cat} />)}
          </datalist>
        </Field>
        <Field label="Notas">
          <textarea className="ui-input w-full resize-y" rows={4} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Datos extra: IDs de cuenta, servidor, etc." maxLength={5000} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="ui-btn ui-btn-outline" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="ui-btn ui-btn-primary" disabled={!nombre.trim() || saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </article>
  )
}
