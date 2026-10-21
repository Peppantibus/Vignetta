import { compareNatural } from '../../../shared/naturalSort'
import { displayTitleOf, groupBySeries, type SeriesGroup } from '../../../shared/series'
import type { BookSummary } from '../../../shared/types'
import { searchKey } from './books'

export type Sort = 'title' | 'recent' | 'added'

/** Un elemento della griglia: un fumetto o una serie raccolta in una pila. */
export type ShelfItem = { kind: 'book'; book: BookSummary } | { kind: 'series'; group: SeriesGroup }

const titleOf = (item: ShelfItem): string => (item.kind === 'book' ? displayTitleOf(item.book) : item.group.name)
const booksOf = (item: ShelfItem): BookSummary[] => (item.kind === 'book' ? [item.book] : item.group.books)
const latest = (item: ShelfItem, field: 'lastReadAt' | 'addedAt'): number => Math.max(...booksOf(item).map((b) => b[field] ?? 0))

const SORTERS: Record<Sort, (a: ShelfItem, b: ShelfItem) => number> = {
  title: (a, b) => compareNatural(titleOf(a), titleOf(b)),
  recent: (a, b) => latest(b, 'lastReadAt') - latest(a, 'lastReadAt') || compareNatural(titleOf(a), titleOf(b)),
  added: (a, b) => latest(b, 'addedAt') - latest(a, 'addedAt')
}

/** Prepara gli elementi della griglia, raccogliendo le serie in pile se richiesto. */
export function shelfItems(books: readonly BookSummary[], groupSeries: boolean, sort: Sort = 'title'): ShelfItem[] {
  if (!groupSeries) return books.map((book): ShelfItem => ({ kind: 'book', book })).sort(SORTERS[sort])
  const { groups, singles } = groupBySeries(books)
  return [
    ...groups.map((group): ShelfItem => ({ kind: 'series', group })),
    ...singles.map((book): ShelfItem => ({ kind: 'book', book }))
  ].sort(SORTERS[sort])
}

/** Testo in cui cercare: titolo, nome del file, serie e autori. */
export function matchesSearch(book: BookSummary, query: string): boolean {
  const { metadata } = book
  const text = [book.title, displayTitleOf(book), metadata?.series, metadata?.title, metadata?.writer, metadata?.penciller].filter(Boolean).join(' ')
  return searchKey(text).includes(searchKey(query.trim()))
}
