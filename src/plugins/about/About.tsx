import { useEffect, useState } from 'react'

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
          <span
            className="material-symbols-outlined text-primary"
            style={{ fontSize: '32px', fontVariationSettings: "'FILL' 1" }}
          >
            construction
          </span>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">Setto Toolkit</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Version <span className="font-mono text-primary">{version}</span>
          </p>
        </div>
      </div>

      {/* Info cards */}
      <div className="space-y-3">
        <InfoRow icon="category" label="Architecture" value="Electron + React + TypeScript" />
        <InfoRow icon="security" label="Renderer security" value="Sandbox · Context isolation · IPC allowlist" />
        <InfoRow icon="storage" label="Data storage" value="Local only — userData directory" />
        <InfoRow icon="lock" label="Secrets" value="Encrypted via OS safeStorage" />
      </div>

      {/* Divider */}
      <div className="my-8 border-t border-outline-variant/15" />

      {/* Description */}
      <p className="text-sm text-on-surface-variant leading-relaxed">
        Setto Toolkit is a modular developer workspace for everyday tasks — API testing,
        code diffing with AI analysis, repository search across Bitbucket and GitHub,
        and a lightweight file editor. All data stays local on your machine.
      </p>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-surface rounded-xl border border-outline-variant/15">
      <span
        className="material-symbols-outlined text-on-surface-variant/50 flex-shrink-0"
        style={{ fontSize: '18px' }}
      >
        {icon}
      </span>
      <span className="text-xs text-on-surface-variant/60 w-36 flex-shrink-0">{label}</span>
      <span className="text-xs text-on-surface font-medium">{value}</span>
    </div>
  )
}
