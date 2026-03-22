import { useState, useCallback, useRef } from 'react'
import type { HttpRequest, HttpResponse, HistoryEntry, Environment } from '../types'

export type RunnerStatus = 'idle' | 'loading' | 'success' | 'error'

export function useRequestRunner(environments: Environment[]) {
  const [status, setStatus] = useState<RunnerStatus>('idle')
  const [response, setResponse] = useState<HttpResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const cancelledRef = useRef(false)

  const activeEnv = environments.find((e) => e.isActive)
  const envVars = activeEnv?.variables ?? {}

  const loadHistory = useCallback(async () => {
    const data = await window.api.invoke<HistoryEntry[]>('api-tester:history-get')
    setHistory(data ?? [])
  }, [])

  const clearHistory = useCallback(async () => {
    await window.api.invoke('api-tester:history-clear')
    setHistory([])
  }, [])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    setStatus('idle')
    setError(null)
  }, [])

  const execute = useCallback(async (request: HttpRequest) => {
    cancelledRef.current = false
    setStatus('loading')
    setError(null)
    setResponse(null)
    try {
      const res = await window.api.invoke<HttpResponse>('api-tester:execute', {
        request,
        envVars,
        timeoutMs: 30_000,
      })
      if (cancelledRef.current) return
      setResponse(res)
      setStatus('success')
      loadHistory()
    } catch (e) {
      if (cancelledRef.current) return
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg === 'TIMEOUT' ? 'Request timed out (30s)' : msg)
      setStatus('error')
    }
  }, [envVars, loadHistory])

  return { status, response, error, history, execute, cancel, loadHistory, clearHistory }
}
