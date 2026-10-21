import { readdir, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { DiskUsage } from '../shared/types'
import type { Library } from './library/library'
import { collectionCoverKey } from './covers'
import { pathKey } from './paths'
import { collectionSourceKey, sourceCacheId, type SourcePool } from './sources'
import { BackgroundSources } from './sources/background'

/** Tentativi se Windows tiene ancora il file occupato per un attimo (antivirus, indicizzazione). */
const RM_RETRIES = { maxRetries: 8, retryDelay: 100 }

/**
 * Libera spazio senza perdere la cronologia: elimina definitivamente (senza Cestino) i file di un fumetto
 * e le cache legate a quei file, mentre la scheda resta in libreria come «non sul disco».
 * Le pagine non vengono mai ricompresse: un file o c'è intero o non c'è.
 */
export class FreeSpace {
  constructor(
    private readonly library: Library,
    private readonly pool: SourcePool,
    private readonly dirs: { caches: readonly string[]; covers: string },
    /** Copertine, metadati e analisi dei volumi aprono i file fuori dal pool: vanno chiusi anche loro. */
    private readonly background = new BackgroundSources()
  ) {}

  /** Byte occupati dai file del fumetto (per un volume, da tutti gli originali). */
  async size(id: string): Promise<number> {
    const sizes = await Promise.all(this.library.diskFiles(id).map(async ({ path }) => (await stat(path).catch(() => null))?.size ?? 0))
    return sizes.reduce((total, size) => total + size, 0)
  }

  /**
   * Spazio occupato da tutti i fumetti sul disco (ogni file contato una volta) e quanto se ne libererebbe
   * eliminando i fumetti indicati (di solito i letti).
   */
  async usage(reclaimableIds: readonly string[]): Promise<DiskUsage> {
    const { books } = this.library.snapshot()
    const present = new Set<string>()
    for (const book of books) {
      if (book.missingSince) continue
      for (const path of book.collection?.parts.map((part) => part.path) ?? [book.path]) present.add(pathKey(path))
    }
    const reclaimable = new Set<string>()
    for (const id of reclaimableIds) {
      try {
        for (const { path } of this.library.diskFiles(id)) reclaimable.add(pathKey(path))
      } catch { /* già senza file o non eliminabile */ }
    }
    const sizes = new Map(await Promise.all([...present, ...reclaimable].map(async (path) => [path, await sizeOf(path)] as const)))
    const sum = (paths: Set<string>): number => [...paths].reduce((total, path) => total + (sizes.get(path) ?? 0), 0)
    return { total: sum(present), reclaimable: sum(reclaimable) }
  }

  /** Restituisce i byte liberati. */
  async remove(id: string): Promise<number> {
    const files = this.library.diskFiles(id)
    const paths = files.map((file) => file.path)
    const keys = new Set(files.flatMap((file) => file.sourceKeys))
    let freed = 0
    this.library.beginRemoval(paths)
    let reopen = (): void => {}
    try {
      const [, unblock] = await Promise.all([this.pool.release((key) => keys.has(key)), this.background.release(paths)])
      reopen = unblock
      for (const path of paths) {
        const info = await stat(path).catch(() => null)
        if (!info) continue // già sparito
        if (!info.isFile()) throw new Error(`«${basename(path)}» non è un file.`)
        try {
          await rm(path, RM_RETRIES)
        } catch {
          throw new Error(`Impossibile eliminare «${basename(path)}»: forse è aperto in un altro programma.`)
        }
        freed += info.size
      }
    } finally {
      reopen()
      await this.library.endRemoval(paths)
    }
    await this.removeCaches([...keys])
    return freed
  }

  /**
   * Toglie le cache e le copertine che non appartengono più a nessun fumetto sul disco
   * (file eliminati fuori da Vignetta, albi rimossi dalla libreria). Da chiamare dopo la scansione.
   */
  async pruneOrphans(): Promise<void> {
    const { books } = this.library.snapshot()
    const cacheIds = new Set<string>()
    const coverIds = new Set<string>()
    for (const book of books) {
      coverIds.add(book.id)
      book.collection?.parts.forEach((part, index) => {
        coverIds.add(part.bookId).add(collectionCoverKey(part))
        if (!book.missingSince) cacheIds.add(sourceCacheId(collectionSourceKey(book.id, index, part))).add(part.bookId) // anche «Leggi originale»
      })
      if (!book.missingSince) cacheIds.add(book.id)
    }
    for (const root of this.dirs.caches) {
      const names = await readdir(root).catch(() => [])
      await Promise.all(names.filter((name) => !cacheIds.has(name)).map((name) => rm(join(root, name), { recursive: true, force: true })))
    }
    // Le copertine dei fumetti «non sul disco» restano: sono quelle mostrate in grigio sullo scaffale.
    const covers = await readdir(this.dirs.covers).catch(() => [])
    await Promise.all(covers.filter((name) => name.endsWith('.jpg') && !coverIds.has(name.slice(0, -4))).map((name) => rm(join(this.dirs.covers, name), { force: true })))
  }

  private async removeCaches(keys: readonly string[]): Promise<void> {
    await Promise.all(keys.flatMap((key) => this.dirs.caches.map((root) => rm(join(root, sourceCacheId(key)), { recursive: true, force: true, ...RM_RETRIES }))))
  }
}

/** Byte di un archivio, o delle immagini direttamente dentro una cartella-fumetto; 0 se non c'è. */
async function sizeOf(path: string): Promise<number> {
  const info = await stat(path).catch(() => null)
  if (!info?.isDirectory()) return info?.size ?? 0
  const entries = await readdir(path, { withFileTypes: true }).catch(() => [])
  const files = await Promise.all(entries.filter((entry) => entry.isFile()).map((entry) => stat(join(path, entry.name)).then((s) => s.size, () => 0)))
  return files.reduce((total, size) => total + size, 0)
}
