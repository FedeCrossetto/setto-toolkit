import { useState, useEffect, useMemo, useRef } from 'react'
import Fuse from 'fuse.js'
import {
  BookMarked, Check, Copy, Download, Folder, LayoutGrid,
  Pencil, Pin, Plus, Search, Trash2, Upload, X,
} from 'lucide-react'
import type { Snippet, SnippetCollection, SnippetLanguage } from './types'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { sql } from '@codemirror/lang-sql'
import { markdown } from '@codemirror/lang-markdown'
import { yaml } from '@codemirror/lang-yaml'
import { python } from '@codemirror/lang-python'
import { xml } from '@codemirror/lang-xml'
import { java } from '@codemirror/lang-java'
import { cpp } from '@codemirror/lang-cpp'
import { useApp } from '../../core/AppContext'
import { useToast } from '../../core/components/Toast'
import { EmptyState } from '../../core/components/EmptyState'

// ── Constants ─────────────────────────────────────────────────────────────────

const LANGUAGES: SnippetLanguage[] = [
  'plaintext', 'javascript', 'typescript', 'python', 'sql', 'json',
  'html', 'css', 'bash', 'java', 'csharp', 'go', 'rust', 'yaml', 'xml', 'markdown',
]

const LANG_COLOR: Record<SnippetLanguage, string> = {
  plaintext: 'text-on-surface-variant',
  javascript: 'text-yellow-400',
  typescript: 'text-blue-400',
  python: 'text-green-400',
  sql: 'text-orange-400',
  json: 'text-accent',
  html: 'text-red-400',
  css: 'text-purple-400',
  bash: 'text-lime-400',
  java: 'text-red-300',
  csharp: 'text-purple-300',
  go: 'text-cyan-400',
  rust: 'text-orange-300',
  yaml: 'text-yellow-300',
  xml: 'text-red-300',
  markdown: 'text-on-surface-variant',
}

function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// ── Mixed content helpers ─────────────────────────────────────────────────────

type ContentBlock = { type: 'text'; value: string } | { type: 'image'; value: string }

const IMAGE_MARKER_RE = /!\[\]\((data:image\/[^)]+)\)/g

