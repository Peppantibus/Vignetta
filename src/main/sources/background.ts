import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathKey } from '../paths'
import { openSource, type PageSource, type SourceTarget } from '.'

/** Lettura fermata da «Elimina dal disco»: non è un errore del file, chi la riceve non deve ricordarla come tale. */
export class InterruptedReading extends Error {
  constructor() {
    super('Lettura interrotta: il file sta per essere eliminato.')
  }
}

interface Reading {
  file: string
  source: PageSource | null
  stopped: boolean
  finished: Promise<void>
}

/**
 * Archivi aperti fuori dal pool del lettore: copertine, metadati e analisi dei volumi. «Elimina dal disco» deve
 * chiudere anche questi, altrimenti Windows trova il file occupato e l'eliminazione fallisce.
 */
export class BackgroundSources {
  private readonly readings = new Set<Reading>()
  /** File in corso di eliminazione (chiave del percorso), con quante eliminazioni li stanno aspettando. */
  private readonly blocked = new Map<string, number>()

  /**
   * Apre il fumetto con una cartella temporanea propria (pagine RAR estratte, pagine PDF preparate), esegue `action`,
   * lo richiude e cancella la cartella. Se il file viene eliminato nel frattempo le letture falliscono.
   */
  async use<T>(target: SourceTarget, scratch: string, action: (source: PageSource) => Promise<T>): Promise<T> {
    const file = pathKey(target.path)
    if (this.blocked.has(file)) throw new InterruptedReading()
    let finish!: () => void
    const reading: Reading = { file, source: null, stopped: false, finished: new Promise((resolve) => (finish = resolve)) }
    this.readings.add(reading)
    try {
      const source = await openSource(target, scratch, join(scratch, 'pdf'))
      reading.source = source
      try {
        if (reading.stopped) source.abort?.()
        return await action(guarded(source, reading))
      } finally {
        await source.close()
      }
    } catch (error) {
      // Dopo l'interruzione anche gli errori dei formati (worker RAR terminato, motore PDF chiuso) vengono da lì.
      throw reading.stopped ? new InterruptedReading() : error
    } finally {
      this.readings.delete(reading)
      finish()
      // Una cartella rimasta non fa danni: non deve far perdere una copertina appena generata.
      await rm(scratch, { recursive: true, force: true }).catch((error) => console.warn('Cartella temporanea non eliminata:', error))
    }
  }

  /**
   * Interrompe le letture sui file indicati e aspetta che li abbiano chiusi; finché non si chiama la funzione
   * restituita nessuno li riapre.
   */
  async release(paths: readonly string[]): Promise<() => void> {
    const files = new Set(paths.map(pathKey))
    for (const file of files) this.blocked.set(file, (this.blocked.get(file) ?? 0) + 1)
    const stopping = [...this.readings].filter((reading) => files.has(reading.file))
    for (const reading of stopping) {
      reading.stopped = true
      reading.source?.abort?.()
    }
    await Promise.all(stopping.map((reading) => reading.finished))
    return () => {
      for (const file of files) {
        const waiting = this.blocked.get(file)! - 1
        if (waiting) this.blocked.set(file, waiting)
        else this.blocked.delete(file)
      }
    }
  }
}

/** Dopo l'interruzione ogni lettura fallisce subito, anche per i formati senza `abort` (ZIP). */
function guarded(source: PageSource, reading: Reading): PageSource {
  const check = (): void => {
    if (reading.stopped) throw new InterruptedReading()
  }
  return {
    pages: source.pages,
    pageSizes: source.pageSizes,
    read: async (index) => { check(); return source.read(index) },
    readHead: async (index, bytes) => { check(); return source.readHead(index, bytes) },
    readMetadata: async () => { check(); return source.readMetadata() },
    prefetchAll: source.prefetchAll && (() => source.prefetchAll!()),
    close: async () => {} // la chiude `use`
  }
}
