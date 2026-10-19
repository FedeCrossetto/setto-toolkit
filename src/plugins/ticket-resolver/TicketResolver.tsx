import { useState, useEffect, useCallback } from 'react'
import {
  Brain, Check, CheckCircle2, CircleAlert, ClipboardList, Code2, Copy,
  FileText, FolderOpen, Pencil, Play, Plus, RotateCcw, Save, Search,
  Settings, Sparkles, Ticket, TriangleAlert, Wrench, X, ChevronRight,
} from 'lucide-react'
import type {
  JiraTicket, AnalysisPlan, AnalysisResult, CodeSnippet,
  HistoryEntry, Phase, AnalysisStepUI, DiffChunk, TicketComment,
} from './types'
import type { IconComponent } from '../../core/types'
import { Modal, Sheet } from '../../core/components/Modal'
import { SegmentedControl } from '../../core/components/SegmentedControl'

// ── Helpers ────────────────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)  return 'ahora'
  if (m < 60) return `hace ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h}h`
  const d = Math.floor(h / 24)
  if (d < 7)  return `hace ${d}d`
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short' })
}

// ── CSS animations (injected once) ────────────────────────────────────────────
const TR_STYLES = `
@keyframes tr-fadein  { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
@keyframes tr-shimmer { 0%,100%{ opacity:.35 } 50%{ opacity:.75 } }
@keyframes tr-pop     { 0%{ transform:scale(.8); opacity:0 } 60%{ transform:scale(1.1) } 100%{ transform:scale(1); opacity:1 } }
@keyframes tr-pulse   { 0%,100%{ opacity:.5 } 50%{ opacity:1 } }
.tr-fadein  { animation: tr-fadein  .3s ease both }
.tr-shimmer { animation: tr-shimmer 1.8s ease-in-out infinite }
.tr-pop     { animation: tr-pop     .28s ease both }
.tr-pulse   { animation: tr-pulse   2s ease-in-out infinite }
`

// ── Display config ─────────────────────────────────────────────────────────────
type FontSize   = 'small' | 'normal' | 'large'
type Density    = 'compact' | 'comfortable'
type LineHeight = 'tight' | 'normal' | 'relaxed'
type FontFamily = 'system' | 'sans' | 'mono' | 'serif'

interface DisplayCfg { fontSize: FontSize; density: Density; lineHeight: LineHeight; fontFamily: FontFamily }

const FONT_PX:        Record<FontSize,   string> = { small: '12px',  normal: '13px',  large: '15px'  }
const PAD_PX:         Record<Density,    string> = { compact: '12px', comfortable: '20px' }
const LINE_MAP:       Record<LineHeight, string> = { tight: '1.4',   normal: '1.6',   relaxed: '1.85' }
const FONT_FAMILY_MAP: Record<FontFamily, string> = {
  system: 'inherit',
  sans:   "'Inter', 'Segoe UI', ui-sans-serif, sans-serif",
  mono:   "'Consolas', 'JetBrains Mono', 'Courier New', monospace",
  serif:  "'Georgia', 'Times New Roman', serif",
}
const FONT_SIZE_ORDER: FontSize[] = ['small', 'normal', 'large']

const DEFAULT_DISPLAY: DisplayCfg = { fontSize: 'normal', density: 'comfortable', lineHeight: 'normal', fontFamily: 'system' }

// ── Session usage ──────────────────────────────────────────────────────────────
interface SessionUsage { inputTokens:number; outputTokens:number; calls:number; contextWindowSize:number }

function TokenCounter({ usage, onReset }: { usage:SessionUsage; onReset:()=>void }): JSX.Element {
  const total = usage.inputTokens + usage.outputTokens
  const pct   = Math.min((total / usage.contextWindowSize) * 100, 100)
  const fmt   = (n:number) => n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n)
  if (usage.calls === 0) return <></>
  return (
    <div className="flex items-center gap-2 t-footnote text-on-surface-variant shrink-0">
      <Ticket size={13} />
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-primary font-semibold">{fmt(total)}</span>
          <span>tok</span>
          <span className="text-on-surface-variant/60">·</span>
          <span className="text-on-surface-variant/60">↑{fmt(usage.inputTokens)} ↓{fmt(usage.outputTokens)}</span>
          <span className="text-on-surface-variant/60">·</span>
          <span>{pct.toFixed(1)}%</span>
        </div>
        <div className="w-20 h-1 bg-on-surface/8 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
            style={{width:`${Math.max(pct,pct>0?3:0)}%`, background:pct>80?'rgb(var(--c-error))':pct>50?'rgb(var(--c-warning))':'rgb(var(--c-primary))'}} />
        </div>
      </div>
      <button onClick={onReset} title="Reiniciar contador de la sesión" aria-label="Reiniciar contador de la sesión" className="ui-btn ui-btn-ghost ui-btn-icon">
        <RotateCcw size={13} />
      </button>
    </div>
  )
}

// ── Config shape ───────────────────────────────────────────────────────────────
interface ConfigValues { jiraUrl:string; jiraUser:string; jiraToken:string; repoPath:string; projectPrefix:string }

// ── Priority ───────────────────────────────────────────────────────────────────
const PRIORITY_COLOR: Record<string,string> = {
  Highest:'text-error', High:'text-warning', Medium:'text-warning', Low:'text-success', Lowest:'text-on-surface-variant',
}
const PRIORITY_BG: Record<string,string> = {
  Highest:'bg-error', High:'bg-warning', Medium:'bg-warning', Low:'bg-success', Lowest:'bg-on-surface-variant',
}

