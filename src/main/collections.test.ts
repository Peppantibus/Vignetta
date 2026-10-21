import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Library } from './library/library'
import { JsonStore } from './library/store'
import { CollectionService } from './collections'
import { SourcePool, type PageSource } from './sources'

const fake = vi.hoisted(() => ({ count: 8, fail: false, closed: 0 }))
vi.mock('electron', () => ({ nativeImage: { createFromBuffer: (bytes: Buffer) => ({ isEmpty: () => false, getSize: () => ({ width: 2, height: 2 }), toBitmap: () => bytes }) } }))
vi.mock('./sources', async (original) => ({ ...await original<typeof import('./sources')>(), openSource: async () => {
  if (fake.fail) throw new Error('Archivio danneggiato')
  return { pages: Array.from({ length: fake.count }, (_, n) => `${n}.png`), pageSizes: Array.from({ length: fake.count }, () => [2, 2]),
    read: async (n: number) => Buffer.from([n, 1, 2, 255, 3, 4, 5, 255, 6, 7, 8, 255, 9, 10, 11, 255]),
    readHead: async () => Buffer.alloc(0), close: async () => { fake.closed++ } }
} }))

let dir: string, store: JsonStore, library: Library, service: CollectionService, ids: string[]
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vignetta-volumi-'))
  store = await JsonStore.load(join(dir, 'library.json'))
  library = new Library(store)
  fake.count = 8; fake.fail = false; fake.closed = 0
  const paths = [join(dir, 'Batman Prova 00.cbz'), join(dir, 'Batman Prova 01.cbz')]
  for (const path of paths) await writeFile(path, 'archivio segnaposto')
  ids = await library.addPaths(paths)
  service = new CollectionService(library, new SourcePool(2, async () => ({ close: async () => {} }) as PageSource), join(dir, 'cache'), () => {})
})
afterEach(async () => { store.flushSync(); await rm(dir, { recursive: true, force: true }) })
const input = () => ({ jobId: 'analisi', title: 'Batman Prova', bookIds: ids, coverPart: 0, hideDuplicates: true })

describe('creazione e integrità dei volumi', () => {
  it('crea il manifesto senza modificare file o progressi degli originali', async () => {
    const before = structuredClone(ids.map((id) => library.get(id)))
    const volume = await service.create(input())
    expect(volume.collection?.parts.map((p) => p.bookId)).toEqual(ids)
    expect(volume.collection?.duplicates).toHaveLength(6)
    expect(volume.pageCount).toBe(10)
    expect(ids.map((id) => library.get(id))).toEqual(before)
    for (const book of before) expect(await readFile(book.path, 'utf8')).toBe('archivio segnaposto')
    expect(fake.closed).toBe(2)
    expect(await readdir(join(dir, 'cache', 'analisi')).catch(() => [])).toEqual([])
    expect(() => service.update(volume.id, [{ part: 1, page: 3 }], 0)).toThrow('solo i doppioni')
    expect(library.summary(volume.id).pageCount).toBe(10)
    service.update(volume.id, [], 1)
    expect(library.summary(volume.id)).toMatchObject({ pageCount: 16, contentVersion: 2, collection: { excluded: [], coverPart: 1 } })
  })
  it('mantiene tutte le pagine quando la deduplicazione è disattivata', async () => {
    const volume = await service.create({ ...input(), hideDuplicates: false })
    expect(volume.pageCount).toBe(16)
    expect(volume.collection?.duplicates).toHaveLength(6)
    expect(volume.collection?.excluded).toEqual([])
  })
  it('annullando non salva volumi parziali e chiude la sorgente', async () => {
    service = new CollectionService(library, new SourcePool(1, async () => ({} as PageSource)), join(dir, 'cache'), (event) => service.cancel(event.jobId))
    await expect(service.create(input())).rejects.toThrow('annullata')
    expect(library.snapshot().books).toHaveLength(2)
    expect(fake.closed).toBe(1)
  })
  it('rifiuta albi ripetuti, serie incompatibili e archivi illeggibili senza salvare', async () => {
    await expect(service.create({ ...input(), bookIds: [ids[0]!, ids[0]!] })).rejects.toThrow('distinti')
    library.updateBook(ids[1]!, { customTitle: 'Superman Altro 1' })
    await expect(service.create(input())).rejects.toThrow('stessa serie')
    library.updateBook(ids[1]!, { customTitle: null })
    fake.fail = true
    await expect(service.create(input())).rejects.toThrow('danneggiato')
    expect(library.snapshot().books).toHaveLength(2)
  })
  it('segnala sorgenti modificate o mancanti; ricollega senza perdere progressi ed esclusioni', async () => {
    const volume = await service.create(input())
    library.saveProgress(volume.id, 8, false, [0, 8])
    const part = volume.collection!.parts[1]!
    await writeFile(part.path, 'archivio cambiato e più lungo')
    await expect(service.source(volume.id)).rejects.toThrow('è cambiato')
    await rm(part.path)
    await expect(service.source(volume.id)).rejects.toThrow('non disponibile')
    const replacement = join(dir, 'copia.cbz')
    await writeFile(replacement, 'archivio segnaposto')
    await service.relink(volume.id, 1, replacement)
    expect(library.summary(volume.id)).toMatchObject({ currentPage: 8, contentVersion: 2, collection: { excluded: volume.collection!.excluded } })
    expect(library.get(volume.id).readPages).toEqual([0, 8])
    const source = await service.source(volume.id)
    expect(source.pages).toHaveLength(10)
    const before = structuredClone(library.get(volume.id))
    fake.count = 9
    await expect(service.relink(volume.id, 1, replacement)).rejects.toThrow('numero diverso')
    expect(library.get(volume.id)).toEqual(before)
  })
})
