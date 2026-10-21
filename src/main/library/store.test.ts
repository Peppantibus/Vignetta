import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JsonStore } from './store'

const folders: string[] = []

afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })))
})

async function libraryFile(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'vignetta-store-'))
  folders.push(folder)
  return join(folder, 'library.json')
}

describe('impostazioni persistenti della modalità notte', () => {
  it('parte spenta al 60% e completa le impostazioni delle librerie precedenti', async () => {
    const file = await libraryFile()
    const fresh = await JsonStore.load(file)
    expect(fresh.data.settings).toMatchObject({ nightMode: false, nightIntensity: 0.6 })

    await writeFile(file, JSON.stringify({ settings: { doublePage: false, fit: 'width' } }))
    const upgraded = await JsonStore.load(file)
    expect(upgraded.data.settings).toMatchObject({
      doublePage: false, fit: 'width', nightMode: false, nightIntensity: 0.6
    })
  })

  it('ricorda attivazione e intensità, compreso lo zero, dopo la riapertura', async () => {
    const file = await libraryFile()
    for (const intensity of [0, 0.6, 1]) {
      const store = await JsonStore.load(file)
      store.update((data) => {
        data.settings.nightMode = true
        data.settings.nightIntensity = intensity
      })
      store.flushSync()
      const reopened = await JsonStore.load(file)
      expect(reopened.data.settings).toMatchObject({ nightMode: true, nightIntensity: intensity })
    }

    const store = await JsonStore.load(file)
    store.update((data) => { data.settings.nightMode = false })
    store.flushSync()
    expect(JSON.parse(await readFile(file, 'utf8')).settings).toMatchObject({ nightMode: false, nightIntensity: 1 })
  })
})

describe('impostazione del ritaglio dei bordi', () => {
  it('parte spento, anche aggiornando una libreria precedente, e ricorda la scelta', async () => {
    const file = await libraryFile()
    expect((await JsonStore.load(file)).data.settings.trimBorders).toBe(false)
    expect((await JsonStore.load(file)).data.settings.libraryZoom).toBe(1)

    await writeFile(file, JSON.stringify({ settings: { doublePage: false, nightMode: true } }))
    const upgraded = await JsonStore.load(file)
    expect(upgraded.data.settings).toMatchObject({ doublePage: false, nightMode: true, trimBorders: false })

    upgraded.update((data) => { data.settings.trimBorders = true })
    upgraded.flushSync()
    expect((await JsonStore.load(file)).data.settings).toMatchObject({ doublePage: false, nightMode: true, trimBorders: true })
  })
})

describe('cartella della copia di sicurezza esterna', () => {
  it('manca nelle librerie precedenti e vale null; una scelta viene ricordata', async () => {
    const file = await libraryFile()
    expect((await JsonStore.load(file)).data.settings.externalBackupFolder).toBeNull()

    await writeFile(file, JSON.stringify({ folders: ['D:/Fumetti'], settings: { doublePage: false, libraryZoom: 1.2 } }))
    const upgraded = await JsonStore.load(file)
    expect(upgraded.data.folders).toEqual(['D:/Fumetti'])
    expect(upgraded.data.settings).toMatchObject({ doublePage: false, libraryZoom: 1.2, externalBackupFolder: null })

    upgraded.update((data) => { data.settings.externalBackupFolder = 'E:/Copie' })
    upgraded.flushSync()
    expect((await JsonStore.load(file)).data.settings).toMatchObject({ doublePage: false, externalBackupFolder: 'E:/Copie' })
  })
})

