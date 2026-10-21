import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { basename, extname, sep } from 'node:path'
import { addReadPages, canContinueReading, isInProgress, startedAfter } from '../../shared/readingProgress'
import { collectionPages, remapCollectionProgress } from '../../shared/collections'
import type { CollectionSpec } from '../../shared/types'
import type { BookKind, BookPatch, BookSummary, ComicMetadata, FolderRemoval, LibrarySnapshot, PageSize, ReaderSettings } from '../../shared/types'
import { pathKey, samePath } from '../paths'
import { collectionSourceKey } from '../sources'
import { bookPatch, settingsPatch } from './patches'
import { archiveKind, isStillDownloading, scanFolder, type FoundBook } from './scanner'
import type { BookRecord, JsonStore } from './store'

/** Un file che si può eliminare per liberare spazio. */
export interface DiskFile {
  path: string
  /** Sorgenti del pool aperte su questo file (l'albo e le sue copie nei volumi), da chiudere e ripulire. */
  sourceKeys: string[]
}

/** Id stabile di un fumetto, ricavato dal percorso (Windows non distingue maiuscole e minuscole). */
export function bookId(path: string): string {
  return createHash('sha1').update(pathKey(path)).digest('hex').slice(0, 16)
}

function titleOf(path: string, kind: BookKind): string {
  const name = basename(path)
  return (kind === 'folder' ? name : name.slice(0, -extname(name).length)).replaceAll('_', ' ').trim()
}

/** Operazioni sulla libreria; ogni modifica passa dallo store, che salva e notifica l'interfaccia. */
export class Library {
  private scanning: Promise<void> | null = null
  private nextScan: Promise<void> | null = null
  private checking: Promise<void> | null = null
  private nextCheck: Promise<void> | null = null
  /** File in corso di eliminazione (id ricavati dal percorso): un controllo contemporaneo non li deve far ricomparire. */
  private readonly removing = new Set<string>()

  constructor(private readonly store: JsonStore) {}

  get settings(): ReaderSettings {
    return this.store.data.settings
  }

  get watchedFolders(): readonly string[] { return this.store.data.folders }

  /** Importazione automatica solo additiva: rispetta rimozioni manuali e progressi esistenti. */
  addDiscoveredBook(found: FoundBook, folder: string): void {
    if (this.isWatched(folder) && !this.excludedKeys().has(pathKey(found.path))) {
      this.addBook(found, folder)
      void this.checkPresence() // un file riscaricato può completare anche un volume
    }
  }

  snapshot(): LibrarySnapshot {
    const { books, folders, settings, heroOrder } = this.store.data
    return { books: Object.values(books).map(toSummary), folders, settings, heroOrder }
  }

  /** Il record di un albo, senza costruire il riepilogo di tutta la libreria (serve a ogni pagina e copertina). */
  find(id: string): BookRecord | undefined {
    const { books } = this.store.data
    return Object.hasOwn(books, id) ? books[id] : undefined
  }

  get(id: string): BookRecord {
    const book = this.store.data.books[id]
    if (!book) throw new Error(`Fumetto non trovato nella libreria (${id})`)
    return book
  }

  summary(id: string): BookSummary {
    return toSummary(this.get(id))
  }

  /** I riferimenti restano utilizzabili anche dopo la rimozione di una cartella dal catalogo. */
  sourceTarget(id: string): { path: string; kind: BookKind } {
    const record = this.store.data.books[id]
    if (record) return record
    for (const book of Object.values(this.store.data.books)) {
      const part = book.collection?.parts.find((p) => p.bookId === id)
      if (part) return part
    }
    throw new Error('Albo originale non trovato.')
  }

  addCollection(book: BookRecord): void {
    if (this.store.data.books[book.id]) throw new Error('Il volume esiste già.')
    this.store.update((d) => { d.books[book.id] = book })
  }

