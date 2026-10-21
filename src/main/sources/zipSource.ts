import { compareNatural } from '../../shared/naturalSort'
import { isComicInfoName, isPageName, type PageSource } from './pageSource'
import { ZipArchive, type ZipEntry } from './zipArchive'

/** CBZ / ZIP: le pagine vengono decompresse una alla volta, senza caricare l'archivio in memoria. */
export class ZipSource implements PageSource {
  readonly pages: readonly string[]

  private constructor(
    private readonly zip: ZipArchive,
    private readonly entries: readonly ZipEntry[],
    private readonly metadataEntry: ZipEntry | null
  ) {
    this.pages = entries.map((e) => e.name)
  }

  static async open(path: string): Promise<ZipSource> {
    const zip = await ZipArchive.open(path)
    const files = zip.entries.filter((e) => !e.name.endsWith('/'))
    const pages = files.filter((e) => isPageName(e.name)).sort((a, b) => compareNatural(a.name, b.name))
    return new ZipSource(zip, pages, files.find((e) => isComicInfoName(e.name)) ?? null)
  }

  read(index: number): Promise<Buffer> {
    return this.zip.read(this.entry(index))
  }

  readHead(index: number, bytes: number): Promise<Buffer> {
    return this.zip.readHead(this.entry(index), bytes)
  }

  async readMetadata(): Promise<Buffer | null> {
    return this.metadataEntry ? this.zip.read(this.metadataEntry) : null
  }

  close(): Promise<void> {
    return this.zip.close()
  }

  private entry(index: number): ZipEntry {
    const entry = this.entries[index]
    if (!entry) throw new RangeError(`Pagina ${index} inesistente`)
    return entry
  }
}
