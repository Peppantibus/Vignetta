import { useCallback, useRef, useState, type RefObject } from 'react'

/** 1 = pagina adattata alla finestra (o alla larghezza). Sotto si rimpicciolisce, sopra si ingrandisce. */
export const FIT_ZOOM = 1
export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 5
/** Ogni scatto di rotella o pressione di +/− moltiplica lo zoom per questo fattore. */
export const ZOOM_STEP = 1.25

/** Punto (relativo all'area delle pagine) che resta fermo durante lo zoom. */
export interface ZoomOrigin {
  x: number
  y: number
}

export interface UseZoom {
  /** 1 = pagina adattata alla finestra. */
  zoom: number
  originRef: RefObject<ZoomOrigin | null>
  zoomBy: (factor: number, origin?: ZoomOrigin) => void
  reset: () => void
}

/** Un livello a meno del 5% da un estremo o dalla pagina adattata viene portato lì: niente scatti quasi nulli. */
const SNAP = 0.05

/**
 * Il prossimo livello di zoom, tra MIN_ZOOM e MAX_ZOOM. Passando da sotto a sopra il 100% (o viceversa)
 * ci si ferma sempre esattamente sulla pagina adattata, che altrimenti verrebbe saltata.
 */
export function nextZoom(current: number, factor: number): number {
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current * factor))
  const crossesFit = (current < FIT_ZOOM && next > FIT_ZOOM) || (current > FIT_ZOOM && next < FIT_ZOOM)
  if (crossesFit) return FIT_ZOOM
  return [MIN_ZOOM, FIT_ZOOM, MAX_ZOOM].find((level) => Math.abs(next / level - 1) < SNAP) ?? next
}

/** Zoom delle pagine: vale per la lettura in corso e riparte dal 100% a ogni fumetto aperto. */
export function useZoom(): UseZoom {
  const [zoom, setZoom] = useState(FIT_ZOOM)
  const originRef = useRef<ZoomOrigin | null>(null)

  const zoomBy = useCallback((factor: number, origin?: ZoomOrigin) => {
    originRef.current = origin ?? null
    setZoom((current) => nextZoom(current, factor))
  }, [])

  const reset = useCallback(() => {
    originRef.current = null
    setZoom(FIT_ZOOM)
  }, [])

  return { zoom, originRef, zoomBy, reset }
}
