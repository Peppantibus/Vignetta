/** Tipi condivisi tra processo principale e interfaccia. */

export type ReadingDirection = 'ltr' | 'rtl'
export type FitMode = 'screen' | 'width'
export type BookKind = 'zip' | 'rar' | 'pdf' | 'folder' | 'collection'

/** Un volume virtuale conserva riferimenti, mai copie delle immagini. */
export interface CollectionPart {
  bookId: string
  title: string
  path: string
  kind: Exclude<BookKind, 'collection'>
  pages: string[]
  sizes: (PageSize | null)[]
  fingerprint: string
}
export interface PageRef { part: number; page: number }
export interface CollectionDuplicate { ref: PageRef; original: PageRef }
export interface CollectionSpec {
  /** Editore della serie al momento della creazione; salvato ma non più mostrato (l'etichetta è sempre «Volume»). */
  edition: 'must-have' | 'dc-library'
  parts: CollectionPart[]
  duplicates: CollectionDuplicate[]
  excluded: PageRef[]
  coverPart: number
}
/**
 * Un originale nel riepilogo per l'interfaccia: elenco e dimensioni delle pagine (migliaia di voci in un volume grande)
 * restano nel processo principale, che le usa per leggere; all'interfaccia basta il loro numero.
 */
export type CollectionPartSummary = Omit<CollectionPart, 'pages' | 'sizes'> & { pageCount: number }
export interface CollectionSummary extends Omit<CollectionSpec, 'parts'> {
  parts: CollectionPartSummary[]
}
export interface CreateCollection {
  jobId: string
  title: string
  bookIds: string[]
  hideDuplicates: boolean
  coverPart: number
}
export interface CollectionProgress { jobId: string; completed: number; total: number; title: string }

/** Larghezza e altezza in pixel di una pagina. */
export type PageSize = readonly [width: number, height: number]

/** Informazioni lette dal file ComicInfo.xml contenuto in molti fumetti digitali. */
export interface ComicMetadata {
  title?: string
  series?: string
  number?: string
  volume?: number
  count?: number
  summary?: string
  year?: number
  month?: number
  publisher?: string
  /** Marchio editoriale (es. Vertigo, Black Label). */
  imprint?: string
  /** Personaggi e squadre, separati da virgole come nel file. */
  characters?: string
  teams?: string
  writer?: string
  penciller?: string
  inker?: string
  colorist?: string
  letterer?: string
  coverArtist?: string
  editor?: string
  genre?: string
  language?: string
  /** Il file dichiara una lettura da destra a sinistra. */
  rightToLeft?: boolean
}

/** Le categorie principali della libreria. */
export type Publisher = 'marvel' | 'dc' | 'manga' | 'other'

/** Classificazione scelta a mano, che prevale su quella automatica. */
export interface ManualClassification {
  publisher: Publisher
  /** Id dei personaggi del dizionario. */
  characters: string[]
}

export interface BookSummary {
  id: string
  title: string
  /** Titolo scelto dall'utente per la libreria; null/undefined = titolo originale. */
  customTitle?: string | null
  path: string
  kind: BookKind
  collection?: CollectionSummary
  /** Cambia quando cambia la corrispondenza tra indice e pagina originale. */
  contentVersion?: number
  /** Noto dopo la prima apertura o la generazione della copertina. */
  pageCount: number | null
  /** Prima pagina dell'ultima schermata letta. */
  currentPage: number
  finished: boolean
  lastReadAt: number | null
  /** Ha raggiunto il 20% di pagine viste dall'ultimo nascondimento. */
  canContinue: boolean
  /** Ha raggiunto il 10% di pagine viste: solo allora l'albo è «In corso». */
  inProgress: boolean
  addedAt: number
  /**
   * Da quando il file non è più sul disco (eliminato per liberare spazio o sparito dalla cartella).
   * La scheda resta in libreria con progressi e stato; assente se il file c'è.
   */
  missingSince?: number
  /** Senso di lettura specifico del fumetto; null = usa l'impostazione globale. */
  direction: ReadingDirection | null
  /** Sposta di una pagina l'accoppiamento in doppia pagina. */
  shiftPairs: boolean
  /** null se il fumetto non contiene metadati (o non è ancora stato analizzato). */
  metadata: ComicMetadata | null
  classification: ManualClassification | null
}

export interface ReaderSettings {
  doublePage: boolean
  /** In doppia pagina mostra la copertina da sola. */
  coverAlone: boolean
  fit: FitMode
  defaultDirection: ReadingDirection
  /** In libreria raccoglie gli albi della stessa serie in una pila. */
  groupSeries: boolean
  /** Velo caldo sulle sole pagine, attivato manualmente. */
  nightMode: boolean
  /** Intensità della modalità notte, tra 0 e 1. */
  nightIntensity: number
  /** Nasconde i margini uniformi delle scansioni; spento finché non lo attiva l'utente. */
  trimBorders: boolean
  /** Ingrandimento degli scaffali della libreria (1 = 100%). */
  libraryZoom: number
  /** Cartella scelta dall'utente per una seconda copia giornaliera della libreria; null = nessuna. */
  externalBackupFolder: string | null
}

/** Stato della copia di sicurezza esterna, mostrato nel dialogo «Cartelle». */
export interface BackupStatus {
  folder: string | null
  /** Ultima copia riuscita (millisecondi), se nota. */
  lastCopyAt: number | null
  /** Ultimo errore, in parole semplici; null se l'ultima prova è andata bene. */
  error: string | null
}

/** Spazio dei fumetti sul disco, in byte. */
export interface DiskUsage {
  total: number
  /** Liberabile eliminando i fumetti richiesti (es. tutti i letti). */
  reclaimable: number
}

/** Cosa si perde togliendo una cartella dalla libreria: le sue schede, con la cronologia. */
export interface FolderRemoval {
  books: number
  /** Albi sul disco già letti. */
  finished: number
  /** Albi sul disco iniziati e non finiti. */
  inProgress: number
  /** Albi senza file: la scheda è l'unico ricordo della lettura. */
  archived: number
}

export interface LibrarySnapshot {
  books: BookSummary[]
  folders: string[]
  settings: ReaderSettings
  /** Ordine di lettura scelto dall'utente per personaggio (chiave `scheda/personaggio`), come elenco di id. */
  heroOrder: Record<string, string[]>
}

/** Cosa è cambiato nella libreria dall'ultimo invio all'interfaccia: solo gli albi nuovi o modificati. */
export interface LibraryUpdate {
  books: BookSummary[]
  removed: string[]
  folders?: string[]
  settings?: ReaderSettings
  heroOrder?: Record<string, string[]>
}

export interface OpenedBook {
  book: BookSummary
  pageCount: number
  /** Dimensioni note finora; le altre arrivano con l'evento PageSizesEvent. */
  sizes: (PageSize | null)[]
  /** Tavole doppie seguite dalle loro metà; null se il fumetto non è ancora stato analizzato. */
  splitSpreads: number[] | null
}

export interface PageSizesEvent {
  bookId: string
  contentVersion?: number
  sizes: Record<number, PageSize>
  /** Vero nell'ultimo evento: tutte le pagine leggibili hanno ora una dimensione. */
  done: boolean
}

export type BookPatch = Partial<Pick<BookSummary, 'direction' | 'shiftPairs' | 'finished' | 'currentPage' | 'classification' | 'customTitle'>>