  replaceCollection(id: string, collection: CollectionSpec): void {
    const record = this.get(id)
    if (!record.collection) throw new Error('Questo fumetto non è un volume virtuale.')
    const progress = remapCollectionProgress(record.collection, collection, record.currentPage, record.readPages ?? [])
    const pages = collectionPages(collection)
    this.mutateBook(id, (book) => {
      if (pages.length > (book.pageCount ?? 0)) book.finished = false
      Object.assign(book, progress, { collection, pageCount: pages.length, sizes: pages.map((ref) => collection.parts[ref.part]!.sizes[ref.page] ?? null), contentVersion: (book.contentVersion ?? 0) + 1 })
      delete book.splitSpreads
    })
  }

  async addFolder(folder: string): Promise<void> {
    // La stessa cartella scritta con altre maiuscole non diventa una seconda cartella.
    if (!this.isWatched(folder)) this.store.update((d) => d.folders.push(folder))
    await this.rescan()
  }

  /** Le schede che `removeFolder` toglierebbe, per chiedere conferma sapendo quanta cronologia si perde. */
  folderRemoval(folder: string): FolderRemoval {
    const removal: FolderRemoval = { books: 0, finished: 0, inProgress: 0, archived: 0 }
    for (const book of Object.values(this.store.data.books)) {
      if (!book.folder || !samePath(book.folder, folder)) continue
      removal.books++
      if (book.missingSince) removal.archived++
      else if (book.finished) removal.finished++
      else if (isInProgress(book)) removal.inProgress++
    }
    return removal
  }

  removeFolder(folder: string): void {
    this.store.update((d) => {
      d.folders = d.folders.filter((f) => !samePath(f, folder))
      for (const [id, book] of Object.entries(d.books)) if (book.folder && samePath(book.folder, folder)) delete d.books[id]
    })
  }

  /** Aggiunge file trascinati o scelti a mano; le cartelle diventano cartelle della libreria. */
  async addPaths(paths: string[]): Promise<string[]> {
    const ids: string[] = []
    for (const path of paths) {
      const info = await stat(path).catch(() => null)
      if (info?.isDirectory()) {
        await this.addFolder(path)
      } else if (info?.isFile()) {
        const kind = archiveKind(path)
        if (kind) ids.push(this.addBook({ path, kind }, null))
      }
    }
    if (ids.length) void this.checkPresence()
    return ids
  }

  rescan(): Promise<void> {
    if (!this.scanning) {
      this.scanning = this.scanAll().finally(() => (this.scanning = null))
      return this.scanning
    }
    // La scansione in corso potrebbe non includere le cartelle appena aggiunte: ne accodiamo
    // un'altra, una sola per tutte le richieste arrivate nel frattempo.
    this.nextScan ??= this.scanning
      .catch(() => {})
      .then(() => {
        this.nextScan = null
        return this.rescan()
      })
    return this.nextScan
  }

  removeBook(id: string): void {
    this.store.update((d) => {
      const book = d.books[id]
      if (!book) return
      // Senza file si dimentica solo la scheda: se lo si riscarica torna come un albo nuovo.
      if (book.folder && !book.missingSince) d.excluded.push(book.path)
      delete d.books[id]
    })
  }

  updateBook(id: string, input: BookPatch): void {
    let patch = bookPatch(input)
    if (patch.customTitle !== undefined && patch.customTitle !== null) {
      if (!patch.customTitle.trim()) throw new Error('Il titolo non può essere vuoto.')
      patch = { ...patch, customTitle: patch.customTitle.replace(/\s+/g, ' ').trim() }
    }
    this.mutateBook(id, (book) => Object.assign(book, patch))
  }

  /** «Segna come da leggere»: si riparte da pagina 1, anche con il conteggio delle pagine viste e lo stato «In corso». */
  markUnread(id: string): void {
    this.mutateBook(id, (book) => Object.assign(book, { finished: false, currentPage: 0, readPages: [], started: false }))
  }

  saveProgress(id: string, page: number, finished: boolean, shown: readonly number[] = []): void {
    this.mutateBook(id, (book) => {
      const readPages = addReadPages(book, shown)
      const started = startedAfter(book, readPages)
      Object.assign(book, { readPages, started, currentPage: page, finished, lastReadAt: Date.now() })
    })
  }

  hideContinueReading(id: string): void {
    this.mutateBook(id, (book) => { book.readPages = [] })
  }

