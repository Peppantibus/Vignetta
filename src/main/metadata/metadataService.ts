import { join } from 'node:path'
import type { ComicMetadata } from '../../shared/types'
import type { Library } from '../library/library'
import { fileSignature } from '../sources'
import { BackgroundSources, InterruptedReading } from '../sources/background'
import { parseComicInfo } from './comicInfo'

/** Attesa prima di partire, per raggruppare le modifiche alla libreria (es. una scansione). */
const START_DELAY_MS = 1500

/**
 * Cerca ComicInfo.xml nei fumetti mai analizzati, uno alla volta e in background.
 * Ogni fumetto viene controllato una volta sola; il risultato (anche "nessun metadato") resta in libreria.
 * Un errore di lettura invece non si salva (potrebbe essere un download non ancora finito):
 * lo si ricorda solo in memoria con la firma del file, e si riprova quando il file cambia.
 */
export class MetadataService {
  private timer: NodeJS.Timeout | null = null
  private running = false
  /** Letture non riuscite, con la firma del file in quel momento. */
  private readonly failed = new Map<string, string>()

  constructor(
    private readonly library: Library,
    private readonly tempDir: string,
    private readonly background = new BackgroundSources()
  ) {}

  /** Da chiamare quando la libreria cambia: parte solo se ci sono fumetti da analizzare (o da ritentare). */
  schedule(): void {
    if (this.running || this.timer || this.library.booksWithoutMetadataCheck().length === 0) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.run()
    }, START_DELAY_MS)
  }

  private async run(): Promise<void> {
    this.running = true
    try {
      const visited = new Set<string>()
      let book
      while ((book = this.library.booksWithoutMetadataCheck().find((b) => !visited.has(b.id)))) {
        visited.add(book.id)
        // Firma presa prima di leggere: se il file cambia durante la lettura, la prossima volta si riprova.
        const signature = await fileSignature(book.path).catch(() => 'assente')
        if (this.failed.get(book.id) === signature) continue
        const metadata = await this.read(book.id)
        if (metadata === 'interrotta') continue // «Elimina dal disco»: alla prossima modifica si riprova, se il file c'è ancora
        if (metadata === undefined) {
          this.failed.set(book.id, signature)
        } else {
          this.failed.delete(book.id)
          this.library.setMetadata(book.id, metadata)
        }
      }
    } finally {
      this.running = false
    }
  }

  /** I metadati, null se il fumetto non ne ha, undefined se il file non si è potuto leggere. */
  private async read(id: string): Promise<ComicMetadata | null | undefined | 'interrotta'> {
    try {
      // ComicInfo.xml appartiene agli archivi: un PDF usa il normale titolo del file.
      if (this.library.get(id).kind === 'pdf') return null
      // I RAR vengono estratti in una cartella temporanea, separata dalla cache del lettore.
      return await this.background.use(this.library.get(id), join(this.tempDir, id), async (source) => {
        const xml = await source.readMetadata()
        return xml ? parseComicInfo(xml.toString('utf8')) : null
      })
    } catch (error) {
      if (error instanceof InterruptedReading) return 'interrotta'
      console.warn(`Metadati non leggibili per ${id}:`, error)
      return undefined
    }
  }
}
