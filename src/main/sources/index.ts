import type { BookKind, CollectionPart } from '../../shared/types'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { archiveFormatOf } from './archiveComplete'
import { readFileHead } from './fileRead'
import { FolderSource } from './folderSource'
import type { PageSource } from './pageSource'
import { RarSource } from './rarSource'
import { PdfSource } from './pdfSource'
import { ZipSource } from './zipSource'

export type { PageSource } from './pageSource'
export { fileSignature } from './pageSource'

export interface SourceTarget {
  path: string
  kind: BookKind
}

/**
 * Il formato vero, letto dai primi byte: alcuni file scaricati hanno l'estensione
 * sbagliata (ZIP, RAR o PDF). null se non è riconoscibile.
 */
export async function detectArchiveKind(path: string): Promise<'zip' | 'rar' | 'pdf' | null> {
  return archiveFormatOf(await readFileHead(path, 5))
}

/** Chiave del pool per la lettura di un originale dentro un volume: legata anche al percorso, così un file ricollegato non riusa la vecchia sorgente. */
export function collectionSourceKey(volumeId: string, partIndex: number, part: Pick<CollectionPart, 'fingerprint' | 'path'>): string {
  return `${volumeId}:${partIndex}:${part.fingerprint}:${part.path}`
}

/** Nome della cartella di cache (RAR e PDF) di una sorgente del pool. */
export function sourceCacheId(key: string): string {
  return key.includes(':') ? createHash('sha1').update(key).digest('hex') : key
}

/** Apre la sorgente adatta al formato, con cache separate per RAR e PDF. */
export async function openSource(target: SourceTarget, rarCacheDir: string, pdfCacheDir = join(rarCacheDir, 'pdf')): Promise<PageSource> {
  if (target.kind === 'collection') throw new Error('Un volume virtuale va aperto tramite la sua raccolta.')
  const kind = target.kind === 'folder' ? 'folder' : ((await detectArchiveKind(target.path)) ?? target.kind)
  switch (kind) {
    case 'zip':
      return ZipSource.open(target.path)
    case 'rar':
      return RarSource.open(target.path, rarCacheDir)
    case 'pdf':
      return PdfSource.open(target.path, pdfCacheDir)
    case 'folder':
      return FolderSource.open(target.path)
  }
}

/** Tiene aperte le sorgenti usate più di recente, così sfogliare non riapre l'archivio a ogni pagina. */
export class SourcePool {
  private readonly open = new Map<string, Promise<PageSource>>()
  private readonly leases = new Map<Promise<PageSource>, number>()
  /** Sorgenti espulse con letture in corso: si chiudono quando finisce l'ultima. */
  private readonly retired = new Map<Promise<PageSource>, () => void>()
  /** Versione del file (vedi `fileSignature`) letta all'apertura di ogni sorgente. */
  private readonly versions = new Map<Promise<PageSource>, Promise<string | null>>()

  constructor(
    private readonly capacity: number,
    private readonly factory: (id: string) => Promise<PageSource>,
    private readonly versionOf?: (id: string) => Promise<string>
  ) {}

  get(id: string): Promise<PageSource> {
    let source = this.open.get(id)
    if (source) {
      this.open.delete(id) // reinserita in fondo: è la più recente
    } else {
      const version = this.version(id)
      const created = this.factory(id)
      created.catch(() => {
        this.versions.delete(created)
        if (this.open.get(id) === created) this.open.delete(id) // riprova alla prossima richiesta
      })
      this.versions.set(created, version)
      source = created
    }
    this.open.set(id, source)
    this.evict()
    return source
  }

  /**
   * Come `get`, ma se il file è cambiato da quando la sorgente è stata aperta (es. un download che
   * nel frattempo è finito) la chiude e la riapre: elenco delle pagine e cache non restano quelli vecchi.
   */
  async fresh(id: string): Promise<PageSource> {
    const opened = this.open.get(id)
    if (opened && this.versionOf) {
      const [before, now] = await Promise.all([this.versions.get(opened), this.version(id)])
      if (before !== now && this.open.get(id) === opened) {
        this.open.delete(id)
        await this.retire(opened, true) // il lavoro sulla versione vecchia non serve più
      }
    }
    return this.get(id)
  }

  async closeAll(): Promise<void> {
    await this.release(() => true)
  }

  /**
   * Chiude le sorgenti indicate (es. prima di eliminare il file), interrompendo i lavori in background,
   * e attende la fine delle letture in corso.
   */
  async release(match: (id: string) => boolean): Promise<void> {
    const closing: Promise<void>[] = []
    for (const [id, source] of [...this.open]) {
      if (!match(id)) continue
      this.open.delete(id)
      closing.push(this.retire(source, true))
    }
    await Promise.allSettled(closing)
  }

  /** Una sorgente espulsa dalla cache termina prima le letture già avviate. */
  async use<T>(id: string, action: (source: PageSource) => Promise<T>): Promise<T> {
    const source = this.get(id)
    this.leases.set(source, (this.leases.get(source) ?? 0) + 1)
    try { return await action(await source) }
    finally {
      const remaining = this.leases.get(source)! - 1
      if (remaining) this.leases.set(source, remaining)
      else {
        this.leases.delete(source)
        const closeRetired = this.retired.get(source)
        this.retired.delete(source)
        closeRetired?.()
      }
    }
  }

  private version(id: string): Promise<string | null> {
    return this.versionOf ? this.versionOf(id).catch(() => null) : Promise.resolve(null)
  }

  /** Con `abort` i lavori in background si fermano subito; un'espulsione normale li lascia finire. */
  private retire(source: Promise<PageSource>, abort = false): Promise<void> {
    this.versions.delete(source)
    if (abort) void source.then((s) => s.abort?.(), () => {})
    const close = (): Promise<void> => source.then((s) => s.close()).catch(() => {})
    if (!this.leases.has(source)) return close()
    return new Promise((resolve) => this.retired.set(source, () => void close().then(resolve)))
  }

  private evict(): void {
    while (this.open.size > this.capacity) {
      const [oldestId, oldest] = this.open.entries().next().value!
      this.open.delete(oldestId)
      void this.retire(oldest)
    }
  }
}
