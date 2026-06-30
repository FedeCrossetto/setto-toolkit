import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'app:ui-scale'
const DEFAULT_SCALE = 1
export const UI_SCALE_MIN = 0.8
export const UI_SCALE_MAX = 1.3
export const UI_SCALE_STEP = 0.02

function readScale(): number {
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
    setScaleState(Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, value)))
  }, [])

  const resetScale = useCallback(() => setScale(DEFAULT_SCALE), [setScale])

  return { scale, setScale, resetScale }
}

// Call once on app boot (before first paint) to avoid a flash of unzoomed content
export function applyUiScaleImmediate(): void {
  window.api.setZoomFactor(readScale())
}
