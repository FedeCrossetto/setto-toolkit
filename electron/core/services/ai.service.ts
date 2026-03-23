import crypto from 'crypto'
import type { DatabaseService } from './db.service'
import type { SettingsService } from './settings.service'

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIResponse {
  text: string
  cached: boolean
}

interface CacheEntry {
  response: string
  model: string
  createdAt: number
}

type CacheStore = Record<string, CacheEntry>

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const CACHE_FILE = 'ai-cache.json'

export class AIService {
  private cache: CacheStore

  constructor(
    private db: DatabaseService,
    private settings: SettingsService
  ) {
    this.cache = db.readEncryptedJSON<CacheStore>(CACHE_FILE) ?? {}
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
    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> }
    return data.choices[0]?.message?.content ?? ''
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
    const data = (await response.json()) as { content: Array<{ type: string; text: string }> }
    return data.content.find((c) => c.type === 'text')?.text ?? ''
  }

  private async completeOllama(messages: AIMessage[]): Promise<string> {
    const baseUrl = (this.settings.get('ai.ollama_url') ?? 'http://localhost:11434').replace(/\/$/, '')
    const model = this.settings.get('ai.ollama_model') ?? 'llama3'

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
    })
    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} — is Ollama running at ${baseUrl}?`)
    }
    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> }
    return data.choices[0]?.message?.content ?? ''
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
