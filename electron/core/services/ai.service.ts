import crypto from 'crypto'
import http from 'http'
import https from 'https'
import type { DatabaseService } from './db.service'
import type { SettingsService } from './settings.service'

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

export interface AIResponse {
  text: string
  cached: boolean
  usage?: TokenUsage
}

interface CacheEntry {
  response: string
  model: string
  createdAt: number
}

type CacheStore = Record<string, CacheEntry>

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const CACHE_FILE = 'ai-cache.json'

const CONTEXT_WINDOW = 200_000 // Claude Sonnet context window

export interface AISessionUsage {
  inputTokens: number
  outputTokens: number
  calls: number
  contextWindowSize: number
}

export class AIService {
  private cache: CacheStore
  private session: AISessionUsage = { inputTokens: 0, outputTokens: 0, calls: 0, contextWindowSize: CONTEXT_WINDOW }

  constructor(
    private db: DatabaseService,
    private settings: SettingsService
  ) {
    this.cache = db.readEncryptedJSON<CacheStore>(CACHE_FILE) ?? {}
  }

  getSessionUsage(): AISessionUsage {
    return { ...this.session }
  }

  resetSessionUsage(): void {
    this.session = { inputTokens: 0, outputTokens: 0, calls: 0, contextWindowSize: CONTEXT_WINDOW }
  }

  private hash(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex')
  }

  private getCached(key: string): string | null {
    const entry = this.cache[key]
    if (!entry) return null
    if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
      delete this.cache[key]
      this.db.writeEncryptedJSON(CACHE_FILE, this.cache)
      return null
    }
    return entry.response
  }

  private saveCache(key: string, response: string, model: string): void {
    this.cache[key] = { response, model, createdAt: Date.now() }
    this.db.writeEncryptedJSON(CACHE_FILE, this.cache)
  }

  private async completeOpenAI(messages: AIMessage[]): Promise<string> {
    const apiKey = this.settings.get('ai.openai_key') ?? ''
    if (!apiKey) throw new Error('NO_API_KEY')

    const model = this.settings.get('ai.model') ?? 'gpt-4o-mini'
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: 1000 }),
    })
    if (!response.ok) {
      const err = (await response.json()) as { error?: { message?: string } }
      throw new Error(err.error?.message ?? `OpenAI API error: ${response.status}`)
    }
    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>
      usage: { prompt_tokens: number; completion_tokens: number }
    }
    this.session.inputTokens  += data.usage?.prompt_tokens     ?? 0
    this.session.outputTokens += data.usage?.completion_tokens ?? 0
    this.session.calls        += 1
    const text = data.choices[0]?.message?.content ?? ''
    if (!text) throw new Error('AI returned an empty response')
    return text
  }

  private async completeAnthropic(messages: AIMessage[]): Promise<string> {
    const apiKey = this.settings.get('ai.anthropic_key') ?? ''
    if (!apiKey) throw new Error('NO_API_KEY')

    const model = this.settings.get('ai.anthropic_model') ?? 'claude-haiku-4-5-20251001'

    // Anthropic separates system messages from the messages array
    const systemMsg = messages.find((m) => m.role === 'system')?.content
    const userMessages = messages.filter((m) => m.role !== 'system')

    const body: Record<string, unknown> = { model, max_tokens: 1000, messages: userMessages }
    if (systemMsg) body.system = systemMsg

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const err = (await response.json()) as { error?: { message?: string } }
      throw new Error(err.error?.message ?? `Anthropic API error: ${response.status}`)
    }
    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>
      usage: { input_tokens: number; output_tokens: number }
    }
    const usage: TokenUsage = {
      inputTokens:  data.usage?.input_tokens  ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    }
    this.session.inputTokens  += usage.inputTokens
    this.session.outputTokens += usage.outputTokens
    this.session.calls        += 1
    const text = data.content.find((c) => c.type === 'text')?.text ?? ''
    if (!text) throw new Error('AI returned an empty response')
    return text
  }

  private completeOllama(messages: AIMessage[]): Promise<string> {
    const baseUrl      = (this.settings.get('ai.ollama_url') ?? 'http://localhost:11434').replace(/\/$/, '')
    const model        = this.settings.get('ai.ollama_model') ?? 'llama3'
    const rawTimeout   = parseInt(this.settings.get('ai.ollama_timeout') ?? '30', 10)
    const timeoutMins  = Number.isNaN(rawTimeout) ? 30 : Math.min(Math.max(rawTimeout, 5), 120)
    const TIMEOUT      = timeoutMins * 60 * 1000

    return new Promise((resolve, reject) => {
      // think:false disables slow reasoning/thinking mode on qwen3, deepseek-r1, etc.
      const body   = JSON.stringify({ model, messages, stream: false, think: false })
      const parsed = new URL(`${baseUrl}/api/chat`)
      const isHttps = parsed.protocol === 'https:'
      const transport = isHttps ? https : http

      const req = transport.request(
        {
          hostname: parsed.hostname,
          port:     parsed.port || (isHttps ? 443 : 80),
          path:     parsed.pathname,
          method:   'POST',
          headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
          timeout:  TIMEOUT,
        },
        (res) => {
          let raw = ''
          const MAX_BYTES = 4 * 1024 * 1024 // 4 MB guard against runaway responses
          res.on('data', (chunk: Buffer) => {
            if (raw.length + chunk.length > MAX_BYTES) {
              req.destroy()
              reject(new Error('Ollama response exceeded 4 MB — something went wrong'))
              return
            }
            raw += chunk.toString()
          })
          res.on('end', () => {
            if (res.statusCode !== 200) {
              reject(new Error(`Ollama error: ${res.statusCode} — ${raw.slice(0, 200)}`))
              return
            }
            try {
              const data = JSON.parse(raw) as { message?: { content?: string } }
              // Strip thinking blocks (<think>...</think>) from qwen3/deepseek-r1 responses
              const content = (data.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
              if (!content) { reject(new Error('AI returned an empty response')); return }
              resolve(content)
            } catch {
              reject(new Error('Ollama returned invalid JSON'))
            }
          })
        },
      )

      req.on('timeout', () => {
        req.destroy()
        reject(new Error(`Ollama timeout (${timeoutMins} min) — the model took too long. Increase the timeout in Settings → AI or use a lighter model.`))
      })
      req.on('error', (err) => reject(new Error(`Ollama error: ${err.message}`)))
      req.write(body)
      req.end()
    })
  }

  async complete(messages: AIMessage[], options?: { skipCache?: boolean }): Promise<AIResponse> {
    const provider = this.settings.get('ai.provider') ?? 'openai'
    const cacheKey = this.hash(JSON.stringify({ messages, provider }))

    if (!options?.skipCache) {
      const cached = this.getCached(cacheKey)
      if (cached) return { text: cached, cached: true }
    }

    let text: string
    if (provider === 'anthropic') {
      text = await this.completeAnthropic(messages)
    } else if (provider === 'ollama') {
      text = await this.completeOllama(messages)
    } else {
      text = await this.completeOpenAI(messages)
    }

    const model =
      provider === 'anthropic' ? (this.settings.get('ai.anthropic_model') ?? 'claude-haiku-4-5-20251001')
      : provider === 'ollama'   ? (this.settings.get('ai.ollama_model') ?? 'llama3')
      :                           (this.settings.get('ai.model') ?? 'gpt-4o-mini')
    this.saveCache(cacheKey, text, model)

    return { text, cached: false }
  }
}
