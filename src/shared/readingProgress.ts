import type { BookSummary } from './types'

type Progress = Pick<BookSummary, 'pageCount' | 'currentPage' | 'lastReadAt' | 'finished'> & {
  readPages?: readonly number[]
  /** Stato «in corso» già raggiunto; assente nei salvataggi precedenti. */
  started?: boolean
}

/** Pagine necessarie per entrare (o rientrare) in «Continua a leggere». */
export function continueThreshold(pageCount: number | null): number {
  return pageCount && pageCount > 0 ? Math.ceil(pageCount / 5) : Infinity
}

/** Pagine necessarie perché un albo aperto sia considerato «In corso» invece di «Da leggere». */
export function startedThreshold(pageCount: number | null): number {
  return pageCount && pageCount > 0 ? Math.ceil(pageCount / 10) : Infinity
}

/** I vecchi salvataggi non conoscono le pagine viste: la posizione è la sola stima disponibile. */
export function readPagesOf(book: Progress): readonly number[] {
  if (book.readPages) return book.readPages
  if (book.lastReadAt === null || !book.pageCount) return []
  const count = Math.max(0, Math.min(book.pageCount, book.currentPage + 1))
  return Array.from({ length: count }, (_, page) => page)
}

/** Conta ogni pagina una sola volta; un salto conta solo le pagine effettivamente mostrate. */
export function addReadPages(book: Progress, shown: readonly number[]): number[] {
  return [...new Set([...readPagesOf(book), ...shown])].filter(
    (page) => Number.isInteger(page) && page >= 0 && (book.pageCount === null || page < book.pageCount)
  )
}

export function canContinueReading(book: Progress): boolean {
  return !book.finished && book.lastReadAt !== null && readPagesOf(book).length >= continueThreshold(book.pageCount)
}

/**
 * «In corso» è permanente: una volta raggiunto il 10% resta anche se «Continua a leggere» azzera il conteggio.
 * Nei salvataggi precedenti (`started` assente) vale la vecchia regola: basta aver aperto l'albo.
 */
export function isInProgress(book: Progress): boolean {
  return !book.finished && (book.started ?? book.lastReadAt !== null)
}

/** Il nuovo valore di `started` dopo aver visto altre pagine. */
export function startedAfter(book: Progress, readPages: readonly number[]): boolean {
  return isInProgress(book) || readPages.length >= startedThreshold(book.pageCount)
}
