import { STRENGTH_LABELS, type StrengthScore } from '../strength'

const TONE: Record<StrengthScore, { bar: string; text: string }> = {
  0: { bar: 'bg-error', text: 'text-error' },
  1: { bar: 'bg-error', text: 'text-error' },
  2: { bar: 'bg-warning', text: 'text-warning' },
  3: { bar: 'bg-success', text: 'text-success' },
  4: { bar: 'bg-success', text: 'text-success' },
}

/** Four-segment meter + label. */
export function StrengthMeter({ score, detail }: { score: number; detail?: string }): JSX.Element {
  const s = Math.max(0, Math.min(4, Math.round(score))) as StrengthScore
  const tone = TONE[s]
  return (
    <div className="flex items-center gap-2.5" title={detail}>
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1 w-6 rounded-full ${i <= Math.max(s, 1) ? tone.bar : 'bg-on-surface/10'}`} />
        ))}
      </div>
      <span className={`t-caption font-medium ${tone.text}`}>{STRENGTH_LABELS[s]}</span>
    </div>
  )
}
