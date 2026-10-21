import { mkdir, readFile, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Worker } from 'node:worker_threads'
import createRarWorker from './rarWorker?nodeWorker'
import { compareNatural } from '../../shared/naturalSort'
import { readFileHead } from './fileRead'
import { fileSignature, isComicInfoName, isPageName, type PageSource } from './pageSource'
import { cacheFileName, type RarJob, type RarMessage } from './rarJob'

/**
 * Scritto nella cartella di cache quando tutte le pagine sono state estratte, con la firma dell'archivio:
 * vale solo se il file è ancora lo stesso, così l'elenco di un download parziale non resta in cache.
 */
const COMPLETE_MARKER = 'pages.json'

interface CompleteMarker {
  signature: string
  pages: string[]
  /** Nome di ComicInfo.xml nell'archivio, null se non c'è; assente nelle cache scritte prima del 18/10/2026. */
  metadata?: string | null
}

/**
 * CBR / RAR. Il formato non permette un accesso veloce alle singole pagine (soprattutto
 * negli archivi "solid"), quindi le pagine vengono estratte in una cartella di cache
 * da un worker thread: una per volta su richiesta, oppure tutte in background con `prefetchAll`.
 */
export class RarSource implements PageSource {
  private readonly ready = new Set<string>()
  private readonly pending = new Map<string, Promise<void>>()
  private prefetching = false
  private prefetchJob: Promise<void> | null = null
  /** Worker al lavoro su questo archivio, da fermare con `abort`. */
  private readonly workers = new Set<Worker>()
  private aborted = false
  private stopping: Promise<unknown> = Promise.resolve()

  private constructor(
    private readonly archive: string,
    private readonly dir: string,
    readonly pages: readonly string[],
    /** undefined = non noto (cache vecchia): si legge l'elenco dell'archivio alla prima richiesta. */
    private metadataName: string | null | undefined,
    private readonly signature: string
  ) {}

  static async open(archive: string, cacheDir: string): Promise<RarSource> {
    await mkdir(cacheDir, { recursive: true })
    const now = new Date()
    await utimes(cacheDir, now, now) // segna la cache come usata di recente

    // Firma letta prima dell'elenco: se il file cambia durante la lettura, la cache non risulterà valida.
    const signature = await fileSignature(archive)
    const cached = await readCompleteMarker(cacheDir, signature)
    if (cached) {
      const source = new RarSource(archive, cacheDir, cached.pages, cached.metadata, signature)
      for (const name of cached.pages) source.ready.add(name)
      return source
    }

    const names = await runJob({ kind: 'list', archive })
    return new RarSource(archive, cacheDir, names.filter(isPageName).sort(compareNatural), names.find(isComicInfoName) ?? null, signature)
  }

  async read(index: number): Promise<Buffer> {
    return readFile(await this.extracted(this.page(index)))
  }

  async readHead(index: number, bytes: number): Promise<Buffer> {
    return readFileHead(await this.extracted(this.page(index)), bytes)
  }

  async readMetadata(): Promise<Buffer | null> {
    if (this.metadataName === undefined) this.metadataName = (await runJob({ kind: 'list', archive: this.archive })).find(isComicInfoName) ?? null
    return this.metadataName ? readFile(await this.extracted(this.metadataName)) : null
  }

  prefetchAll(): void {
    if (this.prefetching || this.aborted) return
    this.prefetching = true
    const missing = this.pages.filter((name) => !this.ready.has(name) && !this.pending.has(name))
    this.prefetchJob = this.extract(missing).then(async () => {
      if (this.pages.every((name) => this.ready.has(name))) {
        const marker: CompleteMarker = { signature: this.signature, pages: [...this.pages], metadata: this.metadataName }
        await writeFile(join(this.dir, COMPLETE_MARKER), JSON.stringify(marker))
      }
    }).catch(() => {}) // chi legge la pagina riceve comunque l'errore dalla relativa promise
  }

