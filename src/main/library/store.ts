import { closeSync, fsyncSync, openSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { open, readdir, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { BookSummary, CollectionSpec, ComicMetadata, ManualClassification, PageSize, ReaderSettings } from '../../shared/types'
import { retryWhileBusy, retryWhileBusySync } from '../fsRetry'

export interface BookRecord extends Omit<BookSummary, 'metadata' | 'classification' | 'canContinue' | 'inProgress' | 'collection'> {
  /** Manifesto completo del volume; nel riepilogo per l'interfaccia gli originali hanno solo il numero di pagine. */
  collection?: CollectionSpec
  /** Pagine uniche viste dall'ultimo nascondimento; undefined nei salvataggi precedenti. */
  readPages?: number[]
  /** «In corso» raggiunto (10% di pagine viste); sopravvive al nascondimento da Continua a leggere. */
  started?: boolean
  classification?: ManualClassification | null
  /** undefined finché il fumetto non è stato analizzato; null se non contiene metadati. */
  metadata?: ComicMetadata | null
  /** Cartella della libreria da cui proviene; null se aperto a mano. */
  folder: string | null
  /** Dimensioni delle pagine, salvate per non ricalcolarle a ogni apertura. */
  sizes?: (PageSize | null)[]
  /** Tavole doppie seguite dalle loro metà, valide finché non cambiano le dimensioni delle pagine. */
  splitSpreads?: number[]
}

export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

export interface StoreData {
  version: 1
  folders: string[]
  /** File rimossi a mano dalla libreria, da non riaggiungere durante la scansione. */
  excluded: string[]
  books: Record<string, BookRecord>
  settings: ReaderSettings
  /** Ordine di lettura scelto dall'utente per personaggio; assente nei salvataggi precedenti. */
  heroOrder: Record<string, string[]>
  window: WindowState
}

const defaults = (): StoreData => ({
  version: 1,
  folders: [],
  excluded: [],
  books: {},
  settings: { doublePage: true, coverAlone: true, fit: 'screen', defaultDirection: 'ltr', groupSeries: true, nightMode: false, nightIntensity: 0.6, trimBorders: false, libraryZoom: 1, externalBackupFolder: null },
  heroOrder: {},
  window: { width: 1280, height: 860, maximized: false }
})

/** I salvataggi precedenti ricevono le impostazioni aggiunte dopo, senza perdere le loro. */
function withDefaults(saved: Partial<StoreData>): StoreData {
  const base = defaults()
  return {
    ...base,
    ...saved,
    settings: { ...base.settings, ...saved.settings },
    window: { ...base.window, ...saved.window }
  }
}

const SAVE_DELAY_MS = 800
/** L'antivirus o l'indicizzazione di Windows possono tenere il file occupato per un attimo. */
const READ_ATTEMPTS = 3
const READ_PAUSE_MS = 150
const BACKUP_NAME = /^library-\d{4}-\d{2}-\d{2}\.json$/

export interface StoreOptions {
  /** Cartella delle copie giornaliere: se la libreria è rovinata si riparte dalla più recente leggibile. */
  backups?: string
}

/** Stato persistente dell'app in un file JSON, salvato con un piccolo ritardo per raggruppare le modifiche. */
export class JsonStore {
  private saveTimer: NodeJS.Timeout | null = null
  /** Modifiche non ancora scritte sul disco (anche dopo un salvataggio fallito). */
  private dirty = false
  /** I salvataggi sono in fila: uno vecchio non può finire dopo uno nuovo. */
  private writing: Promise<void> = Promise.resolve()
  /** Cresce a ogni salvataggio; uno superato prima del rename non sostituisce il file. */
  private generation = 0
  private readonly listeners = new Set<() => void>()

  private constructor(
    private readonly file: string,
    readonly data: StoreData
  ) {}

  /**
   * Un file mancante è una libreria nuova; un file occupato fa fallire l'avvio (meglio che partire vuoti).
   * Solo un JSON davvero rovinato viene messo da parte, e si riparte dall'ultima copia giornaliera leggibile.
   */
  static async load(file: string, options: StoreOptions = {}): Promise<JsonStore> {
    const text = await readWithRetry(file)
    if (text === null) return new JsonStore(file, defaults())
    try {
      return new JsonStore(file, withDefaults(JSON.parse(text) as Partial<StoreData>))
    } catch (error) {
      const aside = `${file}.${Date.now()}.bak`
      console.error(`Libreria illeggibile, messa da parte in ${aside}`, error)
      await rename(file, aside)
      const restored = options.backups ? await newestValidBackup(options.backups) : null
      if (!restored) return new JsonStore(file, defaults())
      console.error(`Libreria ripristinata dalla copia ${restored.name}`)
      const store = new JsonStore(file, restored.data)
      store.dirty = true
      store.scheduleSave() // library.json torna subito sul disco
      return store
    }
  }

  update(mutate: (data: StoreData) => void): void {
    mutate(this.data)
    this.dirty = true
    this.scheduleSave()
    for (const listener of this.listeners) listener()
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Salvataggio sincrono, da usare alla chiusura dell'app. Se il file resta occupato (antivirus) lancia
   * l'errore e le modifiche restano da salvare: library.json conserva il salvataggio precedente.
   */
  flushSync(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    if (!this.dirty) return
    this.dirty = false
    this.generation++ // un salvataggio asincrono ancora in corso non lo sovrascrive
    const temporary = `${this.file}.sync.tmp`
    try {
      const fd = openSync(temporary, 'w')
      try {
        writeFileSync(fd, this.serialize())
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
      retryWhileBusySync(() => renameSync(temporary, this.file))
    } catch (error) {
      this.dirty = true
      rmSync(temporary, { force: true })
      throw error
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.save().catch((error) => console.error('Salvataggio fallito', error))
    }, SAVE_DELAY_MS)
  }

  private save(): Promise<void> {
    this.dirty = false
    const text = this.serialize()
    const generation = ++this.generation
    const job = this.writing.then(async () => {
      if (generation !== this.generation) return // c'è già un salvataggio più recente
      const temporary = `${this.file}.tmp`
      // Su disco prima del rename: dopo un blackout il file non resta vuoto.
      try {
        const handle = await open(temporary, 'w')
        try {
          await handle.writeFile(text)
          await handle.sync()
        } finally {
          await handle.close()
        }
        // Tra un tentativo e l'altro può arrivare un salvataggio più recente (es. la chiusura): si ricontrolla ogni volta.
        const renamed = await retryWhileBusy(async () => {
          if (generation !== this.generation) return false
          await rename(temporary, this.file)
          return true
        })
        if (!renamed) await rm(temporary, { force: true })
      } catch (error) {
        await rm(temporary, { force: true }).catch(() => {})
        throw error
      }
    }).catch((error: unknown) => {
      if (generation === this.generation) this.dirty = true // ci riprova la chiusura o la modifica successiva
      throw error
    })
    this.writing = job.catch(() => {})
    return job
  }

  private serialize(): string {
    return JSON.stringify(this.data)
  }
}

/** Testo del file, null se non esiste; gli altri errori passano a chi chiama dopo qualche tentativo. */
async function readWithRetry(file: string): Promise<string | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await readFile(file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      if (attempt >= READ_ATTEMPTS) throw error
      await new Promise((resolve) => setTimeout(resolve, READ_PAUSE_MS))
    }
  }
}

/** La copia giornaliera più recente che si legge correttamente, se c'è. */
async function newestValidBackup(dir: string): Promise<{ name: string; data: StoreData } | null> {
  const names = (await readdir(dir).catch(() => [])).filter((name) => BACKUP_NAME.test(name)).sort().reverse()
  for (const name of names) {
    try {
      const saved: unknown = JSON.parse(await readFile(join(dir, name), 'utf8'))
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) return { name, data: withDefaults(saved as Partial<StoreData>) }
    } catch { /* copia rovinata: si prova la precedente */ }
  }
  return null
}
