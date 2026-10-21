import { LIBRARY_ZOOM_MAX, LIBRARY_ZOOM_MIN } from '../../../shared/settings'

/** Lo zoom della libreria (separato da quello del lettore) va a passi del 10%. */
const STEP = 0.1

/** Un passo avanti o indietro, sempre su multipli del 10% e dentro i limiti. */
export function stepLibraryZoom(current: number, direction: 1 | -1): number {
  const base = Number.isFinite(current) ? current : 1
  const next = Math.round((base + direction * STEP) * 10) / 10
  return Math.min(LIBRARY_ZOOM_MAX, Math.max(LIBRARY_ZOOM_MIN, next))
}