  setPageCount(id: string, pageCount: number): void {
    if (this.store.data.books[id]?.pageCount !== pageCount) this.mutateBook(id, (book) => (book.pageCount = pageCount))
  }

  setSizes(id: string, sizes: (PageSize | null)[]): void {
    this.mutateBook(id, (book) => {
      if (book.sizes?.length !== sizes.length) delete book.splitSpreads // il contenuto del file è cambiato
      book.sizes = sizes
    })
  }

  setMetadata(id: string, metadata: ComicMetadata | null): void {
    this.mutateBook(id, (book) => (book.metadata = metadata))
  }

  /** Fumetti non ancora analizzati in cerca di metadati. */
  booksWithoutMetadataCheck(): BookRecord[] {
    return Object.values(this.store.data.books).filter((book) => book.metadata === undefined && !book.missingSince)
  }

  /** I file da eliminare per liberare spazio: l'archivio dell'albo, o tutti gli originali di un volume. */
  diskFiles(id: string): DiskFile[] {
    const book = this.get(id)
    if (book.missingSince) throw new Error('Il file non è più sul disco.')
    if (book.kind === 'folder') throw new Error('Le cartelle di immagini non si eliminano da Vignetta.')
    const paths = new Map((book.collection?.parts.map((part) => part.path) ?? [book.path]).map((path) => [bookId(path), path]))
    return [...paths].map(([fileId, path]) => {
      const sourceKeys = [fileId]
      for (const other of Object.values(this.store.data.books)) {
        other.collection?.parts.forEach((part, index) => {
          if (bookId(part.path) === fileId) sourceKeys.push(collectionSourceKey(other.id, index, part))
        })
      }
      return { path, sourceKeys }
    })
  }

  /**
   * Albi sul disco che potrebbero essere lo stesso file spostato o rinominato: stesso nome del file
   * (senza estensione, maiuscole e punteggiatura) o stessa serie e numero in ComicInfo.xml. La scelta resta all'utente.
   */
  relinkCandidates(id: string): { id: string; path: string }[] {
    const book = this.get(id)
    const issue = issueKey(book)
    return Object.values(this.store.data.books)
      .filter((other) => other.id !== id && !other.missingSince && !other.collection)
      .filter((other) => fileKey(other.path) === fileKey(book.path) || (issue !== null && issueKey(other) === issue))
      .map((other) => ({ id: other.id, path: other.path }))
  }

  /**
   * Collega un albo senza file a un file scelto (spostato, rinominato o riscaricato altrove), conservandone la
   * cronologia. Se quel file è già in libreria come albo nuovo, le due schede diventano una. Restituisce il nuovo id.
   */
  async relinkBook(id: string, path: string): Promise<string> {
    const old = this.get(id)
    if (old.collection) throw new Error('Per un volume usa «Gestisci volume».')
    const info = await stat(path).catch(() => null)
    const kind = info?.isFile() ? archiveKind(path) : null
    if (!kind) throw new Error('Scegli un file CBZ, CBR o PDF.')
    const newId = bookId(path)
    const existing = this.store.data.books[newId]
    if (existing?.collection) throw new Error('File non valido.')
    if (newId === id) {
      this.mutateBook(id, (book) => delete book.missingSince)
      return id
    }
    if (!old.missingSince) throw new Error('Il file di questo albo è ancora sul disco.')

    this.store.update((d) => {
      const fresh = d.books[newId]
      // La lettura più recente vince: di solito è quella del vecchio albo, che il nuovo non ha mai aperto.
      const progress = fresh && (fresh.lastReadAt ?? 0) > (old.lastReadAt ?? 0) ? fresh : old
      const record: BookRecord = {
        ...old,
        id: newId,
        path,
        kind,
        title: titleOf(path, kind),
        folder: fresh?.folder ?? d.folders.find((folder) => isInside(path, folder)) ?? null,
        currentPage: progress.currentPage,
        readPages: progress.readPages,
        started: progress.started,
        finished: progress.finished,
        lastReadAt: progress.lastReadAt,
        // Dati che dipendono dal file: dal nuovo albo se c'è già, altrimenti si ricalcolano all'apertura.
        pageCount: fresh?.pageCount ?? old.pageCount,
        metadata: fresh?.metadata
      }
      for (const key of ['missingSince', 'sizes', 'splitSpreads', 'contentVersion'] as const) delete record[key]
      if (fresh?.sizes) record.sizes = fresh.sizes
      if (fresh?.splitSpreads) record.splitSpreads = fresh.splitSpreads
      if (record.metadata === undefined) delete record.metadata
      delete d.books[id]
      d.books[newId] = record
      d.excluded = d.excluded.filter((p) => !samePath(p, path))
      // L'ordine personale tiene la posizione del vecchio albo.
      for (const [key, ids] of Object.entries(d.heroOrder)) {
        if (ids.includes(id)) d.heroOrder[key] = ids.filter((other) => other !== newId).map((other) => (other === id ? newId : other))
      }
    })
    void this.checkPresence()
    return newId
  }

