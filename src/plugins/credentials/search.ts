import { KeyRound } from 'lucide-react'
import type { SearchContext, SearchProvider } from '../../core/search'
import type { Credential } from './types'
import { copyToClipboard, credentialsApi, displayHost, invalidateCredentials, loadCredentials, rankCredentials } from './data'

/** Enter: copies the password in main (counts a use, 30 s auto-clear). Locked → opens Claves to ask for the PIN. */
async function copyPassword(c: Credential, { dispatch, notify }: SearchContext): Promise<void> {
  if (!c.hasPassword) {
    notify('Esta credencial no tiene contraseña guardada', 'info')
    dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'credentials', action: 'open', payload: c.id })
    return
  }
  try {
    const r = await credentialsApi.copyPassword(c.id)
    if (r.ok) { invalidateCredentials(); notify('Contraseña copiada. Se borra en 30 s', 'success'); return }
    if (r.locked) {
      dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'credentials', action: 'copy-password', payload: c.id })
      return
    }
    notify(r.error, 'error')
  } catch {
    notify('No se pudo copiar al portapapeles', 'error')
  }
}

/** Shift+Enter: copies the username (through main so it counts as a use). */
async function copyUsername(c: Credential, { notify }: SearchContext): Promise<void> {
  if (!c.usuario) { notify('Esta credencial no tiene usuario', 'info'); return }
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

export const credentialsSearchProvider: SearchProvider = {
  id: 'credentials',
  group: 'Claves',
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
      hint: c.hasPassword ? 'Copiar contraseña' : 'Abrir',
      score,
      run: (ctx) => copyPassword(c, ctx),
      ...(c.usuario ? { altRun: (ctx: SearchContext) => copyUsername(c, ctx), altHint: 'Copiar usuario' } : {}),
    }))
  },
}
