import { app, BrowserWindow, dialog, Menu } from 'electron'
import { join } from 'node:path'
import { IPC } from '../shared/api'
import { BookService } from './books'
import { CollectionService } from './collections'
import { CoverService } from './covers'
import { FreeSpace } from './freeSpace'
import { registerIpc } from './ipc'
import { Library } from './library/library'
import { AutoImport } from './library/autoImport'
import { DailyBackup } from './library/backups'
import { LibraryFeed } from './library/feed'
import { JsonStore } from './library/store'
import { LaunchRequests } from './launch'
import { captureMainLog, LogFile, RendererConsole } from './log'
import { migrateFromPreviousName } from './migration'
import { MetadataService } from './metadata/metadataService'
import { handleImageProtocol, registerSchemePrivileges } from './protocol'
import { fileSignature, openSource, sourceCacheId, SourcePool, type SourceTarget } from './sources'
import { BackgroundSources } from './sources/background'
import { pruneCache } from './sources/cache'
import { createMainWindow } from './window'

/** Quante cache di CBR estratti tenere su disco. */
const RAR_CACHES_TO_KEEP = 4
/** Quanti PDF preparati conservare in cache. */
const PDF_CACHES_TO_KEEP = 4
/** Quanti fumetti tenere aperti contemporaneamente. */
const OPEN_BOOKS = 3
/** Copie giornaliere conservate accanto alla libreria e nella cartella esterna scelta dall'utente. */
const BACKUPS_TO_KEEP = 7
const EXTERNAL_BACKUPS_TO_KEEP = 30
/** Alla chiusura non si aspetta all'infinito una cartella esterna che non risponde. */
const EXTERNAL_BACKUP_QUIT_TIMEOUT_MS = 5000

// Permette di usare una libreria separata (prove, versione portatile).
if (process.env.VIGNETTA_USER_DATA) app.setPath('userData', process.env.VIGNETTA_USER_DATA)

// Registro su file: nell'app installata la console del processo principale non si vede.
// Segue userData, quindi con VIGNETTA_USER_DATA finisce nella cartella di prova.
const log = new LogFile(join(app.getPath('userData'), 'logs'))

registerSchemePrivileges()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  captureMainLog(log)
  log.write('INFO', `Avvio di Vignetta ${app.getVersion()} (Electron ${process.versions.electron})`)
  app.on('render-process-gone', (_event, _contents, details) => console.error("Processo dell'interfaccia terminato:", details.reason, `codice ${details.exitCode}`))
  app.on('child-process-gone', (_event, details) => console.error(`Processo ${details.type} terminato:`, details.reason, `codice ${details.exitCode}`))
  app.on('window-all-closed', () => app.quit())
  void app.whenReady().then(start).catch(startFailed)
}

/**
 * Senza finestra l'app resterebbe viva e invisibile, e il blocco d'istanza unica chiuderebbe ogni nuovo avvio:
 * meglio spiegarlo e uscire. La libreria sul disco non viene toccata.
 */
async function startFailed(error: unknown): Promise<void> {
  console.error('Avvio non riuscito:', error)
  await log.flush().catch(() => {})
  dialog.showMessageBoxSync({
    type: 'error', title: 'Vignetta', buttons: ['Chiudi'], noLink: true, message: 'Vignetta non si è avviata',
    detail: `La libreria non è stata modificata. Riprova tra qualche istante.\n\nDettagli nel registro:\n${log.file}`
  })
  app.exit(1)
}

