import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const CredentialsPlugin = lazy(() => import('./CredentialsPlugin').then((m) => ({ default: m.CredentialsPlugin })))

export const credentialsPlugin: PluginManifest = {
  id: 'credentials',
  name: 'Claves',
  description: 'Usuarios y contraseñas cifrados, con copia segura',
  icon: 'key',
  section: 'personal',
  component: CredentialsPlugin,
  keywords: ['claves', 'credenciales', 'contraseñas', 'passwords', 'usuarios', 'login', 'vault'],
}
