import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const RepoSearch = lazy(() => import('./RepoSearch').then((m) => ({ default: m.RepoSearch })))

export const repoSearchPlugin: PluginManifest = {
  id: 'repo-search',
  name: 'Repo Search',
  description: 'Search code across repositories — Bitbucket, GitHub and more',
  icon: 'folder_search',
  component: RepoSearch,
  keywords: ['search', 'code', 'repository', 'bitbucket', 'github', 'refactor'],
}