async function start(): Promise<void> {
  const userData = app.getPath('userData')
  if (!process.env.VIGNETTA_USER_DATA) await migrateFromPreviousName(app.getPath('appData'), userData)
  // Le cache sono solo un risparmio di tempo: se la pulizia non riesce si parte lo stesso.
  const rarCacheRoot = join(userData, 'cache', 'rar')
  await pruneCache(rarCacheRoot, RAR_CACHES_TO_KEEP).catch((error) => console.warn('Pulizia della cache RAR non riuscita:', error))
  const pdfCacheRoot = join(userData, 'cache', 'pdf')
  await pruneCache(pdfCacheRoot, PDF_CACHES_TO_KEEP).catch((error) => console.warn('Pulizia della cache PDF non riuscita:', error))

  const libraryFile = join(userData, 'library.json')
  const backupsDir = join(userData, 'backups')
  const store = await JsonStore.load(libraryFile, { backups: backupsDir })
  const backup = new DailyBackup(libraryFile, backupsDir, { keep: BACKUPS_TO_KEEP, label: 'Copia di sicurezza della libreria' })
  void backup.run()
  // Seconda copia su un altro disco o in una cartella sincronizzata: dopo «Elimina dal disco» la libreria
  // è l'unico ricordo degli albi letti. Se la cartella non risponde il salvataggio normale non ne risente.
  const externalBackup = new DailyBackup(libraryFile, store.data.settings.externalBackupFolder, { keep: EXTERNAL_BACKUPS_TO_KEEP, label: 'Copia di sicurezza esterna' })
  void externalBackup.run()
  const library = new Library(store)
  const autoImport = new AutoImport(library)
  const targetOf = (key: string): SourceTarget => collections.target(key) ?? library.sourceTarget(key)
  const pool = new SourcePool(OPEN_BOOKS, (key) => {
    const cacheId = sourceCacheId(key)
    return openSource(targetOf(key), join(rarCacheRoot, cacheId), join(pdfCacheRoot, cacheId))
  }, async (key) => fileSignature(targetOf(key).path))

  // Copertine, metadati e analisi dei volumi aprono i file fuori dal pool; «Elimina dal disco» li chiude tutti.
  const background = new BackgroundSources()
  let win: BrowserWindow | null = null
  const collections = new CollectionService(library, pool, join(userData, 'cache', 'collection-analysis'), (event) => win?.webContents.send(IPC.collectionProgress, event), background)
  const books = new BookService(library, pool, (event) => win?.webContents.send(IPC.pageSizes, event), collections)
  const covers = new CoverService(join(userData, 'covers'), join(app.getPath('temp'), 'vignetta-covers'), library, background)
  const freeSpace = new FreeSpace(library, pool, { caches: [rarCacheRoot, pdfCacheRoot], covers: join(userData, 'covers') }, background)
  const metadata = new MetadataService(library, join(app.getPath('temp'), 'vignetta-metadata'), background)

  // Senza menu predefinito: le sue scorciatoie (Ctrl+più, Ctrl+R…) ingrandirebbero o ricaricherebbero l'interfaccia.
  Menu.setApplicationMenu(null)
  const launch = new LaunchRequests(library, () => win?.webContents.send(IPC.openRequested))
  const feed = new LibraryFeed(() => library.snapshot())
  handleImageProtocol(books, covers)
  registerIpc(library, books, collections, launch, freeSpace, covers, externalBackup, feed)

  win = createMainWindow(store)
  const rendererConsole = new RendererConsole((level, text) => log.write(level, text))
  win.webContents.on('console-message', (event) => rendererConsole.message(event))
  win.on('focus', () => autoImport.refresh())
  win.on('closed', () => (win = null))
  // Doppio clic su un fumetto in Esplora file: all'avvio arriva negli argomenti,
  // con l'app già aperta Windows avvia una seconda istanza che passa qui i suoi argomenti e si chiude.
  void launch.open(process.argv, process.cwd())
  app.on('second-instance', (_event, argv, workingDirectory) => {
    if (win?.isMinimized()) win.restore()
    win?.focus()
    void launch.open(argv, workingDirectory)
  })

  // L'interfaccia riceve gli albi cambiati dopo ogni modifica (raggruppate per non inondarla).
  let notifyTimer: NodeJS.Timeout | null = null
  store.onChange(() => {
    void backup.run() // copia del giorno anche se l'app resta aperta oltre la mezzanotte
    void externalBackup.run()
    autoImport.syncFolders()
    metadata.schedule()
    notifyTimer ??= setTimeout(() => {
      notifyTimer = null
      const update = feed.changes()
      if (update) win?.webContents.send(IPC.libraryChanged, update)
    }, 30)
  })

  let quitting = false
  app.on('before-quit', (event) => {
    if (quitting) return
    quitting = true
    autoImport.close()
    try {
      store.flushSync()
    } catch (error) {
      // Un errore qui farebbe comparire il dialogo di Electron e bloccherebbe l'uscita; resta il salvataggio precedente.
      console.error('Salvataggio della libreria alla chiusura non riuscito:', error)
    }
    void pool.closeAll()
    if (!externalBackup.folder) return
    // La copia esterna del giorno prende lo stato appena salvato; poi si esce davvero (anche se non risponde).
    event.preventDefault()
    const timeout = new Promise((resolve) => setTimeout(resolve, EXTERNAL_BACKUP_QUIT_TIMEOUT_MS))
    void Promise.race([externalBackup.refresh(), timeout])
      .then(() => log.flush())
      .finally(() => app.quit())
  })

  autoImport.syncFolders()
  // Dopo la scansione si sa quali file ci sono ancora: via le cache di quelli spariti.
  void library.rescan().then(() => {
    metadata.schedule()
    return freeSpace.pruneOrphans()
  }).catch((error) => console.warn('Pulizia delle cache non riuscita:', error))
}
