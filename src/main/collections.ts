import { nativeImage } from 'electron'
import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { boundaryPages, collectionPages, exactDuplicates, refKey } from '../shared/collections'
import { classifyBook } from '../shared/catalog/classify'
import { displayTitleOf, seriesKeyOf } from '../shared/series'
import type { BookSummary, CollectionPart, CollectionProgress, CollectionSpec, CreateCollection, PageRef, PageSize } from '../shared/types'
import type { Library } from './library/library'
import { bookId } from './library/library'
import { collectionSourceKey, type PageSource, type SourcePool } from './sources'
import { statSignature } from './sources/pageSource'
import { BackgroundSources } from './sources/background'
import { readImageSize } from './imageSize'
import { pixelDigest } from './pixelDigest'

async function fingerprint(path: string, title?: string): Promise<string> {
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) throw new Error(`File originale${title ? ` «${title}»` : ''} non disponibile. Usa «Gestisci volume» per ricollegarlo.`)
  return statSignature(info)
}

/** Crea manifesti persistenti; nessun archivio originale viene scritto o eliminato. */
export class CollectionService {
  private readonly jobs = new Map<string, { cancelled: boolean }>()
  constructor(private readonly library: Library, private readonly pool: SourcePool, private readonly cache: string,
    private readonly notify: (progress: CollectionProgress) => void, private readonly background = new BackgroundSources()) {}

  cancel(jobId: string): void { const job = this.jobs.get(jobId); if (job) job.cancelled = true }

  async create(input: CreateCollection): Promise<BookSummary> {
    if (!input.title?.trim() || input.bookIds.length < 2 || new Set(input.bookIds).size !== input.bookIds.length) throw new Error('Scegli almeno due albi distinti e un titolo.')
    const books = input.bookIds.map((id) => this.library.summary(id))
    const publisher = classifyBook(books[0]!).publisher
    if (!['marvel', 'dc'].includes(publisher) || books.some((b) => b.collection || b.kind === 'folder' || classifyBook(b).publisher !== publisher || seriesKeyOf(b) !== seriesKeyOf(books[0]!))) throw new Error('Scegli albi della stessa serie Marvel o DC.')
    if (!Number.isInteger(input.coverPart) || !books[input.coverPart]) throw new Error('Copertina non valida.')
    if (this.jobs.has(input.jobId)) throw new Error('Analisi già in corso.')
    const job = { cancelled: false }
    this.jobs.set(input.jobId, job)
    try {
      const parts = books.map((book) => ({ bookId: book.id, title: displayTitleOf(book), path: book.path, kind: book.kind as CollectionPart['kind'] }))
      const analysed = await this.analyse(parts, input.jobId, () => job.cancelled)
      if (job.cancelled) throw new Error('Creazione annullata.')
      const collection: CollectionSpec = { ...analysed, edition: publisher === 'marvel' ? 'must-have' : 'dc-library', excluded: input.hideDuplicates ? analysed.duplicates.map((d) => d.ref) : [], coverPart: input.coverPart }
      const pages = collectionPages(collection)
      const id = randomUUID()
      this.library.addCollection({ id, title: input.title.replace(/\s+/g, ' ').trim(), path: `volume:${id}`, kind: 'collection', collection,
        contentVersion: 1, pageCount: pages.length, sizes: pages.map((ref) => collection.parts[ref.part]!.sizes[ref.page] ?? null),
        currentPage: 0, finished: false, lastReadAt: null, readPages: [], addedAt: Date.now(), direction: null, shiftPairs: false, metadata: null,
        classification: { publisher, characters: [...new Set(books.flatMap((book) => classifyBook(book).characters))] }, folder: null })
      return this.library.summary(id)
    } finally { this.jobs.delete(input.jobId) }
  }

  update(id: string, excluded: PageRef[], coverPart: number): void {
    const spec = this.library.get(id).collection
    if (!spec || !Number.isInteger(coverPart) || !spec.parts[coverPart]) throw new Error('Volume non valido.')
    const allowed = new Set(spec.duplicates.map((d) => refKey(d.ref)))
    if (excluded.some((ref) => !allowed.has(refKey(ref)))) throw new Error('Si possono escludere solo i doppioni verificati.')
    this.library.replaceCollection(id, { ...spec, excluded, coverPart })
  }

