import { describe, expect, it } from 'vitest'
import { isSecretSettingKey, maskSecretSettings, SECURE_SET_SENTINEL } from './settings-mask'

describe('settings mask', () => {
  it('detects secret keys but not public client ids', () => {
    expect(isSecretSettingKey('ai.openai_key')).toBe(true)
    expect(isSecretSettingKey('repo-search.github.token')).toBe(true)
    expect(isSecretSettingKey('ticket-resolver.jira_token')).toBe(true)
    expect(isSecretSettingKey('gastos.supabase_service_key')).toBe(true)
    expect(isSecretSettingKey('repo-search.github.client_id')).toBe(false)
    expect(isSecretSettingKey('ai.model')).toBe(false)
    expect(isSecretSettingKey('repo-search.aliases')).toBe(false)
  })
  it('masks configured secrets and leaves empty ones empty', () => {
    expect(maskSecretSettings({ 'ai.openai_key': 'sk-1', 'ai.anthropic_key': '', 'ai.model': 'gpt' }))
      .toEqual({ 'ai.openai_key': SECURE_SET_SENTINEL, 'ai.anthropic_key': '', 'ai.model': 'gpt' })
    expect(maskSecretSettings({ x: 'v' }, new Set(['x']))).toEqual({ x: SECURE_SET_SENTINEL })
  })
})
