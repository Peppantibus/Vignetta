import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyLibraryUpdate } from '../../shared/libraryUpdate'
import type { CollectionSpec } from '../../shared/types'
import { LibraryFeed } from './feed'
import { Library } from './library'
import { JsonStore, type BookRecord } from './store'

let dir: string, store: JsonStore, library: Library, feed: LibraryFeed

const record = (n: number): BookRecord => ({
  id: `albo${n}`, title: `Batman ${n}`, path: `C:/Fumetti/Batman ${n}.cbz`, kind: 'zip', folder: 'C:/Fumetti',
  pageCount: 24, currentPage: 0, lastReadAt: null, readPages: [], finished: false, addedAt: n, direction: null, shiftPairs: false,
  metadata: { series: 'Batman', number: String(n), writer: 'Scrittore di prova', summary: 'Trama di prova '.repeat(10) }
})

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vignetta-feed-'))
  store = await JsonStore.load(join(dir, 'library.json'))
  store.update((d) => {
    d.folders = ['C:/Fumetti']
    for (let n = 1; n <= 66; n++) d.books[`albo${n}`] = record(n)
  })
  library = new Library(store)
  feed = new LibraryFeed(() => library.snapshot())
})
afterEach(async () => {
  store.flushSync()
  await rm(dir, { recursive: true, force: true })
})

describe("aggiornamenti della libreria verso l'interfaccia", () => {
  it('a ogni pagina girata parte solo l\'albo letto, non tutta la libreria', () => {
    const full = feed.full()
    library.saveProgress('albo7', 3, false, [3])
    const update = feed.changes()!
    expect(update.books.map((book) => book.id)).toEqual(['albo7'])
    expect(update).toEqual({ books: [expect.objectContaining({ currentPage: 3 })], removed: [] })
    expect(JSON.stringify(update).length * 20).toBeLessThan(JSON.stringify(full).length)
    expect(feed.changes()).toBeNull() // nient'altro da mandare
  })

  it('unite alla libreria nota danno la libreria attuale, con gli albi non cambiati come prima', async () => {
    let known = feed.full()
    const untouched = known.books.find((book) => book.id === 'albo2')!

    library.removeBook('albo1')
    store.update((d) => { d.books.nuovo = { ...record(99), id: 'nuovo' } })
    library.updateBook('albo3', { customTitle: 'Batman - Anno uno' })
    library.updateSettings({ nightMode: true })
    library.setHeroOrder('dc/batman', ['albo3', 'albo2'])
    const update = feed.changes()!
    expect(update.removed).toEqual(['albo1'])
    expect(update.books.map((book) => book.id).sort()).toEqual(['albo3', 'nuovo'])
    expect(update.folders).toBeUndefined()

    known = applyLibraryUpdate(known, update)
    expect(known).toEqual(library.snapshot())
    expect(known.books.find((book) => book.id === 'albo2')).toBe(untouched)
    expect(known.books.at(-1)!.id).toBe('nuovo')

    await library.addFolder(join(dir, 'altra cartella'))
    known = applyLibraryUpdate(known, feed.changes()!)
    expect(known).toEqual(library.snapshot())
  })

  it('la libreria intera richiesta dall\'interfaccia fa da nuovo punto di partenza', () => {
    feed.full()
    library.saveProgress('albo5', 2, false, [2])
    const known = feed.full() // es. l'interfaccia ricaricata: contiene già la modifica
    expect(feed.changes()).toBeNull()
    library.removeBook('albo5')
    expect(applyLibraryUpdate(known, feed.changes()!)).toEqual(library.snapshot())
  })

  it("dei volumi l'interfaccia riceve solo il numero di pagine degli originali", () => {
    const spec: CollectionSpec = { edition: 'dc-library', coverPart: 0, duplicates: [], excluded: [],
      parts: [1, 2].map((n) => ({ bookId: `albo${n}`, title: `Batman ${n}`, path: `C:/Fumetti/Batman ${n}.cbz`, kind: 'zip', pages: Array.from({ length: 24 }, (_, i) => `${i}.jpg`), sizes: Array.from({ length: 24 }, () => [1988, 3056] as const), fingerprint: '1/2' })) }
    library.addCollection({ ...record(0), id: 'volume', path: 'volume:volume', kind: 'collection', collection: spec, folder: null })
    expect(library.summary('volume').collection!.parts[0]).toEqual({ bookId: 'albo1', title: 'Batman 1', path: 'C:/Fumetti/Batman 1.cbz', kind: 'zip', fingerprint: '1/2', pageCount: 24 })
    expect(library.get('volume').collection!.parts[0]!.pages).toHaveLength(24) // il manifesto salvato resta completo
  })
})