  async relink(id: string, partIndex: number, path: string): Promise<void> {
    const record = this.library.get(id)
    const spec = record.collection
    if (!spec?.parts[partIndex]) throw new Error('Albo non valido.')
    const expectedVersion = record.contentVersion
    const parts = spec.parts.map((part, i) => i === partIndex ? { ...part, path, bookId: bookId(path) } : part)
    const analysed = await this.analyse(parts, `relink:${id}`, () => false)
    if (this.library.get(id).contentVersion !== expectedVersion) throw new Error('Il volume è cambiato. Riprova.')
    // Una sostituzione deve conservare l'ordine e il numero delle pagine, per non perdere l'ancoraggio.
    if (analysed.parts.some((part, i) => part.pages.length !== spec.parts[i]!.pages.length)) throw new Error('Il file sostitutivo ha un numero diverso di pagine. Seleziona lo stesso albo originale.')
    const hidden = new Set(spec.excluded.map(refKey))
    this.library.replaceCollection(id, { ...spec, ...analysed, excluded: analysed.duplicates.filter((d) => hidden.has(refKey(d.ref))).map((d) => d.ref) })
  }

  async source(id: string): Promise<PageSource> {
    const spec = this.library.get(id).collection
    if (!spec) throw new Error('Volume non valido.')
    for (const part of spec.parts) {
      if (await fingerprint(part.path, part.title) !== part.fingerprint) throw new Error(`«${part.title}» è cambiato. Ricollega l'originale da «Gestisci volume».`)
    }
    const refs = collectionPages(spec)
    const access = <T>(index: number, read: (source: PageSource, page: number) => Promise<T>): Promise<T> => {
      const ref = refs[index]
      if (!ref) return Promise.reject(new Error('Pagina non disponibile.'))
      const part = spec.parts[ref.part]!
      return this.pool.use(collectionSourceKey(id, ref.part, part), async (source) => {
        if (source.pages.length !== part.pages.length || source.pages[ref.page] !== part.pages[ref.page]) throw new Error('L’originale è cambiato. Ricollegalo da Gestisci volume.')
        source.prefetchAll?.()
        return read(source, ref.page)
      })
    }
    return { pages: refs.map((ref) => spec.parts[ref.part]!.pages[ref.page]!), pageSizes: refs.map((ref) => spec.parts[ref.part]!.sizes[ref.page] ?? null),
      read: (i) => access(i, (s, p) => s.read(p)), readHead: (i, bytes) => access(i, (s, p) => s.readHead(p, bytes)), readMetadata: async () => null, close: async () => {} }
  }

  /** La factory del pool distingue le letture fisiche di un volume da quelle dei singoli albi. */
  target(key: string): CollectionPart | null {
    const [id, index] = key.split(':')
    return this.library.find(id)?.collection?.parts[Number(index)] ?? null
  }

  private async analyse(targets: Pick<CollectionPart, 'bookId' | 'title' | 'path' | 'kind'>[], jobId: string, cancelled: () => boolean): Promise<Pick<CollectionSpec, 'parts' | 'duplicates'>> {
    const parts: CollectionPart[] = []
    const samples: (PageRef & { digest: string | null })[] = []
    for (const [partIndex, target] of targets.entries()) {
      if (cancelled()) throw new Error('Creazione annullata.')
      this.notify({ jobId, completed: partIndex, total: targets.length, title: target.title })
      const before = await fingerprint(target.path, target.title)
      const scratch = join(this.cache, jobId.replace(/[^a-zA-Z0-9-]/g, '_'), target.bookId)
      parts.push(await this.background.use(target, scratch, async (source) => {
          if (!source.pages.length) throw new Error(`«${target.title}» non contiene pagine.`)
          source.prefetchAll?.()
          const candidates = new Set(boundaryPages(source.pages.length))
          const sizes: (PageSize | null)[] = []
          for (let page = 0; page < source.pages.length; page++) {
            if (cancelled()) throw new Error('Creazione annullata.')
            let size = source.pageSizes?.[page] ?? null
            if (!size) size = readImageSize(await source.readHead(page, 128 * 1024))
            if (candidates.has(page)) {
              const data = await source.read(page)
              const image = nativeImage.createFromBuffer(data)
              // Non ridurre mai l'immagine: una miniatura potrebbe nascondere differenze reali.
              const dimensions = image.getSize()
              samples.push({ part: partIndex, page, digest: image.isEmpty() ? null : pixelDigest(dimensions.width, dimensions.height, image.toBitmap()) })
              size ??= readImageSize(data)
            }
            sizes.push(size)
            await new Promise<void>((resolve) => setImmediate(resolve))
          }
          if (await fingerprint(target.path) !== before) throw new Error(`«${target.title}» è cambiato durante l'analisi. Riprova.`)
          return { ...target, pages: [...source.pages], sizes, fingerprint: before }
      }))
    }
    this.notify({ jobId, completed: targets.length, total: targets.length, title: '' })
    return { parts, duplicates: exactDuplicates(samples) }
  }
}
