import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const RepoSearch = lazy(() => import('./RepoSearch').then((m) => ({ default: m.RepoSearch })))

export const repoSearchPlugin: PluginManifest = {
  id: 'repo-search',
  name: 'Buscar en repos',
  description: 'Buscá código en Bitbucket, GitHub y GitLab',
  icon: 'repo-search',
  section: 'dev',
  defaultDisabled: true,
  component: RepoSearch,
  keywords: ['search', 'code', 'repository', 'bitbucket', 'github', 'refactor'],
}
