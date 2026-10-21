import type { OpenedBook, PageSize, PageSizesEvent } from '../shared/types'
import { readImageSize } from './imageSize'
import type { Library } from './library/library'
import { mimeOf } from './sources/pageSource'
import { describeOpenError } from './sources/openError'
import type { PageSource, SourcePool } from './sources'
import type { CollectionService } from './collections'

export interface ImageData {
  data: Buffer
  mime: string
}

/** Quanti byte leggere per ricavare le dimensioni di un'immagine senza decomprimerla tutta. */
const HEAD_BYTES = 128 * 1024
/** Ogni quanto inviare all'interfaccia le dimensioni appena calcolate. */
const NOTIFY_INTERVAL_MS = 150

/** Apertura dei fumetti, lettura delle pagine e calcolo in background delle loro dimensioni. */
export class BookService {
  private readonly probing = new Set<string>()

  constructor(
    private readonly library: Library,
    private readonly pool: SourcePool,
    private readonly notify: (event: PageSizesEvent) => void,
    private readonly collections?: CollectionService
  ) {}

  async open(id: string): Promise<OpenedBook> {
    const source = await this.source(id).catch((error: unknown) => this.explainOpenError(id, error))
    const pageCount = source.pages.length
    this.library.setPageCount(id, pageCount)
    source.prefetchAll?.()

    const record = this.library.get(id)
    const upToDate = record.sizes?.length === pageCount
    const sizes = source.pageSizes ? [...source.pageSizes] : upToDate ? record.sizes! : new Array<PageSize | null>(pageCount).fill(null)
    if (source.pageSizes) this.library.setSizes(id, sizes)
    if (sizes.includes(null)) void this.probeSizes(id, source, [...sizes], record.contentVersion)

    return { book: this.library.summary(id), pageCount, sizes, splitSpreads: upToDate ? (record.splitSpreads ?? null) : null }
  }

  async page(id: string, index: number, revision?: number): Promise<ImageData> {
    const record = this.library.find(id)
    if (revision !== record?.contentVersion) throw new Error('La pagina appartiene a una versione precedente del volume.')
    // Durante e dopo l'eliminazione il file non va riaperto (Windows non elimina un file aperto).
    if (record?.missingSince) throw new Error('Il file non è più sul disco.')
    const source = await this.source(id, false)
    return { data: await source.read(index), mime: mimeOf(source.pages[index] ?? '') }
  }

  /**
   * L'errore tecnico finisce nel registro, all'utente arriva una spiegazione in italiano.
   * I volumi virtuali hanno già messaggi propri (originale cambiato o mancante) e restano com'erano.
   */
  private async explainOpenError(id: string, error: unknown): Promise<never> {
    const record = this.library.get(id)
    if (record.collection) throw error
    console.warn(`Apertura non riuscita: ${record.path}`, error)
    throw new Error(await describeOpenError(record.path, error))
  }

  private readonly collectionSources = new Map<string, { version: number | undefined; source: PageSource }>()
  private async source(id: string, validate = true): Promise<PageSource> {
    const record = this.library.find(id)
    if (record?.collection && this.collections) {
      const known = this.collectionSources.get(id)
      if (!validate && known && known.version === record.contentVersion) return known.source
      const source = await this.collections.source(id)
      this.collectionSources.set(id, { version: record.contentVersion, source })
      return source
    }
    // All'apertura si controlla che il file non sia cambiato (es. un download finito dopo il primo tentativo).
    const source = await (validate ? this.pool.fresh(id) : this.pool.get(id))
    return { pages: source.pages, pageSizes: source.pageSizes,
      read: (i) => this.pool.use(id, (s) => s.read(i)), readHead: (i, bytes) => this.pool.use(id, (s) => s.readHead(i, bytes)),
      readMetadata: () => this.pool.use(id, (s) => s.readMetadata()), prefetchAll: () => source.prefetchAll?.(), close: async () => {} }
  }

  /** Le dimensioni servono per riconoscere le splash page e accoppiare correttamente le pagine. */
  private async probeSizes(id: string, source: PageSource, sizes: (PageSize | null)[], version?: number): Promise<void> {
    const key = `${id}:${version ?? 0}`
    if (this.probing.has(key)) return
    this.probing.add(key)
    const current = (): boolean => this.library.find(id)?.contentVersion === version

    let batch: Record<number, PageSize> = {}
    let lastNotify = Date.now()
    const flush = (done = false): void => {
      if (current() && (done || Object.keys(batch).length > 0)) this.notify({ bookId: id, sizes: batch, done, contentVersion: version })
      batch = {}
      lastNotify = Date.now()
    }

    try {
      for (let i = 0; i < sizes.length; i++) {
        if (!current()) return
        if (sizes[i]) continue
        const size = await probeSize(source, i)
        sizes[i] = size
        if (size) batch[i] = size
        if (Date.now() - lastNotify > NOTIFY_INTERVAL_MS) flush()
      }
      if (current()) this.library.setSizes(id, sizes)
      flush(true)
    } finally {
      this.probing.delete(key)
    }
  }
}

async function probeSize(source: PageSource, index: number): Promise<PageSize | null> {
  try {
    // Di solito l'intestazione basta; altrimenti (es. JPEG con metadati molto grandi) si legge la pagina intera.
    return readImageSize(await source.readHead(index, HEAD_BYTES)) ?? readImageSize(await source.read(index))
  } catch {
    return null
  }
}
