import { useState } from 'react'
import { credentialLogoUrl, initials, tintIndex } from '../data'

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

/**
 * Logo del servicio: de la URL, o deducido del nombre (AWS, Jira…) o del correo; si no hay,
 * iniciales sobre un círculo de color.
 */
export function Avatar({ name, url, user, size = 30 }: { name: string; url?: string; user?: string; size?: number }): JSX.Element {
  const src = credentialLogoUrl({ nombre: name, url, usuario: user })
  const [failed, setFailed] = useState(false)
  // Si cambia el logo (se editó el nombre o la URL), se vuelve a intentar.
  const [lastSrc, setLastSrc] = useState(src)
  if (src !== lastSrc) { setLastSrc(src); setFailed(false) }
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
          // Sin logo, el servicio devuelve un globo genérico de 16 px (pedimos 64): mejor las iniciales.
          onLoad={(e) => { if (e.currentTarget.naturalWidth > 0 && e.currentTarget.naturalWidth <= 16) setFailed(true) }}
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
