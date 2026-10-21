import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PageSize } from '../../shared/types'
import { readFileHead } from './fileRead'
import type { PageSource } from './pageSource'
import { PdfNative } from './pdfNative'

/** Risoluzione sufficiente per pagina intera, zoom e lente; PNG senza ulteriore compressione JPEG. */
const PDF_LONG_EDGE = 3200
const CACHE_VERSION = 1

export function pdfRenderSize([width, height]: PageSize): PageSize {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('Dimensioni della pagina PDF non valide.')
  const scale = PDF_LONG_EDGE / Math.max(width, height)
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))]
}

/** Le pagine PDF entrano nello stesso protocollo immagini degli archivi, con preparazione su richiesta. */
export class PdfSource implements PageSource {
  readonly pages: readonly string[]
  private readonly pending = new Map<number, Promise<string>>()
  private native: PdfNative | null = null
  private opening: Promise<void> | null = null
  private closed = false

  private constructor(private readonly file: string, private readonly dir: string, readonly pageSizes: readonly PageSize[]) {
    this.pages = pageSizes.map((_, index) => `${index + 1}.png`)
  }

  static async open(file: string, cacheDir: string): Promise<PdfSource> {
    const info = await stat(file)
    const signature = createHash('sha256').update(`${CACHE_VERSION}:${info.size}:${info.mtimeMs}`).digest('hex').slice(0, 20)
    const dir = join(cacheDir, signature)
    await mkdir(dir, { recursive: true })
    const now = new Date()
    await utimes(cacheDir, now, now)
    let sizes: PageSize[] | null = null
    try {
      const saved: unknown = JSON.parse(await readFile(join(dir, 'pages.json'), 'utf8'))
      if (Array.isArray(saved) && saved.length && saved.every((s) => Array.isArray(s) && s.length === 2 && s.every((n: unknown) => typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= PDF_LONG_EDGE))) sizes = saved as PageSize[]
    } catch { /* Cache assente o incompleta: si rilegge il documento. */ }
    if (sizes) return new PdfSource(file, dir, sizes)

    const native = new PdfNative()
    try {
      const opened = await native.request<{ sizes: PageSize[] }>({ kind: 'open', path: file })
      sizes = opened.sizes.map(pdfRenderSize)
      if (!sizes.length) throw new Error('Il PDF non contiene pagine.')
      await writeFile(join(dir, 'pages.json'), JSON.stringify(sizes))
      const source = new PdfSource(file, dir, sizes)
      source.native = native
      source.opening = Promise.resolve()
      return source
    } catch (error) {
      native.close()
      throw error
    }
  }

  async read(index: number): Promise<Buffer> {
    return readFile(await this.rendered(index))
  }

  async readHead(index: number, bytes: number): Promise<Buffer> {
    return readFileHead(await this.rendered(index), bytes)
  }

  async readMetadata(): Promise<Buffer | null> { return null }

  /** Le pagine ancora in coda nel motore di Windows non servono più: si chiude subito la sessione. */
  abort(): void {
    this.closed = true
    this.native?.close()
  }

  async close(): Promise<void> {
    this.closed = true
    await Promise.allSettled(this.pending.values())
    this.native?.close()
  }

  private rendered(index: number): Promise<string> {
    if (this.closed) return Promise.reject(new Error('Il fumetto PDF è chiuso.'))
    if (!Number.isInteger(index) || !this.pages[index]) return Promise.reject(new RangeError(`Pagina ${index} inesistente`))
    const pending = this.pending.get(index)
    if (pending) return pending
    const job = this.render(index).finally(() => this.pending.delete(index))
    this.pending.set(index, job)
    return job
  }

  private async render(index: number): Promise<string> {
    const target = join(this.dir, this.pages[index]!)
    try {
      const head = await readFileHead(target, 24)
      if (head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && head.length === 24 && head.readUInt32BE(16) === this.pageSizes[index]![0] && head.readUInt32BE(20) === this.pageSizes[index]![1]) return target
    } catch { /* Una pagina mancante viene preparata dal motore di Windows. */ }
    const native = await this.engine()
    const [width, height] = this.pageSizes[index]!
    const temporary = `${target}.tmp`
    await native.request({ kind: 'render', page: index, width, height, target: temporary })
    await rename(temporary, target)
    return target
  }

  /**
   * Sessione di Windows.Data.Pdf con il documento aperto. Dopo un errore (tempo scaduto, PowerShell chiuso)
   * la pagina successiva ne avvia una nuova: senza, il PDF resterebbe illeggibile fino al riavvio.
   */
  private async engine(): Promise<PdfNative> {
    if (this.closed) throw new Error('Il fumetto PDF è chiuso.')
    if (!this.native?.alive) {
      this.native = new PdfNative()
      this.opening = null
    }
    const native = this.native
    this.opening ??= native.request({ kind: 'open', path: this.file }).then(() => {})
    const opening = this.opening
    try {
      await opening
    } catch (error) {
      if (this.opening === opening) this.opening = null
      throw error
    }
    return native
  }
}
