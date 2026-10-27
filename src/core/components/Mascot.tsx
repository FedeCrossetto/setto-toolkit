import { useEffect, useRef, useState, type ReactNode } from 'react'
import { isAnimatedPose, useMascotsEnabled, type MascotPose } from '../mascots'
import { useMotionPreference } from '../motion-prefs'

/** Halo de color detrás de las animadas: tapa el recorte circular de abajo de los videos. */
const HALO: Record<string, string> = {
  buscando: 'rgb(251 191 36 / 0.20)',
  listo: 'rgb(132 204 22 / 0.20)',
  actualizando: 'rgb(168 85 247 / 0.18)',
  atencion: 'rgb(239 68 68 / 0.16)',
}
const LABEL: Record<MascotPose, string> = {
  buscando: 'Buscando', listo: 'Listo', actualizando: 'Actualizando', atencion: 'Atención',
  neutra: '', saludo: 'Hola', curiosa: '', descanso: '',
}

/**
 * Mascota tejida. Las animadas (buscando, listo, actualizando, atención) son WebM con
 * transparencia; las quietas, WebP. Como los videos se mueven poco, encima va un gesto de
 * cuerpo por pose (globals.css → "Mascotas"): busca balanceándose, festeja saltando, avisa
 * sacudiéndose; las quietas respiran. Tiene sombra en el piso y entra con un rebote.
 * `once`: el gesto se repite unas veces y queda quieta (avisos). `bare`: sin halo ni sombra
 * (el widget). `paused`: primer cuadro, sin gesto. `interactive`: salta al tocarla.
 * Con Animaciones: ninguna, todo quieto. Si el usuario las apagó, se muestra `fallback`.
 */
export function Mascot({ pose, size = 96, once = false, bare = false, paused = false, interactive = false, fallback = null, className = '' }: {
  pose: MascotPose
  size?: number
  once?: boolean
  bare?: boolean
  paused?: boolean
  interactive?: boolean
  fallback?: ReactNode
  className?: string
}): JSX.Element | null {
  const enabled = useMascotsEnabled()
  const [, motion] = useMotionPreference()
  const [poke, setPoke] = useState(0)
  const pokeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (pokeTimer.current) clearTimeout(pokeTimer.current) }, [])
  if (!enabled) return <>{fallback}</>

  const label = LABEL[pose]
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }
  const animated = isAnimatedPose(pose)
  const still = motion === 'off' || paused
  const doPoke = (): void => {
    if (motion !== 'full') return
    setPoke((n) => n + 1)
    if (pokeTimer.current) clearTimeout(pokeTimer.current)
    pokeTimer.current = setTimeout(() => setPoke(0), 700)
  }
  const body = still ? '' : `mascot-pose-${pose} ${once ? 'mascot-once' : ''} ${poke ? 'mascot-poke' : ''}`

  return (
    <span {...a11y} className={`${/\b(absolute|fixed)\b/.test(className) ? '' : 'relative'} inline-block shrink-0 select-none ${interactive ? 'cursor-pointer' : ''} ${className}`} style={{ width: size, height: size }}
      onMouseEnter={interactive ? doPoke : undefined} onClick={interactive ? doPoke : undefined}>
      {!bare && <span className={`mascot-shadow ${still ? '' : `mascot-shadow-${pose} ${once ? 'mascot-shadow-once' : ''}`}`} />}
      <span key={pose} className={`absolute inset-0 ${motion === 'off' ? '' : 'mascot-in'}`}>
        <span key={poke} className={`mascot-body absolute inset-0 ${body}`}>
          {animated && !bare && <span className="absolute inset-[6%] rounded-full" style={{ background: HALO[pose] }} />}
          {!animated || still ? (
            <img src={`./mascots/${pose}.webp`} alt="" draggable={false} className="relative w-full h-full object-contain pointer-events-none" />
          ) : (
            <video src={`./mascots/${pose}.webm`} poster={`./mascots/${pose}.webp`} autoPlay muted playsInline loop={!once}
              disablePictureInPicture className="relative w-full h-full object-contain pointer-events-none" />
          )}
        </span>
      </span>
      {pose === 'descanso' && motion === 'full' && (
        <>
          <span className="mascot-z" style={{ right: '16%', top: '14%', fontSize: Math.max(10, size * 0.11) }}>z</span>
          <span className="mascot-z" style={{ right: '10%', top: '6%', fontSize: Math.max(8, size * 0.085), animationDelay: '1.8s' }}>z</span>
        </>
      )}
    </span>
  )
}
