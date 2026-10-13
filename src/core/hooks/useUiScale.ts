import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'app:ui-scale'
const DEFAULT_SCALE = 1
export const UI_SCALE_MIN = 0.8
export const UI_SCALE_MAX = 1.3
/** Pasos de 10%: zooms intermedios (98%, 102%…) dejan el texto borroso en Windows. */
export const UI_SCALE_STEP = 0.1

/** v2: se resetea una vez a 100% (valores como 98% desenfocaban el texto). */
const SCALE_V2_KEY = 'app:ui-scale-v2'

function readScale(): number {
  if (!localStorage.getItem(SCALE_V2_KEY)) {
    localStorage.setItem(SCALE_V2_KEY, '1')
    localStorage.setItem(STORAGE_KEY, String(DEFAULT_SCALE))
    return DEFAULT_SCALE
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const n = raw ? parseFloat(raw) : DEFAULT_SCALE
    return Number.isFinite(n) ? Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, n)) : DEFAULT_SCALE
  } catch {
    return DEFAULT_SCALE
  }
}

/**
 * Scales the whole window via Electron's native page zoom (webFrame.setZoomFactor) —
 * unlike the font-size CSS var, this scales every pixel value uniformly regardless of
 * whether a component uses rem or hardcoded px, so it actually fixes "too big/small".
 */
export function useUiScale() {
  const [scale, setScaleState] = useState<number>(readScale)

  useEffect(() => {
    window.api.setZoomFactor(scale)
    localStorage.setItem(STORAGE_KEY, String(scale))
  }, [scale])

  const setScale = useCallback((value: number) => {
    const snapped = Math.round(value * 10) / 10
    setScaleState(Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, snapped)))
  }, [])

  const resetScale = useCallback(() => setScale(DEFAULT_SCALE), [setScale])

  return { scale, setScale, resetScale }
}

// Call once on app boot (before first paint) to avoid a flash of unzoomed content
export function applyUiScaleImmediate(): void {
  window.api.setZoomFactor(readScale())
}