function parseContent(content: string): ContentBlock[] {
  const blocks: ContentBlock[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  IMAGE_MARKER_RE.lastIndex = 0
  while ((match = IMAGE_MARKER_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: 'text', value: content.slice(lastIndex, match.index) })
    }
    blocks.push({ type: 'image', value: match[1] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) {
    blocks.push({ type: 'text', value: content.slice(lastIndex) })
  }
  return blocks
}

function hasImages(content: string): boolean {
  return /!\[\]\(data:image\//.test(content)
}

// ── Empty state helpers ───────────────────────────────────────────────────────

function emptyForm() {
  return { title: '', language: 'plaintext' as SnippetLanguage, content: '', tags: [] as string[], description: '', pinned: false, collectionId: null as string | null, images: {} as Record<string, string> }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LangBadge({ lang }: { lang: SnippetLanguage }): JSX.Element {
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-container ${LANG_COLOR[lang]}`}>
      {lang}
    </span>
  )
}

function Tag({ label, onRemove }: { label: string; onRemove?: () => void }): JSX.Element {
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium">
      {label}
      {onRemove && (
        <button onClick={onRemove} className="hover:text-error transition-colors leading-none">
          <X size={11} />
        </button>
      )}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function SnippetManager(): JSX.Element {
  const { state } = useApp()
  const { show: showToast } = useToast()
  const dark = state.theme === 'dark'
  const [snippets, setSnippets]       = useState<Snippet[]>([])
  const [collections, setCollections] = useState<SnippetCollection[]>([])
  const [selected, setSelected]       = useState<Snippet | null>(null)
  const [search, setSearch]           = useState('')
  const [filter, setFilter]           = useState<string>('all')  // 'all' | 'pinned' | collectionId
  const [editing, setEditing]         = useState(false)
  const [form, setForm]               = useState(emptyForm())
  const [tagInput, setTagInput]       = useState('')
  const [copied, setCopied]           = useState(false)
  const [showNewCol, setShowNewCol]   = useState(false)
  const [newColName, setNewColName]   = useState('')

  // ── Load ──────────────────────────────────────────────────────────────────
  const reload = async (): Promise<void> => {
    const data = await window.api.invoke<{ snippets: Snippet[]; collections: SnippetCollection[] }>('snippets:load')
    setSnippets(data.snippets)
    setCollections(data.collections)
  }

  useEffect(() => { reload() }, [])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        startNew()
      }
      if (e.key === 'Escape' && editing) {
        setEditing(false)
        if (!selected) setForm(emptyForm())
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editing, selected]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Search + filter ───────────────────────────────────────────────────────
  const fuse = useMemo(() => new Fuse(snippets, {
    keys: ['title', 'content', 'tags', 'description'],
    threshold: 0.35,
  }), [snippets])

  const visible = useMemo(() => {
    let base = search.trim()
      ? fuse.search(search).map((r) => r.item)
      : [...snippets].sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        })
    if (filter === 'pinned') base = base.filter((s) => s.pinned)
    else if (filter !== 'all') base = base.filter((s) => s.collectionId === filter)
    return base
  }, [snippets, search, filter, fuse])

  // ── Actions ───────────────────────────────────────────────────────────────
  const saveSnippet = async (data: typeof form, id?: string): Promise<void> => {
    const now = new Date().toISOString()
    const snippetId = id ?? randomId()
    // Expand short placeholders ![img:id] back to full data URLs before persisting
    const expandedContent = data.content.replace(/!\[img:([^\]]+)\]/g, (match, imgId) => {
      const url = data.images[imgId]
      return url ? `![](${url})` : match
    })
    const { images: _images, ...rest } = data
    const snippet: Snippet = {
      id: snippetId,
      ...rest,
      content: expandedContent,
      createdAt: id ? (selected?.createdAt ?? now) : now,
      updatedAt: now,
    }
    await window.api.invoke('snippets:save', snippet)
    const fresh = await window.api.invoke<{ snippets: Snippet[]; collections: SnippetCollection[] }>('snippets:load')
    setSnippets(fresh.snippets)
    setCollections(fresh.collections)
    setSelected(fresh.snippets.find((s) => s.id === snippetId) ?? snippet)
    setEditing(false)
    showToast('Snippet saved', 'success', 2200)
  }

  const deleteSnippet = async (id: string): Promise<void> => {
    await window.api.invoke('snippets:delete', id)
    setSelected(null)
    await reload()
  }

  const togglePin = async (s: Snippet): Promise<void> => {
    const updated = { ...s, pinned: !s.pinned, updatedAt: new Date().toISOString() }
    await window.api.invoke('snippets:save', updated)
    setSelected(updated)
    await reload()
  }

  const copyContent = (content: string): void => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const createCollection = async (): Promise<void> => {
    if (!newColName.trim()) return
    const col: SnippetCollection = { id: randomId(), name: newColName.trim(), createdAt: new Date().toISOString() }
    const updated = [...collections, col]
    await window.api.invoke('snippets:collections-save', updated)
    setCollections(updated)
    setNewColName('')
    setShowNewCol(false)
  }

  const deleteCollection = async (id: string): Promise<void> => {
    const updated = collections.filter((c) => c.id !== id)
    await window.api.invoke('snippets:collections-save', updated)
    // Unassign snippets from deleted collection
    const updatedSnippets = snippets.map((s) => s.collectionId === id ? { ...s, collectionId: null } : s)
    for (const s of updatedSnippets.filter((s) => s.collectionId === null && snippets.find((o) => o.id === s.id)?.collectionId === id)) {
      await window.api.invoke('snippets:save', s)
    }
    setCollections(updated)
    if (filter === id) setFilter('all')
    await reload()
  }

  const startNew = (): void => {
    setForm({ ...emptyForm(), collectionId: filter !== 'all' && filter !== 'pinned' ? filter : null })
    setTagInput('')
    setSelected(null)
    setEditing(true)
  }

  const startEdit = (s: Snippet): void => {
    // Convert full data URLs to short placeholders so the textarea stays readable
    const images: Record<string, string> = {}
    let counter = 0
    IMAGE_MARKER_RE.lastIndex = 0
    const content = s.content.replace(IMAGE_MARKER_RE, (_, dataUrl) => {
      const id = `img-${++counter}`
      images[id] = dataUrl
      return `![img:${id}]`
    })
    setForm({ title: s.title, language: s.language, content, images, tags: [...s.tags], description: s.description, pinned: s.pinned, collectionId: s.collectionId })
    setTagInput('')
    setEditing(true)
  }

  const addTag = (): void => {
    const t = tagInput.trim().toLowerCase()
    if (t && !form.tags.includes(t)) setForm((f) => ({ ...f, tags: [...f.tags, t] }))
    setTagInput('')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left sidebar ──────────────────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 border-r border-outline-variant/20 flex flex-col bg-surface overflow-hidden">

        {/* Search */}
        <div className="px-3 pt-3 pb-2 flex-shrink-0">
          <div className="flex items-center gap-2 bg-surface-container border border-outline-variant/25 rounded-xl px-3 py-2">
            <Search size={15} className="text-on-surface-variant/50 flex-shrink-0" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search snippets..."
              className="flex-1 bg-transparent text-[12px] text-on-surface placeholder-on-surface-variant/40 outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-on-surface-variant/40 hover:text-on-surface-variant">
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          {/* All / Pinned */}
          {[
            { id: 'all',    label: 'All snippets', Icon: LayoutGrid, count: snippets.length },
            { id: 'pinned', label: 'Pinned',        Icon: Pin,        count: snippets.filter((s) => s.pinned).length },
          ].map(({ id, label, Icon, count }) => (
            <button key={id} onClick={() => setFilter(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-colors mb-0.5 ${filter === id ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'}`}>
              <Icon size={15} className="flex-shrink-0" />
              <span className="flex-1 text-left">{label}</span>
              <span className="text-[10px] opacity-50">{count}</span>
            </button>
          ))}

          {/* Collections */}
          {collections.length > 0 && (
            <div className="mt-2 mb-1 px-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">Collections</span>
            </div>
          )}
          {collections.map((col) => {
            const count = snippets.filter((s) => s.collectionId === col.id).length
            return (
              <div key={col.id} className="group flex items-center">
                <button onClick={() => setFilter(col.id)}
                  className={`flex-1 flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-colors mb-0.5 ${filter === col.id ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'}`}>
                  <Folder size={15} className="flex-shrink-0" />
                  <span className="flex-1 text-left truncate">{col.name}</span>
                  <span className="text-[10px] opacity-50">{count}</span>
                </button>
                <button onClick={() => deleteCollection(col.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 mr-1 text-on-surface-variant/40 hover:text-error transition-all"
                  title="Delete collection">
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}

          {/* New collection */}
          <div className="mt-1 px-2">
            {showNewCol ? (
              <form onSubmit={(e) => { e.preventDefault(); createCollection() }} className="flex gap-1">
                <input autoFocus value={newColName} onChange={(e) => setNewColName(e.target.value)}
                  placeholder="Collection name"
                  className="flex-1 text-xs bg-surface-container border border-outline-variant/30 rounded-lg px-2 py-1.5 text-on-surface placeholder-on-surface-variant/40 outline-none focus:ring-1 focus:ring-primary/50" />
                <button type="submit" className="text-primary"><Check size={16} /></button>
                <button type="button" onClick={() => setShowNewCol(false)} className="text-on-surface-variant/50"><X size={16} /></button>
              </form>
            ) : (
              <button onClick={() => setShowNewCol(true)}
                className="flex items-center gap-1.5 text-[11px] text-on-surface-variant/50 hover:text-on-surface-variant transition-colors px-1 py-1">
                <Plus size={13} />
                New collection
              </button>
            )}
          </div>
        </nav>

        {/* Sidebar footer: New + Export/Import */}
        <div className="px-3 pb-3 flex-shrink-0 border-t border-outline-variant/15 pt-3 flex flex-col gap-2">
          <button onClick={startNew}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[12px] font-semibold text-on-primary transition-all hover:opacity-90"
            style={{ background: 'var(--gradient-brand)' }}>
            <Plus size={15} />
            New snippet <span className="opacity-60 text-[10px] font-normal ml-1">Ctrl+N</span>
          </button>
          <div className="flex gap-1.5">
            <button onClick={async () => {
              try {
                const res = await window.api.invoke<{ ok: boolean; canceled?: boolean }>('snippets:export')
                if (res.ok) await reload()
              } catch { /* ignore */ }
            }}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium border border-outline-variant/30 text-on-surface-variant hover:text-primary hover:border-primary/40 transition-colors"
              title="Export snippets to JSON">
              <Download size={13} />
              Export
            </button>
            <button onClick={async () => {
              try {
                const res = await window.api.invoke<{ ok: boolean; canceled?: boolean; count?: number }>('snippets:import')
                if (res.ok) await reload()
              } catch { /* ignore */ }
            }}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium border border-outline-variant/30 text-on-surface-variant hover:text-primary hover:border-primary/40 transition-colors"
              title="Import snippets from JSON">
              <Upload size={13} />
              Import
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main panel ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Snippet list */}
        <div className="w-64 flex-shrink-0 border-r border-outline-variant/20 flex flex-col overflow-hidden bg-surface-container-low">
          <div className="px-3 py-2.5 border-b border-outline-variant/15 flex-shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
              {visible.length} snippet{visible.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {visible.length === 0 ? (
              <EmptyState
                icon={BookMarked}
                title={search ? 'No matches' : 'No snippets yet'}
                description={search ? 'Try a different search or clear the filter.' : 'Create your first snippet with Ctrl+N or the + button.'}
              />
            ) : (
              visible.map((s) => (
                <button key={s.id} onClick={() => { setSelected(s); setEditing(false) }}
                  className={`w-full text-left px-3 py-2.5 transition-colors border-b border-outline-variant/10 ${selected?.id === s.id ? 'bg-primary/10' : 'hover:bg-surface-container'}`}>
                  <div className="flex items-start gap-1.5">
                    {s.pinned && (
                      <Pin size={12} className="text-primary/60 flex-shrink-0 mt-0.5" />
                    )}
                    <p className={`text-[12px] font-medium truncate flex-1 ${selected?.id === s.id ? 'text-primary' : 'text-on-surface'}`}>{s.title || 'Untitled'}</p>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <LangBadge lang={s.language} />
                    {s.tags.slice(0, 2).map((t) => (
                      <span key={t} className="text-[10px] text-on-surface-variant/50">#{t}</span>
                    ))}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Detail / Editor panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {editing ? (
            <SnippetForm
              form={form}
              setForm={setForm}
              tagInput={tagInput}
              setTagInput={setTagInput}
              collections={collections}
              onAddTag={addTag}
              onSave={() => saveSnippet(form, selected?.id)}
              onCancel={() => { setEditing(false); if (!selected) setForm(emptyForm()) }}
            />
          ) : selected ? (
            <SnippetDetail
              snippet={selected}
              copied={copied}
              dark={dark}
              onCopy={() => copyContent(selected.content)}
              onEdit={() => startEdit(selected)}
              onDelete={() => deleteSnippet(selected.id)}
              onTogglePin={() => togglePin(selected)}
              collectionName={collections.find((c) => c.id === selected.collectionId)?.name}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <BookMarked size={56} className="text-on-surface-variant/15 mb-4 mx-auto" />
              <p className="text-sm text-on-surface-variant/40 font-medium">Select a snippet to view it</p>
              <p className="text-xs text-on-surface-variant/30 mt-1">or create a new one</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Snippet Viewer (CodeMirror read-only) ─────────────────────────────────────

function getLangExtension(lang: SnippetLanguage) {
  switch (lang) {
    case 'javascript':  return javascript()
    case 'typescript':  return javascript({ typescript: true })
    case 'json':        return json()
    case 'html':        return html()
    case 'css':         return css()
    case 'sql':         return sql()
    case 'markdown':    return markdown()
    case 'yaml':        return yaml()
    case 'python':      return python()
    case 'xml':         return xml()
    case 'java':        return java()
    case 'cpp':         return cpp()
    case 'csharp':      return cpp()
    default:            return null
  }
}

function SnippetViewer({ content, language, dark }: { content: string; language: SnippetLanguage; dark: boolean }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const langExt = getLangExtension(language)
    const view = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [
          basicSetup,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          ...(langExt ? [langExt] : []),
          ...(dark ? [oneDark] : []),
          EditorView.baseTheme({
            '&': { height: '100%', fontSize: '12px' },
            '.cm-editor': { height: '100%' },
            '.cm-scroller': { fontFamily: "'JetBrains Mono','Fira Code',monospace", lineHeight: '1.65', overflow: 'auto' },
            '.cm-content': { padding: '12px 0' },
          }),
        ],
      }),
      parent: ref.current,
    })
    return () => view.destroy()
  }, [content, language, dark])

  return <div ref={ref} className="h-full overflow-hidden" />
}

// ── Mixed Content Viewer ──────────────────────────────────────────────────────

function MixedContentViewer({ content }: { content: string }): JSX.Element {
  const blocks = useMemo(() => parseContent(content), [content])
  return (
    <div className="h-full overflow-auto p-4 space-y-3">
      {blocks.map((block, i) =>
        block.type === 'image' ? (
          <div key={i} className="flex justify-center">
            <img src={block.value} alt="" className="max-w-full rounded-lg object-contain" style={{ maxHeight: '400px' }} />
          </div>
        ) : block.value.trim() ? (
          <pre key={i} className="text-[12px] font-mono text-on-surface leading-relaxed whitespace-pre-wrap break-words">
            {block.value}
          </pre>
        ) : null
      )}
    </div>
  )
}

// ── Snippet Detail ─────────────────────────────────────────────────────────────

function SnippetDetail({
  snippet, copied, dark, collectionName,
  onCopy, onEdit, onDelete, onTogglePin,
}: {
  snippet: Snippet
  copied: boolean
  dark: boolean
  collectionName?: string
  onCopy: () => void
  onEdit: () => void
  onDelete: () => void
  onTogglePin: () => void
}): JSX.Element {
  const mixed = hasImages(snippet.content)
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-outline-variant/15 flex-shrink-0">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-semibold text-on-surface truncate">{snippet.title || 'Untitled'}</h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <LangBadge lang={snippet.language} />
              {collectionName && (
                <span className="flex items-center gap-0.5 text-[10px] text-on-surface-variant/50">
                  <Folder size={11} />
                  {collectionName}
                </span>
              )}
              {snippet.tags.map((t) => <Tag key={t} label={t} />)}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={onTogglePin} title={snippet.pinned ? 'Unpin' : 'Pin'}
              className={`p-2 rounded-lg transition-colors ${snippet.pinned ? 'text-primary bg-primary/10' : 'text-on-surface-variant/40 hover:text-on-surface hover:bg-surface-container'}`}>
              <Pin size={16} />
            </button>
            <button onClick={onEdit} title="Edit"
              className="p-2 rounded-lg text-on-surface-variant/40 hover:text-on-surface hover:bg-surface-container transition-colors">
              <Pencil size={16} />
            </button>
            <button onClick={onDelete} title="Delete"
              className="p-2 rounded-lg text-on-surface-variant/40 hover:text-error hover:bg-error/10 transition-colors">
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        {snippet.description && (
          <p className="mt-2 text-[12px] text-on-surface-variant/70 leading-relaxed">{snippet.description}</p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col p-4 gap-3">
        {/* Copy button — only for pure-code snippets */}
        {!mixed && snippet.content && (
          <button onClick={onCopy}
            className={`flex items-center gap-2 self-end px-4 py-2 rounded-xl text-sm font-semibold transition-all ${copied ? 'bg-accent/20 text-accent' : 'text-on-primary hover:opacity-90'}`}
            style={copied ? {} : { background: 'var(--gradient-brand)' }}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        )}

        {/* Content viewer */}
        <div className="flex-1 overflow-hidden rounded-xl border border-outline-variant/20">
          {!snippet.content ? (
            <div className="h-full flex items-center justify-center">
              <span className="text-xs text-on-surface-variant/30 italic">No content</span>
            </div>
          ) : mixed ? (
            <MixedContentViewer content={snippet.content} />
          ) : (
            <SnippetViewer content={snippet.content} language={snippet.language} dark={dark} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Snippet Form ───────────────────────────────────────────────────────────────

function SnippetForm({
  form, setForm, tagInput, setTagInput, collections, onAddTag, onSave, onCancel,
}: {
  form: ReturnType<typeof emptyForm>
  setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof emptyForm>>>
  tagInput: string
  setTagInput: React.Dispatch<React.SetStateAction<string>>
  collections: SnippetCollection[]
  onAddTag: () => void
  onSave: () => void
  onCancel: () => void
}): JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        if (form.title.trim() && form.content.trim()) onSave()
      }
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [form.title, form.content, onSave, onCancel])

  const insertImageMarker = (dataUrl: string): void => {
    const id = 'img-' + Math.random().toString(36).slice(2, 7)
    const marker = `![img:${id}]`
    const ta = textareaRef.current
    const start = ta ? ta.selectionStart : -1
    const end   = ta ? ta.selectionEnd   : -1
    setForm((f) => {
      const s = start >= 0 ? start : f.content.length
      const e = end   >= 0 ? end   : f.content.length
      return {
        ...f,
        content: f.content.slice(0, s) + marker + f.content.slice(e),
        images: { ...f.images, [id]: dataUrl },
      }
    })
    if (ta) {
      setTimeout(() => {
        ta.selectionStart = ta.selectionEnd = (start >= 0 ? start : ta.value.length) + marker.length
        ta.focus()
      }, 0)
    }
  }

  const loadImageFile = (file: File): void => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      insertImageMarker(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  const handlePaste = (e: React.ClipboardEvent): void => {
    const imageItem = Array.from(e.clipboardData.items).find((item) => item.type.startsWith('image/'))
    if (imageItem) {
      e.preventDefault()
      const file = imageItem.getAsFile()
      if (file) loadImageFile(file)
    }
  }

  const handleDrop = (e: React.DragEvent): void => {
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) {
      e.preventDefault()
      loadImageFile(file)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" onPaste={handlePaste} onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
      {/* Form header */}
      <div className="px-6 py-3 border-b border-outline-variant/15 flex items-center justify-between flex-shrink-0">
        <h3 className="text-[13px] font-semibold text-on-surface">
          {form.title ? `Editing "${form.title}"` : 'New snippet'}
        </h3>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-on-surface-variant hover:bg-surface-container transition-colors">
            Cancel
          </button>
          <button onClick={onSave} disabled={!form.title.trim() || !form.content.trim()}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold text-on-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:opacity-90"
            style={{ background: 'var(--gradient-brand)' }}>
            Save
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* Title */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60 mb-1.5">Title *</label>
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. SQL active users query"
            className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/40 outline-none focus:ring-1 focus:ring-primary/50" />
        </div>

        {/* Language + Collection row */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60 mb-1.5">Language</label>
            <select value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value as SnippetLanguage }))}
              className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-3 py-2 text-sm text-on-surface outline-none focus:ring-1 focus:ring-primary/50">
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          {collections.length > 0 && (
            <div className="flex-1">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60 mb-1.5">Collection</label>
              <select value={form.collectionId ?? ''} onChange={(e) => setForm((f) => ({ ...f, collectionId: e.target.value || null }))}
                className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-3 py-2 text-sm text-on-surface outline-none focus:ring-1 focus:ring-primary/50">
                <option value="">None</option>
                {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60 mb-1.5">Description</label>
          <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Optional — when or why to use this snippet"
            className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/40 outline-none focus:ring-1 focus:ring-primary/50" />
        </div>

        {/* Tags */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60 mb-1.5">Tags</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {form.tags.map((t) => (
              <Tag key={t} label={t} onRemove={() => setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }))} />
            ))}
          </div>
          <div className="flex gap-2">
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAddTag() } }}
              placeholder="Add tag and press Enter"
              className="flex-1 bg-surface-container border border-outline-variant/30 rounded-xl px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/40 outline-none focus:ring-1 focus:ring-primary/50" />
            <button type="button" onClick={onAddTag} disabled={!tagInput.trim()}
              className="px-3 py-2 rounded-xl text-xs font-medium border border-outline-variant/30 text-on-surface-variant hover:text-primary hover:border-primary/40 disabled:opacity-40 transition-colors">
              Add
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col" style={{ minHeight: '200px' }}>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60 mb-1.5">Content *</label>
          <textarea ref={textareaRef} value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            placeholder="Paste code or notes here... drag & drop or paste images inline"
            className="flex-1 w-full bg-surface-container border border-outline-variant/30 rounded-xl px-3 py-2.5 text-[12px] font-mono text-on-surface placeholder-on-surface-variant/40 outline-none focus:ring-1 focus:ring-primary/50 resize-none leading-relaxed"
            style={{ minHeight: '200px' }} />
        </div>

        {/* Pin */}
        <label className="flex items-center gap-2.5 cursor-pointer">
          <div onClick={() => setForm((f) => ({ ...f, pinned: !f.pinned }))}
            className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${form.pinned ? 'bg-primary' : 'bg-outline-variant/40'}`}>
            <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${form.pinned ? 'translate-x-4' : 'translate-x-0'}`} />
          </div>
          <span className="text-[12px] text-on-surface-variant">Pin this snippet</span>
        </label>
      </div>
    </div>
  )
}
