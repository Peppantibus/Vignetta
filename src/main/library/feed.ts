import type { BookSummary, LibrarySnapshot, LibraryUpdate } from '../../shared/types'

/**
 * Cosa mandare all'interfaccia dopo una modifica: solo gli albi cambiati dall'ultimo invio. Prima a ogni pagina
 * girata partiva tutta la libreria (decine di KB, in crescita con gli albi) e React ridisegnava ogni scheda.
 * Il confronto è sul JSON di ogni riepilogo, quindi vale qualunque sia il punto del codice che ha cambiato l'albo.
 */
export class LibraryFeed {
  private books = new Map<string, string>()
  private folders = ''
  private settings = ''
  private heroOrder = ''

  constructor(private readonly snapshot: () => LibrarySnapshot) {}

  /** Tutta la libreria, all'apertura dell'interfaccia: da qui partono i confronti successivi. */
  full(): LibrarySnapshot {
    const snapshot = this.snapshot()
    this.books = new Map(snapshot.books.map((book) => [book.id, JSON.stringify(book)]))
    this.folders = JSON.stringify(snapshot.folders)
    this.settings = JSON.stringify(snapshot.settings)
    this.heroOrder = JSON.stringify(snapshot.heroOrder)
    return snapshot
  }

  /** Le differenze dall'ultimo invio; null se l'interfaccia è già aggiornata. */
  changes(): LibraryUpdate | null {
    const snapshot = this.snapshot()
    const books: BookSummary[] = []
    const current = new Map<string, string>()
    for (const book of snapshot.books) {
      const json = JSON.stringify(book)
      current.set(book.id, json)
      if (this.books.get(book.id) !== json) books.push(book)
    }
    const removed = [...this.books.keys()].filter((id) => !current.has(id))
    this.books = current
    const update: LibraryUpdate = { books, removed }
    let changed = books.length > 0 || removed.length > 0

    const folders = JSON.stringify(snapshot.folders)
    if (folders !== this.folders) [this.folders, update.folders, changed] = [folders, snapshot.folders, true]
    const settings = JSON.stringify(snapshot.settings)
    if (settings !== this.settings) [this.settings, update.settings, changed] = [settings, snapshot.settings, true]
    const heroOrder = JSON.stringify(snapshot.heroOrder)
    if (heroOrder !== this.heroOrder) [this.heroOrder, update.heroOrder, changed] = [heroOrder, snapshot.heroOrder, true]
    return changed ? update : null
  }
}
