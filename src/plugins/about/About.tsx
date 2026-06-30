import { useEffect, useState, type ComponentType } from 'react'
import { Database, Lock, ShieldCheck, Tag, Wrench } from 'lucide-react'

const INFO_ICONS: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  category:  Tag,
  security:  ShieldCheck,
  storage:   Database,
  lock:      Lock,
  construction: Wrench,
}

export function About(): JSX.Element {
  const [version, setVersion] = useState<string>('...')

  useEffect(() => {
    window.api.invoke<string>('app:version').then(setVersion).catch(() => setVersion('—'))
  }, [])

  return (
    <div className="p-8 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-5 mb-10">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
          <Wrench size={32} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">Setto Toolkit</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Versión <span className="font-mono text-primary">{version}</span>
          </p>
        </div>
      </div>

      {/* Info cards */}
      <div className="space-y-3">
        <InfoRow icon="category" label="Arquitectura" value="Electron + React + TypeScript" />
        <InfoRow icon="security" label="Seguridad del renderer" value="Sandbox · Aislamiento de contexto · Allowlist de IPC" />
        <InfoRow icon="storage" label="Almacenamiento" value="Solo local — directorio userData" />
        <InfoRow icon="lock" label="Secretos" value="Cifrados con safeStorage del SO" />
      </div>

      {/* Divider */}
      <div className="my-8 border-t border-outline-variant/15" />

      {/* Description */}
      <p className="text-sm text-on-surface-variant leading-relaxed">
        Setto Toolkit es un espacio de trabajo modular para desarrolladores pensado para las tareas
        del día a día — testing de APIs, comparación de código con análisis por IA, búsqueda en
        repositorios de Bitbucket y GitHub, y un editor de archivos liviano. Todos los datos quedan
        localmente en tu equipo.
      </p>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }): JSX.Element {
  const Icon = INFO_ICONS[icon] ?? Tag
  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-surface rounded-xl border border-outline-variant/15">
      <Icon size={18} className="text-on-surface-variant/50 flex-shrink-0" />
      <span className="text-xs text-on-surface-variant/60 w-36 flex-shrink-0">{label}</span>
      <span className="text-xs text-on-surface font-medium">{value}</span>
    </div>
  )
}
