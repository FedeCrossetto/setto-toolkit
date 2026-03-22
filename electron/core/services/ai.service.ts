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
    this.cache = db.readJSON<CacheStore>(CACHE_FILE) ?? {}
  }

  private hash(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex')
  }

  private getCached(key: string): string | null {
    const entry = this.cache[key]
    if (!entry) return null
    if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
      delete this.cache[key]
      this.db.writeJSON(CACHE_FILE, this.cache)
      return null
    }
    return entry.response
  }

  private saveCache(key: string, response: string, model: string): void {
    this.cache[key] = { response, model, createdAt: Date.now() }
    this.db.writeJSON(CACHE_FILE, this.cache)
  }

  async complete(messages: AIMessage[], options?: { skipCache?: boolean }): Promise<AIResponse> {
    const apiKey = this.settings.get('ai.openai_key') ?? ''
    if (!apiKey) {
      throw new Error('NO_API_KEY')
    }

    const model = this.settings.get('ai.model') ?? 'gpt-4o-mini'
    const cacheKey = this.hash(JSON.stringify({ messages, model }))

    if (!options?.skipCache) {
      const cached = this.getCached(cacheKey)
      if (cached) return { text: cached, cached: true }
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, messages, max_tokens: 1000 })
    })

    if (!response.ok) {
      const err = (await response.json()) as { error?: { message?: string } }
      throw new Error(err.error?.message ?? `AI API error: ${response.status}`)
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>
    }
    const text = data.choices[0]?.message?.content ?? ''
    this.saveCache(cacheKey, text, model)

    return { text, cached: false }
  }
}