describe("lettura della libreria all'avvio", () => {
  it('senza file parte da una libreria vuota e non crea nulla finché non si modifica', async () => {
    const file = await libraryFile()
    const store = await JsonStore.load(file)
    expect(store.data.books).toEqual({})
    store.flushSync()
    await expect(readFile(file)).rejects.toThrow()
  })

  it("un file che non si riesce a leggere fa fallire l'avvio senza toccare la libreria", async () => {
    const file = await libraryFile()
    await mkdir(file) // al posto del file c'è una cartella: errore diverso da «file mancante»
    await writeFile(join(file, 'dentro.txt'), 'intatto')
    await expect(JsonStore.load(file, { backups: join(file, '..', 'backups') })).rejects.toThrow()
    expect(await readFile(join(file, 'dentro.txt'), 'utf8')).toBe('intatto')
  })

  it('mette da parte un JSON rovinato e riparte dalla copia giornaliera leggibile più recente', async () => {
    const file = await libraryFile()
    const folder = join(file, '..')
    const backups = join(folder, 'backups')
    await mkdir(backups)
    await writeFile(join(backups, 'library-2026-10-14.json'), JSON.stringify({ folders: ['vecchia'], settings: { doublePage: false } }))
    await writeFile(join(backups, 'library-2026-10-15.json'), JSON.stringify({ folders: ['buona'], settings: { doublePage: false } }))
    await writeFile(join(backups, 'library-2026-10-16.json'), '{ "folders": [')
    await writeFile(join(backups, 'nota.json'), JSON.stringify({ folders: ['non è una copia'] }))
    await writeFile(file, '{ "books": { troncato')

    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = await JsonStore.load(file, { backups })
    error.mockRestore()
    expect(store.data.folders).toEqual(['buona'])
    expect(store.data.settings).toMatchObject({ doublePage: false, nightMode: false })
    const aside = (await readdir(folder)).filter((name) => name.endsWith('.bak'))
    expect(aside).toHaveLength(1)
    expect(await readFile(join(folder, aside[0]!), 'utf8')).toBe('{ "books": { troncato')

    store.flushSync() // la copia ripristinata torna subito a essere library.json
    expect(JSON.parse(await readFile(file, 'utf8')).folders).toEqual(['buona'])
  })

  it('senza copie leggibili riparte vuota, conservando il file rovinato', async () => {
    const file = await libraryFile()
    await writeFile(file, 'non è JSON')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = await JsonStore.load(file, { backups: join(file, '..', 'backups') })
    error.mockRestore()
    expect(store.data.books).toEqual({})
    expect((await readdir(join(file, '..'))).some((name) => name.endsWith('.bak'))).toBe(true)
  })
})

describe('salvataggi in fila', () => {
  it('un salvataggio ritardato ancora in corso non sovrascrive quello fatto alla chiusura', async () => {
    const file = await libraryFile()
    const store = await JsonStore.load(file)
    vi.useFakeTimers()
    try {
      store.update((data) => { data.folders = ['prima'] })
      vi.advanceTimersByTime(1000) // parte il salvataggio asincrono
      store.update((data) => { data.folders = ['dopo'] })
      store.flushSync()
    } finally { vi.useRealTimers() }
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(JSON.parse(await readFile(file, 'utf8')).folders).toEqual(['dopo'])
    expect((await readdir(join(file, '..'))).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  // Un file in sola lettura fa fallire il rename con EPERM su Windows, come un file tenuto aperto dall'antivirus.
  it.runIf(process.platform === 'win32')('un salvataggio ritardato riprova se library.json è occupato per un attimo', async () => {
    const file = await libraryFile()
    const store = await JsonStore.load(file)
    store.update((data) => { data.folders = ['prima'] })
    store.flushSync()
    await chmod(file, 0o444)
    setTimeout(() => void chmod(file, 0o644), 900 + 150) // si libera durante i tentativi
    store.update((data) => { data.folders = ['dopo'] })
    await new Promise((resolve) => setTimeout(resolve, 1600))
    expect(JSON.parse(await readFile(file, 'utf8')).folders).toEqual(['dopo'])
    expect((await readdir(join(file, '..'))).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it.runIf(process.platform === 'win32')('alla chiusura un file sempre occupato lascia il salvataggio precedente e le modifiche da salvare', async () => {
    const file = await libraryFile()
    const store = await JsonStore.load(file)
    store.update((data) => { data.folders = ['prima'] })
    store.flushSync()
    await chmod(file, 0o444)
    try {
      store.update((data) => { data.folders = ['dopo'] })
      expect(() => store.flushSync()).toThrow()
      expect(JSON.parse(await readFile(file, 'utf8')).folders).toEqual(['prima'])
      expect((await readdir(join(file, '..'))).filter((name) => name.endsWith('.tmp'))).toEqual([])
    } finally {
      await chmod(file, 0o644)
    }
    store.flushSync() // le modifiche non erano state dimenticate
    expect(JSON.parse(await readFile(file, 'utf8')).folders).toEqual(['dopo'])
  })

  it("i salvataggi ritardati scrivono l'ultimo stato e la chiusura senza modifiche non riscrive", async () => {
    const file = await libraryFile()
    const store = await JsonStore.load(file)
    store.update((data) => { data.folders = ['uno'] })
    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(JSON.parse(await readFile(file, 'utf8')).folders).toEqual(['uno'])
    await writeFile(file, JSON.stringify({ folders: ['scritto da fuori'] }))
    store.flushSync()
    expect(JSON.parse(await readFile(file, 'utf8')).folders).toEqual(['scritto da fuori'])
  })
})
