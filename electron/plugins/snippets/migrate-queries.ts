import type { Snippet, SnippetCollection } from '../../../src/plugins/snippets/types'

/** Minimal shape of a Gastos "Queries" board item (see `queries:load`). */
export interface LegacyQuery {
  id: string
  motor?: string
  descripcion?: string
  query?: string
  tags?: string[]
  orden?: number
}

export const QUERIES_COLLECTION_NAME = 'Queries'

export interface QueriesMigrationResult {
  snippets: Snippet[]
  collections: SnippetCollection[]
  added: number
}

/** Stable snippet id for an imported query, so re-running the import never duplicates. */
export function snippetIdForQuery(queryId: string): string {
  return `query-${queryId}`
}

/**
 * Pure, idempotent merge of the legacy Gastos queries into the snippet library.
 * Each query becomes a `sql` snippet inside the "Queries" collection (created if
 * missing). Queries already imported (same stable id) are skipped.
 */
export function migrateQueries(
  snippets: Snippet[],
  collections: SnippetCollection[],
  queries: LegacyQuery[],
  now: Date = new Date(),
): QueriesMigrationResult {
  const valid = queries.filter((q) => q && typeof q.id === 'string' && q.id)
  const existingIds = new Set(snippets.map((s) => s.id))
  const pending = valid.filter((q) => !existingIds.has(snippetIdForQuery(q.id)))
  if (pending.length === 0) return { snippets, collections, added: 0 }

  let nextCollections = collections
  let collection = collections.find((c) => c.name.trim().toLowerCase() === QUERIES_COLLECTION_NAME.toLowerCase())
  if (!collection) {
    collection = { id: 'col-queries', name: QUERIES_COLLECTION_NAME, createdAt: now.toISOString() }
    nextCollections = [...collections, collection]
  }

  const iso = now.toISOString()
  const imported: Snippet[] = [...pending]
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .map((q) => {
      const tags = Array.isArray(q.tags) ? q.tags.filter((t) => typeof t === 'string' && t.trim()) : []
      const motor = q.motor?.trim()
      if (motor && !tags.some((t) => t.toLowerCase() === motor.toLowerCase())) tags.push(motor)
      return {
        id: snippetIdForQuery(q.id),
        title: q.descripcion?.trim() || 'Query sin título',
        language: 'sql',
        content: q.query ?? '',
        tags,
        description: motor ? `Importado de Gastos › Queries (${motor})` : 'Importado de Gastos › Queries',
        pinned: false,
        collectionId: collection!.id,
        createdAt: iso,
        updatedAt: iso,
      }
    })

  return { snippets: [...snippets, ...imported], collections: nextCollections, added: imported.length }
}
