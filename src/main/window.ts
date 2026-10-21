import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import icon from '../../build/icon.png?asset'
import type { JsonStore } from './library/store'

/** Colori della barra del titolo: devono combaciare con il tema dell'interfaccia. */
const BACKGROUND = '#0e0e12'
const TITLE_BAR_HEIGHT = 48

export function createMainWindow(store: JsonStore): BrowserWindow {
  const saved = store.data.window
  const onScreen = saved.x !== undefined && saved.y !== undefined && isVisible(saved.x, saved.y)

  const win = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    ...(onScreen ? { x: saved.x, y: saved.y } : {}),
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'Vignetta',
    icon,
    backgroundColor: BACKGROUND,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: BACKGROUND, symbolColor: '#c9c7d1', height: TITLE_BAR_HEIGHT },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  win.once('ready-to-show', () => {
    if (saved.maximized) win.maximize()
    win.show()
  })

  win.on('close', () => {
    const maximized = win.isMaximized()
    const bounds = win.getNormalBounds()
    store.update((d) => (d.window = { ...bounds, maximized }))
  })

  // Una sola pagina locale: nessuna navigazione altrove (un link trascinato nella finestra, un file lasciato cadere fuori
  // dalle zone previste) e nessuna finestra nuova. Ricaricare la stessa pagina resta possibile.
  win.webContents.on('will-navigate', (event) => {
    if (event.url !== win.webContents.getURL()) event.preventDefault()
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

function isVisible(x: number, y: number): boolean {
  return screen.getAllDisplays().some(({ workArea: a }) => x >= a.x && y >= a.y && x < a.x + a.width && y < a.y + a.height)
}
