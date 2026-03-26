import { useState, useEffect, useCallback, type ComponentType } from 'react'
import {
  Brain, Check, CheckCircle2, CircleAlert, ClipboardList, Code2, Copy,
  FileText, FolderOpen, Network, Pencil, Play, Plus, RotateCcw, Save, Search,
  Settings, Sparkles, Ticket, TriangleAlert, Wrench, X,
} from 'lucide-react'
import type {
  JiraTicket, AnalysisPlan, AnalysisResult, CodeSnippet,
  HistoryEntry, Phase, AnalysisStepUI, DiffChunk, TicketComment,
} from './types'

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
type FontSize  = 'small' | 'normal' | 'large'
type Density   = 'compact' | 'comfortable'
type LineHeight = 'tight' | 'normal' | 'relaxed'

interface DisplayCfg { fontSize: FontSize; density: Density; lineHeight: LineHeight }

const FONT_PX:   Record<FontSize,  string> = { small: '12px',   normal: '13px',  large: '15px'  }
const PAD_PX:    Record<Density,   string> = { compact: '12px', comfortable: '20px' }
const LINE_MAP:  Record<LineHeight, string> = { tight: '1.4',   normal: '1.6',   relaxed: '1.85' }

const DEFAULT_DISPLAY: DisplayCfg = { fontSize: 'normal', density: 'comfortable', lineHeight: 'normal' }

// ── Session usage ──────────────────────────────────────────────────────────────
interface SessionUsage { inputTokens:number; outputTokens:number; calls:number; contextWindowSize:number }

function TokenCounter({ usage, onReset }: { usage:SessionUsage; onReset:()=>void }): JSX.Element {
  const total = usage.inputTokens + usage.outputTokens
  const pct   = Math.min((total / usage.contextWindowSize) * 100, 100)
  const fmt   = (n:number) => n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n)
  if (usage.calls === 0) return <></>
  return (
    <div className="flex items-center gap-2 text-[11px] text-on-surface-variant/45 flex-shrink-0">
      <Ticket size={13} />
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-primary font-semibold">{fmt(total)}</span>
          <span>tok</span>
          <span className="text-on-surface-variant/25">·</span>
          <span className="text-on-surface-variant/35">↑{fmt(usage.inputTokens)} ↓{fmt(usage.outputTokens)}</span>
          <span className="text-on-surface-variant/25">·</span>
          <span>{pct.toFixed(1)}%</span>
        </div>
        <div className="w-20 h-1 bg-outline-variant/20 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
            style={{width:`${Math.max(pct,pct>0?3:0)}%`, background:pct>80?'#f87171':pct>50?'#fb923c':'rgb(var(--c-primary))'}} />
        </div>
      </div>
      <button onClick={onReset} title="Resetear sesión" className="text-on-surface-variant/25 hover:text-primary transition-colors">
        <RotateCcw size={13} />
      </button>
    </div>
  )
}

// ── Config shape ───────────────────────────────────────────────────────────────
interface ConfigValues { jiraUrl:string; jiraUser:string; jiraToken:string; repoPath:string; projectPrefix:string }

// ── Priority ───────────────────────────────────────────────────────────────────
const PRIORITY_COLOR: Record<string,string> = {
  Highest:'text-red-400', High:'text-orange-400', Medium:'text-yellow-400', Low:'text-green-400', Lowest:'text-blue-400',
}
const PRIORITY_BG: Record<string,string> = {
  Highest:'bg-red-500', High:'bg-orange-500', Medium:'bg-yellow-500', Low:'bg-green-500', Lowest:'bg-blue-500',
}

