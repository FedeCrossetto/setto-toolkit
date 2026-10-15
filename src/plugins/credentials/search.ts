import { KeyRound } from 'lucide-react'
import type { SearchProvider } from '../../core/search'
import type { Credential } from './types'
import { copyToClipboard, credentialsApi, displayHost, invalidateCredentials, loadCredentials, rankCredentials } from './data'

export const credentialsSearchProvider: SearchProvider = {
  id: 'credentials',
  group: 'Credenciales',
  pluginId: 'credentials',
  async search(query) {
    if (!query) return []
    let items: Credential[]
    try {
      items = await loadCredentials()
    } catch {
      return []
    }
    return rankCredentials(items, query).map(({ item: c, score }) => ({
      id: `credentials:${c.id}`,
      title: c.nombre,
      subtitle: [c.usuario, displayHost(c.url)].filter(Boolean).join(' · '),
      icon: KeyRound,
      hint: c.usuario ? 'Enter copia el usuario' : 'Enter abre',
      score,
      run: async ({ dispatch, notify }) => {
        // Only the username is ever copied from the palette, never the password.
        // Copied through main so it counts as a use (ranking by usage).
        if (c.usuario) {
          try {
            const r = await credentialsApi.copyUsername(c.id).catch(async () => {
              await copyToClipboard(c.usuario)
              return { ok: true as const, usedAt: Date.now() }
            })
            if (r.ok) { invalidateCredentials(); notify('Usuario copiado', 'success') }
            else notify(r.error, 'error')
          } catch {
            notify('No se pudo copiar al portapapeles', 'error')
          }
        }
        dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'credentials', action: 'open', payload: c.id })
      },
    }))
  },
}
