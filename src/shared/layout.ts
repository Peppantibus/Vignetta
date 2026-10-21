import type { PageSize } from './types'

/**
 * Una "schermata": le pagine mostrate insieme, in ordine di lettura.
 * `wide` indica una splash page (tavola orizzontale) mostrata da sola.
 */
export interface Spread {
  pages: number[]
  wide: boolean
  /** Pagine duplicate non mostrate perché questa schermata ne mostra lo stesso disegno. */
  replaces?: number[]
}

export interface SpreadOptions {
  doublePage: boolean
  coverAlone: boolean
  shiftPairs: boolean
  /**
   * Tavole doppie seguite nel file dalle loro due metà (come negli scan "C2C").
   * In doppia pagina si mostrano le metà affiancate, più definite e con la piega al centro;
   * in pagina singola si mostra la tavola intera, per non spezzare il disegno.
   */
  splitSpreads?: readonly number[]
}

/** Proporzione usata finché non si conoscono le dimensioni reali di una pagina. */
export const DEFAULT_ASPECT = 2 / 3

/** Scarto massimo tra le proporzioni di una tavola doppia e quelle delle sue metà affiancate. */
const HALVES_ASPECT_TOLERANCE = 0.12

/** Una pagina più larga che alta è una splash page / tavola doppia. */
export function isWide(size: PageSize | null | undefined): boolean {
  return size != null && size[0] > size[1]
}

/**
 * Raggruppa le pagine in schermate.
 * In doppia pagina le splash page restano sempre da sole, e una pagina verticale
 * che precede una splash page viene mostrata da sola invece di essere accoppiata.
 */
export function computeSpreads(
  pageCount: number,
  sizes: readonly (PageSize | null | undefined)[],
  options: SpreadOptions
): Spread[] {
  const wide = (i: number): boolean => isWide(sizes[i])
  const split = new Set(options.splitSpreads)
  const spreads: Spread[] = []

  if (!options.doublePage) {
    const halves = new Set([...split].flatMap((i) => [i + 1, i + 2]))
    for (let i = 0; i < pageCount; i++) {
      if (halves.has(i)) continue
      spreads.push(split.has(i) ? { pages: [i], wide: true, replaces: [i + 1, i + 2] } : { pages: [i], wide: wide(i) })
    }
    return spreads
  }

  let i = 0
  const single = (): void => {
    spreads.push({ pages: [i], wide: wide(i) })
    i++
  }

  if (options.coverAlone && i < pageCount && !split.has(i)) single()
  if (options.shiftPairs && i < pageCount && !wide(i)) single()

  while (i < pageCount) {
    if (split.has(i)) {
      // Le due metà vanno sempre insieme; la tavola intera viene saltata.
      spreads.push({ pages: [i + 1, i + 2], wide: false, replaces: [i] })
      i += 3
    } else if (wide(i) || i + 1 >= pageCount || wide(i + 1)) {
      single()
    } else {
      spreads.push({ pages: [i, i + 1], wide: false })
      i += 2
    }
  }
  return spreads
}

/**
 * Indice della schermata che mostra la pagina data, anche se al posto suo ne mostra il duplicato
 * (la tavola intera o le sue metà). Per una pagina assente restituisce la schermata successiva.
 */
export function spreadIndexOf(spreads: readonly Spread[], page: number): number {
  const exact = spreads.findIndex((s) => s.pages.includes(page) || s.replaces?.includes(page))
  if (exact !== -1) return exact
  const next = spreads.findIndex((s) => s.pages[0]! > page)
  return next === -1 ? Math.max(0, spreads.length - 1) : next
}

/**
 * Tavole doppie seguite da due pagine verticali che, affiancate, hanno le sue stesse proporzioni:
 * potrebbero esserne le metà. Solo un confronto delle immagini può confermarlo.
 */
export function splitSpreadCandidates(sizes: readonly (PageSize | null | undefined)[]): number[] {
  const candidates: number[] = []
  for (let i = 0; i + 2 < sizes.length; i++) {
    const [full, first, second] = [sizes[i], sizes[i + 1], sizes[i + 2]]
    if (!isWide(full) || !first || !second || isWide(first) || isWide(second)) continue
    const fullAspect = aspectOf(full)
    if (Math.abs(aspectOf(first) + aspectOf(second) - fullAspect) / fullAspect <= HALVES_ASPECT_TOLERANCE) candidates.push(i)
  }
  return candidates
}

export interface Box {
  width: number
  height: number
}

/**
 * Calcola le dimensioni a schermo di ogni pagina di una schermata.
 * Le pagine affiancate vengono portate alla stessa altezza.
 * - 'screen': tutta la schermata entra nella finestra.
 * - 'width':  la schermata occupa tutta la larghezza (si scorre in verticale).
 */
export function fitSpread(
  aspects: readonly number[],
  viewport: Box,
  fit: 'screen' | 'width'
): Box[] {
  const totalAspect = aspects.reduce((sum, a) => sum + a, 0)
  if (totalAspect <= 0 || viewport.width <= 0 || viewport.height <= 0) return aspects.map(() => ({ width: 0, height: 0 }))

  const heightForWidth = viewport.width / totalAspect
  const height = fit === 'width' ? heightForWidth : Math.min(viewport.height, heightForWidth)
  return aspects.map((a) => ({ width: a * height, height }))
}

export function aspectOf(size: PageSize | null | undefined): number {
  return size && size[1] > 0 ? size[0] / size[1] : DEFAULT_ASPECT
}
