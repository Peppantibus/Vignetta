import { useEffect, useState } from 'react'

/** Diametro della lente in pixel. */
const LENS_SIZE = 300

export const LENS_MIN_FACTOR = 1.5
export const LENS_MAX_FACTOR = 6
export const LENS_DEFAULT_FACTOR = 2.5

export interface Point {
  x: number
  y: number
}

interface MagnifierProps {
  /** Ingrandimento rispetto alla pagina come appare a schermo. */
  factor: number
  /** Posizione del mouse quando la lente viene attivata. */
  start: Point | null
}

interface LensView {
  x: number
  y: number
  src: string
  backgroundSize: string
  backgroundPosition: string
}

/**
 * Lente che segue il mouse e ingrandisce la pagina sottostante. Usa l'immagine originale,
 * quindi mostra dettagli che la pagina adattata alla finestra non riesce a mostrare.
 */
export function Magnifier({ factor, start }: MagnifierProps): React.JSX.Element | null {
  const [pointer, setPointer] = useState<Point | null>(start)

  useEffect(() => {
    const onMove = (e: PointerEvent): void => setPointer({ x: e.clientX, y: e.clientY })
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  const view = pointer && lensView(pointer.x, pointer.y, factor)
  if (!view) return null

  return (
    <div
      className="magnifier"
      style={{
        width: LENS_SIZE,
        height: LENS_SIZE,
        left: view.x - LENS_SIZE / 2,
        top: view.y - LENS_SIZE / 2,
        backgroundImage: `url("${view.src}")`,
        backgroundSize: view.backgroundSize,
        backgroundPosition: view.backgroundPosition
      }}
    />
  )
}

/** Calcola cosa mostrare nella lente: la porzione ingrandita della pagina sotto il punto (x, y). */
function lensView(x: number, y: number, factor: number): LensView | null {
  // La lente ha pointer-events: none, quindi elementFromPoint trova la pagina sottostante.
  const page = document.elementFromPoint(x, y)?.closest('.page')
  const image = page?.querySelector('img')
  if (!page || !image) return null

  // Il rettangolo dell'immagine, non della pagina: col ritaglio dei bordi l'immagine sborda dalla pagina.
  const rect = image.getBoundingClientRect()
  const offsetX = (x - rect.left) * factor - LENS_SIZE / 2
  const offsetY = (y - rect.top) * factor - LENS_SIZE / 2
  return {
    x,
    y,
    src: image.src,
    backgroundSize: `${rect.width * factor}px ${rect.height * factor}px`,
    backgroundPosition: `${-offsetX}px ${-offsetY}px`
  }
}
