import type { LibrarySnapshot, LibraryUpdate } from './types'

/**
 * Unisce le modifiche alla libreria già nota. Gli albi non cambiati restano gli stessi oggetti, così React non
 * ridisegna le loro schede; i nuovi vanno in fondo, come nella libreria del processo principale.
 */
export function applyLibraryUpdate(library: LibrarySnapshot, update: LibraryUpdate): LibrarySnapshot {
  let books = library.books
  if (update.books.length || update.removed.length) {
    const changed = new Map(update.books.map((book) => [book.id, book]))
    const removed = new Set(update.removed)
    books = library.books.filter((book) => !removed.has(book.id)).map((book) => {
      const next = changed.get(book.id)
      changed.delete(book.id)
      return next ?? book
    })
    books.push(...changed.values())
  }
  return {
    books,
    folders: update.folders ?? library.folders,
    settings: update.settings ?? library.settings,
    heroOrder: update.heroOrder ?? library.heroOrder
  }
}