// ── Spinner ────────────────────────────────────────────────────────────────────
function Spinner({ size=16 }: { size?:number }): JSX.Element {
  return (
    <svg className="animate-spin shrink-0 text-primary" style={{width:size,height:size}} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skel({ h='h-4', w='w-full', className='' }: { h?:string; w?:string; className?:string }): JSX.Element {
  return <div className={`${h} ${w} rounded-lg bg-on-surface/6 tr-shimmer ${className}`} />
}

// ── Diff view ──────────────────────────────────────────────────────────────────
function DiffView({ diff }: { diff:DiffChunk[] }): JSX.Element {
  if (diff.length === 0) return <></>
  return (
    <div className="flex flex-col gap-2.5 mt-4">
      {diff.map((chunk, i) => (
        <div key={i} className="rounded-xl overflow-hidden hairline t-footnote font-mono tr-fadein">
          <div className="px-3 py-1.5 text-on-surface-variant t-caption hairline-b truncate flex items-center gap-2">
            <FileText size={11} />
            {chunk.file} · línea {chunk.lineStart}
          </div>
          <div className="bg-error/8 px-3 py-2 whitespace-pre-wrap text-error/80 hairline-b">
            {chunk.original.split('\n').map((l,j) => (
              <div key={j}><span className="select-none text-error/30 mr-2">−</span>{l}</div>
            ))}
          </div>
          <div className="bg-success/8 px-3 py-2 whitespace-pre-wrap text-success/80">
            {chunk.modified.split('\n').map((l,j) => (
              <div key={j}><span className="select-none text-success/30 mr-2">+</span>{l}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Ticket detail card ─────────────────────────────────────────────────────────
function TicketDetailCard({ ticket, skeleton, disp }: { ticket?:JiraTicket|null; skeleton?:boolean; disp:DisplayCfg }): JSX.Element {
  const [expanded, setExpanded] = useState(false)

  if (skeleton || !ticket) {
    return (
      <div className="bg-surface hairline rounded-xl overflow-hidden">
        <div className="h-0.5 w-full bg-on-surface/10 tr-shimmer" />
        <div className="px-3 py-3 flex flex-col gap-2">
          <div className="flex gap-2"><Skel h="h-3" w="w-16"/><Skel h="h-3" w="w-12"/></div>
          <Skel h="h-4"/><Skel h="h-4" w="w-3/4"/>
          <div className="flex flex-col gap-1 pt-0.5">
            <Skel h="h-3"/><Skel h="h-3" w="w-5/6"/><Skel h="h-3" w="w-4/6"/>
          </div>
        </div>
      </div>
    )
  }

  const pColor = PRIORITY_COLOR[ticket.priority] ?? 'text-on-surface-variant'
  const pBg    = PRIORITY_BG[ticket.priority]    ?? 'bg-primary/50'
  const desc   = ticket.description ?? ''
  const limit  = 180
  const fmtDate = (iso:string) => {
    if (!iso) return ''
    try { return new Date(iso).toLocaleDateString('es-AR', {day:'2-digit',month:'short',year:'numeric'}) }
    catch { return iso }
  }

  return (
    <div className="bg-surface hairline rounded-xl overflow-hidden tr-fadein">
      <div className={`h-0.5 w-full ${pBg} opacity-75`}/>
      <div className="px-3 py-3">
        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
          <span className="t-footnote font-semibold text-on-surface">{ticket.key}</span>
          {ticket.type && <span className="t-caption px-1.5 py-0.5 rounded-full hairline text-on-surface-variant">{ticket.type}</span>}
          {ticket.priority && <span className={`t-caption font-semibold ${pColor}`}>{ticket.priority}</span>}
          {ticket.status && <span className="fl-chip h-5!">{ticket.status}</span>}
        </div>

        <p className="t-footnote font-semibold text-on-surface leading-snug mb-2">{ticket.summary}</p>

        {desc && (
          <div className="mb-2 bg-surface/50 rounded-lg px-2.5 py-2 hairline">
            <p className="t-footnote text-on-surface-variant/65" style={{lineHeight:LINE_MAP[disp.lineHeight]}}>
              {expanded ? desc : desc.length > limit ? desc.slice(0,limit)+'…' : desc}
            </p>
            {desc.length > limit && (
              <button onClick={()=>setExpanded(e=>!e)} className="t-caption text-primary mt-1 hover:underline">
                {expanded ? 'Ver menos' : 'Ver más'}
              </button>
            )}
          </div>
        )}

        {ticket.components.length > 0 && (
          <div className="flex gap-1 flex-wrap mb-2">
            {ticket.components.map(c=><span key={c} className="fl-chip h-5!">{c}</span>)}
          </div>
        )}

        <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 t-caption">
          {ticket.reporter && <><span className="text-on-surface-variant/60">Informante</span><span className="text-on-surface-variant truncate">{ticket.reporter}</span></>}
          {ticket.assignee && <><span className="text-on-surface-variant/60">Asignado</span><span className="text-on-surface-variant truncate">{ticket.assignee}</span></>}
          {ticket.created  && <><span className="text-on-surface-variant/60">Creado</span><span className="text-on-surface-variant">{fmtDate(ticket.created)}</span></>}
        </div>
      </div>
    </div>
  )
}

// ── Plan card ──────────────────────────────────────────────────────────────────
function PlanCard({ plan, skeleton }: { plan?:AnalysisPlan|null; skeleton?:boolean }): JSX.Element {
  if (skeleton || !plan) {
    return (
      <div className="bg-surface hairline rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-3"><Skel h="h-3" w="w-28"/></div>
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {[0,1,2,3].map(i=><div key={i} className="bg-surface rounded-lg px-2 py-1.5"><Skel h="h-2.5" w="w-12" className="mb-1"/><Skel h="h-3"/></div>)}
        </div>
        <Skel h="h-3"/><Skel h="h-3" w="w-4/5" className="mt-1"/>
      </div>
    )
  }
  return (
    <div className="bg-surface hairline rounded-xl p-3 tr-fadein">
      <div className="flex items-center gap-1.5 mb-3">
        <ClipboardList size={13} className="text-on-surface-variant"/>
        <span className="t-caption font-medium uppercase tracking-[0.08em] text-on-surface-variant/80">Plan de análisis</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        {[{l:'Componente',v:plan.component},{l:'Tecnología',v:plan.technology},{l:'Términos',v:plan.searchTerms.slice(0,3).join(', ')}]
          .map(({l,v})=>(
            <div key={l} className="bg-surface rounded-lg px-2 py-1.5">
              <div className="t-caption font-medium uppercase tracking-[0.08em] text-on-surface-variant/80 mb-0.5">{l}</div>
              <div className="t-footnote font-medium text-on-surface truncate">{v||'—'}</div>
            </div>
          ))}
      </div>
      <div className="mb-2">
        <div className="t-caption font-medium uppercase tracking-[0.08em] text-on-surface-variant/80 mb-1">Problema</div>
        <p className="t-footnote text-on-surface leading-snug">{plan.nature}</p>
      </div>
      {plan.steps.length > 0 && (
        <div>
          <div className="t-caption font-medium uppercase tracking-[0.08em] text-on-surface-variant/80 mb-1.5">Pasos</div>
          <div className="flex flex-col gap-1">
            {plan.steps.map(s=>(
              <div key={s.id} className="flex items-start gap-1.5">
                <span className="shrink-0 w-3.5 h-3.5 rounded-full border border-hairline-strong text-on-surface-variant text-[9px] font-semibold flex items-center justify-center mt-0.5">{s.id}</span>
                <div>
                  <div className="t-footnote font-medium text-on-surface">{s.label}</div>
                  <div className="t-caption text-on-surface-variant">{s.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Analyzing panel ────────────────────────────────────────────────────────────
function AnalyzingPanel({ steps }: { steps:AnalysisStepUI[] }): JSX.Element {
  const doneCount = steps.filter(s=>s.status==='done').length
  const total     = steps.length
  const pct       = total > 0 ? Math.round((doneCount/total)*100) : 0
  const ICONS: Record<string,IconComponent> = { search:Search, analyze:Brain }
  const TITLES: Record<string,string> = { search:'Búsqueda en repositorio', analyze:'Análisis con inteligencia artificial' }

  return (
    <div className="flex flex-col gap-5 tr-fadein">
      {/* Progress header */}
      <div className="bg-surface hairline rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Spinner size={16} />
            <span className="t-body font-semibold text-on-surface">Analizando ticket...</span>
          </div>
          <span className="t-footnote font-bold text-primary tabular-nums">{pct}%</span>
        </div>
        <div className="h-1.5 bg-on-surface/8 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
            style={{width:`${Math.max(pct,pct>0?4:0)}%`, background:'rgb(var(--c-primary))'}} />
        </div>
        <div className="flex gap-1 mt-3">
          {[0,160,320].map(d=><div key={d} className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{animationDelay:`${d}ms`}} />)}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {steps.map(step => {
          const run  = step.status==='running'
          const done = step.status==='done'
          const pend = step.status==='pending'
          const Icon = ICONS[step.id] ?? Pencil
          return (
            <div key={step.id} className={['rounded-xl p-4 border transition-all duration-500',
              run  ? 'bg-surface border-primary/30' : '',
              done ? 'bg-surface border-hairline' : '',
              pend ? 'border-hairline opacity-50' : '',
            ].join(' ')}>
              <div className="flex items-center gap-3">
                <div className={['w-9 h-9 rounded-[10px] border flex items-center justify-center shrink-0 transition-all',
                  run?'border-primary/25':done?'border-success/25':'border-hairline-strong',
                ].join(' ')}>
                  {run  && <Spinner size={18} />}
                  {done && <CheckCircle2 size={18} className="text-success tr-pop" />}
                  {pend && <Icon size={18} className="text-on-surface-variant/60" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`t-footnote font-semibold ${pend?'text-on-surface-variant/60':done?'text-on-surface/70':'text-on-surface'}`}>
                    {TITLES[step.id]??step.label}
                  </div>
                  {step.detail && (
                    <div className={`t-footnote mt-0.5 truncate ${run?'text-primary/55':'text-on-surface-variant'}`}>
                      {step.detail}
                    </div>
                  )}
                </div>
                {done && <span className="t-caption text-success/60 font-semibold shrink-0 tr-fadein">Listo</span>}
                {run  && <span className="t-caption text-primary/50 font-semibold shrink-0 tr-pulse">En progreso</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Comment card ───────────────────────────────────────────────────────────────
function CommentCard({ comment, disp }: { comment:TicketComment; disp:DisplayCfg }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const fullText = `CAUSA DEL ERROR:\n${comment.causa}\n\nSOLUCIÓN:\n${comment.solucion}\n\nCÓMO PROBARLO:\n${comment.comoProbarlo}`
  const copy = () => void navigator.clipboard.writeText(fullText).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1500)})

  return (
    <div className="bg-surface hairline rounded-xl tr-fadein" style={{padding:PAD_PX[disp.density]}}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText size={17} className="text-on-surface-variant" />
          <span className="t-caption font-medium uppercase tracking-[0.08em] text-on-surface-variant/80">Comentario para el ticket</span>
        </div>
        <button onClick={copy} className="ui-btn ui-btn-outline ui-btn-sm">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied?'Copiado':'Copiar todo'}
        </button>
      </div>
      <div className="flex flex-col rounded-xl overflow-hidden hairline">
        {[
          {key:'causa',    label:'Causa del error', color:'text-error',   bg:'bg-error/5',   text:comment.causa},
          {key:'solucion', label:'Solución',        color:'text-success', bg:'bg-success/5', text:comment.solucion},
          {key:'probarlo', label:'Cómo probar',     color:'text-primary',  bg:'bg-primary/5',  text:comment.comoProbarlo},
        ].map(({key,label,color,bg,text},i,arr)=>(
          <div key={key} className={`px-4 py-3.5 ${bg} ${i<arr.length-1?'hairline-b':''}`}>
            <div className={`t-section mb-2 ${color}`}>{label}</div>
            <p className="text-on-surface" style={{fontSize:FONT_PX[disp.fontSize],lineHeight:LINE_MAP[disp.lineHeight]}}>{text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Display settings section ───────────────────────────────────────────────────
function DisplaySettings({ disp, onChange }: { disp:DisplayCfg; onChange:(k:keyof DisplayCfg,v:string)=>void }): JSX.Element {
  const btnCls = (active:boolean) =>
    `flex-1 py-1 t-footnote font-medium rounded-md transition-colors ${active
      ? 'bg-surface dark:bg-white/16 text-on-surface shadow-sm'
      : 'text-on-surface-variant hover:text-on-surface'}`
  const group = 'flex gap-0.5 p-[2px] rounded-lg bg-on-surface/6'

  const FONT_FAMILY_LABELS: Record<FontFamily, string> = {
    system: 'Sistema', sans: 'Sans', mono: 'Mono', serif: 'Serif',
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Font size */}
      <div>
        <div className="t-caption font-medium uppercase tracking-[0.08em] text-on-surface-variant/80 mb-2">Tamaño de texto</div>
        <div className={group}>
          {(['small','normal','large'] as FontSize[]).map(s=>(
            <button key={s} className={btnCls(disp.fontSize===s)} onClick={()=>onChange('fontSize',s)}>
              {s==='small'?'Pequeño':s==='normal'?'Normal':'Grande'}
            </button>
          ))}
        </div>
        <div className="mt-2 px-3 py-2 bg-surface/60 rounded-lg hairline">
          <span className="text-on-surface-variant/60" style={{fontSize:FONT_PX[disp.fontSize],fontFamily:FONT_FAMILY_MAP[disp.fontFamily]}}>
            Vista previa: el texto del módulo tendrá este tamaño y fuente.
          </span>
        </div>
      </div>

      {/* Font family */}
      <div>
        <div className="t-caption font-medium uppercase tracking-[0.08em] text-on-surface-variant/80 mb-2">Tipografía</div>
        <div className={group}>
          {(['system','sans','mono','serif'] as FontFamily[]).map(ff=>(
            <button key={ff} className={btnCls(disp.fontFamily===ff)} onClick={()=>onChange('fontFamily',ff)}
              style={{fontFamily:FONT_FAMILY_MAP[ff]}}>
              {FONT_FAMILY_LABELS[ff]}
            </button>
          ))}
        </div>
      </div>

      {/* Density */}
      <div>
        <div className="t-caption font-medium uppercase tracking-[0.08em] text-on-surface-variant/80 mb-2">Densidad de cards</div>
        <div className={group}>
          {(['compact','comfortable'] as Density[]).map(d=>(
            <button key={d} className={btnCls(disp.density===d)} onClick={()=>onChange('density',d)}>
              {d==='compact'?'Compacta':'Cómoda'}
            </button>
          ))}
        </div>
      </div>

      {/* Line height */}
      <div>
        <div className="t-caption font-medium uppercase tracking-[0.08em] text-on-surface-variant/80 mb-2">Interlineado</div>
        <div className={group}>
          {(['tight','normal','relaxed'] as LineHeight[]).map(lh=>(
            <button key={lh} className={btnCls(disp.lineHeight===lh)} onClick={()=>onChange('lineHeight',lh)}>
              {lh==='tight'?'Ajustado':lh==='normal'?'Normal':'Amplio'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Config panel ───────────────────────────────────────────────────────────────
type ConfigTab = 'jira' | 'display'

function ConfigPanel({
  config, onSave, onClose, disp, onDisplayChange, aiModel,
}: {
  config:ConfigValues; onSave:(c:ConfigValues)=>Promise<void>; onClose:()=>void
  disp:DisplayCfg; onDisplayChange:(k:keyof DisplayCfg,v:string)=>void; aiModel:string
}): JSX.Element {
  const [local, setLocal]   = useState<ConfigValues>(config)
  const [saving, setSaving] = useState(false)
  const [tab, setTab]       = useState<ConfigTab>('jira')

  const set = (k:keyof ConfigValues) => (e:React.ChangeEvent<HTMLInputElement>) => setLocal(prev=>({...prev,[k]:e.target.value}))
  const [saveError, setSaveError] = useState<string|null>(null)
  const save = async () => {
    setSaving(true); setSaveError(null)
    try { await onSave(local); onClose() }
    catch(e) { setSaveError((e as Error).message) }
    finally { setSaving(false) }
  }

  const inp = 'ui-input w-full t-body'
  const lbl = 'block t-footnote text-on-surface-variant mb-1'

  return (
    <Sheet
      open
      onClose={onClose}
      title="Configuración"
      width={440}
      footer={tab === 'jira' ? (
        <div className="flex flex-col gap-2 w-full">
          {saveError && (
            <div className="t-footnote text-error bg-error/10 rounded-md px-3 py-2">{saveError}</div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="ui-btn ui-btn-outline">Cancelar</button>
            <button onClick={()=>void save()} disabled={saving} className="ui-btn ui-btn-primary">
              {saving?'Guardando…':'Guardar'}
            </button>
          </div>
        </div>
      ) : undefined}
    >
      <SegmentedControl
        className="mb-5"
        options={[{ value: 'jira', label: 'Conexión' }, { value: 'display', label: 'Visualización' }]}
        value={tab}
        onChange={(t)=>setTab(t as ConfigTab)}
      />
      <div>
        {tab === 'jira' && (
          <div className="flex flex-col gap-5">
            {/* Jira */}
            <div>
              <div className="t-caption font-medium uppercase tracking-[0.08em] text-on-surface-variant/80 mb-3">Jira</div>
              <div className="flex flex-col gap-3">
                <div><label className={lbl}>URL base</label><input className={inp} placeholder="https://empresa.atlassian.net" value={local.jiraUrl} onChange={set('jiraUrl')} /></div>
                <div><label className={lbl}>Email</label><input className={inp} placeholder="tu@empresa.com" value={local.jiraUser} onChange={set('jiraUser')} /></div>
                <div>
                  <label className={lbl}>Token de API</label>
                  <input className={inp} type="password" placeholder={local.jiraToken==='__CONFIGURED__'?'●●●●●●●● (ya configurado)':'Token de API de Jira'}
                    value={local.jiraToken==='__CONFIGURED__'?'':local.jiraToken} onChange={set('jiraToken')} />
                  <p className="t-footnote text-on-surface-variant/60 mt-1">Jira → Configuración → Seguridad → API tokens</p>
                </div>
              </div>
            </div>
            {/* Repo */}
            <div>
              <div className="t-caption font-medium uppercase tracking-[0.08em] text-on-surface-variant/80 mb-3">Repositorio</div>
              <div className="flex flex-col gap-3">
                <div>
                  <label className={lbl}>Prefijo de proyecto</label>
                  <input className={inp} placeholder="WIN" value={local.projectPrefix} onChange={set('projectPrefix')} />
                  <p className="t-footnote text-on-surface-variant/60 mt-1">Ej: 1234 → WIN-1234</p>
                </div>
                <div><label className={lbl}>Ruta del repositorio Wigos</label><input className={inp} placeholder="D:\repos\wigos" value={local.repoPath} onChange={set('repoPath')} /></div>
              </div>
            </div>
            {/* AI info */}
            <div className="ui-card shadow-none px-4 py-3">
              <div className="t-caption font-medium uppercase tracking-[0.08em] text-on-surface-variant/80 mb-1">Modelo de IA activo</div>
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-on-surface-variant" />
                <span className="t-footnote text-on-surface font-medium">{aiModel || 'No configurado'}</span>
              </div>
              <p className="t-footnote text-on-surface-variant/60 mt-1">Cambiá el modelo en Configuración → Servicio de IA.</p>
            </div>
          </div>
        )}

        {tab === 'display' && (
          <DisplaySettings disp={disp} onChange={onDisplayChange} />
        )}
      </div>
    </Sheet>
  )
}

// ── Right panel — awaiting ─────────────────────────────────────────────────────
function AwaitingPanel({ plan, onExecute, onReset }: { plan:AnalysisPlan; onExecute:()=>void; onReset:()=>void }): JSX.Element {
  return (
    <div className="flex flex-col gap-3 tr-fadein">
      <div className="bg-surface hairline rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={15} className="text-on-surface-variant"/>
          <span className="t-body font-semibold text-on-surface">Plan listo</span>
        </div>
        <p className="t-footnote text-on-surface-variant leading-relaxed mb-3">
          Revisá el plan en el panel izquierdo y ejecutá el análisis completo.
        </p>
        {plan.steps.length > 0 && (
          <div className="flex flex-col bg-surface/50 rounded-lg overflow-hidden hairline mb-3">
            {plan.steps.map((s,i)=>(
              <div key={s.id} className={`flex items-start gap-2 px-3 py-2 ${i>0?'hairline-t':''}`}>
                <span className="shrink-0 w-4 h-4 rounded-full border border-hairline-strong text-on-surface-variant text-[10px] font-semibold flex items-center justify-center mt-0.5">{i+1}</span>
                <div>
                  <div className="t-footnote font-medium text-on-surface">{s.label}</div>
                  <div className="t-caption text-on-surface-variant/60 mt-0.5">{s.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onExecute} className="ui-btn ui-btn-primary">
            <Play size={13}/>Ejecutar análisis
          </button>
          <button onClick={onReset} className="ui-btn ui-btn-ghost">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ── Apply changes modal ────────────────────────────────────────────────────────
interface ApplyResult { file:string; status:'applied'|'not_found'|'error'; message?:string }

function ApplyChangesModal({ diff, onClose }: { diff:DiffChunk[]; onClose:()=>void }): JSX.Element {
  const [selected, setSelected]   = useState<Set<number>>(new Set(diff.map((_,i)=>i)))
  const [applying, setApplying]   = useState(false)
  const [results, setResults]     = useState<ApplyResult[]|null>(null)

  const toggle = (i:number) => setSelected(prev => {
    const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n
  })

  const handleApply = async () => {
    setApplying(true)
    try {
      const res = await window.api.invoke<ApplyResult[]>(
        'ticket-resolver:apply-changes',
        diff.filter((_,i) => selected.has(i)),
      )
      setResults(res)
    } catch(e) {
      setResults([{file:'',status:'error',message:(e as Error).message}])
    } finally { setApplying(false) }
  }

  const allOk = results?.every(r => r.status==='applied')

  return (
    <Modal
      open
      onClose={onClose}
      width={680}
      title="Aplicar cambios en el repositorio"
      subtitle={`${diff.length} cambio${diff.length!==1?'s':''} propuesto${diff.length!==1?'s':''}`}
      footer={!results ? (
        <>
          <span className="t-footnote text-on-surface-variant mr-auto self-center">{selected.size} de {diff.length} seleccionado{selected.size!==1?'s':''}</span>
          <button onClick={onClose} className="ui-btn ui-btn-outline">Cancelar</button>
          <button onClick={()=>void handleApply()} disabled={applying||selected.size===0}
            className="ui-btn ui-btn-primary">
            {applying ? <><Spinner size={13}/>Aplicando…</> : <><Wrench size={13}/>Aplicar {selected.size} cambio{selected.size!==1?'s':''}</>}
          </button>
        </>
      ) : (
        <button onClick={onClose} className="ui-btn ui-btn-primary">Cerrar</button>
      )}
    >
        <div className="flex flex-col gap-3">
          {!results ? (
            <>
              <p className="t-footnote text-on-surface-variant px-1">
                Seleccioná los cambios a aplicar. Los archivos se modificarán directamente en el repositorio configurado.
              </p>
              {diff.map((chunk,i) => (
                <label key={i} onClick={()=>toggle(i)}
                  className={['rounded-xl border overflow-hidden cursor-pointer transition-all select-none',
                    selected.has(i) ? 'border-primary/25 bg-primary/5' : 'border-hairline bg-surface-container/40 opacity-60',
                  ].join(' ')}>
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <div className={['w-4 h-4 rounded flex items-center justify-center border transition-all shrink-0',
                      selected.has(i) ? 'bg-primary border-primary' : 'border-hairline'
                    ].join(' ')}>
                      {selected.has(i) && <Check size={10} className="text-on-primary" />}
                    </div>
                    <FileText size={12} className="text-on-surface-variant/60 shrink-0"/>
                    <span className="font-mono t-footnote text-on-surface flex-1 truncate">{chunk.file}</span>
                    <span className="t-caption text-on-surface-variant/60 shrink-0">línea {chunk.lineStart}</span>
                  </div>
                  <div className="t-footnote font-mono leading-relaxed">
                    {chunk.original.split('\n').map((l,j)=>(
                      <div key={j} className="flex gap-2 px-4 py-0.5 bg-error/8 text-error/70 border-t border-error/8">
                        <span className="text-error/40 select-none w-3 shrink-0">−</span><span>{l}</span>
                      </div>
                    ))}
                    {chunk.modified.split('\n').map((l,j)=>(
                      <div key={j} className="flex gap-2 px-4 py-0.5 bg-success/8 text-success/70">
                        <span className="text-success/40 select-none w-3 shrink-0">+</span><span>{l}</span>
                      </div>
                    ))}
                  </div>
                </label>
              ))}
            </>
          ) : (
            <div className="flex flex-col gap-2.5">
              {allOk && (
                <div className="flex items-center gap-2.5 text-success bg-success/10 rounded-lg px-4 py-3">
                  <CheckCircle2 size={16} className="shrink-0"/>
                  <span className="t-body font-medium">Todos los cambios aplicados correctamente</span>
                </div>
              )}
              {results.map((r,i)=>(
                <div key={i} className={['flex items-start gap-3 rounded-lg px-4 py-3',
                  r.status==='applied'   ? 'bg-success/8' :
                  r.status==='not_found' ? 'bg-warning/8' :
                                           'bg-error/8',
                ].join(' ')}>
                  {r.status==='applied'   ? <Check size={14} className="text-success shrink-0 mt-0.5"/> :
                   r.status==='not_found' ? <TriangleAlert size={14} className="text-warning shrink-0 mt-0.5"/> :
                                            <CircleAlert size={14} className="text-error shrink-0 mt-0.5"/>}
                  <div>
                    {r.file && <div className="t-footnote font-mono text-on-surface">{r.file}</div>}
                    {r.message && <div className="t-footnote text-on-surface-variant mt-0.5">{r.message}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
    </Modal>
  )
}

// ── Right panel — results ──────────────────────────────────────────────────────
function ResultsPanel({
  result, disp, onSaveHistory, onReset, isAlreadySaved, justSaved,
}: {
  result:AnalysisResult; disp:DisplayCfg; onSaveHistory:()=>void; onReset:()=>void
  isAlreadySaved:boolean; justSaved:boolean
}): JSX.Element {
  const [copied, setCopied]     = useState<string|null>(null)
  const [showApply, setShowApply] = useState(false)
  const copy = (text:string, key:string) => void navigator.clipboard.writeText(text).then(()=>{setCopied(key);setTimeout(()=>setCopied(null),1500)})
  const hasDiff = result.diff.length > 0

  const SectionHeader = ({ color, icon: Icon, label, copyKey, copyText }: {
    color:string; icon:IconComponent; label:string; copyKey?:string; copyText?:string
  }) => (
    <div className={`flex items-center gap-2 px-4 py-2 hairline-b`}>
      <Icon size={13} className={`shrink-0 ${color}`}/>
      <span className="t-caption font-medium uppercase tracking-[0.08em] text-on-surface-variant/80">{label}</span>
      {copyKey && copyText && (
        <button onClick={()=>copy(copyText,copyKey)} title="Copiar" aria-label="Copiar" className="ml-auto ui-btn ui-btn-ghost ui-btn-icon">
          {copied===copyKey ? <Check size={12}/> : <Copy size={12}/>}
        </button>
      )}
    </div>
  )

  return (
    <>
      {showApply && <ApplyChangesModal diff={result.diff} onClose={()=>setShowApply(false)}/>}

      <div className="flex flex-col gap-3">

        {/* Banner */}
        <div className="flex items-center gap-3 rounded-xl hairline px-4 py-3 bg-surface tr-fadein">
          <CheckCircle2 size={18} className="text-success shrink-0"/>
          <div className="flex-1 min-w-0">
            <div className="t-body font-semibold text-on-surface">Análisis completado</div>
            <div className="t-footnote text-on-surface-variant truncate">
              {result.affectedFiles.length > 0 && `${result.affectedFiles.length} archivo${result.affectedFiles.length!==1?'s':''}`}
              {hasDiff && ` · ${result.diff.length} cambio${result.diff.length!==1?'s':''} listo${result.diff.length!==1?'s':''} para aplicar`}
            </div>
          </div>
          {hasDiff && (
            <button onClick={()=>setShowApply(true)} className="ui-btn ui-btn-primary shrink-0">
              <Wrench size={13}/>Aplicar cambios
            </button>
          )}
        </div>

        {/* Root cause */}
        <div className="rounded-xl hairline overflow-hidden tr-fadein">
          <SectionHeader color="text-warning" icon={Search} label="Causa raíz" copyKey="root" copyText={result.rootCause}/>
          <div className="px-4 py-4">
            <p className="text-on-surface" style={{fontSize:FONT_PX[disp.fontSize],lineHeight:LINE_MAP[disp.lineHeight]}}>{result.rootCause}</p>
          </div>
        </div>

        {/* Fix */}
        <div className="rounded-xl hairline overflow-hidden tr-fadein" style={{animationDelay:'.05s'}}>
          <SectionHeader color="text-success" icon={Wrench} label="Solución propuesta" copyKey="fix" copyText={result.fix}/>
          <div className="px-4 py-4">
            <p className="text-on-surface" style={{fontSize:FONT_PX[disp.fontSize],lineHeight:LINE_MAP[disp.lineHeight]}}>{result.fix}</p>
          </div>
          {hasDiff && (
            <div className="hairline-t">
              <DiffView diff={result.diff}/>
            </div>
          )}
        </div>

        {/* Affected files */}
        {result.affectedFiles.length > 0 && (
          <div className="rounded-xl hairline overflow-hidden tr-fadein" style={{animationDelay:'.1s'}}>
            <SectionHeader color="text-on-surface-variant" icon={FolderOpen} label={`Archivos modificados · ${result.affectedFiles.length}`}/>
            <div className="px-3 py-2.5 flex flex-col gap-1">
              {result.affectedFiles.map(f=>(
                <div key={f} className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-on-surface/4">
                  <FileText size={12} className="text-on-surface-variant/60 shrink-0"/>
                  <span className="font-mono t-footnote text-on-surface-variant/60 truncate">{f}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ticket comment */}
        {result.ticketComment && (
          <div className="tr-fadein" style={{animationDelay:'.15s'}}>
            <CommentCard comment={result.ticketComment} disp={disp}/>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-wrap pb-1 pt-0.5 tr-fadein" style={{animationDelay:'.2s'}}>
          <button onClick={onSaveHistory}
            className={`ui-btn ui-btn-sm ${isAlreadySaved || justSaved ? 'ui-btn-outline' : 'ui-btn-primary'}`}>
            {justSaved?<><CheckCircle2 size={12} className="text-success"/>Guardado</>:isAlreadySaved?<><RotateCcw size={12}/>Actualizar</>:<><Save size={12}/>Guardar</>}
          </button>
          <button onClick={()=>copy(`CAUSA RAÍZ:\n${result.rootCause}\n\nSOLUCIÓN:\n${result.fix}`,'all')}
            className="ui-btn ui-btn-outline ui-btn-sm">
            {copied==='all'?<Check size={12}/>:<Copy size={12}/>}Copiar
          </button>
          <button onClick={onReset}
            className="ui-btn ui-btn-ghost ui-btn-sm ml-auto">
            <Plus size={12}/>Nuevo
          </button>
        </div>

      </div>
    </>
  )
}


// ── Main ───────────────────────────────────────────────────────────────────────
export function TicketResolver(): JSX.Element {
  const [phase, setPhase]             = useState<Phase>('idle')
  const [ticketInput, setTicketInput] = useState('')
  const [ticket, setTicket]           = useState<JiraTicket|null>(null)
  const [plan, setPlan]               = useState<AnalysisPlan|null>(null)
  const [snippets, setSnippets]       = useState<CodeSnippet[]>([])
  const [result, setResult]           = useState<AnalysisResult|null>(null)
  const [steps, setSteps]             = useState<AnalysisStepUI[]>([])
  const [history, setHistory]         = useState<HistoryEntry[]>([])
  const [selectedId, setSelectedId]   = useState<string|null>(null)
  const [error, setError]             = useState<string|null>(null)
  const [showConfig, setShowConfig]   = useState(false)
  const [justSavedKey, setJustSavedKey] = useState<string|null>(null)
  const [aiModel, setAiModel]         = useState('')
  const [sessionUsage, setSessionUsage] = useState<SessionUsage>({inputTokens:0,outputTokens:0,calls:0,contextWindowSize:200000})
  const [config, setConfig]           = useState<ConfigValues>({jiraUrl:'',jiraUser:'',jiraToken:'',repoPath:'',projectPrefix:'WIN'})
  const [disp, setDisp]               = useState<DisplayCfg>(DEFAULT_DISPLAY)

  useEffect(() => {
    if (!document.getElementById('tr-styles')) {
      const s = document.createElement('style'); s.id='tr-styles'; s.textContent=TR_STYLES; document.head.appendChild(s)
    }
    void (async () => {
      const [url,user,token,repo,prefix,fs,dn,lh,ff,provider,openModel,anthropicModel,ollamaModel] = await Promise.all([
        window.api.invoke<string|null>('settings:get','ticket-resolver.jira_url'),
        window.api.invoke<string|null>('settings:get','ticket-resolver.jira_user'),
        window.api.invoke<string|null>('settings:get','ticket-resolver.jira_token'),
        window.api.invoke<string|null>('settings:get','ticket-resolver.repo_path'),
        window.api.invoke<string|null>('settings:get','ticket-resolver.project_prefix'),
        window.api.invoke<string|null>('settings:get','ticket-resolver.ui.font_size'),
        window.api.invoke<string|null>('settings:get','ticket-resolver.ui.density'),
        window.api.invoke<string|null>('settings:get','ticket-resolver.ui.line_height'),
        window.api.invoke<string|null>('settings:get','ticket-resolver.ui.font_family'),
        window.api.invoke<string|null>('settings:get','ai.provider'),
        window.api.invoke<string|null>('settings:get','ai.model'),
        window.api.invoke<string|null>('settings:get','ai.anthropic_model'),
        window.api.invoke<string|null>('settings:get','ai.ollama_model'),
      ])
      setConfig({jiraUrl:url??'',jiraUser:user??'',jiraToken:token??'',repoPath:repo??'',projectPrefix:prefix??'WIN'})
      setDisp({
        fontSize:   (fs  as FontSize)   ?? 'normal',
        density:    (dn  as Density)    ?? 'comfortable',
        lineHeight: (lh  as LineHeight) ?? 'normal',
        fontFamily: (ff  as FontFamily) ?? 'system',
      })
      const p = provider ?? 'openai'
      const m = p==='anthropic' ? (anthropicModel??'claude-sonnet') : p==='ollama' ? (ollamaModel??'llama3') : (openModel??'gpt-4o-mini')
      setAiModel(`${p === 'openai' ? 'OpenAI' : p === 'anthropic' ? 'Anthropic' : 'Ollama'} · ${m}`)
      const hist = await window.api.invoke<HistoryEntry[]>('ticket-resolver:history-get')
      setHistory(hist)
    })()
  }, [])

  const saveConfig = useCallback(async (c:ConfigValues) => {
    await Promise.all([
      window.api.invoke('settings:set','ticket-resolver.jira_url',c.jiraUrl),
      window.api.invoke('settings:set','ticket-resolver.jira_user',c.jiraUser),
      window.api.invoke('settings:set','ticket-resolver.repo_path',c.repoPath),
      window.api.invoke('settings:set','ticket-resolver.project_prefix',c.projectPrefix),
    ])
    if (c.jiraToken && c.jiraToken!=='__CONFIGURED__')
      await window.api.invoke('settings:set','ticket-resolver.jira_token',c.jiraToken)
    // Normalize token in state: if it was set (either now or previously), store sentinel
    setConfig(prev => ({
      ...c,
      jiraToken: (c.jiraToken && c.jiraToken !== '__CONFIGURED__') || prev.jiraToken
        ? '__CONFIGURED__'
        : '',
    }))
  }, [])

  const handleDisplayChange = useCallback(async (k:keyof DisplayCfg, v:string) => {
    setDisp(prev=>({...prev,[k]:v}))
    const keyMap: Partial<Record<keyof DisplayCfg,string>> = { lineHeight:'line_height', fontFamily:'font_family', fontSize:'font_size' }
    await window.api.invoke('settings:set',`ticket-resolver.ui.${keyMap[k]??k}`,v)
  }, [])

  const refreshUsage = useCallback(async () => {
    const u = await window.api.invoke<SessionUsage>('ticket-resolver:ai-usage-get')
    setSessionUsage(u)
  }, [])

  const updateStep = (id:string, status:AnalysisStepUI['status'], detail?:string) =>
    setSteps(prev=>prev.map(s=>s.id===id?{...s,status,detail:detail??s.detail}:s))

  const normalizeKey = (input:string) => {
    const t = input.trim().toUpperCase()
    if (/^[A-Z]+-\d+$/.test(t)) return t
    if (/^\d+$/.test(t)) return `${config.projectPrefix||'WIN'}-${t}`
    return t
  }

  const resetToIdle = () => {
    setPhase('idle'); setTicketInput(''); setTicket(null); setPlan(null)
    setSnippets([]); setResult(null); setSteps([]); setError(null); setSelectedId(null)
  }

  const handleFetch = async () => {
    if (!ticketInput.trim()) return
    setError(null); setPhase('fetching')
    try {
      const t = await window.api.invoke<JiraTicket>('ticket-resolver:fetch', normalizeKey(ticketInput))
      setTicket(t); setPhase('planning')
      const p = await window.api.invoke<AnalysisPlan>('ticket-resolver:plan', t)
      setPlan(p); void refreshUsage(); setPhase('awaiting')
    } catch(e) { setError((e as Error).message); setPhase('error') }
  }

  const handleExecute = async () => {
    if (!ticket||!plan) return
    setSteps([
      {id:'search',  label:'Buscando código', status:'pending'},
      {id:'analyze', label:'Análisis IA',     status:'pending'},
    ])
    setPhase('analyzing')
    try {
      updateStep('search','running',`Buscando: ${plan.searchTerms.slice(0,3).join(', ')}`)
      const found = await window.api.invoke<CodeSnippet[]>('ticket-resolver:search', plan.searchTerms)
      setSnippets(found)
      updateStep('search','done', found.length>0 ? `${found.length} fragmento${found.length!==1?'s':''} encontrado${found.length!==1?'s':''}` : 'Sin código — analizando desde descripción')
      updateStep('analyze','running','Generando causa raíz y solución...')
      const res = await window.api.invoke<AnalysisResult>('ticket-resolver:analyze', ticket, plan, found)
      setResult(res); updateStep('analyze','done','Análisis completo')
      void refreshUsage(); setPhase('done')
    } catch(e) { setError((e as Error).message); setPhase('error') }
  }

  const handleSaveHistory = async () => {
    if (!ticket||!plan||!result) return
    // Use a stable ID based on ticketKey so repeated saves upsert the same slot
    const entry: HistoryEntry = {
      id:ticket.key, ticketKey:ticket.key, summary:ticket.summary,
      component:plan.component, technology:plan.technology, nature:plan.nature,
      rootCause:result.rootCause, fix:result.fix, affectedFiles:result.affectedFiles,
      diff:result.diff, createdAt:new Date().toISOString(),
    }
    await window.api.invoke('ticket-resolver:history-save', entry)
    setHistory(prev=>[entry,...prev.filter(h=>h.ticketKey!==entry.ticketKey)])
    setSelectedId(entry.id)
    setJustSavedKey(ticket.key)
    setTimeout(() => setJustSavedKey(null), 2000)
  }

  const handleDeleteHistory = async (id:string, e:React.MouseEvent) => {
    e.stopPropagation()
    await window.api.invoke('ticket-resolver:history-delete', id)
    setHistory(prev=>prev.filter(h=>h.id!==id))
    if (selectedId===id) resetToIdle()
  }

  const handleSelectHistory = (entry:HistoryEntry) => {
    setSelectedId(entry.id)
    setTicket({key:entry.ticketKey,summary:entry.summary,description:'',type:'',priority:'',status:'',components:[],reporter:'',assignee:null,created:entry.createdAt,updated:entry.createdAt})
    setPlan({component:entry.component,technology:entry.technology,nature:entry.nature,searchTerms:[],steps:[],estimatedTokens:0})
    setResult({rootCause:entry.rootCause,fix:entry.fix,affectedFiles:entry.affectedFiles,diff:entry.diff})
    setSnippets([]); setError(null); setPhase('done')
  }

  const isConfigured  = Boolean(config.jiraUrl && config.jiraUser && config.jiraToken)
  const showTwoCols   = phase !== 'idle'
  const [histOpen, setHistOpen] = useState(false)

  return (
    <div className="flex h-full overflow-hidden relative">

      {showConfig && (
        <ConfigPanel
          config={config} onSave={saveConfig} onClose={()=>setShowConfig(false)}
          disp={disp} onDisplayChange={(k,v)=>void handleDisplayChange(k,v)} aiModel={aiModel}
        />
      )}

      {/* History sidebar — collapsible */}
      <aside className={`shrink-0 flex flex-col hairline-r fl-pane overflow-hidden transition-all duration-200 ${histOpen?'w-56':'w-9'}`}>
        {/* Toggle strip */}
        <div className={`shrink-0 flex items-center h-[42px] hairline-b ${histOpen?'justify-between px-2':'justify-center'}`}>
          {histOpen && <span className="fl-section">Historial</span>}
          <button onClick={()=>setHistOpen(o=>!o)} title={histOpen?'Colapsar historial':'Ver historial'} aria-label={histOpen?'Colapsar historial':'Ver historial'}
            className="ui-btn ui-btn-ghost ui-btn-icon shrink-0">
            <ChevronRight size={13} className={`transition-transform duration-200 ${histOpen?'rotate-180':''}`}/>
          </button>
        </div>

        {/* Collapsed: dot indicators */}
        {!histOpen && history.length > 0 && (
          <div className="flex flex-col items-center gap-1 pt-2">
            {history.slice(0,5).map(entry=>(
              <button key={entry.id} onClick={()=>{setHistOpen(true);handleSelectHistory(entry)}}
                title={`${entry.ticketKey} — ${entry.summary}`}
                className={`w-2 h-2 rounded-full transition-all ${selectedId===entry.id?'bg-on-surface':'bg-on-surface-variant/30 hover:bg-on-surface-variant/60'}`}/>
            ))}
            {history.length > 5 && <span className="t-caption text-on-surface-variant/60 mt-0.5">+{history.length-5}</span>}
          </div>
        )}

        {/* Expanded list */}
        {histOpen && (
          <div className="flex-1 overflow-y-auto pb-1">
            <button onClick={resetToIdle} className="fl-row w-[calc(100%-12px)]! mx-1.5 mt-1.5 t-body text-on-surface-variant!">
              <Plus size={12}/>Nuevo ticket
            </button>
            {history.length===0 ? (
              <p className="t-caption text-on-surface-variant/60 text-center px-3 pt-6 leading-relaxed">Sin tickets aún.</p>
            ) : history.map(entry=>(
              <div key={entry.id} onClick={()=>handleSelectHistory(entry)}
                className={['group relative flex flex-col gap-0.5 px-2.5 py-1.5 mx-1.5 mt-px rounded-[9px] border cursor-default transition-colors',
                  selectedId===entry.id ? 'nav-active' : 'border-transparent hover:bg-on-surface/4',
                ].join(' ')}>
                <div className="flex items-center justify-between gap-1 min-w-0">
                  <span className="t-footnote font-medium truncate text-on-surface">{entry.ticketKey}</span>
                  <span className="t-caption text-on-surface-variant/70 shrink-0 tabular-nums group-hover:opacity-0">{relativeTime(entry.createdAt)}</span>
                </div>
                <span className="t-caption text-on-surface-variant truncate leading-snug">{entry.summary}</span>
                <button onClick={e=>{void handleDeleteHistory(entry.id,e)}} title="Eliminar del historial" aria-label="Eliminar del historial"
                  className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-on-surface-variant hover:text-on-surface hover:bg-on-surface/8 transition-opacity">
                  <X size={10}/>
                </button>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0" style={{fontFamily:FONT_FAMILY_MAP[disp.fontFamily]}}>

        {/* Header */}
        <div className="fl-toolbar justify-between shrink-0 gap-2!">
          <div className="flex items-center gap-2 min-w-0">
            <Ticket size={14} className="text-on-surface-variant shrink-0"/>
            {ticket && <span className="t-footnote font-medium text-on-surface truncate">{ticket.key}</span>}
            {(phase==='analyzing'||phase==='planning') && (
              <span className="flex items-center gap-1.5 t-caption text-on-surface-variant tr-fadein">
                <Spinner size={11}/>{phase==='analyzing'?'Analizando…':'Planificando…'}
              </span>
            )}
            {aiModel && (
              <span className="hidden lg:inline-flex items-center gap-1.5 t-caption text-on-surface-variant">
                <Sparkles size={11}/>{aiModel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <TokenCounter usage={sessionUsage} onReset={()=>void window.api.invoke('ticket-resolver:ai-usage-reset').then(()=>setSessionUsage(p=>({...p,inputTokens:0,outputTokens:0,calls:0})))} />
            {/* Font size quick controls */}
            <div className="flex items-center">
              <button
                onClick={()=>{ const i=FONT_SIZE_ORDER.indexOf(disp.fontSize); if(i>0) void handleDisplayChange('fontSize',FONT_SIZE_ORDER[i-1]!) }}
                disabled={disp.fontSize==='small'}
                title="Reducir fuente" aria-label="Reducir fuente"
                className="ui-btn ui-btn-ghost ui-btn-sm px-1.5! t-caption font-semibold">
                A−
              </button>
              <button
                onClick={()=>{ const i=FONT_SIZE_ORDER.indexOf(disp.fontSize); if(i<2) void handleDisplayChange('fontSize',FONT_SIZE_ORDER[i+1]!) }}
                disabled={disp.fontSize==='large'}
                title="Aumentar fuente" aria-label="Aumentar fuente"
                className="ui-btn ui-btn-ghost ui-btn-sm px-1.5! font-semibold">
                A+
              </button>
            </div>
            <button onClick={()=>setShowConfig(true)} className="ui-btn ui-btn-ghost ui-btn-sm gap-1!" title="Configuración" aria-label="Configuración">
              <Settings size={14}/>
              {!isConfigured && <span className="text-warning t-caption font-medium">Sin configurar</span>}
            </button>
          </div>
        </div>

        {/* IDLE */}
        {!showTwoCols && (
          <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-6 py-6 gap-4">
            {!isConfigured && (
              <div className="flex items-center gap-2 text-on-surface t-footnote bg-warning/10 px-3 py-2 rounded-lg w-full max-w-sm">
                <TriangleAlert size={13} className="shrink-0 text-warning"/>
                <span>Configurá las credenciales de Jira primero.</span>
                <button onClick={()=>setShowConfig(true)} className="ui-btn ui-btn-outline ui-btn-sm ml-auto shrink-0">Configurar</button>
              </div>
            )}
            <div className="w-full max-w-xs">
              <div className="text-center mb-4">
                <Ticket size={36} strokeWidth={1.4} className="text-on-surface-variant/50 mx-auto mb-2"/>
                <h2 className="t-title3 text-on-surface">Tickets</h2>
                <p className="t-footnote text-on-surface-variant mt-0.5">Analizá tickets de Jira con IA</p>
                {aiModel && <p className="t-caption text-on-surface-variant/70 mt-0.5">{aiModel}</p>}
              </div>
              <div className="flex gap-1.5">
                <input value={ticketInput} onChange={e=>setTicketInput(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter')void handleFetch()}}
                  placeholder={`${config.projectPrefix||'WIN'}-1234`}
                  autoFocus
                  className="ui-input flex-1 t-footnote"/>
                <button onClick={()=>void handleFetch()} disabled={!ticketInput.trim()||!isConfigured}
                  className="ui-btn ui-btn-primary">
                  Cargar
                </button>
              </div>
              <p className="t-caption text-on-surface-variant/60 text-center mt-1.5">Solo el número (1234) o la clave (WIN-1234)</p>
            </div>
            {history.length > 0 && (
              <div className="w-full max-w-xs">
                <div className="t-caption font-medium uppercase tracking-[0.08em] text-on-surface-variant/80 mb-1.5">Recientes</div>
                <div className="flex flex-col gap-1">
                  {history.slice(0,5).map(e=>(
                    <button key={e.id} onClick={()=>handleSelectHistory(e)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-[9px] hover:bg-on-surface/4 transition-colors text-left">
                      <span className="t-footnote font-medium text-on-surface w-20 shrink-0">{e.ticketKey}</span>
                      <span className="t-footnote text-on-surface-variant truncate">{e.summary}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TWO COLUMNS */}
        {showTwoCols && (
          <div className="flex-1 flex overflow-hidden">

            {/* Left col */}
            <div className="w-[280px] shrink-0 overflow-y-auto hairline-r fl-pane flex flex-col gap-2 p-3">
              <TicketDetailCard ticket={ticket} skeleton={phase==='fetching'} disp={disp} />
              {phase !== 'fetching' && <PlanCard plan={plan} skeleton={phase==='planning'} />}
              {snippets.length > 0 && (
                <div className="rounded-xl hairline bg-surface overflow-hidden tr-fadein">
                  <button className="fl-section w-full h-8! px-3! hover:bg-on-surface/3 transition-colors"
                    onClick={e=>{const el=e.currentTarget.nextElementSibling as HTMLElement; el.style.display=el.style.display==='none'?'':'none'}}>
                    <Code2 size={10}/>Código encontrado · {snippets.length}
                  </button>
                  <div style={{display:'none'}} className="flex flex-col divide-y divide-(--hairline)">
                    {snippets.map((s,i)=>(
                      <div key={i} className="px-3 py-1.5">
                        <div className="t-caption font-mono text-on-surface-variant/60 truncate mb-1">{s.file}:{s.line}</div>
                        <pre className="t-caption font-mono text-on-surface/45 overflow-x-auto whitespace-pre leading-relaxed max-h-16">{s.context.slice(0,200)}</pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right col */}
            <div className="flex-1 overflow-y-auto p-4">
              {phase==='fetching' && (
                <div className="flex flex-col items-center justify-center h-full gap-3 tr-fadein">
                  <Spinner size={22}/>
                  <div className="text-center">
                    <div className="t-body font-semibold text-on-surface mb-0.5">Conectando con Jira</div>
                    <div className="t-footnote text-on-surface-variant">Obteniendo información del ticket...</div>
                  </div>
                </div>
              )}
              {phase==='planning' && (
                <div className="flex flex-col items-center justify-center h-full gap-3 tr-fadein">
                  <Brain size={26} strokeWidth={1.5} className="text-on-surface-variant"/>
                  <div className="text-center">
                    <div className="t-body font-semibold text-on-surface mb-0.5">Generando plan</div>
                    <div className="t-footnote text-on-surface-variant">La IA está analizando el contexto...</div>
                  </div>
                  <div className="flex gap-1">{[0,160,320].map(d=><div key={d} className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{animationDelay:`${d}ms`}}/>)}</div>
                </div>
              )}
              {phase==='awaiting' && plan && (
                <AwaitingPanel plan={plan} onExecute={()=>void handleExecute()} onReset={resetToIdle}/>
              )}
              {phase==='analyzing' && (
                <AnalyzingPanel steps={steps}/>
              )}
              {phase==='done' && result && (
                <ResultsPanel result={result} disp={disp} onSaveHistory={()=>void handleSaveHistory()} onReset={resetToIdle}
                  isAlreadySaved={history.some(h=>h.ticketKey===ticket?.key)}
                  justSaved={justSavedKey===ticket?.key}/>
              )}
              {phase==='error' && (
                <div className="flex flex-col items-center justify-center h-full gap-3 tr-fadein">
                  <CircleAlert size={26} strokeWidth={1.5} className="text-error"/>
                  <div className="text-center max-w-sm">
                    <div className="t-body font-semibold text-on-surface mb-1.5">
                      {error==='JIRA_NOT_CONFIGURED'?'Jira no configurado':'Ocurrió un error'}
                    </div>
                    <div className="t-footnote text-on-surface-variant leading-relaxed bg-surface hairline rounded-xl px-3 py-2.5">{error}</div>
                  </div>
                  <div className="flex gap-1.5">
                    {error==='JIRA_NOT_CONFIGURED' && (
                      <button onClick={()=>setShowConfig(true)} className="ui-btn ui-btn-primary">
                        Configurar Jira
                      </button>
                    )}
                    <button onClick={resetToIdle} className="ui-btn ui-btn-outline">
                      Intentar de nuevo
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
