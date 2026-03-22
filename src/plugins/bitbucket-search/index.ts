import type { PluginManifest } from '../../core/types'
import { BitbucketSearch } from './BitbucketSearch'

export const bitbucketSearchPlugin: PluginManifest = {
  id: 'bitbucket-search',
  name: 'Bitbucket Search',
  description: 'Search code across all Bitbucket workspace repositories',
  icon: 'database_search',
  component: BitbucketSearch,
  keywords: ['bitbucket', 'search', 'code', 'repository', 'refactor']
}
