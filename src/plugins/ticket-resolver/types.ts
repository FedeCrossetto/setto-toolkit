export interface JiraTicket {
  key: string
  summary: string
  description: string
  type: string
  priority: string
  status: string
  components: string[]
  reporter: string
  assignee: string | null
  created: string
  updated: string
}

export interface PlanStep {
  id: string
  label: string
  detail: string
}

export interface AnalysisPlan {
  component: string
  technology: string
  nature: string
  searchTerms: string[]
  steps: PlanStep[]
  estimatedTokens: number
}

export interface CodeSnippet {
  file: string
  line: number
  context: string
}

export interface DiffChunk {
  file: string
  lineStart: number
  original: string
  modified: string
}

export interface TicketComment {
  causa: string
  solucion: string
  comoProbarlo: string
}

export interface AnalysisResult {
  rootCause: string
  fix: string
  affectedFiles: string[]
  diff: DiffChunk[]
  ticketComment?: TicketComment
}

export interface HistoryEntry {
  id: string
  ticketKey: string
  summary: string
  component: string
  technology: string
  nature: string
  rootCause: string
  fix: string
  affectedFiles: string[]
  diff: DiffChunk[]
  createdAt: string
}

export type Phase = 'idle' | 'fetching' | 'planning' | 'awaiting' | 'analyzing' | 'done' | 'error'

export interface AnalysisStepUI {
  id: string
  label: string
  status: 'pending' | 'running' | 'done' | 'error'
  detail?: string
}

// ── Claude CLI Orchestrator types ────────────────────────────────────────────

export type FlowState =
  | 'idle'
  | 'building_context'
  | 'extracting_terms'
  | 'running_analysis'
  | 'analysis_ready'
  | 'awaiting_decision'
  | 'running_plan'
  | 'plan_ready'
  | 'error'

export interface OrchestratorAnalysis {
  analysis: string
  rootCause: string
  approach: string
  complexity: string
  risks: string
  raw: string
}

export interface OrchestratorPlan {
  plan: string
  files: string
  tests: string
  jiraComment: string
  raw: string
}