  /** Prima di eliminare i file: albi e volumi che li usano diventano «non sul disco», con progressi e stato intatti. */
  beginRemoval(paths: readonly string[]): void {
    const ids = paths.map(bookId)
    for (const id of ids) this.removing.add(id)
    const now = Date.now()
    this.store.update((d) => {
      for (const book of Object.values(d.books)) if (usesAny(book, ids)) book.missingSince ??= now
    })
  }

  /** Dopo l'eliminazione (riuscita o no) lo stato torna a seguire il disco. */
  async endRemoval(paths: readonly string[]): Promise<void> {
    for (const path of paths) this.removing.delete(bookId(path))
    await this.checkPresence()
  }

  /**
   * Segna le schede i cui file non sono più sul disco e ripristina quelle i cui file sono tornati. Un controllo alla
   * volta: importare venti file ne chiede venti, e ognuno rilegge lo stato di tutti gli albi. Le richieste arrivate
   * durante un controllo si soddisfano con un solo giro successivo, che vede anche le loro modifiche.
   */
  checkPresence(): Promise<void> {
    if (!this.checking) {
      this.checking = this.checkPresenceNow().finally(() => (this.checking = null))
      return this.checking
    }
    this.nextCheck ??= this.checking
      .catch(() => {})
      .then(() => {
        this.nextCheck = null
        return this.checkPresence()
      })
    return this.nextCheck
  }

  private async checkPresenceNow(): Promise<void> {
    const exists = (path: string): Promise<boolean> => stat(path).then(() => true, () => false)
    const reachable = new Map<string, Promise<boolean>>()
    const changes = new Map<string, boolean>()
    for (const book of Object.values(this.store.data.books)) {
      // Una cartella irraggiungibile (es. disco esterno scollegato) non cambia lo stato dei suoi albi.
      if (book.folder) {
        if (!reachable.has(book.folder)) reachable.set(book.folder, exists(book.folder))
        if (!(await reachable.get(book.folder))) continue
      }
      const paths = book.collection?.parts.map((part) => part.path) ?? [book.path]
      const present = (await Promise.all(paths.map(exists))).every(Boolean) && !usesAny(book, [...this.removing])
      if (present === !book.missingSince) continue
      changes.set(book.id, present)
    }
    if (!changes.size) return
    const now = Date.now()
    this.store.update((d) => {
      for (const [id, present] of changes) {
        const book = d.books[id]
        if (!book) continue
        if (present) delete book.missingSince
        else book.missingSince ??= now
      }
    })
  }

  setSplitSpreads(id: string, splitSpreads: number[]): void {
    this.mutateBook(id, (book) => (book.splitSpreads = splitSpreads))
  }

  /** Salva l'ordine di lettura di un personaggio; un elenco vuoto torna all'ordine automatico. */
  setHeroOrder(key: string, ids: readonly string[]): void {
    if (typeof key !== 'string' || !Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) throw new Error('Ordine non valido.')
    this.store.update((d) => {
      if (ids.length) d.heroOrder[key] = [...new Set(ids)]
      else delete d.heroOrder[key]
    })
  }

