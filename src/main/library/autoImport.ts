import { watch, type FSWatcher } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pathKey } from '../paths'
import { bookId, type Library } from './library'
import { archiveKind, INCOMPLETE_LIMIT_MS, scanFolder, type FoundBook } from './scanner'
import { isArchiveComplete } from '../sources/archiveComplete'
import { isPageName, statSignature } from '../sources/pageSource'

/** Un nuovo file in attesa: la sua firma e da quando è rimasta uguale. */
interface Candidate {
  signature: string
  since: number
}

interface FolderWatch {
  watcher: FSWatcher | null
  timer: NodeJS.Timeout | null
  pending: Map<string, Candidate>
  scanning: boolean
  changed: boolean
}

/** Un archivio fermo ma incompleto si ricontrolla con meno fretta: se il download riprende arriva comunque una notifica. */
const WAITING_FACTOR = 4
/**
 * Al ritorno nella finestra si riesaminano tutte le cartelle (sottocartelle comprese) al massimo una volta in questo
 * tempo: servono solo a recuperare notifiche perse, mentre passare spesso da una finestra all'altra rileggeva ogni volta
 * l'intero albero, pesante con molte cartelle o un disco lento.
 */
export const REFRESH_INTERVAL_MS = 5 * 60_000

/** Notifiche native delle cartelle: nessuna scansione periodica quando non cambia nulla. */
export class AutoImport {
  private readonly folders = new Map<string, FolderWatch>()
  private closed = false
  /** L'avvio controlla già tutte le cartelle: il primo ritorno nella finestra non serve a nulla. */
  private lastRefresh = Date.now()
  constructor(
    private readonly library: Library,
    private readonly settleMs = 2500,
    private readonly incompleteLimitMs = INCOMPLETE_LIMIT_MS,
    private readonly refreshMs = REFRESH_INTERVAL_MS
  ) {}

  /** Chiamata dopo le modifiche alla libreria; riusa le sottoscrizioni già presenti. */
  syncFolders(): void {
    if (this.closed) return
    for (const [folder, state] of this.folders) {
      if (!this.library.watchedFolders.includes(folder)) { this.dispose(state); this.folders.delete(folder) }
    }
    for (const folder of this.library.watchedFolders) {
      if (this.folders.has(folder)) continue
      const state: FolderWatch = { watcher: null, timer: null, pending: new Map(), scanning: false, changed: false }
      this.folders.set(folder, state)
      this.attach(folder, state)
      this.schedule(folder, state)
    }
  }

  /**
   * Al ritorno nell'app recupera eventuali notifiche perse (non più di una volta ogni `refreshMs`) e i dischi
   * ricollegati: una cartella che torna osservabile si controlla subito, perché nel frattempo può essere cambiata.
   */
  refresh(): void {
    this.syncFolders()
    const now = Date.now()
    const due = now - this.lastRefresh >= this.refreshMs
    if (due) this.lastRefresh = now
    for (const [folder, state] of this.folders) {
      const reattached = !state.watcher && this.attach(folder, state)
      if (due || reattached) this.schedule(folder, state)
    }
  }

  close(): void {
    this.closed = true
    for (const state of this.folders.values()) this.dispose(state)
    this.folders.clear()
  }

  /** Vero se la cartella ora è osservata. */
  private attach(folder: string, state: FolderWatch): boolean {
    try {
      state.watcher = watch(folder, { recursive: true, persistent: false }, (event, name) => {
        if (event === 'change' && name && !archiveKind(String(name)) && !isPageName(String(name))) return
        this.schedule(folder, state)
      })
      state.watcher.on('error', () => { state.watcher?.close(); state.watcher = null })
      return true
    } catch {
      return false // cartella irraggiungibile: si riprova quando si torna nell'app
    }
  }

  private schedule(folder: string, state: FolderWatch, delay = this.settleMs): void {
    if (this.closed || this.folders.get(folder) !== state) return
    if (state.scanning) { state.changed = true; return }
    if (state.timer) clearTimeout(state.timer)
    state.timer = setTimeout(() => { state.timer = null; void this.scan(folder, state) }, delay)
    state.timer.unref()
  }

  /**
   * Un nuovo file si importa quando due rilevazioni danno la stessa firma e l'archivio è completo
   * (vedi `isArchiveComplete`). Fermo ma incompleto resta in attesa: il download può essere solo in pausa.
   * Dopo `incompleteLimitMs` senza cambiamenti lo si importa comunque.
   */
  private async scan(folder: string, state: FolderWatch): Promise<void> {
    state.scanning = true
    state.changed = false
    let unsettled = false
    try {
      // Un albo «non sul disco» riscaricato nello stesso percorso viene ricollegato come un nuovo download.
      const known = new Set(this.library.snapshot().books.filter((book) => !book.missingSince).map((book) => book.id))
      // Gli albi rimossi a mano non si importerebbero comunque: inutile rileggerli a ogni giro.
      const excluded = this.library.excludedKeys()
      const pending = new Map<string, Candidate>()
      for (const found of await scanFolder(folder)) {
        if (this.closed || this.folders.get(folder) !== state) return
        if (known.has(bookId(found.path)) || excluded.has(pathKey(found.path))) continue
        const signature = await signatureOf(found).catch(() => null)
        if (this.closed || this.folders.get(folder) !== state) return
        if (!signature) continue
        const previous = state.pending.get(found.path)
        if (previous?.signature !== signature) {
          pending.set(found.path, { signature, since: Date.now() })
          unsettled = true
        } else if (!state.changed && await this.complete(found, previous)) {
          if (this.closed || this.folders.get(folder) !== state) return
          this.library.addDiscoveredBook(found, folder)
        } else {
          pending.set(found.path, previous)
        }
      }
      state.pending = pending
    } catch (error) {
      console.warn('Aggiornamento automatico della cartella non riuscito:', error)
    } finally {
      state.scanning = false
      if (state.changed || unsettled) this.schedule(folder, state)
      else if (state.pending.size) this.schedule(folder, state, this.settleMs * WAITING_FACTOR)
    }
  }

  /** Le cartelle di immagini bastano stabili; un archivio deve avere la sua chiusura o essere fermo da troppo. */
  private async complete(found: FoundBook, candidate: Candidate): Promise<boolean> {
    if (found.kind === 'folder') return true
    if (await isArchiveComplete(found.path).catch(() => false)) return true
    return Date.now() - candidate.since >= this.incompleteLimitMs
  }

  private dispose(state: FolderWatch): void {
    state.watcher?.close()
    if (state.timer) clearTimeout(state.timer)
    state.pending.clear()
  }
}

/** Due rilevazioni uguali prima dell'importazione; le cartelle di immagini controllano anche i file interni. */
async function signatureOf(found: FoundBook): Promise<string | null> {
  if (found.kind !== 'folder') {
    const info = await stat(found.path)
    return info.isFile() && info.size > 0 ? statSignature(info) : null
  }
  const names = (await readdir(found.path)).filter(isPageName).sort()
  if (!names.length) return null
  const signatures = await Promise.all(names.map(async (name) => {
    const info = await stat(join(found.path, name))
    return `${name}/${statSignature(info)}`
  }))
  return signatures.join('\n')
}
