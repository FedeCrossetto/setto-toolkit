import { useState, useEffect, useCallback } from 'react'
import type { Collection, HttpRequest } from '../types'
import { randomUUID } from '../utils'

export function useCollections() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const data = await window.api.invoke<Collection[]>('api-tester:collections-get')
    setCollections(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const createCollection = useCallback(async (name: string) => {
    const col = await window.api.invoke<Collection>('api-tester:collection-create', name)
    setCollections((prev) => [...prev, col])
    return col
  }, [])

  const deleteCollection = useCallback(async (id: string) => {
    await window.api.invoke('api-tester:collection-delete', id)
    setCollections((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const saveRequest = useCallback(async (request: HttpRequest) => {
    const updated = await window.api.invoke<Collection>('api-tester:request-save', request)
    setCollections((prev) => prev.map((c) => c.id === updated.id ? updated : c))
  }, [])

  const deleteRequest = useCallback(async (collectionId: string, requestId: string) => {
    await window.api.invoke('api-tester:request-delete', collectionId, requestId)
    setCollections((prev) => prev.map((c) =>
      c.id === collectionId
        ? { ...c, requests: c.requests.filter((r) => r.id !== requestId) }
        : c
    ))
  }, [])

  const duplicateRequest = useCallback(async (request: HttpRequest) => {
    const copy: HttpRequest = {
      ...request,
      id: randomUUID(),
      name: `${request.name} (copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await saveRequest(copy)
    return copy
  }, [saveRequest])

  return { collections, loading, createCollection, deleteCollection, saveRequest, deleteRequest, duplicateRequest, reload: load }
}
