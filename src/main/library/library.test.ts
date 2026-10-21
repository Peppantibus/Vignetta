import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Library } from './library'
import { JsonStore, type BookRecord } from './store'
import { completePdf, completeRar5, completeZip } from '../sources/testArchives'
import { classifyBook } from '../../shared/catalog/classify'
import { displayTitleOf } from '../../shared/series'
import { catalogBooks } from '../../shared/collections'
import type { BookPatch, CollectionSpec } from '../../shared/types'

const folders: string[] = []

it('salva volume, esclusioni e progressi; scioglierlo conserva tutti gli originali', async () => {
  const { store, library, file } = await setup()
  const original = structuredClone(library.get('albo'))
  const spec: CollectionSpec = { edition: 'dc-library', coverPart: 0,
    parts: [0, 1].map((n) => ({ bookId: n ? 'altro' : 'albo', title: `Batman ${n}`, path: `${n}.cbz`, kind: 'zip', pages: ['0.png', '1.png'], sizes: [[100, 200], [100, 200]], fingerprint: '1/2' })),
    duplicates: [{ ref: { part: 1, page: 0 }, original: { part: 0, page: 0 } }], excluded: [{ part: 1, page: 0 }] }
  library.addCollection({ ...original, id: 'volume', title: 'Batman', kind: 'collection', path: 'volume:volume', collection: spec, pageCount: 3, currentPage: 0, readPages: [], contentVersion: 1, metadata: null })
  library.saveProgress('volume', 2, true, [0, 2])
  expect(library.get('albo')).toEqual(original)
  library.replaceCollection('volume', { ...spec, excluded: [] })
  expect(library.get('volume')).toMatchObject({ currentPage: 3, readPages: [0, 3], pageCount: 4, finished: false, contentVersion: 2 })
  store.flushSync()
  const reopened = await JsonStore.load(file)
  const next = new Library(reopened)
  expect(next.summary('volume').collection?.excluded).toEqual([])
  expect(catalogBooks(next.snapshot().books).map((b) => b.id)).toEqual(['volume'])
  expect(next.sourceTarget('altro')).toMatchObject({ path: '1.cbz' })
  next.removeBook('volume')
  expect(next.get('albo')).toEqual(original)
  expect(catalogBooks(next.snapshot().books).map((b) => b.id)).toEqual(['albo'])
  reopened.flushSync()
})
it('trova un albo per id senza confonderlo con le proprietà degli oggetti', async () => {
  const { store, library } = await setup()
  expect(library.find('albo')).toBe(library.get('albo'))
  for (const id of ['nessuno', 'constructor', '__proto__', 'toString']) expect(library.find(id)).toBeUndefined()
  store.flushSync()
})
afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })))
})

describe('titolo personale', () => {
  it('rinomina, riclassifica e ricorda il titolo conservando identità e lettura', async () => {
    const { store, library, file } = await setup(true)
    const before = { ...library.get('albo') }
    library.updateBook('albo', { customTitle: '  Batman   - Parte 1  ' })
    const renamed = library.summary('albo')
    expect(displayTitleOf(renamed)).toBe('Batman - Parte 1')
    expect(classifyBook(renamed)).toMatchObject({ publisher: 'dc', characters: ['batman'] })
    expect(library.get('albo')).toEqual({ ...before, customTitle: 'Batman - Parte 1' })
    store.flushSync()
    const reopened = await JsonStore.load(file)
    expect(displayTitleOf(new Library(reopened).summary('albo'))).toBe('Batman - Parte 1')
    const next = new Library(reopened)
    next.updateBook('albo', { customTitle: null })
    expect(displayTitleOf(next.summary('albo'))).toBe(before.title)
    reopened.flushSync()
  })

  it('rifiuta il titolo vuoto prima di applicare qualsiasi modifica', async () => {
    const { store, library } = await setup()
    expect(() => library.updateBook('albo', { customTitle: '   ', finished: true })).toThrow('Il titolo non può essere vuoto.')
    expect(library.summary('albo')).toMatchObject({ finished: false, title: 'Albo di prova' })
    expect(library.get('albo').customTitle).toBeUndefined()
    store.flushSync()
  })

  it("una modifica con campi non previsti o valori sbagliati non tocca né la scheda né le impostazioni", async () => {
    const { store, library } = await setup()
    const before = structuredClone(library.get('albo'))
    expect(() => library.updateBook('albo', { finished: true, path: 'C:/altro.cbz' } as BookPatch)).toThrow('Modifica non valida (path)')
    expect(() => library.updateSettings({ nightMode: true, libraryZoom: 50 })).toThrow('Modifica non valida (libraryZoom)')
    expect(library.get('albo')).toEqual(before)
    expect(library.settings).toMatchObject({ nightMode: false, libraryZoom: 1 })
    store.flushSync()
  })

  it('mantiene titolo personale e progresso durante una nuova scansione', async () => {
    const { store, library, file } = await setup()
    const source = join(file, '..', 'parte 1.cbz')
    await writeFile(source, 'archivio segnaposto per la scansione')
    const [id] = await library.addPaths([source])
    await library.addFolder(join(file, '..'))
    library.updateBook(id, { customTitle: 'Batman - Parte 1', currentPage: 12 })
    await library.rescan()
    expect(library.summary(id)).toMatchObject({ customTitle: 'Batman - Parte 1', currentPage: 12, path: source })
    expect(library.snapshot().books.filter((b) => b.path === source)).toHaveLength(1)
    store.flushSync()
  })
})

