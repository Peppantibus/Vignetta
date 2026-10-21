import { compareNatural } from '../../../shared/naturalSort'
import { displayTitleOf } from '../../../shared/series'
import type { BookSummary } from '../../../shared/types'

export type BookStatus = 'new' | 'reading' | 'finished'

const DAY_MS = 86_400_000

export function statusOf(book: BookSummary): BookStatus {
  if (book.finished) return 'finished'
  return book.inProgress ? 'reading' : 'new'
}

/** Avanzamento tra 0 e 1. */
export function progressOf(book: BookSummary): number {
  if (book.finished) return 1
  if (!book.pageCount || !book.inProgress) return 0
  return Math.min(1, (book.currentPage + 1) / book.pageCount)
}

export function progressLabel(book: BookSummary): string {
  switch (statusOf(book)) {
    case 'finished':
      return 'Letto'
    case 'new':
      return book.pageCount ? `${book.pageCount} pagine` : 'Da leggere'
    case 'reading':
      return book.pageCount
        ? `Pagina ${book.currentPage + 1} di ${book.pageCount} · ${Math.max(1, Math.round(progressOf(book) * 100))}%`
        : `Pagina ${book.currentPage + 1}`
  }
}

/** Quando è stato letto l'ultima volta, a parole: «oggi», «ieri», «3 giorni fa», poi la data. */
export function lastReadLabel(ms: number, now = Date.now()): string {
  const day = (time: number): number => {
    const date = new Date(time)
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS
  }
  const days = day(now) - day(ms)
  if (days <= 0) return 'oggi'
  if (days === 1) return 'ieri'
  if (days < 7) return `${days} giorni fa`
  return `il ${new Date(ms).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`
}

/**
 * Il prossimo albo di un percorso di lettura (già in ordine, es. l'ordine personale di un personaggio): quello in corso
 * letto più di recente, altrimenti il primo non letto; `null` se sono tutti letti.
 */
export function nextToRead(books: readonly BookSummary[]): BookSummary | null {
  const reading = books.filter((book) => statusOf(book) === 'reading').sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0))
  return reading[0] ?? books.find((book) => !book.finished) ?? null
}

/** Si può liberare spazio eliminando il file: non per le cartelle di immagini né per chi è già senza file. */
export function canDeleteFromDisk(book: BookSummary): boolean {
  return !book.missingSince && book.kind !== 'folder'
}

/** Gli albi archiviati (file eliminato dal disco), dal più recente; a parità di data per titolo. */
export function archivedBooks(books: readonly BookSummary[]): BookSummary[] {
  return books
    .filter((book) => book.missingSince)
    .sort((a, b) => b.missingSince! - a.missingSince! || compareNatural(displayTitleOf(a), displayTitleOf(b)))
}

/** Per quanti giorni un albo non ancora iniziato resta tra gli «Aggiunti di recente». */
export const RECENT_DAYS = 14

/**
 * Albi aggiunti negli ultimi giorni e non ancora iniziati, dal più nuovo. Se sono più di metà della libreria
 * (la prima importazione di una cartella) la riga non direbbe niente di nuovo: nessun albo.
 */
export function recentlyAdded(books: readonly BookSummary[], now = Date.now()): BookSummary[] {
  const since = now - RECENT_DAYS * DAY_MS
  const recent = books.filter((book) => book.addedAt >= since && statusOf(book) === 'new' && !book.missingSince)
  if (recent.length * 2 > books.length) return []
  return recent.sort((a, b) => b.addedAt - a.addedAt)
}

/** Dimensione come la mostra Esplora file (multipli di 1024). */
export function formatBytes(bytes: number): string {
  const mb = bytes / 1024 ** 2
  if (mb >= 1024) return `${(mb / 1024).toLocaleString('it-IT', { maximumFractionDigits: 2 })} GB`
  return `${Math.max(1, Math.round(mb)).toLocaleString('it-IT')} MB`
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Normalizza per la ricerca: niente maiuscole né accenti. */
export function searchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/** Tinta stabile ricavata dall'id, per le copertine segnaposto. */
export function hueOf(id: string): number {
  return parseInt(id.slice(0, 6), 16) % 360
}