  updateSettings(patch: Partial<ReaderSettings>): void {
    // La cartella della copia esterna cambia solo da setExternalBackupFolder (selettore nativo + prima copia).
    const settings = settingsPatch(patch)
    this.store.update((d) => Object.assign(d.settings, settings))
  }

  setExternalBackupFolder(folder: string | null): void {
    this.store.update((d) => (d.settings.externalBackupFolder = folder))
  }

  private isWatched(folder: string): boolean {
    return this.store.data.folders.some((f) => samePath(f, folder))
  }

  /** Albi rimossi a mano, da non reimportare (chiavi di `pathKey`). */
  excludedKeys(): Set<string> {
    return new Set(this.store.data.excluded.map(pathKey))
  }

  private mutateBook(id: string, mutate: (book: BookRecord) => void): void {
    this.store.update((d) => {
      const book = d.books[id]
      if (book) mutate(book)
    })
  }

  private addBook(found: FoundBook, folder: string | null): string {
    const id = bookId(found.path)
    const existing = this.store.data.books[id]
    if (existing) {
      // Il file è tornato nello stesso percorso: si riprende da dove si era rimasti.
      if (existing.missingSince && !this.removing.has(id)) this.mutateBook(id, (book) => delete book.missingSince)
      return id
    }
    this.store.update((d) => {
      d.excluded = d.excluded.filter((p) => !samePath(p, found.path))
      d.books[id] = {
        id,
        title: titleOf(found.path, found.kind),
        path: found.path,
        kind: found.kind,
        pageCount: null,
        currentPage: 0,
        finished: false,
        lastReadAt: null,
        readPages: [],
        addedAt: Date.now(),
        direction: null,
        shiftPairs: false,
        folder
      }
    })
    return id
  }

  private async scanAll(): Promise<void> {
    const excluded = this.excludedKeys()
    for (const folder of [...this.store.data.folders]) {
      // Una cartella irraggiungibile (es. disco esterno scollegato) non deve cancellare i progressi.
      if (!(await stat(folder).catch(() => null))) continue

      for (const book of await scanFolder(folder)) {
        if (excluded.has(pathKey(book.path))) continue
        // Un download non ancora finito si aggiunge più tardi: lo nota AutoImport, o la prossima scansione.
        if (!this.store.data.books[bookId(book.path)] && await isStillDownloading(book)) continue
        this.addBook(book, folder)
      }
    }
    // Un file sparito non cancella la scheda: restano progressi, stato e copertina.
    await this.checkPresence()
  }
}

function toSummary(book: BookRecord): BookSummary {
  const { folder: _folder, sizes: _sizes, splitSpreads: _splitSpreads, readPages: _readPages, metadata, classification, collection, ...summary } = book
  return {
    ...summary,
    ...(collection && { collection: { ...collection, parts: collection.parts.map(({ pages, sizes: _partSizes, ...part }) => ({ ...part, pageCount: pages.length })) } }),
    metadata: metadata ?? null, classification: classification ?? null, canContinue: !book.missingSince && canContinueReading(book), inProgress: isInProgress(book)
  }
}

/** Testo confrontabile: senza maiuscole, accenti, spazi e punteggiatura. */
function comparable(text: string): string {
  return text.normalize('NFD').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()
}

/** Nome del file senza cartella né estensione. */
function fileKey(path: string): string {
  const name = basename(path)
  return comparable(name.slice(0, name.length - extname(name).length))
}

/** Serie e numero dai metadati, se ci sono entrambi. */
function issueKey(book: BookRecord): string | null {
  const { series, number, volume } = book.metadata ?? {}
  return series && number ? `${comparable(series)}|${volume ?? ''}|${comparable(number)}` : null
}

function isInside(path: string, folder: string): boolean {
  const prefix = folder.endsWith(sep) ? folder : folder + sep
  return pathKey(path).startsWith(pathKey(prefix))
}

/** L'albo (o il volume) legge almeno uno dei file indicati, per id ricavato dal percorso. */
function usesAny(book: BookRecord, fileIds: readonly string[]): boolean {
  const paths = book.collection?.parts.map((part) => part.path) ?? [book.path]
  return paths.some((path) => fileIds.includes(bookId(path)))
}