  /**
   * Ferma subito le estrazioni in corso: altrimenti «Elimina dal disco» o un file cambiato aspetterebbero l'estrazione
   * di tutto l'albo. Le pagine a metà non contano: senza `pages.json` la cache si rifà alla prossima apertura.
   */
  abort(): void {
    if (this.aborted) return
    this.aborted = true
    this.stopping = Promise.all([...this.workers].map((worker) => worker.terminate()))
  }

  /** Senza `abort` lascia finire l'estrazione in background, così la cache resta completa per la prossima volta. */
  async close(): Promise<void> {
    await this.stopping
    await this.prefetchJob
  }

  private page(index: number): string {
    const name = this.pages[index]
    if (name === undefined) throw new RangeError(`Pagina ${index} inesistente`)
    return name
  }

  /** Percorso del file estratto, estraendolo se non è ancora su disco. */
  private async extracted(name: string): Promise<string> {
    if (!this.ready.has(name)) {
      if (this.aborted) throw new Error('Lettura del fumetto RAR interrotta.')
      if (!this.pending.has(name)) void this.extract([name])
      await this.pending.get(name)
    }
    return join(this.dir, cacheFileName(name))
  }

  /** Estrae le pagine indicate; ogni pagina ha la sua promise in `pending`, risolta appena è su disco. */
  private async extract(names: string[]): Promise<void> {
    if (names.length === 0) return
    const resolvers = new Map<string, { resolve: () => void; reject: (e: Error) => void }>()
    for (const name of names) {
      const promise = new Promise<void>((resolve, reject) => resolvers.set(name, { resolve, reject }))
      promise.catch(() => {}) // l'errore arriva comunque a chi la sta aspettando
      this.pending.set(name, promise)
    }

    const settle = (name: string, error?: Error): void => {
      const resolver = resolvers.get(name)
      if (!resolver) return
      resolvers.delete(name)
      this.pending.delete(name)
      if (error) {
        resolver.reject(error)
      } else {
        this.ready.add(name)
        resolver.resolve()
      }
    }

    try {
      await runJob({ kind: 'extract', archive: this.archive, targetDir: this.dir, files: names }, (name) => settle(name), this.workers)
    } catch (error) {
      for (const name of [...resolvers.keys()]) settle(name, error as Error)
    }
    for (const name of [...resolvers.keys()]) settle(name, new Error(`Pagina non trovata nell'archivio: ${name}`))
  }
}

/** Esegue un lavoro in un worker; se `workers` è indicato, il worker vi resta registrato finché è vivo. */
function runJob(job: RarJob, onFile?: (name: string) => void, workers?: Set<Worker>): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const worker = createRarWorker({ workerData: job })
    workers?.add(worker)
    let names: string[] = []
    worker.on('message', (message: RarMessage) => {
      switch (message.type) {
        case 'list':
          names = message.names
          break
        case 'file':
          onFile?.(message.name)
          break
        case 'done':
          resolve(names)
          void worker.terminate()
          break
        case 'error':
          reject(new Error(message.message))
          void worker.terminate()
          break
      }
    })
    worker.once('error', reject)
    worker.once('exit', (code) => {
      workers?.delete(worker)
      reject(new Error(`Il worker RAR si è chiuso inaspettatamente (codice ${code})`))
    })
  })
}

/** Elenco delle pagine già estratte, solo se la cache appartiene a questa versione dell'archivio. */
async function readCompleteMarker(dir: string, signature: string): Promise<Pick<CompleteMarker, 'pages' | 'metadata'> | null> {
  try {
    const marker = JSON.parse(await readFile(join(dir, COMPLETE_MARKER), 'utf8')) as Partial<CompleteMarker> | null
    // I vecchi marcatori (solo l'elenco, senza firma) non valgono: le pagine vengono estratte di nuovo.
    if (marker?.signature !== signature || !Array.isArray(marker.pages) || !marker.pages.every((name) => typeof name === 'string')) return null
    const metadata = typeof marker.metadata === 'string' || marker.metadata === null ? marker.metadata : undefined
    return { pages: marker.pages, metadata }
  } catch {
    return null
  }
}
