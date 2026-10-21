/**
 * Griglie che si adattano allo spazio visibile della libreria: fra tutti i numeri di colonne si sceglie quello che dà
 * gli elementi più grandi senza far scorrere la pagina. Quando non entrano più nemmeno alla misura minima il risultato
 * è `null` e la griglia torna a quella normale, che va a capo e si scorre.
 */

export const HERO_MIN_WIDTH = 220
/** Oltre questa larghezza un riquadro sarebbe soprattutto vuoto: con uno o due personaggi la riga non si riempie. */
export const HERO_MAX_WIDTH = 640
/** Altezza minima e massima rispetto alla larghezza: il riquadro resta fra «quasi quadrato largo» e «verticale». */
const MIN_HEIGHT_RATIO = 0.8
const MAX_HEIGHT_RATIO = 1.3

export interface HeroLayout {
  columns: number
  width: number
  height: number
}

/** Riquadri dei personaggi (schede Marvel e DC): con più personaggi le righe aumentano e i riquadri si rimpiccioliscono. */
export function heroLayout(count: number, width: number, height: number, gap: number): HeroLayout | null {
  if (count <= 0 || width <= 0 || height <= 0) return null
  let best: (HeroLayout & { score: number }) | null = null
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns)
    const tileWidth = Math.min(HERO_MAX_WIDTH, (width - (columns - 1) * gap) / columns)
    const rowHeight = (height - (rows - 1) * gap) / rows
    const tileHeight = Math.min(rowHeight, tileWidth * MAX_HEIGHT_RATIO)
    if (tileWidth < HERO_MIN_WIDTH || tileHeight < tileWidth * MIN_HEIGHT_RATIO) continue
    // Conta il lato più corto: un riquadro largo ma basso non ha copertine più grandi.
    const score = Math.min(tileWidth, tileHeight)
    if (!best || score > best.score) best = { columns, width: Math.floor(tileWidth), height: Math.floor(tileHeight), score }
  }
  return best && { columns: best.columns, width: best.width, height: best.height }
}

/** Larghezza normale delle copertine nelle griglie (come `minmax(156px, 1fr)` di .book-grid). */
export const COVER_MIN_WIDTH = 156
/** Con pochi albi le copertine crescono fin qui, non oltre: restano copertine, non manifesti. */
export const COVER_MAX_WIDTH = 260
/** Sotto la copertina: numero d'ordine, titolo su due righe e stato. */
const CARD_TEXT_HEIGHT = 90

export interface CoverLayout {
  columns: number
  width: number
}

/** Copertine della pagina di un personaggio: pochi albi = copertine grandi, tanti = misura normale. */
export function coverLayout(count: number, width: number, height: number, gap: number, rowGap: number): CoverLayout | null {
  if (count <= 0 || width <= 0 || height <= 0) return null
  let best: CoverLayout | null = null
  for (let rows = 1; rows <= count; rows++) {
    const columns = Math.ceil(count / rows)
    const fromWidth = (width - (columns - 1) * gap) / columns
    const fromHeight = ((height - (rows - 1) * rowGap) / rows - CARD_TEXT_HEIGHT) / 1.5 // copertine 2:3
    const cover = Math.floor(Math.min(COVER_MAX_WIDTH, fromWidth, fromHeight))
    if (cover >= COVER_MIN_WIDTH && (!best || cover > best.width)) best = { columns, width: cover }
  }
  return best
}