async function setup(legacy = false): Promise<{ store: JsonStore; library: Library; file: string }> {
  const folder = await mkdtemp(join(tmpdir(), 'vignetta-reading-'))
  folders.push(folder)
  const file = join(folder, 'library.json')
  const store = await JsonStore.load(file)
  const book: BookRecord = {
    id: 'albo', title: 'Albo di prova', path: 'C:/Fumetti/albo.cbz', kind: 'zip', folder: null,
    pageCount: 200, currentPage: legacy ? 39 : 0, lastReadAt: legacy ? 1 : null,
    finished: false, addedAt: 0, direction: null, shiftPairs: false,
    ...(legacy ? {} : { readPages: [] })
  }
  store.update((data) => { data.books[book.id] = book })
  store.flushSync()
  return { store, file, library: new Library(store) }
}

describe('ripresa della lettura persistente', () => {
  it('una semplice apertura e un salto non raggiungono la soglia', async () => {
    const { store, library } = await setup()
    library.saveProgress('albo', 0, false, [0])
    library.saveProgress('albo', 100, false, [100, 101])
    expect(library.summary('albo')).toMatchObject({ currentPage: 100, canContinue: false })
    expect(library.get('albo').readPages).toEqual([0, 100, 101])
    store.flushSync()
  })

  it('accumula il 20% tra riavvii senza ricontare le pagine riaperte', async () => {
    const { store, library, file } = await setup()
    library.saveProgress('albo', 19, false, Array.from({ length: 20 }, (_, i) => i))
    expect(library.summary('albo').canContinue).toBe(false)
    store.flushSync()
    const reopened = await JsonStore.load(file)
    const next = new Library(reopened)
    next.saveProgress('albo', 19, false, [19])
    next.saveProgress('albo', 39, false, Array.from({ length: 20 }, (_, i) => i + 20))
    expect(next.summary('albo').canContinue).toBe(true)
    expect(next.get('albo').readPages).toHaveLength(40)
    expect(next.summary('albo')).not.toHaveProperty('readPages')
    reopened.flushSync()
  })

  it('nasconde conservando la posizione e richiede un altro 20%, anche dopo il riavvio', async () => {
    const { store, library, file } = await setup(true)
    expect(library.summary('albo').canContinue).toBe(true)
    library.hideContinueReading('albo')
    expect(library.summary('albo')).toMatchObject({ currentPage: 39, lastReadAt: 1, finished: false, canContinue: false })
    store.flushSync()
    const reopened = await JsonStore.load(file)
    const next = new Library(reopened)
    for (let i = 0; i < 30; i++) next.saveProgress('albo', 39, false, [39])
    expect(next.summary('albo').canContinue).toBe(false)
    next.saveProgress('albo', 77, false, Array.from({ length: 38 }, (_, i) => i + 40))
    expect(next.summary('albo').canContinue).toBe(false)
    next.saveProgress('albo', 78, false, [78])
    expect(next.summary('albo').canContinue).toBe(true)
    reopened.flushSync()
  })

  it('conta entrambe le pagine di una coppia e non conta due volte il cambio impaginazione', async () => {
    const { store, library } = await setup()
    library.setPageCount('albo', 32)
    library.saveProgress('albo', 0, false, [0])
    library.saveProgress('albo', 1, false, [1, 2])
    library.saveProgress('albo', 2, false, [2])
    expect(library.summary('albo').canContinue).toBe(false)
    library.saveProgress('albo', 3, false, [3])
    expect(library.summary('albo').canContinue).toBe(false)
    library.saveProgress('albo', 6, false, [4, 5, 6])
    expect(library.summary('albo').canContinue).toBe(true)
    store.flushSync()
  })

  it('esclude i terminati e ricomincia il conteggio con Segna come da leggere', async () => {
    const { store, library } = await setup(true)
    library.updateBook('albo', { finished: true })
    expect(library.summary('albo').canContinue).toBe(false)
    library.markUnread('albo')
    expect(library.get('albo').readPages).toEqual([])
    library.saveProgress('albo', 0, false, [0])
    expect(library.summary('albo').canContinue).toBe(false)
    store.flushSync()
  })
})

