/**
 * IPC channel naming convention: `pluginId:action`
 * All channels are registered via plugin handlers through plugin-loader.
 * This file documents known channels for discoverability.
 */
export const IPC = {
  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_DELETE: 'settings:delete',
  SETTINGS_GET_ALL: 'settings:getAll',

  // Repo Search (Bitbucket, GitHub, ...)
  REPO_SEARCH_LOGIN: 'repo-search:login',
  REPO_SEARCH_LOGOUT: 'repo-search:logout',
  REPO_SEARCH_ME: 'repo-search:me',
  REPO_SEARCH_SEARCH: 'repo-search:search',

  // Smart Diff
  SMART_DIFF_ANALYZE: 'smart-diff:analyze'
} as const
