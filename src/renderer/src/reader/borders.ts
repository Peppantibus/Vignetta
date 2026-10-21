import { aspectOf } from '../../../shared/layout'
import type { PageSize } from '../../../shared/types'

/**
 * Ritaglio dei bordi uniformi delle scansioni (margini bianchi, color carta o neri).
 * Logica pura: lavora sui pixel RGBA di una miniatura della pagina, preparata da `pageBorders.ts`.
 * Il risultato è la quota di pagina da nascondere su ogni lato, tra 0 e 1.
 */
export interface Borders {
  top: number
  right: number
  bottom: number
  left: number
}

export const NO_BORDERS: Borders = { top: 0, right: 0, bottom: 0, left: 0 }

export interface Pixels {
  data: ArrayLike<number>
  width: number
  height: number
}

/** Quota di bordo restituita alla pagina, per non tagliare disegni o balloon vicini al margine. */
const SAFETY_MARGIN = 0.01
/** Oltre questa quota il bianco fa parte della pagina (pagina vuota, fondo del disegno): quel lato non si tocca. */
const MAX_SIDE = 0.25
/** Differenza massima per canale da colore del bordo, per assorbire grana della carta e compressione JPEG. */
const COLOR_TOLERANCE = 32
/** Quota di pixel diversi ammessa in una riga di bordo (polvere, puntini dello scanner). */
const NOISE = 0.006
const LIGHT_MIN_LUMA = 180
const LIGHT_MAX_CHROMA = 50
const DARK_MAX_LUMA = 50
/** Un bordo solo scuro si toglie se la pagina ha una cornice: altrimenti è facile che sia un'ombra del disegno. */
const DARK_FRAME_MIN_SIDES = 3

type Side = 'top' | 'right' | 'bottom' | 'left'
type Kind = 'light' | 'dark'
type Color = readonly [number, number, number]

interface Band {
  depth: number
  /** Colore della parte più interna del bordo. */
  kind: Kind | null
}

const NO_BAND: Band = { depth: 0, kind: null }

export function detectBorders(pixels: Pixels): Borders {
  const { width, height } = pixels
  if (width < 8 || height < 8) return NO_BORDERS

  // Una fascia scura lungo un lato blocca il rilevamento degli altri due: si ripete il giro
  // restringendo le righe alla parte già libera dai bordi laterali, e viceversa.
  const bands: Record<Side, Band> = { top: NO_BAND, right: NO_BAND, bottom: NO_BAND, left: NO_BAND }
  for (let pass = 0; pass < 2; pass++) {
    bands.top = borderBand(pixels, 'top', bands.left.depth, width - bands.right.depth)
    bands.bottom = borderBand(pixels, 'bottom', bands.left.depth, width - bands.right.depth)
    bands.left = borderBand(pixels, 'left', bands.top.depth, height - bands.bottom.depth)
    bands.right = borderBand(pixels, 'right', bands.top.depth, height - bands.bottom.depth)
  }

  // Una fascia nera su un lato solo, in un disegno al vivo, è quasi sempre parte della scena.
  const framed = Object.values(bands).filter((band) => band.depth > 0).length >= DARK_FRAME_MIN_SIDES
  const fraction = ({ depth, kind }: Band, extent: number): number =>
    kind === 'dark' && !framed ? 0 : Math.max(0, depth / extent - SAFETY_MARGIN)
  return {
    top: fraction(bands.top, height),
    right: fraction(bands.right, width),
    bottom: fraction(bands.bottom, height),
    left: fraction(bands.left, width)
  }
}

/**
 * Quante righe (o colonne) uniformi ci sono a partire dal lato indicato, considerando solo
 * il tratto [from, to) di ciascuna. Nessun bordo se supera MAX_SIDE.
 */
