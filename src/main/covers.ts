import { nativeImage } from 'electron'
import { createHash } from 'node:crypto'
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CollectionPart } from '../shared/types'
import type { ImageData } from './books'
import type { Library } from './library/library'
import { createLimiter } from '../shared/limit'
import { fileSignature, type SourceTarget } from './sources'
import { BackgroundSources, InterruptedReading } from './sources/background'
import { mimeOf } from './sources/pageSource'

const COVER_WIDTH = 480

/** Nome della copertina di un volume: legata al file e alla sua firma, così un ricollegamento non mostra un'immagine vecchia. */
export function collectionCoverKey(part: Pick<CollectionPart, 'path' | 'fingerprint'>): string {
  return createHash('sha1').update(`${part.path}/${part.fingerprint}`).digest('hex')
}

/**
 * Copertine della libreria: la prima pagina ridotta e salvata su disco, così
 * la libreria si apre subito anche con centinaia di fumetti.
 */
export class CoverService {
  private readonly inflight = new Map<string, Promise<ImageData | null>>()
  /**
   * Copertine non riuscite, con la firma del file in quel momento: non si ritenta a vuoto a ogni richiesta,
   * ma se il file cambia (es. un download finito dopo l'importazione) si riprova senza riavviare.
   */
  private readonly failed = new Map<string, string>()
  private readonly limit = createLimiter(2)

  constructor(
    private readonly dir: string,
    private readonly tempDir: string,
    private readonly library: Library,
    private readonly background = new BackgroundSources()
  ) {}

  async get(id: string): Promise<ImageData | null> {
    const book = this.library.find(id)
    // Senza file (archiviato, o in corso di eliminazione) resta solo la copertina già salvata.
    const generate = !book?.missingSince
    const spec = book?.collection
    if (spec) {
      const part = spec.parts[spec.coverPart]!
      return this.cached(collectionCoverKey(part), generate, part)
    }
    return this.cached(id, generate)
  }

  /** Un albo ricollegato cambia id: tiene la copertina del file nuovo se c'è già, altrimenti sposta la vecchia. */
  async move(oldId: string, newId: string): Promise<void> {
    if (oldId === newId) return
    this.failed.delete(newId)
    const hasNew = await access(this.file(newId)).then(() => true, () => false)
    if (hasNew) await rm(this.file(oldId), { force: true })
    else await rename(this.file(oldId), this.file(newId)).catch(() => {})
  }

  private async cached(id: string, generate: boolean, target?: SourceTarget): Promise<ImageData | null> {
    const failedAt = this.failed.get(id)
    if (failedAt !== undefined && failedAt === await this.signature(id, target)) return null
    const cached = await readFile(this.file(id)).catch(() => null)
    if (cached) return { data: cached, mime: 'image/jpeg' }
    if (!generate) return null

    let job = this.inflight.get(id)
    if (!job) {
      job = this.limit(() => this.generate(id, target)).finally(() => this.inflight.delete(id))
      this.inflight.set(id, job)
    }
    return job
  }

  private async generate(id: string, target?: SourceTarget): Promise<ImageData | null> {
    // Firma presa prima di leggere: se il file cambia durante il tentativo, il prossimo riprova.
    const signature = await this.signature(id, target)
    try {
      // I RAR vengono estratti in una cartella temporanea, separata dalla cache usata dal lettore.
      return await this.background.use(target ?? this.library.sourceTarget(id), join(this.tempDir, id), async (source) => {
        if (!target) this.library.setPageCount(id, source.pages.length)
        if (source.pages.length === 0) throw new Error('Nessuna pagina')
        const page = await source.read(0)
        this.failed.delete(id)

        const image = nativeImage.createFromBuffer(page)
        if (image.isEmpty()) return { data: page, mime: mimeOf(source.pages[0]!) } // formato non gestito da nativeImage (es. WebP)

        const thumbnail = image.resize({ width: COVER_WIDTH, quality: 'best' }).toJPEG(85)
        await mkdir(this.dir, { recursive: true })
        await writeFile(this.file(id), thumbnail)
        return { data: thumbnail, mime: 'image/jpeg' }
      })
    } catch (error) {
      // Se l'eliminazione non riesce il file resta: la copertina si deve poter riprovare.
      if (error instanceof InterruptedReading) return null
      console.warn(`Copertina non disponibile per ${id}:`, error)
      this.failed.set(id, signature)
      return null
    }
  }

  /** Versione del file della copertina; un file assente ha comunque una firma, così si riprova quando torna. */
  private async signature(id: string, target?: SourceTarget): Promise<string> {
    try {
      return await fileSignature((target ?? this.library.sourceTarget(id)).path)
    } catch {
      return 'assente'
    }
  }

  private file(id: string): string {
    return join(this.dir, `${id}.jpg`)
  }
}