describe('stato «In corso»', () => {
  const pages = (from: number, count: number): number[] => Array.from({ length: count }, (_, i) => from + i)

  it('un albo appena aperto resta «Da leggere» fino al 10% di pagine viste', async () => {
    const { store, library } = await setup()
    library.saveProgress('albo', 0, false, [0])
    expect(library.summary('albo').inProgress).toBe(false)
    library.saveProgress('albo', 18, false, pages(1, 18))
    expect(library.summary('albo').inProgress).toBe(false)
    library.saveProgress('albo', 19, false, [19])
    expect(library.summary('albo').inProgress).toBe(true)
    store.flushSync()
  })

  it('resta «In corso» dopo il nascondimento da Continua a leggere e il riavvio', async () => {
    const { store, library, file } = await setup()
    library.saveProgress('albo', 40, false, pages(0, 41))
    library.hideContinueReading('albo')
    expect(library.summary('albo')).toMatchObject({ canContinue: false, inProgress: true })
    store.flushSync()
    const reopened = await JsonStore.load(file)
    expect(new Library(reopened).summary('albo').inProgress).toBe(true)
    reopened.flushSync()
  })

  it('tornare a pagina 1 per altre vie non azzera le pagine viste: lo fa solo «Segna come da leggere»', async () => {
    const { store, library } = await setup()
    library.saveProgress('albo', 60, true, pages(0, 61))
    library.updateBook('albo', { finished: false, currentPage: 0 })
    expect(library.get('albo')).toMatchObject({ finished: false, currentPage: 0, started: true })
    expect(library.get('albo').readPages).toHaveLength(61)
    store.flushSync()
  })

  it('un albo in corso si segna «Da leggere» e riparte da zero', async () => {
    const { store, library } = await setup()
    library.saveProgress('albo', 60, false, pages(0, 61))
    library.markUnread('albo')
    expect(library.summary('albo')).toMatchObject({ currentPage: 0, inProgress: false, canContinue: false })
    library.saveProgress('albo', 0, false, [0])
    expect(library.summary('albo').inProgress).toBe(false)
    store.flushSync()
  })

  it('i salvataggi precedenti già aperti restano «In corso»; i terminati no', async () => {
    const { store, library } = await setup(true)
    expect(library.summary('albo').inProgress).toBe(true)
    library.updateBook('albo', { finished: true })
    expect(library.summary('albo').inProgress).toBe(false)
    store.flushSync()
  })
})

describe('ordine di lettura personale', () => {
  it('si salva, sopravvive al riavvio e si ripristina con un elenco vuoto', async () => {
    const { store, library, file } = await setup()
    library.setHeroOrder('dc/batman', ['b', 'a', 'b'])
    expect(library.snapshot().heroOrder).toEqual({ 'dc/batman': ['b', 'a'] })
    store.flushSync()
    const reopened = await JsonStore.load(file)
    const next = new Library(reopened)
    expect(next.snapshot().heroOrder['dc/batman']).toEqual(['b', 'a'])
    next.setHeroOrder('dc/batman', [])
    expect(next.snapshot().heroOrder).toEqual({})
    expect(() => next.setHeroOrder('dc/batman', [1 as unknown as string])).toThrow()
    reopened.flushSync()
  })

  it('un salvataggio precedente senza ordini si apre con un elenco vuoto', async () => {
    const { library } = await setup()
    expect(library.snapshot().heroOrder).toEqual({})
  })
})

