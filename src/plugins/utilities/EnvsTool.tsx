import { useCallback, useEffect, useState } from 'react'
import { Check, FolderSearch, Pencil, Plus, Server, Trash2, X } from 'lucide-react'
import { useToast } from '../../core/components/Toast'
import { Modal } from '../../core/components/Modal'
import { detectEnv, type EnvChange, type EnvTarget, type WigosEnv } from './envs'

type Current = { path: string; exists: boolean; values: { principal: string; mirror: string; dbId: string } | null }
type Config = { envs: WigosEnv[]; targets: EnvTarget[]; root?: string; current?: Current[] }
type Preview = { path: string; kind: EnvTarget['kind']; exists: boolean; changes: EnvChange[]; error?: string }

const invoke = <T,>(ch: string, ...args: unknown[]): Promise<T> => window.api.invoke<T>(ch, ...args)
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const base = (p: string): string => p.split(/[\\/]/).pop() ?? p
/** "…\\WSI.WigosGUI\\bin\\Debug\\WigosGUI.cfg" → "WSI.WigosGUI · WigosGUI.cfg" (lo que identifica al archivo). */
function shortName(p: string): string {
  const parts = p.split(/[\\/]/)
  const file = parts.pop() ?? p
  const project = parts.reverse().find((x) => !/^(bin|debug|release|properties|x86|x64|net\d.*)$/i.test(x))
  return project ? `${project} · ${file}` : file
}
const KIND_LABEL: Record<EnvTarget['kind'], string> = { cfg: '.cfg', 'csproj-user': 'Argumentos (VS)', 'launch-settings': 'Argumentos (launchSettings)' }
const newId = (): string => Math.random().toString(36).slice(2, 10)

/**
 * Utilidades → Ambientes: cambiar de una vez la IP y la base en los .cfg y en los
 * argumentos de inicio de Visual Studio. Antes de escribir se ve qué cambia en cada archivo.
 * `initial`: id de un ambiente para abrir directo su vista previa (desde Ctrl+K).
 */
