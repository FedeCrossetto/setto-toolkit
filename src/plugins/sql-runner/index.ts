import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const SqlRunner = lazy(() => import('./SqlRunner').then((m) => ({ default: m.SqlRunner })))

export const sqlRunnerPlugin: PluginManifest = {
  id: 'sql-runner',
  name: 'Consultas',
  description: 'SQL contra tus bases (Main, LPS, QA) sin perder nunca lo escrito; comparar ambientes',
  icon: 'database',
  component: SqlRunner,
  keywords: ['sql', 'consulta', 'query', 'select', 'base de datos', 'ssms', 'general params', 'gp', 'comparar', 'ambientes'],
}