describe('albi non sul disco', () => {
  async function withComic(): Promise<{ store: JsonStore; library: Library; folder: string; comic: string; id: string }> {
    const { store, library, file } = await setup()
    const folder = join(file, '..', 'fumetti')
    await mkdir(folder)
    const comic = join(folder, 'Batman 1.cbz')
    await writeFile(comic, completeZip())
    await library.addFolder(folder)
    const id = library.snapshot().books.find((b) => b.path === comic)!.id
    library.setPageCount(id, 10)
    return { store, library, folder, comic, id }
  }

  it('un file sparito resta in libreria con la sua cronologia e torna quando lo si rimette', async () => {
    const { store, library, comic, id } = await withComic()
    library.saveProgress(id, 4, false, [0, 1, 2, 3, 4])
    await rm(comic)
    await library.rescan()
    expect(library.summary(id)).toMatchObject({ currentPage: 4, inProgress: true, canContinue: false, missingSince: expect.any(Number) })
    await writeFile(comic, completeZip('archivio riscaricato'))
    await library.rescan()
    expect(library.summary(id).missingSince).toBeUndefined()
    expect(library.summary(id)).toMatchObject({ currentPage: 4, canContinue: true })
    store.flushSync()
  })

  it('un albo senza file rimosso a mano si può reimportare', async () => {
    const { store, library, comic, id } = await withComic()
    await rm(comic)
    await library.rescan()
    library.removeBook(id)
    await writeFile(comic, completeZip())
    await library.rescan()
    expect(library.summary(id)).toMatchObject({ currentPage: 0, finished: false })
    store.flushSync()
  })

  it('una cartella irraggiungibile (disco scollegato) non cambia lo stato dei suoi albi', async () => {
    const { store, library, folder, id } = await withComic()
    await rm(folder, { recursive: true })
    await library.rescan()
    expect(library.summary(id).missingSince).toBeUndefined()
    store.flushSync()
  })

  it('un volume è «non sul disco» se manca un suo originale', async () => {
    const { store, library, folder, comic } = await withComic()
    const other = join(folder, 'Batman 2.cbz')
    await writeFile(other, completeZip())
    const spec: CollectionSpec = { edition: 'dc-library', coverPart: 0, duplicates: [], excluded: [],
      parts: [comic, other].map((path, n) => ({ bookId: `parte${n}`, title: `Batman ${n + 1}`, path, kind: 'zip', pages: ['0.png'], sizes: [[1, 1]], fingerprint: '1/2' })) }
    library.addCollection({ ...library.get('albo'), id: 'volume', path: 'volume:volume', kind: 'collection', collection: spec, folder: null })
    await library.checkPresence()
    expect(library.summary('volume').missingSince).toBeUndefined()
    await rm(other)
    await library.checkPresence()
    expect(library.summary('volume').missingSince).toEqual(expect.any(Number))
    store.flushSync()
  })

  it("durante l'eliminazione un controllo contemporaneo non fa ricomparire il file; se fallisce torna com'era", async () => {
    const { store, library, comic, id } = await withComic()
    library.beginRemoval([comic])
    await library.checkPresence()
    expect(library.summary(id).missingSince).toEqual(expect.any(Number))
    await library.endRemoval([comic]) // il file c'è ancora: eliminazione fallita
    expect(library.summary(id).missingSince).toBeUndefined()
    library.beginRemoval([comic])
    await rm(comic)
    await library.endRemoval([comic])
    expect(library.summary(id).missingSince).toEqual(expect.any(Number))
    expect(() => library.diskFiles(id)).toThrow('non è più sul disco')
    store.flushSync()
  })

  it('prima di togliere una cartella dice quanti albi e quanta cronologia si perdono', async () => {
    const { store, library, folder, id } = await withComic()
    const other = join(folder, 'Batman 2.cbz')
    const archived = join(folder, 'Batman 3.cbz')
    const unread = join(folder, 'Batman 4.cbz')
    for (const path of [other, archived, unread]) await writeFile(path, completeZip(path))
    await library.rescan()
    const idOf = (path: string): string => library.snapshot().books.find((b) => b.path === path)!.id
    library.updateBook(id, { finished: true })
    library.setPageCount(idOf(other), 10)
    library.saveProgress(idOf(other), 3, false, [0, 1, 2])
    library.updateBook(idOf(archived), { finished: true })
    await rm(archived)
    await library.rescan()
    // L'albo aperto a mano non appartiene alla cartella e resta.
    expect(library.folderRemoval(folder)).toEqual({ books: 4, finished: 1, inProgress: 1, archived: 1 })
    expect(library.folderRemoval(join(folder, 'altra'))).toEqual({ books: 0, finished: 0, inProgress: 0, archived: 0 })

    library.removeFolder(folder)
    expect(library.snapshot().books.map((b) => b.id)).toEqual(['albo'])
    expect(library.folderRemoval(folder).books).toBe(0)
    store.flushSync()
  })

  it.runIf(process.platform === 'win32')('una cartella scritta con altre maiuscole è la stessa: nessun doppione, esclusioni rispettate', async () => {
    const { store, library, folder, id } = await withComic()
    const shouted = folder.toUpperCase()
    await library.addFolder(shouted)
    expect(library.watchedFolders).toEqual([folder])
    expect(library.folderRemoval(shouted).books).toBe(1)
    library.removeBook(id) // esclusa con il percorso scritto come nella cartella originale
    library.removeFolder(shouted)
    expect(library.watchedFolders).toEqual([])
    await library.addFolder(shouted)
    expect(library.snapshot().books.map((b) => b.id)).toEqual(['albo'])
    store.flushSync()
  })
})