// ── Spinner ────────────────────────────────────────────────────────────────────
function Spinner({ size=16 }: { size?:number }): JSX.Element {
  return (
    <svg className="animate-spin flex-shrink-0 text-primary" style={{width:size,height:size}} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skel({ h='h-4', w='w-full', className='' }: { h?:string; w?:string; className?:string }): JSX.Element {
  return <div className={`${h} ${w} rounded-lg bg-white/[0.06] tr-shimmer ${className}`} />
}

// ── Diff view ──────────────────────────────────────────────────────────────────
function DiffView({ diff }: { diff:DiffChunk[] }): JSX.Element {
  if (diff.length === 0) return <></>
  return (
    <div className="flex flex-col gap-2.5 mt-4">
      {diff.map((chunk, i) => (
        <div key={i} className="rounded-xl overflow-hidden border border-outline-variant/20 text-[12px] font-mono tr-fadein">
          <div className="px-3 py-1.5 bg-surface-container/60 text-on-surface-variant/40 text-[10px] border-b border-outline-variant/10 truncate flex items-center gap-2">
            <FileText size={11} />
            {chunk.file} · línea {chunk.lineStart}
          </div>
          <div className="bg-red-500/8 px-3 py-2 whitespace-pre-wrap text-red-300/80 border-b border-outline-variant/10">
            {chunk.original.split('\n').map((l,j) => (
              <div key={j}><span className="select-none text-red-400/30 mr-2">−</span>{l}</div>
            ))}
          </div>
          <div className="bg-green-500/8 px-3 py-2 whitespace-pre-wrap text-green-300/80">
            {chunk.modified.split('\n').map((l,j) => (
              <div key={j}><span className="select-none text-green-400/30 mr-2">+</span>{l}</div>
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
      <div className="bg-surface-container rounded-2xl overflow-hidden">
        <div className="h-1 w-full bg-white/10 tr-shimmer" />
        <div className="px-5 py-4 flex flex-col gap-3">
          <div className="flex gap-2"><Skel h="h-4" w="w-16" /><Skel h="h-4" w="w-12" /></div>
          <Skel h="h-5" /><Skel h="h-5" w="w-3/4" />
          <div className="flex flex-col gap-1.5 pt-1">
            <Skel h="h-3" /><Skel h="h-3" w="w-5/6" /><Skel h="h-3" w="w-4/6" />
          </div>
        </div>
      </div>
    )
  }

  const pColor = PRIORITY_COLOR[ticket.priority] ?? 'text-on-surface-variant'
  const pBg    = PRIORITY_BG[ticket.priority]    ?? 'bg-primary/50'
  const desc   = ticket.description ?? ''
  const limit  = 220
  const fmtDate = (iso:string) => {
    if (!iso) return ''
    try { return new Date(iso).toLocaleDateString('es-AR', {day:'2-digit',month:'short',year:'numeric'}) }
    catch { return iso }
  }

  return (
    <div className="bg-surface-container rounded-2xl overflow-hidden tr-fadein">
      <div className={`h-1 w-full ${pBg} opacity-75`} />
      <div style={{padding: PAD_PX[disp.density]}}>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-[13px] font-bold text-primary tracking-wide">{ticket.key}</span>
          {ticket.type && <span className="text-[10px] px-2 py-0.5 rounded-full border border-outline-variant/20 text-on-surface-variant/45">{ticket.type}</span>}
          {ticket.priority && <span className={`text-[10px] font-bold uppercase tracking-wider ${pColor}`}>{ticket.priority}</span>}
          {ticket.status && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{ticket.status}</span>}
        </div>

        <p className="font-semibold text-on-surface leading-snug mb-3" style={{fontSize: FONT_PX[disp.fontSize]}}>
          {ticket.summary}
        </p>

        {desc && (
          <div className="mb-3 bg-surface/50 rounded-xl px-3 py-2.5 border border-outline-variant/10">
            <div className="text-[9px] font-semibold text-on-surface-variant/35 uppercase tracking-widest mb-1.5">Descripción</div>
            <p className="text-on-surface-variant/70" style={{fontSize:FONT_PX[disp.fontSize], lineHeight:LINE_MAP[disp.lineHeight]}}>
              {expanded ? desc : desc.length > limit ? desc.slice(0,limit)+'…' : desc}
            </p>
            {desc.length > limit && (
              <button onClick={()=>setExpanded(e=>!e)} className="text-[11px] text-primary mt-1.5 hover:underline">
                {expanded ? 'Ver menos' : 'Ver más'}
              </button>
            )}
          </div>
        )}

        {ticket.components.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mb-3">
            {ticket.components.map(c => <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">{c}</span>)}
          </div>
        )}

        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
          {ticket.reporter && <><span className="text-on-surface-variant/30">Reportado por</span><span className="text-on-surface-variant/55 truncate">{ticket.reporter}</span></>}
          {ticket.assignee && <><span className="text-on-surface-variant/30">Asignado a</span><span className="text-on-surface-variant/55 truncate">{ticket.assignee}</span></>}
          {ticket.created  && <><span className="text-on-surface-variant/30">Creado</span><span className="text-on-surface-variant/55">{fmtDate(ticket.created)}</span></>}
          {ticket.updated  && <><span className="text-on-surface-variant/30">Actualizado</span><span className="text-on-surface-variant/55">{fmtDate(ticket.updated)}</span></>}
        </div>
      </div>
    </div>
  )
}

// ── Plan card ──────────────────────────────────────────────────────────────────
function PlanCard({ plan, skeleton, disp }: { plan?:AnalysisPlan|null; skeleton?:boolean; disp:DisplayCfg }): JSX.Element {
  if (skeleton || !plan) {
    return (
      <div className="bg-surface-container rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4"><Skel h="h-4" w="w-32" /></div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {[0,1,2,3].map(i=><div key={i} className="bg-surface rounded-xl px-3 py-2"><Skel h="h-3" w="w-14" className="mb-1" /><Skel h="h-4" /></div>)}
        </div>
        <Skel h="h-3" /><Skel h="h-3" w="w-4/5" className="mt-1.5" />
      </div>
    )
  }
  return (
    <div className="bg-surface-container rounded-2xl tr-fadein" style={{padding:PAD_PX[disp.density]}}>
      <div className="flex items-center gap-2 mb-4">
        <ClipboardList size={16} className="text-primary" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/45">Plan de análisis</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {[{l:'Componente',v:plan.component},{l:'Tecnología',v:plan.technology},{l:'Est. tokens',v:String(plan.estimatedTokens)},{l:'Términos',v:plan.searchTerms.slice(0,3).join(', ')}]
          .map(({l,v})=>(
            <div key={l} className="bg-surface rounded-xl px-3 py-2">
              <div className="text-[9px] text-on-surface-variant/35 uppercase tracking-widest mb-0.5">{l}</div>
              <div className="text-[12px] font-medium text-on-surface truncate">{v||'—'}</div>
            </div>
          ))}
      </div>
      <div className="mb-3">
        <div className="text-[9px] text-on-surface-variant/35 uppercase tracking-widest mb-1">Problema</div>
        <p className="text-on-surface" style={{fontSize:FONT_PX[disp.fontSize],lineHeight:LINE_MAP[disp.lineHeight]}}>{plan.nature}</p>
      </div>
      {plan.steps.length > 0 && (
        <div>
          <div className="text-[9px] text-on-surface-variant/35 uppercase tracking-widest mb-2">Pasos</div>
          <div className="flex flex-col gap-1.5">
            {plan.steps.map(s=>(
              <div key={s.id} className="flex items-start gap-2">
                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center mt-0.5">{s.id}</span>
                <div>
                  <div className="text-[12px] font-medium text-on-surface">{s.label}</div>
                  <div className="text-[11px] text-on-surface-variant/40">{s.detail}</div>
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
  const done  = steps.filter(s=>s.status==='done').length
  const total = steps.length
  const pct   = total > 0 ? Math.round((done/total)*100) : 0
  const ICONS: Record<string,ComponentType<{size?:number;className?:string}>> = { search:Search, analyze:Brain }
  const TITLES: Record<string,string> = { search:'Búsqueda en repositorio', analyze:'Análisis con inteligencia artificial' }

  return (
    <div className="flex flex-col gap-5 tr-fadein">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[14px] font-semibold text-on-surface">Analizando ticket...</span>
          <span className="text-[12px] text-on-surface-variant/50 tabular-nums">{pct}%</span>
        </div>
        <div className="h-2 bg-outline-variant/15 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
            style={{width:`${pct}%`, background:'linear-gradient(90deg,rgb(var(--c-primary)),rgb(var(--c-secondary,var(--c-primary))))'}} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {steps.map(step => {
          const run  = step.status==='running'
          const done = step.status==='done'
          const pend = step.status==='pending'
          return (
            <div key={step.id} className={['rounded-2xl p-4 border transition-all duration-400',
              run  ? 'bg-primary/7 border-primary/20 shadow-sm shadow-primary/5' : '',
              done ? 'bg-surface-container border-outline-variant/15' : '',
              pend ? 'bg-surface-container/35 border-outline-variant/8 opacity-45' : '',
            ].join(' ')}>
              <div className="flex items-center gap-3">
                <div className={['w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all',
                  run?'bg-primary/15':done?'bg-green-500/12':'bg-white/[0.04]',
                ].join(' ')}>
                  {run  && <Spinner size={20} />}
                  {done && <CheckCircle2 size={20} className="text-green-400 tr-pop" />}
                  {pend && (() => { const Icon = ICONS[step.id] ?? Pencil; return <Icon size={20} className="text-on-surface-variant/20" /> })()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[13px] font-semibold ${pend?'text-on-surface-variant/30':'text-on-surface'}`}>
                    {TITLES[step.id]??step.label}
                  </div>
                  {step.detail && (
                    <div className={`text-[12px] mt-0.5 ${run?'text-primary/60':'text-on-surface-variant/45'}`}>
                      {step.detail}
                    </div>
                  )}
                </div>
                {done && <span className="text-[10px] text-green-400/60 font-medium flex-shrink-0 tr-fadein">Completado</span>}
              </div>
              {run && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-primary/12">
                  <div className="flex gap-1">
                    {[0,160,320].map(d=><div key={d} className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{animationDelay:`${d}ms`}} />)}
                  </div>
                  <span className="text-[11px] text-primary/50">Procesando, esto puede tardar con modelos locales...</span>
                </div>
              )}
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
    <div className="bg-surface-container rounded-2xl tr-fadein" style={{padding:PAD_PX[disp.density]}}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText size={17} className="text-blue-400" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/45">Comentario para el ticket</span>
        </div>
        <button onClick={copy} className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-primary/10 hover:text-primary text-on-surface-variant/45 transition-all">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied?'Copiado':'Copiar todo'}
        </button>
      </div>
      <div className="flex flex-col rounded-xl overflow-hidden border border-outline-variant/12">
        {[
          {key:'causa',    label:'Causa del error', color:'text-red-400',   bg:'bg-red-500/5',   text:comment.causa},
          {key:'solucion', label:'Solución',        color:'text-green-400', bg:'bg-green-500/5', text:comment.solucion},
          {key:'probarlo', label:'Cómo probar',     color:'text-blue-400',  bg:'bg-blue-500/5',  text:comment.comoProbarlo},
        ].map(({key,label,color,bg,text},i,arr)=>(
          <div key={key} className={`px-4 py-3.5 ${bg} ${i<arr.length-1?'border-b border-outline-variant/10':''}`}>
            <div className={`text-[9px] font-bold uppercase tracking-widest mb-2 ${color}`}>{label}</div>
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
    `flex-1 py-1.5 text-[11px] font-medium rounded-lg border transition-all ${active
      ? 'bg-primary text-on-primary border-primary'
      : 'bg-surface border-outline-variant/25 text-on-surface-variant/60 hover:border-primary/40'}`

  return (
    <div className="flex flex-col gap-4">
      {/* Font size */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/45 mb-2">Tamaño de texto</div>
        <div className="flex gap-1.5">
          {(['small','normal','large'] as FontSize[]).map(s=>(
            <button key={s} className={btnCls(disp.fontSize===s)} onClick={()=>onChange('fontSize',s)}>
              {s==='small'?'Pequeño':s==='normal'?'Normal':'Grande'}
            </button>
          ))}
        </div>
        <div className="mt-2 px-3 py-2 bg-surface/60 rounded-lg border border-outline-variant/10">
          <span className="text-on-surface-variant/60" style={{fontSize:FONT_PX[disp.fontSize]}}>
            Vista previa del tamaño de texto seleccionado.
          </span>
        </div>
      </div>

      {/* Density */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/45 mb-2">Densidad de cards</div>
        <div className="flex gap-1.5">
          {(['compact','comfortable'] as Density[]).map(d=>(
            <button key={d} className={btnCls(disp.density===d)} onClick={()=>onChange('density',d)}>
              {d==='compact'?'Compacta':'Cómoda'}
            </button>
          ))}
        </div>
      </div>

      {/* Line height */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/45 mb-2">Interlineado</div>
        <div className="flex gap-1.5">
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
  const save = async () => { setSaving(true); await onSave(local); setSaving(false); onClose() }

  const inp = 'w-full bg-surface border border-outline-variant/25 rounded-lg px-3 py-2 text-[13px] text-on-surface placeholder-on-surface-variant/30 focus:outline-none focus:border-primary/60 transition-colors'
  const lbl = 'block text-[11px] text-on-surface-variant/50 mb-1'

  const TAB_BTN = (t:ConfigTab, Icon:ComponentType<{size?:number}>, label:string) => (
    <button
      key={t}
      onClick={()=>setTab(t)}
      className={['flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium transition-all',
        tab===t ? 'bg-primary/10 text-primary' : 'text-on-surface-variant/50 hover:text-on-surface hover:bg-white/[0.04]'
      ].join(' ')}
    >
      <Icon size={16} />
      {label}
    </button>
  )

  return (
    <div className="absolute inset-0 bg-surface z-30 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/15 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Settings size={18} className="text-primary" />
          <span className="text-[14px] font-semibold text-on-surface">Configuración</span>
        </div>
        <button onClick={onClose} className="text-on-surface-variant/45 hover:text-on-surface transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-0 flex-shrink-0">
        {TAB_BTN('jira',    Network,   'Conexión')}
        {TAB_BTN('display', Settings,  'Visualización')}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {tab === 'jira' && (
          <div className="flex flex-col gap-5">
            {/* Jira */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/40 mb-3">Jira</div>
              <div className="flex flex-col gap-3">
                <div><label className={lbl}>Base URL</label><input className={inp} placeholder="https://company.atlassian.net" value={local.jiraUrl} onChange={set('jiraUrl')} /></div>
                <div><label className={lbl}>Email</label><input className={inp} placeholder="tu@empresa.com" value={local.jiraUser} onChange={set('jiraUser')} /></div>
                <div>
                  <label className={lbl}>API Token</label>
                  <input className={inp} type="password" placeholder={local.jiraToken==='__CONFIGURED__'?'●●●●●●●● (ya configurado)':'Jira API token'}
                    value={local.jiraToken==='__CONFIGURED__'?'':local.jiraToken} onChange={set('jiraToken')} />
                  <p className="text-[11px] text-on-surface-variant/30 mt-1">Jira → Configuración → Seguridad → API tokens</p>
                </div>
              </div>
            </div>
            {/* Repo */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/40 mb-3">Repositorio</div>
              <div className="flex flex-col gap-3">
                <div>
                  <label className={lbl}>Prefijo de proyecto</label>
                  <input className={inp} placeholder="WIN" value={local.projectPrefix} onChange={set('projectPrefix')} />
                  <p className="text-[11px] text-on-surface-variant/30 mt-1">Ej: 1234 → WIN-1234</p>
                </div>
                <div><label className={lbl}>Ruta del repositorio Wigos</label><input className={inp} placeholder="D:\repos\wigos" value={local.repoPath} onChange={set('repoPath')} /></div>
              </div>
            </div>
            {/* AI info */}
            <div className="px-4 py-3 bg-surface-container/60 rounded-xl border border-outline-variant/10">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/40 mb-1">Modelo IA activo</div>
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-primary tr-pulse" />
                <span className="text-[12px] text-on-surface font-medium">{aiModel || 'No configurado'}</span>
              </div>
              <p className="text-[11px] text-on-surface-variant/35 mt-1">Cambiá el modelo en Configuración → AI Service.</p>
            </div>
          </div>
        )}

        {tab === 'display' && (
          <DisplaySettings disp={disp} onChange={onDisplayChange} />
        )}
      </div>

      {tab === 'jira' && (
        <div className="px-5 py-4 border-t border-outline-variant/15 flex-shrink-0">
          <button onClick={()=>void save()} disabled={saving} className="w-full py-2.5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50" style={{background:'var(--gradient-brand)'}}>
            {saving?'Guardando…':'Guardar configuración'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Right panel — awaiting ─────────────────────────────────────────────────────
function AwaitingPanel({ plan, onExecute, onReset }: { plan:AnalysisPlan; onExecute:()=>void; onReset:()=>void }): JSX.Element {
  return (
    <div className="flex flex-col gap-4 tr-fadein">
      <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={20} className="text-primary tr-pulse" />
          <span className="text-[15px] font-semibold text-on-surface">Plan listo</span>
        </div>
        <p className="text-[13px] text-on-surface-variant/65 leading-relaxed mb-5">
          El plan de análisis fue generado. Revisá el detalle en el panel izquierdo y ejecutá el análisis completo cuando estés listo.
        </p>
        <div className="flex flex-col gap-2 mb-5 bg-surface/50 rounded-xl overflow-hidden border border-outline-variant/10">
          {plan.steps.map((s,i)=>(
            <div key={s.id} className={`flex items-start gap-3 px-4 py-3 ${i>0?'border-t border-outline-variant/8':''}`}>
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center mt-0.5">{i+1}</span>
              <div>
                <div className="text-[12px] font-medium text-on-surface">{s.label}</div>
                <div className="text-[11px] text-on-surface-variant/40 mt-0.5">{s.detail}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={onExecute} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white hover:opacity-90 transition-opacity" style={{background:'var(--gradient-brand)'}}>
            <Play size={17} />
            Ejecutar análisis completo
          </button>
          <button onClick={onReset} className="px-4 py-2.5 rounded-xl text-[13px] text-on-surface-variant/55 hover:text-on-surface hover:bg-white/[0.04] transition-colors">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ── Right panel — results ──────────────────────────────────────────────────────
function ResultsPanel({
  result, disp, onSaveHistory, onReset, isAlreadySaved, justSaved,
}: {
  result:AnalysisResult; disp:DisplayCfg; onSaveHistory:()=>void; onReset:()=>void
  isAlreadySaved:boolean; justSaved:boolean
}): JSX.Element {
  const [copied, setCopied] = useState<string|null>(null)
  const copy = (text:string, key:string) => void navigator.clipboard.writeText(text).then(()=>{setCopied(key);setTimeout(()=>setCopied(null),1500)})
  const pad = PAD_PX[disp.density]

  return (
    <div className="flex flex-col gap-4">

      {/* Root cause */}
      <div className="bg-surface-container rounded-2xl tr-fadein" style={{padding:pad}}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-5 rounded-full bg-amber-400 flex-shrink-0" />
            <Search size={16} className="text-amber-400" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/45">Causa raíz</span>
          </div>
          <button onClick={()=>copy(result.rootCause,'root')} className="text-on-surface-variant/30 hover:text-primary transition-colors">
            {copied==='root' ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </div>
        <p className="text-on-surface" style={{fontSize:FONT_PX[disp.fontSize],lineHeight:LINE_MAP[disp.lineHeight]}}>{result.rootCause}</p>
      </div>

      {/* Fix */}
      <div className="bg-surface-container rounded-2xl tr-fadein" style={{padding:pad,animationDelay:'.06s'}}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-5 rounded-full bg-green-400 flex-shrink-0" />
            <Wrench size={16} className="text-green-400" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/45">Solución propuesta</span>
          </div>
          <button onClick={()=>copy(result.fix,'fix')} className="text-on-surface-variant/30 hover:text-primary transition-colors">
            {copied==='fix' ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </div>
        <p className="text-on-surface" style={{fontSize:FONT_PX[disp.fontSize],lineHeight:LINE_MAP[disp.lineHeight]}}>{result.fix}</p>
        <DiffView diff={result.diff} />
      </div>

      {/* Affected files */}
      {result.affectedFiles.length > 0 && (
        <div className="bg-surface-container rounded-2xl tr-fadein" style={{padding:pad,animationDelay:'.12s'}}>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-5 rounded-full bg-primary/60 flex-shrink-0" />
            <FolderOpen size={16} className="text-primary/60" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/45">Archivos modificados</span>
            <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">{result.affectedFiles.length}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {result.affectedFiles.map(f=>(
              <div key={f} className="flex items-center gap-2 bg-surface rounded-lg px-3 py-2 border border-outline-variant/8">
                <FileText size={13} className="text-on-surface-variant/25" />
                <span className="font-mono text-on-surface-variant/65 truncate" style={{fontSize:FONT_PX[disp.fontSize]}}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ticket comment */}
      {result.ticketComment && (
        <div style={{animationDelay:'.18s'}}>
          <CommentCard comment={result.ticketComment} disp={disp} />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap pb-2 tr-fadein" style={{animationDelay:'.24s'}}>
        <button onClick={onSaveHistory} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-medium transition-colors ${justSaved ? 'bg-green-500/15 text-green-400' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}>
          {justSaved ? <><CheckCircle2 size={14} />Guardado</> : isAlreadySaved ? <><RotateCcw size={14} />Actualizar historial</> : <><Save size={14} />Guardar en historial</>}
        </button>
        <button onClick={()=>copy(`CAUSA RAÍZ:\n${result.rootCause}\n\nSOLUCIÓN:\n${result.fix}`,'all')} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] text-on-surface-variant/55 hover:text-on-surface hover:bg-white/[0.04] transition-colors">
          {copied==='all' ? <Check size={14} /> : <Copy size={14} />}Copiar análisis
        </button>
        <button onClick={onReset} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] text-on-surface-variant/55 hover:text-on-surface hover:bg-white/[0.04] transition-colors">
          <Plus size={14} />Nuevo ticket
        </button>
      </div>
    </div>
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
      const [url,user,token,repo,prefix,fs,dn,lh,provider,openModel,anthropicModel,ollamaModel] = await Promise.all([
        window.api.invoke<string|null>('settings:get','ticket-resolver.jira_url'),
        window.api.invoke<string|null>('settings:get','ticket-resolver.jira_user'),
        window.api.invoke<string|null>('settings:get','ticket-resolver.jira_token'),
        window.api.invoke<string|null>('settings:get','ticket-resolver.repo_path'),
        window.api.invoke<string|null>('settings:get','ticket-resolver.project_prefix'),
        window.api.invoke<string|null>('settings:get','ticket-resolver.ui.font_size'),
        window.api.invoke<string|null>('settings:get','ticket-resolver.ui.density'),
        window.api.invoke<string|null>('settings:get','ticket-resolver.ui.line_height'),
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
    await window.api.invoke('settings:set',`ticket-resolver.ui.${k === 'lineHeight' ? 'line_height' : k}`,v)
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

  const isConfigured = Boolean(config.jiraUrl && config.jiraUser && config.jiraToken)
  const showTwoCols  = phase !== 'idle'

  return (
    <div className="flex h-full overflow-hidden relative">

      {showConfig && (
        <ConfigPanel
          config={config} onSave={saveConfig} onClose={()=>setShowConfig(false)}
          disp={disp} onDisplayChange={(k,v)=>void handleDisplayChange(k,v)} aiModel={aiModel}
        />
      )}

      {/* History */}
      <aside className="w-48 flex-shrink-0 flex flex-col border-r border-outline-variant/15 bg-surface overflow-hidden">
        <div className="flex items-center justify-between px-3 pt-4 pb-2 flex-shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/40">Historial</span>
          <button onClick={resetToIdle} title="Nuevo ticket" className="text-on-surface-variant/35 hover:text-primary transition-colors">
            <Plus size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {history.length===0 ? (
            <p className="text-[11px] text-on-surface-variant/28 text-center px-3 pt-8 leading-relaxed">Sin tickets aún.<br/>Ingresá un número para empezar.</p>
          ) : history.map(entry=>(
            <div key={entry.id} onClick={()=>handleSelectHistory(entry)}
              className={['group relative flex flex-col px-3 py-2.5 mx-1 mb-0.5 rounded-xl cursor-pointer transition-colors',
                selectedId===entry.id?'bg-primary/10 text-primary':'hover:bg-white/[0.04] text-on-surface',
              ].join(' ')}>
              <span className="text-[12px] font-bold truncate">{entry.ticketKey}</span>
              <span className="text-[11px] text-on-surface-variant/50 truncate mt-0.5">{entry.summary}</span>
              <span className="text-[10px] text-on-surface-variant/30 mt-0.5 truncate">{entry.component}</span>
              <button onClick={e=>{void handleDeleteHistory(entry.id,e)}}
                className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 text-on-surface-variant/30 hover:text-red-400 transition-all">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-outline-variant/15 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Ticket size={19} className="text-primary flex-shrink-0" />
            <span className="text-[14px] font-semibold text-on-surface">Ticket Resolver</span>
            {ticket && <span className="text-[12px] text-on-surface-variant/40 truncate">· {ticket.key}</span>}
            {(phase==='analyzing'||phase==='planning') && (
              <span className="flex items-center gap-1.5 text-[11px] text-primary/70 bg-primary/8 px-2.5 py-1 rounded-full border border-primary/20 tr-fadein">
                <Spinner size={11} />{phase==='analyzing'?'Analizando...':'Planificando...'}
              </span>
            )}
            {aiModel && (
              <span className="hidden xl:flex items-center gap-1 text-[10px] text-on-surface-variant/30 bg-white/[0.04] px-2 py-1 rounded-full border border-outline-variant/10 flex-shrink-0">
                <Sparkles size={11} />
                {aiModel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 ml-3">
            <TokenCounter usage={sessionUsage} onReset={()=>void window.api.invoke('ticket-resolver:ai-usage-reset').then(()=>setSessionUsage(p=>({...p,inputTokens:0,outputTokens:0,calls:0})))} />
            <button onClick={()=>setShowConfig(true)} className="flex items-center gap-1.5 text-[12px] text-on-surface-variant/45 hover:text-on-surface transition-colors" title="Configuración">
              <Settings size={17} />
              {!isConfigured && <span className="text-amber-400 text-[11px] font-medium">Sin configurar</span>}
            </button>
          </div>
        </div>

        {/* IDLE */}
        {!showTwoCols && (
          <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-6 py-8 gap-6">
            {!isConfigured && (
              <div className="flex items-center gap-2 text-amber-400 text-[13px] bg-amber-400/10 border border-amber-400/20 px-4 py-3 rounded-xl w-full">
                <TriangleAlert size={16} className="flex-shrink-0" />
                <span className="whitespace-nowrap">Configurá las credenciales de Jira primero.</span>
                <button onClick={()=>setShowConfig(true)} className="underline font-medium ml-auto flex-shrink-0 hover:no-underline">Configurar</button>
              </div>
            )}
            <div className="w-full max-w-sm">
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <Ticket size={32} className="text-primary" />
                </div>
                <h2 className="text-[18px] font-bold text-on-surface">Ticket Resolver</h2>
                <p className="text-[13px] text-on-surface-variant/45 mt-1">Analizá tickets de Jira con inteligencia artificial</p>
                {aiModel && <p className="text-[11px] text-primary/50 mt-1">{aiModel}</p>}
              </div>
              <div className="flex gap-2">
                <input
                  value={ticketInput}
                  onChange={e=>setTicketInput(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter')void handleFetch()}}
                  placeholder={`${config.projectPrefix||'WIN'}-1234`}
                  autoFocus
                  className="flex-1 bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-[14px] text-on-surface placeholder-on-surface-variant/25 focus:outline-none focus:border-primary/60 transition-colors"
                />
                <button onClick={()=>void handleFetch()} disabled={!ticketInput.trim()||!isConfigured}
                  className="px-5 py-3 rounded-xl text-[13px] font-semibold text-white disabled:opacity-35 hover:opacity-90 transition-opacity"
                  style={{background:'var(--gradient-brand)'}}>
                  Load
                </button>
              </div>
              <p className="text-[11px] text-on-surface-variant/30 text-center mt-2">Solo el número o la clave (ej. 1234 o WIN-1234)</p>
            </div>
            {history.length > 0 && (
              <div className="w-full max-w-sm">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/30 mb-2">Recientes</div>
                <div className="flex flex-col gap-1">
                  {history.slice(0,4).map(e=>(
                    <button key={e.id} onClick={()=>handleSelectHistory(e)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-container/50 hover:bg-surface-container border border-outline-variant/10 hover:border-outline-variant/20 transition-all text-left">
                      <span className="text-[12px] font-bold text-primary w-24 flex-shrink-0">{e.ticketKey}</span>
                      <span className="text-[12px] text-on-surface-variant/55 truncate">{e.summary}</span>
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
            <div className="w-[360px] flex-shrink-0 overflow-y-auto border-r border-outline-variant/10 flex flex-col gap-3 p-4">
              <TicketDetailCard ticket={ticket} skeleton={phase==='fetching'} disp={disp} />
              {phase !== 'fetching' && <PlanCard plan={plan} skeleton={phase==='planning'} disp={disp} />}
              {snippets.length > 0 && (
                <div className="bg-surface-container rounded-2xl p-4 tr-fadein">
                  <div className="flex items-center gap-2 mb-3">
                    <Code2 size={14} className="text-on-surface-variant/35" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/35">
                      Código · {snippets.length} fragmento{snippets.length!==1?'s':''}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {snippets.map((s,i)=>(
                      <div key={i} className="rounded-xl overflow-hidden border border-outline-variant/10">
                        <div className="px-3 py-1.5 bg-surface text-[10px] font-mono text-on-surface-variant/35 border-b border-outline-variant/8 truncate">
                          {s.file} · {s.line}
                        </div>
                        <pre className="px-3 py-2 text-[11px] font-mono text-on-surface/55 overflow-x-auto whitespace-pre bg-surface/30 leading-relaxed max-h-28">
                          {s.context}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right col */}
            <div className="flex-1 overflow-y-auto p-5">
              {phase==='fetching' && (
                <div className="flex flex-col items-center justify-center h-full gap-4 tr-fadein">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center"><Spinner size={28}/></div>
                  <div className="text-center">
                    <div className="text-[14px] font-semibold text-on-surface mb-1">Conectando con Jira</div>
                    <div className="text-[12px] text-on-surface-variant/45">Obteniendo información del ticket...</div>
                  </div>
                </div>
              )}
              {phase==='planning' && (
                <div className="flex flex-col items-center justify-center h-full gap-4 tr-fadein">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Brain size={28} className="text-primary tr-pulse" />
                  </div>
                  <div className="text-center">
                    <div className="text-[14px] font-semibold text-on-surface mb-1">Generando plan</div>
                    <div className="text-[12px] text-on-surface-variant/45">La IA está analizando el contexto...</div>
                  </div>
                  <div className="flex gap-1.5">{[0,200,400].map(d=><div key={d} className="w-2 h-2 rounded-full bg-primary/45 animate-bounce" style={{animationDelay:`${d}ms`}}/>)}</div>
                </div>
              )}
              {phase==='awaiting' && plan && (
                <AwaitingPanel plan={plan} onExecute={()=>void handleExecute()} onReset={resetToIdle} />
              )}
              {phase==='analyzing' && (
                <AnalyzingPanel steps={steps} />
              )}
              {phase==='done' && result && (
                <ResultsPanel result={result} disp={disp} onSaveHistory={()=>void handleSaveHistory()} onReset={resetToIdle}
                  isAlreadySaved={history.some(h=>h.ticketKey===ticket?.key)}
                  justSaved={justSavedKey===ticket?.key} />
              )}
              {phase==='error' && (
                <div className="flex flex-col items-center justify-center h-full gap-4 tr-fadein">
                  <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center">
                    <CircleAlert size={28} className="text-red-400" />
                  </div>
                  <div className="text-center max-w-md">
                    <div className="text-[14px] font-semibold text-on-surface mb-2">
                      {error==='JIRA_NOT_CONFIGURED'?'Jira no configurado':'Ocurrió un error'}
                    </div>
                    <div className="text-[12px] text-on-surface-variant/50 leading-relaxed bg-surface-container rounded-xl px-4 py-3">{error}</div>
                  </div>
                  <div className="flex gap-2">
                    {error==='JIRA_NOT_CONFIGURED' && (
                      <button onClick={()=>setShowConfig(true)} className="px-4 py-2 rounded-xl text-[12px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                        Configurar Jira
                      </button>
                    )}
                    <button onClick={resetToIdle} className="px-4 py-2 rounded-xl text-[12px] font-medium text-on-surface-variant/55 hover:text-on-surface hover:bg-white/[0.04] transition-colors">
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