export function EnvsTool({ initial }: { initial: string }): JSX.Element {
  const toast = useToast()
  const [cfg, setCfg] = useState<Config | null>(null)
  const [editing, setEditing] = useState<WigosEnv | null>(null)
  const [previewing, setPreviewing] = useState<{ env: WigosEnv; items: Preview[]; picked: Set<string> } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [found, setFound] = useState<EnvTarget[] | null>(null)

  const load = useCallback(async (): Promise<Config | null> => {
    try { const c = await invoke<Config>('envs:get'); setCfg(c); return c } catch (e) { toast.show(errMsg(e), 'error'); return null }
  }, [toast])
  const save = async (next: Config): Promise<void> => {
    try { await invoke('envs:save', { envs: next.envs, targets: next.targets, root: next.root }); await load() } catch (e) { toast.show(errMsg(e), 'error') }
  }

  const openPreview = useCallback(async (env: WigosEnv): Promise<void> => {
    try {
      const items = await invoke<Preview[]>('envs:preview', env.id)
      setPreviewing({ env, items, picked: new Set(items.filter((i) => i.changes.length).map((i) => i.path)) })
    } catch (e) { toast.show(errMsg(e), 'error') }
  }, [toast])

  useEffect(() => {
    void load().then((c) => {
      const env = initial && c?.envs.find((x) => x.id === initial)
      if (env) void openPreview(env)
    })
  }, [load, openPreview, initial])

  if (!cfg) return <p className="t-footnote text-on-surface-variant">Cargando…</p>

  const firstCfg = cfg.current?.find((c) => c.values)?.values ?? null
  const active = detectEnv(firstCfg, cfg.envs)

  const apply = async (): Promise<void> => {
    if (!previewing) return
    try {
      const r = await invoke<{ changed: number; failed: string[] }>('envs:apply', previewing.env.id, [...previewing.picked])
      toast.show(r.failed.length ? `${r.changed} archivos actualizados · no se pudo: ${r.failed.join(', ')}` : `Ambiente ${previewing.env.name}: ${r.changed} ${r.changed === 1 ? 'archivo actualizado' : 'archivos actualizados'}`, r.failed.length ? 'warning' : 'success')
      setPreviewing(null)
      void load()
    } catch (e) { toast.show(errMsg(e), 'error') }
  }

  const scan = async (): Promise<void> => {
    const root = cfg.root ?? await invoke<string | null>('envs:pick-root')
    if (!root) return
    setScanning(true)
    try {
      const list = await invoke<EnvTarget[]>('envs:scan', root)
      const known = new Set(cfg.targets.map((t) => t.path.toLowerCase()))
      setFound(list.filter((t) => !known.has(t.path.toLowerCase())))
      if (root !== cfg.root) void save({ ...cfg, root })
    } catch (e) { toast.show(errMsg(e), 'error') } finally { setScanning(false) }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Ambiente actual (según el primer .cfg de la lista) */}
      <div className="flex items-center gap-3 ui-card px-4 py-3">
        <span className="grid place-items-center w-9 h-9 rounded-(--r-md) bg-primary/12 text-primary shrink-0"><Server size={17} /></span>
        <div className="flex-1 min-w-0">
          <div className="t-caption text-on-surface-variant">Ahora apuntás a</div>
          <div className="t-body font-semibold text-on-surface truncate">
            {active ? active.name : firstCfg ? <span className="font-mono">{firstCfg.principal}{firstCfg.dbId ? ` · base ${firstCfg.dbId}` : ''}</span> : 'Agregá tus archivos para verlo'}
          </div>
        </div>
        {firstCfg && !active && (
          <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => setEditing({ id: newId(), name: '', principal: firstCfg.principal, mirror: firstCfg.mirror === firstCfg.principal ? '' : firstCfg.mirror, dbId: firstCfg.dbId })}>
            Guardar como ambiente
          </button>
        )}
      </div>

      {/* Ambientes */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className="t-section flex-1">Ambientes</h3>
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => setEditing({ id: newId(), name: '', principal: '', mirror: '', dbId: '' })}><Plus size={13} /> Nuevo</button>
        </div>
        {cfg.envs.length === 0 ? (
          <p className="t-footnote text-on-surface-variant">Todavía no hay ambientes. Creá uno con su IP y base (QA, STG, local…).</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5">
            {cfg.envs.map((e) => {
              const on = active?.id === e.id
              return (
                <div key={e.id} className={`group ui-card p-3 flex flex-col gap-2 ${on ? 'ring-1 ring-primary/40' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 min-w-0 t-body font-semibold text-on-surface truncate">{e.name}</span>
                    {on && <span className="h-[18px] px-1.5 rounded-[5px] bg-primary/12 text-primary text-[10.5px] font-semibold leading-[18px]">Actual</span>}
                    <button type="button" title="Editar" aria-label="Editar" className="ui-btn ui-btn-ghost ui-btn-icon w-6! h-6! opacity-0 group-hover:opacity-100" onClick={() => setEditing(e)}><Pencil size={12} /></button>
                    <button type="button" title="Borrar" aria-label="Borrar" className="ui-btn ui-btn-ghost ui-btn-icon w-6! h-6! opacity-0 group-hover:opacity-100 hover:text-error"
                      onClick={() => void save({ ...cfg, envs: cfg.envs.filter((x) => x.id !== e.id) })}><Trash2 size={12} /></button>
                  </div>
                  <div className="font-mono text-[12px] text-on-surface-variant truncate">{e.principal}{e.dbId ? ` · ${e.dbId}` : ''}</div>
                  <button type="button" className={`ui-btn ui-btn-sm ${on ? 'ui-btn-ghost' : 'ui-btn-primary'}`} disabled={!cfg.targets.length} onClick={() => void openPreview(e)}>
                    {on ? 'Volver a aplicar' : 'Aplicar'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Archivos que se tocan */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className="t-section flex-1">Archivos que se cambian ({cfg.targets.length})</h3>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" disabled={scanning} onClick={() => void scan()}
            title={cfg.root ? `Buscar en ${cfg.root}` : 'Elegir la carpeta del workspace'}>
            <FolderSearch size={13} /> {scanning ? 'Buscando…' : cfg.root ? 'Buscar archivos' : 'Elegir carpeta y buscar'}
          </button>
          {cfg.root && <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => void invoke<string | null>('envs:pick-root').then((r) => { if (r) void save({ ...cfg, root: r }) })}>Otra carpeta</button>}
        </div>
        {cfg.targets.length === 0 ? (
          <p className="t-footnote text-on-surface-variant">Buscá en la carpeta del workspace: encuentra los .cfg con DBPrincipal y los proyectos con /dbprincipal en los argumentos de inicio.</p>
        ) : (
          <div className="ui-card divide-y divide-(--hairline)">
            {cfg.targets.map((t) => {
              const cur = cfg.current?.find((c) => c.path === t.path)
              return (
                <div key={t.path} className="group flex items-center gap-3 px-3 h-10">
                  <span className="shrink-0 w-[150px] t-caption text-on-surface-variant truncate">{KIND_LABEL[t.kind]}</span>
                  <span className="flex-1 min-w-0 t-footnote text-on-surface truncate" title={t.path}>{shortName(t.path)}</span>
                  {cur && !cur.exists && <span className="t-caption text-warning">No existe</span>}
                  {cur?.values && <span className="font-mono text-[11.5px] text-on-surface-variant truncate max-w-[200px]">{cur.values.principal}</span>}
                  <button type="button" title="Quitar de la lista" aria-label="Quitar" className="ui-btn ui-btn-ghost ui-btn-icon w-6! h-6! opacity-0 group-hover:opacity-100"
                    onClick={() => void save({ ...cfg, targets: cfg.targets.filter((x) => x.path !== t.path) })}><X size={12} /></button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Encontrados al buscar: elegir cuáles agregar */}
      {found && (
        <FoundSheet found={found} onClose={() => setFound(null)}
          onAdd={(list) => { setFound(null); void save({ ...cfg, targets: [...cfg.targets, ...list] }) }} />
      )}

      {editing && (
        <EnvEditor env={editing} onClose={() => setEditing(null)}
          onSave={(e) => { setEditing(null); const exists = cfg.envs.some((x) => x.id === e.id); void save({ ...cfg, envs: exists ? cfg.envs.map((x) => (x.id === e.id ? e : x)) : [...cfg.envs, e] }) }} />
      )}

      {/* Vista previa antes de escribir */}
      <Modal open={!!previewing} onClose={() => setPreviewing(null)} width={680}
        title={previewing ? `Aplicar ${previewing.env.name}` : ''}
        subtitle="Revisá qué cambia en cada archivo. Antes de escribir se guarda una copia."
        footer={previewing && (
          <>
            <span className="flex-1 t-caption text-on-surface-variant">{previewing.picked.size} {previewing.picked.size === 1 ? 'archivo' : 'archivos'}</span>
            <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setPreviewing(null)}>Cancelar</button>
            <button type="button" className="ui-btn ui-btn-primary" disabled={!previewing.picked.size} onClick={() => void apply()}><Check size={14} /> Aplicar</button>
          </>
        )}>
        {previewing && (
          <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto">
            {previewing.items.map((it) => (
              <label key={it.path} className={`flex items-start gap-3 rounded-(--r-md) ring-1 ring-(--hairline) px-3 py-2.5 ${it.changes.length ? 'cursor-pointer' : 'opacity-60'}`}>
                <input type="checkbox" className="mt-0.5 accent-(--color-primary)" disabled={!it.changes.length} checked={previewing.picked.has(it.path)}
                  onChange={() => setPreviewing((p) => { if (!p) return p; const s = new Set(p.picked); if (s.has(it.path)) s.delete(it.path); else s.add(it.path); return { ...p, picked: s } })} />
                <span className="flex-1 min-w-0">
                  <span className="block t-footnote font-medium text-on-surface truncate" title={it.path}>{shortName(it.path)}</span>
                  {!it.exists ? <span className="t-caption text-warning">El archivo ya no existe</span>
                    : it.error ? <span className="t-caption text-error">{it.error}</span>
                    : !it.changes.length ? <span className="t-caption text-on-surface-variant">Ya está en este ambiente</span>
                    : it.changes.map((c, i) => (
                      <span key={i} className="flex items-center gap-1.5 t-caption font-mono">
                        <span className="text-on-surface-variant w-[150px] truncate">{c.label}</span>
                        <span className="text-on-surface-variant line-through truncate">{c.from || '—'}</span>
                        <span className="text-on-surface-variant">→</span>
                        <span className="text-success font-medium truncate">{c.to}</span>
                      </span>
                    ))}
                </span>
              </label>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}

function EnvEditor({ env, onClose, onSave }: { env: WigosEnv; onClose: () => void; onSave: (e: WigosEnv) => void }): JSX.Element {
  const [d, setD] = useState(env)
  const ok = d.name.trim() && d.principal.trim()
  const input = 'ui-input w-full h-[34px] font-mono text-[12.5px]'
  return (
    <Modal open onClose={onClose} width={480} title={env.name ? `Editar ${env.name}` : 'Nuevo ambiente'}
      footer={<><span className="flex-1" /><button type="button" className="ui-btn ui-btn-ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="ui-btn ui-btn-primary" disabled={!ok} onClick={() => onSave({ ...d, name: d.name.trim(), principal: d.principal.trim(), mirror: d.mirror.trim(), dbId: d.dbId.trim() })}>Guardar</button></>}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5"><span className="t-footnote font-medium text-on-surface-variant">Nombre</span>
          <input autoFocus className="ui-input w-full h-[34px]" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="QA, STG, Local…" /></label>
        <label className="flex flex-col gap-1.5"><span className="t-footnote font-medium text-on-surface-variant">Servidor principal (IP,puerto)</span>
          <input className={input} value={d.principal} onChange={(e) => setD({ ...d, principal: e.target.value })} placeholder="13.38.6.166,44058" spellCheck={false} /></label>
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <label className="flex flex-col gap-1.5"><span className="t-footnote font-medium text-on-surface-variant">Espejo</span>
            <input className={input} value={d.mirror} onChange={(e) => setD({ ...d, mirror: e.target.value })} placeholder="igual al principal" spellCheck={false} /></label>
          <label className="flex flex-col gap-1.5"><span className="t-footnote font-medium text-on-surface-variant">DBId</span>
            <input className={input} value={d.dbId} onChange={(e) => setD({ ...d, dbId: e.target.value })} placeholder="000" spellCheck={false} /></label>
        </div>
        <p className="t-caption text-on-surface-variant">En los .cfg cambia DBPrincipal, DBMirror y DBId; en los argumentos, /dbprincipal, /dbmirror y /dbid (también _second). Nada más.</p>
      </div>
    </Modal>
  )
}

function FoundSheet({ found, onClose, onAdd }: { found: EnvTarget[]; onClose: () => void; onAdd: (list: EnvTarget[]) => void }): JSX.Element {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(found.map((f) => f.path)))
  return (
    <Modal open onClose={onClose} width={640} title={found.length ? `Se encontraron ${found.length} archivos` : 'No se encontraron archivos nuevos'}
      subtitle={found.length ? 'Elegí cuáles cambiar al aplicar un ambiente.' : 'Los que tienen DBPrincipal o /dbprincipal ya están en la lista, o no hay en esa carpeta.'}
      footer={<><span className="flex-1" /><button type="button" className="ui-btn ui-btn-ghost" onClick={onClose}>Cerrar</button>
        {found.length > 0 && <button type="button" className="ui-btn ui-btn-primary" disabled={!picked.size} onClick={() => onAdd(found.filter((f) => picked.has(f.path)))}>Agregar {picked.size}</button>}</>}>
      <div className="flex flex-col max-h-[55vh] overflow-y-auto">
        {found.map((f) => (
          <label key={f.path} className="flex items-center gap-3 px-1 h-9 cursor-pointer hover:bg-on-surface/[0.03] rounded-(--r-sm)">
            <input type="checkbox" className="accent-(--color-primary)" checked={picked.has(f.path)}
              onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(f.path)) n.delete(f.path); else n.add(f.path); return n })} />
            <span className="w-[150px] shrink-0 t-caption text-on-surface-variant">{KIND_LABEL[f.kind]}</span>
            <span className="flex-1 min-w-0 t-footnote text-on-surface truncate" title={f.path}>{shortName(f.path)}</span>
            <span className="t-caption text-on-surface-variant/70 truncate max-w-[200px]">{base(f.path.replace(/[\\/][^\\/]+$/, ''))}</span>
          </label>
        ))}
      </div>
    </Modal>
  )
}