describe('ricollegare un albo spostato o rinominato', () => {
  it('trasferisce la cronologia sul file nuovo, unisce la scheda doppione e conserva l\'ordine personale', async () => {
    const { store, library, file } = await setup()
    const folder = join(file, '..', 'fumetti')
    await mkdir(join(folder, 'letti'), { recursive: true })
    const before = join(folder, 'Batman 1.cbz')
    const after = join(folder, 'letti', 'batman_1.cbz')
    await writeFile(before, completeZip())
    await library.addFolder(folder)
    const oldId = library.snapshot().books.find((b) => b.path === before)!.id
    library.setPageCount(oldId, 10)
    library.saveProgress(oldId, 9, true, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    library.updateBook(oldId, { customTitle: 'Batman - Anno uno #1' })
    library.setHeroOrder('dc/batman', ['albo', oldId])
    await rm(before)
    await writeFile(after, completeZip('archivio spostato'))
    await library.rescan()
    const newId = library.snapshot().books.find((b) => b.path === after)!.id
    library.setHeroOrder('dc/batman', [newId, 'albo', oldId])

    expect(library.relinkCandidates(oldId)).toEqual([{ id: newId, path: after }])
    expect(await library.relinkBook(oldId, after)).toBe(newId)

    expect(() => library.get(oldId)).toThrow()
    expect(library.summary(newId)).toMatchObject({ path: after, finished: true, currentPage: 9, pageCount: 10, customTitle: 'Batman - Anno uno #1' })
    expect(library.get(newId).folder).toBe(folder)
    expect(library.summary(newId).missingSince).toBeUndefined()
    expect(library.snapshot().books.filter((b) => b.path === after)).toHaveLength(1)
    expect(library.snapshot().heroOrder['dc/batman']).toEqual(['albo', newId])
    await library.rescan()
    expect(library.summary(newId)).toMatchObject({ finished: true })
    store.flushSync()
  })

  it('rifiuta file non supportati e albi ancora sul disco', async () => {
    const { store, library, file } = await setup()
    const image = join(file, '..', 'pagina.png')
    const comic = join(file, '..', 'altro.cbz')
    await writeFile(image, 'x')
    await writeFile(comic, 'x')
    library.beginRemoval(['C:/Fumetti/albo.cbz'])
    await expect(library.relinkBook('albo', image)).rejects.toThrow('CBZ, CBR o PDF')
    const [present] = await library.addPaths([comic])
    await expect(library.relinkBook(present!, image)).rejects.toThrow()
    const [other] = await library.addPaths([join(file, '..', 'altro.cbz')])
    await expect(library.relinkBook(other!, comic)).resolves.toBe(other)
    store.flushSync()
  })
})


describe('download in corso durante la scansione', () => {
  it('non aggiunge gli archivi incompleti modificati da poco; quelli vecchi e quelli completi sì', async () => {
    const { store, library, file } = await setup()
    const folder = join(file, '..', 'fumetti')
    await mkdir(folder)
    const downloading = join(folder, 'Lanterna Verde 01.cbr')
    const forgotten = join(folder, 'Vecchio download.cbz')
    const complete = join(folder, 'Batman 1.pdf')
    await writeFile(downloading, completeRar5('pagine').subarray(0, 20))
    await writeFile(forgotten, completeZip('pagine').subarray(0, 20))
    const hourAgo = new Date(Date.now() - 60 * 60_000)
    await utimes(forgotten, hourAgo, hourAgo)
    await writeFile(complete, completePdf())
    await library.addFolder(folder)
    expect(library.snapshot().books.map((b) => b.path).sort()).toEqual([complete, forgotten, 'C:/Fumetti/albo.cbz'].sort())

    await writeFile(downloading, completeRar5('pagine'))
    await library.rescan()
    expect(library.snapshot().books.some((b) => b.path === downloading)).toBe(true)
    store.flushSync()
  })
})
