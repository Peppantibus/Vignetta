import { access, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BackupStatus } from '../../shared/types'
import { retryWhileBusy } from '../fsRetry'

const BACKUP_NAME = /^library-\d{4}-\d{2}-\d{2}\.json$/
/** Dopo un errore (es. cartella scollegata) si riprova alla modifica successiva, ma non più di una volta al minuto. */
const RETRY_AFTER_MS = 60_000

/** Giorno locale nel formato AAAA-MM-GG, usato nel nome delle copie. */
export function localDay(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export interface DailyBackupOptions {
  /** Quante copie conservare. */
  keep: number
  /** Nome usato nei messaggi del registro. */
  label: string
  today?: () => string
  now?: () => number
}

/**
 * Copie giornaliere della libreria: protezione contro errori dell'app o operazioni sbagliate,
 * che il salvataggio atomico da solo non può annullare. Si conservano le più recenti.
 * La stessa classe fa la copia interna (accanto alla libreria) e quella esterna, in una cartella
 * scelta dall'utente (es. sincronizzata con un servizio cloud), che può mancare o non rispondere.
 */
export class DailyBackup {
  private lastDay: string | null = null
  private retryAt = 0
  private queue: Promise<void> = Promise.resolve()
  private lastCopyAt: number | null = null
  private error: string | null = null
  private readonly today: () => string
  private readonly now: () => number

  constructor(
    private readonly file: string,
    private dir: string | null,
    private readonly options: DailyBackupOptions
  ) {
    this.today = options.today ?? ((): string => localDay(new Date()))
    this.now = options.now ?? Date.now
  }

  get folder(): string | null {
    return this.dir
  }

  /**
   * Da chiamare all'avvio e a ogni modifica della libreria: lavora soltanto la prima volta
   * di ogni giorno, così un'app lasciata aperta per giorni continua a fare le sue copie
   * senza timer a riposo. Copia lo stato salvato sul disco, cioè quello precedente alle modifiche del giorno.
   * Se la copia non riesce si riprova a una modifica successiva (al massimo una volta al minuto), mai in ciclo.
   */
  run(): Promise<void> {
    const day = this.today()
    if (!this.dir || day === this.lastDay || this.now() < this.retryAt) return this.queue
    this.lastDay = day
    return this.enqueue(day, false)
  }

  /** Riscrive la copia di oggi con lo stato più recente (alla chiusura dell'app). */
  refresh(): Promise<void> {
    if (!this.dir) return this.queue
    const day = this.today()
    this.lastDay = day
    return this.enqueue(day, true)
  }

  /** Cambia cartella (null = nessuna copia) e, se ce n'è una, fa subito la prima copia. */
  setFolder(dir: string | null): Promise<void> {
    this.dir = dir
    this.lastDay = null
    this.retryAt = 0
    this.lastCopyAt = null
    this.error = null
    return this.run()
  }

  /** Cartella, data dell'ultima copia riuscita e ultimo errore, per l'interfaccia. */
  async status(): Promise<BackupStatus> {
    const folder = this.dir
    if (!folder) return { folder: null, lastCopyAt: null, error: null }
    if (this.error) return { folder, lastCopyAt: this.lastCopyAt, error: this.error }
    try {
      // Dopo un riavvio la data si ricava dalla copia più recente presente nella cartella.
      return { folder, lastCopyAt: this.lastCopyAt ?? await newestCopy(folder), error: null }
    } catch (error) {
      // Cartella sparita dopo l'ultima copia: lo si dice subito, senza aspettare il prossimo tentativo.
      return { folder, lastCopyAt: this.lastCopyAt, error: describeBackupError(error) }
    }
  }

  private enqueue(day: string, overwrite: boolean): Promise<void> {
    this.queue = this.queue.then(async () => {
      const dir = this.dir
      if (!dir) return
      try {
        if (await this.copy(dir, day, overwrite)) this.lastCopyAt = this.now()
        if (dir === this.dir) this.error = null
      } catch (error) {
        if (dir !== this.dir) return // nel frattempo l'utente ha scelto un'altra cartella
        console.warn(`${this.options.label} non riuscita (${dir})`, error)
        this.error = describeBackupError(error)
        this.retryAt = this.now() + RETRY_AFTER_MS
        if (this.lastDay === day) this.lastDay = null
      }
    })
    return this.queue
  }

  /** Vero se ha scritto una copia. */
  private async copy(dir: string, day: string, overwrite: boolean): Promise<boolean> {
    const target = join(dir, `library-${day}.json`)
    // Dopo un riavvio nello stesso giorno resta la prima copia: è quella precedente alle modifiche di oggi.
    if (!overwrite && await access(target).then(() => true, () => false)) return false

    const content = await readFile(this.file, 'utf8').catch(() => null)
    if (content === null) return false // prima apertura: ancora nessuna libreria
    try {
      JSON.parse(content)
    } catch {
      return false // un file rovinato non deve prendere il posto di una copia buona
    }

    await mkdir(dir, { recursive: true })
    await writeFile(`${target}.tmp`, content)
    await renameWithRetry(`${target}.tmp`, target)
    await this.prune(dir)
    return true
  }

  private async prune(dir: string): Promise<void> {
    // Solo i nomi `library-AAAA-MM-GG.json`: gli altri file (es. desktop.ini di Windows o Drive) restano.
    const names = (await readdir(dir)).filter((name) => BACKUP_NAME.test(name)).sort()
    for (const name of names.slice(0, Math.max(0, names.length - this.options.keep))) await rm(join(dir, name), { force: true })
  }
}

/** Google Drive o l'antivirus possono tenere il file occupato per un attimo mentre lo leggono. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  try {
    await retryWhileBusy(() => rename(from, to))
  } catch (error) {
    await rm(from, { force: true }).catch(() => {})
    throw error
  }
}

/** Data della copia più recente nella cartella; se la cartella non si legge, l'errore passa a chi chiama. */
async function newestCopy(dir: string): Promise<number | null> {
  const newest = (await readdir(dir)).filter((name) => BACKUP_NAME.test(name)).sort().at(-1)
  return newest ? (await stat(join(dir, newest))).mtimeMs : null
}

/** L'errore tecnico va nel registro; all'utente si spiega in parole semplici. */
export function describeBackupError(error: unknown): string {
  switch ((error as NodeJS.ErrnoException | null)?.code) {
    case 'ENOENT':
    case 'ENOTDIR':
    case 'ENODEV':
    case 'ENXIO':
      return 'Cartella non raggiungibile: forse il disco è scollegato o il programma di sincronizzazione (es. Google Drive) è chiuso.'
    case 'EACCES':
    case 'EPERM':
    case 'EROFS':
      return 'Vignetta non ha il permesso di scrivere in questa cartella.'
    case 'EEXIST':
      return "Al posto della cartella c'è un file con lo stesso nome."
    case 'EBUSY':
      return 'Il file della copia era occupato da un altro programma.'
    case 'ENOSPC':
      return 'Spazio esaurito sul disco della cartella.'
    default:
      return 'Copia non riuscita: la cartella non risponde.'
  }
}
