import type { BackupStatus, BookPatch, BookSummary, CollectionProgress, CreateCollection, DiskUsage, FolderRemoval, LibrarySnapshot, LibraryUpdate, OpenedBook, PageRef, PageSizesEvent, ReaderSettings } from './types'

/** Canali IPC tra interfaccia e processo principale. */
export const IPC = {
  createCollection: 'collection:create',
  cancelCollection: 'collection:cancel',
  updateCollection: 'collection:update',
  relinkCollection: 'collection:relink',
  collectionProgress: 'collection:progress',
  getLibrary: 'library:get',
  addFolder: 'library:add-folder',
  removeFolder: 'library:remove-folder',
  folderRemoval: 'library:folder-removal',
  openFiles: 'library:open-files',
  addPaths: 'library:add-paths',
  rescan: 'library:rescan',
  removeBook: 'book:remove',
  diskSize: 'book:disk-size',
  deleteFromDisk: 'book:delete-from-disk',
  diskUsage: 'library:disk-usage',
  relinkCandidates: 'book:relink-candidates',
  relinkBook: 'book:relink',
  showInFolder: 'book:show-in-folder',
  openBook: 'book:open',
  updateBook: 'book:update',
  markUnread: 'book:mark-unread',
  saveProgress: 'book:save-progress',
  hideContinueReading: 'book:hide-continue-reading',
  saveSplitSpreads: 'book:save-split-spreads',
  updateSettings: 'settings:update',
  backupStatus: 'backup:status',
  chooseBackupFolder: 'backup:choose-folder',
  clearBackupFolder: 'backup:clear-folder',
  setHeroOrder: 'library:set-hero-order',
  libraryChanged: 'library:changed',
  openRequested: 'app:open-requested',
  takeOpenRequest: 'app:take-open-request',
  pageSizes: 'book:page-sizes'
} as const

/** API esposta all'interfaccia da `window.vignetta`. */
export interface VignettaApi {
  createCollection(input: CreateCollection): Promise<BookSummary>
  cancelCollection(jobId: string): void
  updateCollection(id: string, excluded: PageRef[], coverPart: number): Promise<void>
  relinkCollection(id: string, partIndex: number): Promise<void>
  onCollectionProgress(listener: (event: CollectionProgress) => void): () => void
  /** Tutta la libreria; le modifiche successive arrivano con `onLibraryChanged`. */
  getLibrary(): Promise<LibrarySnapshot>
  /** Mostra il selettore di cartelle; restituisce false se annullato. */
  addFolder(): Promise<boolean>
  /** Quante schede (e quanta cronologia) si perderebbero togliendo la cartella. */
  folderRemoval(folder: string): Promise<FolderRemoval>
  removeFolder(folder: string): Promise<void>
  /** Mostra il selettore di file; restituisce gli id dei fumetti aggiunti. */
  openFiles(): Promise<string[]>
  /** Aggiunge file o cartelle trascinati nella finestra. */
  addPaths(paths: string[]): Promise<string[]>
  rescan(): Promise<void>
  removeBook(id: string): Promise<void>
  /** Byte occupati sul disco dal fumetto (per un volume, da tutti i suoi originali). */
  diskSize(id: string): Promise<number>
  /** Elimina definitivamente i file, conservando la scheda; restituisce i byte liberati. */
  deleteFromDisk(id: string): Promise<number>
  /** Spazio occupato da tutti i fumetti e quanto si libererebbe eliminando quelli indicati. */
  diskUsage(reclaimableIds: readonly string[]): Promise<DiskUsage>
  /** File in libreria che potrebbero essere questo albo spostato o rinominato. */
  relinkCandidates(id: string): Promise<{ id: string; path: string }[]>
  /** Collega un albo senza file a un altro file (senza percorso: lo si sceglie); restituisce il nuovo id o null se annullato. */
  relinkBook(id: string, path: string | null): Promise<string | null>
  showInFolder(id: string): Promise<void>
  openBook(id: string): Promise<OpenedBook>
  updateBook(id: string, patch: BookPatch): Promise<void>
  /** «Segna come da leggere»: riparte da pagina 1 e azzera il conteggio delle pagine viste. */
  markUnread(id: string): Promise<void>
  saveProgress(id: string, page: number, finished: boolean, shown?: readonly number[]): void
  hideContinueReading(id: string): Promise<void>
  saveSplitSpreads(id: string, splitSpreads: number[]): void
  /** La cartella della copia esterna si cambia solo con `chooseBackupFolder` / `clearBackupFolder`. */
  updateSettings(patch: Partial<Omit<ReaderSettings, 'externalBackupFolder'>>): Promise<void>
  backupStatus(): Promise<BackupStatus>
  /** Selettore di cartelle; scelta una cartella fa subito la prima copia. Annullato: stato invariato. */
  chooseBackupFolder(): Promise<BackupStatus>
  /** Smette di fare la copia esterna (le copie già fatte restano dove sono). */
  clearBackupFolder(): Promise<BackupStatus>
  setHeroOrder(key: string, ids: readonly string[]): Promise<void>
  pathForFile(file: File): string
  /** Solo gli albi cambiati dall'ultimo invio (o da `getLibrary`), da unire con `applyLibraryUpdate`. */
  onLibraryChanged(listener: (update: LibraryUpdate) => void): () => void
  onPageSizes(listener: (event: PageSizesEvent) => void): () => void
  /** Fumetto aperto da Esplora file in attesa di essere mostrato (una sola volta), altrimenti null. */
  takeOpenRequest(): Promise<string | null>
  /** Avvisa quando Windows chiede di aprire un fumetto (doppio clic con l'app già avviata). */
  onOpenRequested(listener: () => void): () => void
}

export const PROTOCOL = 'vignetta'

export const pageUrl = (bookId: string, index: number): string => `${PROTOCOL}://page/${bookId}/${index}`
export const coverUrl = (bookId: string): string => `${PROTOCOL}://cover/${bookId}`
/** Il suffisso invalida tutte le cache di immagini quando si ripristina una pagina. */
export const imageBookId = (book: Pick<BookSummary, 'id' | 'contentVersion'>): string => book.contentVersion ? `${book.id}~${book.contentVersion}` : book.id