function borderBand(pixels: Pixels, side: Side, from: number, to: number): Band {
  const extent = side === 'top' || side === 'bottom' ? pixels.height : pixels.width
  const limit = Math.floor(extent * MAX_SIDE)
  if (to - from < 8) return NO_BAND

  let reference = lineColor(pixels, side, 0, from, to)
  let kind = kindOf(reference)
  if (!kind) return NO_BAND

  let depth = 0
  while (depth <= limit) {
    if (lineMatches(pixels, side, depth, from, to, reference)) {
      depth++
      continue
    }
    // L'ombra scura dello scanner fuori dal foglio, seguita dal margine chiaro della carta.
    if (kind === 'dark') {
      const next = lineColor(pixels, side, depth, from, to)
      if (kindOf(next) === 'light' && lineMatches(pixels, side, depth, from, to, next)) {
        reference = next
        kind = 'light'
        continue
      }
    }
    break
  }
  return depth > limit || depth === 0 ? NO_BAND : { depth, kind }
}

function kindOf([r, g, b]: Color): Kind | null {
  const luma = 0.299 * r + 0.587 * g + 0.114 * b
  if (luma <= DARK_MAX_LUMA) return 'dark'
  if (luma >= LIGHT_MIN_LUMA && Math.max(r, g, b) - Math.min(r, g, b) <= LIGHT_MAX_CHROMA) return 'light'
  return null // un colore deciso al bordo è disegno, non margine
}

/** Posizione nell'array RGBA del pixel `t` della riga/colonna `depth` contata dal lato. */
function offset({ width, height }: Pixels, side: Side, depth: number, t: number): number {
  switch (side) {
    case 'top':
      return (depth * width + t) * 4
    case 'bottom':
      return ((height - 1 - depth) * width + t) * 4
    case 'left':
      return (t * width + depth) * 4
    case 'right':
      return (t * width + width - 1 - depth) * 4
  }
}

/** Colore tipico di una riga: mediana di ciascun canale, insensibile a qualche puntino. */
function lineColor(pixels: Pixels, side: Side, depth: number, from: number, to: number): Color {
  const channels: [number[], number[], number[]] = [[], [], []]
  for (let t = from; t < to; t++) {
    const i = offset(pixels, side, depth, t)
    for (let c = 0; c < 3; c++) channels[c]!.push(pixels.data[i + c]!)
  }
  const median = (values: number[]): number => values.sort((a, b) => a - b)[values.length >> 1]!
  return [median(channels[0]), median(channels[1]), median(channels[2])]
}

function lineMatches(pixels: Pixels, side: Side, depth: number, from: number, to: number, [r, g, b]: Color): boolean {
  const allowed = Math.max(1, Math.floor((to - from) * NOISE))
  let different = 0
  for (let t = from; t < to; t++) {
    const i = offset(pixels, side, depth, t)
    const { data } = pixels
    if (Math.abs(data[i]! - r) > COLOR_TOLERANCE || Math.abs(data[i + 1]! - g) > COLOR_TOLERANCE || Math.abs(data[i + 2]! - b) > COLOR_TOLERANCE) {
      if (++different > allowed) return false
    }
  }
  return true
}

/**
 * Due pagine affiancate perdono in alto e in basso solo il bordo che hanno in comune:
 * così restano alla stessa scala e le vignette allineate. I lati restano indipendenti.
 */
export function pairBorders(first: Borders, second: Borders): [Borders, Borders] {
  const top = Math.min(first.top, second.top)
  const bottom = Math.min(first.bottom, second.bottom)
  return [
    { ...first, top, bottom },
    { ...second, top, bottom }
  ]
}

/** Proporzioni della parte visibile di una pagina ritagliata. */
export function croppedAspect(size: PageSize | null | undefined, borders: Borders): number {
  return (aspectOf(size) * (1 - borders.left - borders.right)) / (1 - borders.top - borders.bottom)
}

export function hasBorders(borders: Borders): boolean {
  return borders.top > 0 || borders.right > 0 || borders.bottom > 0 || borders.left > 0
}
