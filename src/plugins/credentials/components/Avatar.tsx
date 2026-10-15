import { useState } from 'react'
import { faviconUrl, initials, tintIndex } from '../data'

/** Soft tints from the data colors (--c-chart-N): follow the active palette, distinct per item. */
const TINTS = [
  'bg-chart-1/[0.14] text-chart-1',
  'bg-chart-2/[0.14] text-chart-2',
  'bg-chart-3/[0.14] text-chart-3',
  'bg-chart-4/[0.14] text-chart-4',
  'bg-chart-5/[0.14] text-chart-5',
  'bg-chart-6/[0.14] text-chart-6',
  'bg-chart-7/[0.14] text-chart-7',
  'bg-chart-8/[0.14] text-chart-8',
]

/** Site favicon when the URL is public; otherwise initials over a soft tinted circle. */
export function Avatar({ name, url, size = 30 }: { name: string; url?: string; size?: number }): JSX.Element {
  const src = faviconUrl(url)
  const [failed, setFailed] = useState(false)
  const box = { width: size, height: size }
  if (src && !failed) {
    return (
      <span className="flex items-center justify-center shrink-0 rounded-full bg-surface hairline overflow-hidden" style={box} aria-hidden>
        <img
          src={src}
          alt=""
          width={Math.round(size * 0.56)}
          height={Math.round(size * 0.56)}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      </span>
    )
  }
  return (
    <span
      className={`flex items-center justify-center shrink-0 rounded-full font-semibold ${TINTS[tintIndex(name, TINTS.length)]}`}
      style={{ ...box, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}
