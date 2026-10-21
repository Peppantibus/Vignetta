import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IPC, type VignettaApi } from '../shared/api'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: VignettaApi = {
  createCollection: (input) => ipcRenderer.invoke(IPC.createCollection, input),
  cancelCollection: (jobId) => ipcRenderer.send(IPC.cancelCollection, jobId),
  updateCollection: (id, excluded, coverPart) => ipcRenderer.invoke(IPC.updateCollection, id, excluded, coverPart),
  relinkCollection: (id, partIndex) => ipcRenderer.invoke(IPC.relinkCollection, id, partIndex),
  onCollectionProgress: (listener) => subscribe(IPC.collectionProgress, listener),
  getLibrary: () => ipcRenderer.invoke(IPC.getLibrary),
  addFolder: () => ipcRenderer.invoke(IPC.addFolder),
  removeFolder: (folder) => ipcRenderer.invoke(IPC.removeFolder, folder),
  folderRemoval: (folder) => ipcRenderer.invoke(IPC.folderRemoval, folder),
  openFiles: () => ipcRenderer.invoke(IPC.openFiles),
  addPaths: (paths) => ipcRenderer.invoke(IPC.addPaths, paths),
  rescan: () => ipcRenderer.invoke(IPC.rescan),
  removeBook: (id) => ipcRenderer.invoke(IPC.removeBook, id),
  diskSize: (id) => ipcRenderer.invoke(IPC.diskSize, id),
  deleteFromDisk: (id) => ipcRenderer.invoke(IPC.deleteFromDisk, id),
  diskUsage: (ids) => ipcRenderer.invoke(IPC.diskUsage, ids),
  relinkCandidates: (id) => ipcRenderer.invoke(IPC.relinkCandidates, id),
  relinkBook: (id, path) => ipcRenderer.invoke(IPC.relinkBook, id, path),
  showInFolder: (id) => ipcRenderer.invoke(IPC.showInFolder, id),
  openBook: (id) => ipcRenderer.invoke(IPC.openBook, id),
  updateBook: (id, patch) => ipcRenderer.invoke(IPC.updateBook, id, patch),
  markUnread: (id) => ipcRenderer.invoke(IPC.markUnread, id),
  saveProgress: (id, page, finished, shown) => ipcRenderer.send(IPC.saveProgress, id, page, finished, shown),
  hideContinueReading: (id) => ipcRenderer.invoke(IPC.hideContinueReading, id),
  saveSplitSpreads: (id, splitSpreads) => ipcRenderer.send(IPC.saveSplitSpreads, id, splitSpreads),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.updateSettings, patch),
  backupStatus: () => ipcRenderer.invoke(IPC.backupStatus),
  chooseBackupFolder: () => ipcRenderer.invoke(IPC.chooseBackupFolder),
  clearBackupFolder: () => ipcRenderer.invoke(IPC.clearBackupFolder),
  setHeroOrder: (key, ids) => ipcRenderer.invoke(IPC.setHeroOrder, key, ids),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onLibraryChanged: (listener) => subscribe(IPC.libraryChanged, listener),
  onPageSizes: (listener) => subscribe(IPC.pageSizes, listener),
  takeOpenRequest: () => ipcRenderer.invoke(IPC.takeOpenRequest),
  onOpenRequested: (listener) => subscribe(IPC.openRequested, () => listener())
}

contextBridge.exposeInMainWorld('vignetta', api)
