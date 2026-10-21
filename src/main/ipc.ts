import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { IPC } from '../shared/api'
import type { BookPatch, ReaderSettings } from '../shared/types'
import type { BookService } from './books'
import type { Library } from './library/library'
import type { CollectionService } from './collections'
import type { FreeSpace } from './freeSpace'
import type { CoverService } from './covers'
import type { LaunchRequests } from './launch'
import type { DailyBackup } from './library/backups'
import type { LibraryFeed } from './library/feed'
import type { CreateCollection, PageRef } from '../shared/types'

const COMIC_FILTERS = [
  { name: 'Fumetti', extensions: ['cbz', 'cbr', 'pdf', 'zip', 'rar'] },
  { name: 'Tutti i file', extensions: ['*'] }
]

export function registerIpc(library: Library, books: BookService, collections: CollectionService, launch: LaunchRequests, freeSpace: FreeSpace, covers: CoverService, externalBackup: DailyBackup, feed: LibraryFeed): void {
  const parent = (): BrowserWindow => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]!

  ipcMain.handle(IPC.createCollection, (_e, input: CreateCollection) => collections.create(input))
  ipcMain.on(IPC.cancelCollection, (_e, jobId: string) => collections.cancel(jobId))
  ipcMain.handle(IPC.updateCollection, (_e, id: string, excluded: PageRef[], coverPart: number) => collections.update(id, excluded, coverPart))
  ipcMain.handle(IPC.relinkCollection, async (_e, id: string, partIndex: number) => {
    const result = await dialog.showOpenDialog(parent(), { title: 'Ricollega lo stesso albo originale', properties: ['openFile'], filters: COMIC_FILTERS })
    if (!result.canceled && result.filePaths[0]) await collections.relink(id, partIndex, result.filePaths[0])
  })

  ipcMain.handle(IPC.getLibrary, () => feed.full())
  ipcMain.handle(IPC.takeOpenRequest, () => launch.take())

  ipcMain.handle(IPC.addFolder, async () => {
    const result = await dialog.showOpenDialog(parent(), { title: 'Scegli una cartella di fumetti', properties: ['openDirectory'] })
    const folder = result.filePaths[0]
    if (result.canceled || !folder) return false
    await library.addFolder(folder)
    return true
  })

  ipcMain.handle(IPC.openFiles, async () => {
    const result = await dialog.showOpenDialog(parent(), {
      title: 'Apri fumetti',
      properties: ['openFile', 'multiSelections'],
      filters: COMIC_FILTERS
    })
    return result.canceled ? [] : library.addPaths(result.filePaths)
  })

  ipcMain.handle(IPC.removeFolder, (_e, folder: string) => library.removeFolder(folder))
  ipcMain.handle(IPC.folderRemoval, (_e, folder: string) => library.folderRemoval(folder))
  ipcMain.handle(IPC.addPaths, (_e, paths: string[]) => library.addPaths(paths))
  ipcMain.handle(IPC.rescan, () => library.rescan())
  ipcMain.handle(IPC.removeBook, (_e, id: string) => library.removeBook(id))
  ipcMain.handle(IPC.diskSize, (_e, id: string) => freeSpace.size(id))
  ipcMain.handle(IPC.deleteFromDisk, (_e, id: string) => freeSpace.remove(id))
  ipcMain.handle(IPC.diskUsage, (_e, ids: string[]) => freeSpace.usage(Array.isArray(ids) ? ids : []))
  ipcMain.handle(IPC.relinkCandidates, (_e, id: string) => library.relinkCandidates(id))
  ipcMain.handle(IPC.relinkBook, async (_e, id: string, path: string | null) => {
    if (!path) {
      const result = await dialog.showOpenDialog(parent(), { title: "Dov'è finito questo fumetto?", properties: ['openFile'], filters: COMIC_FILTERS })
      path = result.canceled ? null : (result.filePaths[0] ?? null)
      if (!path) return null
    }
    const newId = await library.relinkBook(id, path)
    await covers.move(id, newId)
    return newId
  })
  ipcMain.handle(IPC.showInFolder, (_e, id: string) => shell.showItemInFolder(library.get(id).path))
  ipcMain.handle(IPC.openBook, (_e, id: string) => books.open(id))
  ipcMain.handle(IPC.updateBook, (_e, id: string, patch: BookPatch) => library.updateBook(id, patch))
  ipcMain.handle(IPC.markUnread, (_e, id: string) => library.markUnread(id))
  ipcMain.handle(IPC.setHeroOrder, (_e, key: string, ids: string[]) => library.setHeroOrder(key, ids))
  ipcMain.handle(IPC.updateSettings, (_e, patch: Partial<ReaderSettings>) => library.updateSettings(patch))
  ipcMain.handle(IPC.backupStatus, () => externalBackup.status())
  ipcMain.handle(IPC.chooseBackupFolder, async () => {
    const result = await dialog.showOpenDialog(parent(), {
      title: 'Scegli la cartella per la copia di sicurezza esterna',
      defaultPath: externalBackup.folder ?? undefined,
      properties: ['openDirectory', 'createDirectory']
    })
    const folder = result.filePaths[0]
    if (!result.canceled && folder) {
      await externalBackup.setFolder(folder) // prima copia subito
      library.setExternalBackupFolder(folder)
    }
    return externalBackup.status()
  })
  ipcMain.handle(IPC.clearBackupFolder, async () => {
    await externalBackup.setFolder(null)
    library.setExternalBackupFolder(null)
    return externalBackup.status()
  })
  ipcMain.on(IPC.saveProgress, (_e, id: string, page: number, finished: boolean, shown?: number[]) => library.saveProgress(id, page, finished, shown))
  ipcMain.handle(IPC.hideContinueReading, (_e, id: string) => library.hideContinueReading(id))
  ipcMain.on(IPC.saveSplitSpreads, (_e, id: string, splitSpreads: number[]) => library.setSplitSpreads(id, splitSpreads))
}
