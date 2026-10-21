import type { BookSummary, CollectionDuplicate, CollectionSpec, PageRef } from './types'

export const refKey = (ref: PageRef): string => `${ref.part}/${ref.page}`
/** Etichetta dei volumi virtuali: un nome generico, non quelli delle collane degli editori. */
export const COLLECTION_LABEL = 'Volume'

/** Solo i margini degli albi: nessuna ricerca nelle tavole interne. */
export function boundaryPages(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i).filter((i) => i < 3 || i >= count - 3)
}

export function exactDuplicates(samples: readonly (PageRef & { digest: string | null })[]): CollectionDuplicate[] {
  const first = new Map<string, PageRef>()
  const found: CollectionDuplicate[] = []
  for (const { digest, part, page } of samples) {
    if (!digest) continue
    const original = first.get(digest)
    if (!original) first.set(digest, { part, page })
    else if (original.part !== part) found.push({ ref: { part, page }, original })
  }
  return found
}

export function collectionPages(spec: CollectionSpec): PageRef[] {
  const allowed = new Set(spec.duplicates.map((d) => refKey(d.ref)))
  const hidden = new Set(spec.excluded.map(refKey).filter((key) => allowed.has(key)))
  return spec.parts.flatMap((part, p) => part.pages.flatMap((_, page) => hidden.has(`${p}/${page}`) ? [] : [{ part: p, page }]))
}

/** Conserva l'ancoraggio alla pagina originale anche ripristinando un doppione prima di essa. */
export function remapCollectionProgress(before: CollectionSpec, after: CollectionSpec, currentPage: number, readPages: readonly number[]): { currentPage: number; readPages: number[] } {
  const old = collectionPages(before)
  const next = new Map(collectionPages(after).map((ref, i) => [refKey(ref), i]))
  const index = (i: number): number | undefined => old[i] ? next.get(refKey(old[i]!)) : undefined
  const anchor = index(currentPage) ?? old.slice(currentPage).map((_, i) => index(currentPage + i)).find((i) => i !== undefined)
    ?? old.slice(0, currentPage).reverse().map((ref) => next.get(refKey(ref))).find((i) => i !== undefined) ?? 0
  return { currentPage: anchor, readPages: readPages.flatMap((i) => index(i) === undefined ? [] : [index(i)!]) }
}

/** Gli originali sono raggiungibili da Gestisci volume, senza raddoppiare il catalogo. */
export function catalogBooks(books: readonly BookSummary[]): BookSummary[] {
  const sources = new Set(books.flatMap((book) => book.collection?.parts.map((part) => part.bookId) ?? []))
  return books.filter((book) => book.collection || !sources.has(book.id))
}
