import { access, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CollectionSpec } from '../shared/types'
import { collectionCoverKey } from './covers'
import { FreeSpace } from './freeSpace'
import { Library } from './library/library'
import { JsonStore } from './library/store'
import { collectionSourceKey, sourceCacheId, SourcePool, type PageSource } from './sources'
import { BackgroundSources, InterruptedReading } from './sources/background'

vi.mock('electron', () => ({ nativeImage: {} }))
// Copertine e metadati aprono i file con openSource: una lettura che finisce solo quando la si interrompe.
vi.mock('./sources', async (original) => ({ ...await original<typeof import('./sources')>(), openSource: async (target: { path: string }) => {
  events.push('aperta')
  let stop: () => void = () => {}
  const stopped = new Promise<Buffer>((_, reject) => (stop = () => reject(new Error('Il worker RAR si è chiuso'))))
  return {
    pages: ['01.jpg'], read: () => stopped, readHead: async () => Buffer.alloc(0), readMetadata: async () => null,
    abort: () => { events.push('interrotta'); stop() },
    close: async () => { events.push(`chiusa, file ${await exists(target.path) ? 'presente' : 'eliminato'}`) }
  }
} }))

const exists = (path: string): Promise<boolean> => access(path).then(() => true, () => false)

let dir: string, store: JsonStore, library: Library, pool: SourcePool, free: FreeSpace, events: string[]
let rar: string, pdf: string, covers: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vignetta-free-'))
  rar = join(dir, 'rar')
  pdf = join(dir, 'pdf')
  covers = join(dir, 'covers')
  store = await JsonStore.load(join(dir, 'library.json'))
  library = new Library(store)
  events = []
  // Su Windows un file aperto non si elimina: la sorgente va chiusa prima.
  pool = new SourcePool(4, async (key) => ({ close: async () => { events.push(`chiusa ${key}`) } }) as unknown as PageSource)
  free = new FreeSpace(library, pool, { caches: [rar, pdf], covers })
})
afterEach(async () => {
  store.flushSync()
  await rm(dir, { recursive: true, force: true })
})

async function comic(name: string, bytes: number): Promise<{ path: string; id: string }> {
  const path = join(dir, name)
  await writeFile(path, Buffer.alloc(bytes, 7))
  const [id] = await library.addPaths([path])
  return { path, id: id! }
}

async function touch(...parts: string[]): Promise<string> {
  const path = join(...parts)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, 'x')
  return path
}

it('elimina il file dopo averlo chiuso, conserva la scheda e pulisce solo le sue cache', async () => {
  const letto = await comic('Batman 1.cbr', 1500)
  const altro = await comic('Batman 2.cbr', 10)
  library.saveProgress(letto.id, 0, true)
  await pool.get(letto.id)
  await pool.get(altro.id)
  const caches = [await touch(rar, letto.id, 'p.jpg'), await touch(pdf, letto.id, 'firma', '1.png')]
  const kept = [await touch(rar, altro.id, 'p.jpg'), await touch(covers, `${letto.id}.jpg`)]

  expect(await free.size(letto.id)).toBe(1500)
  expect(await free.remove(letto.id)).toBe(1500)

  expect(events).toEqual([`chiusa ${letto.id}`])
  expect(await exists(letto.path)).toBe(false)
  expect(await exists(altro.path)).toBe(true)
  expect(await exists(join(rar, letto.id))).toBe(false)
  expect(await exists(join(pdf, letto.id))).toBe(false)
  for (const path of caches) expect(await exists(path)).toBe(false)
  for (const path of kept) expect(await exists(path)).toBe(true)
  expect(library.summary(letto.id)).toMatchObject({ finished: true, missingSince: expect.any(Number) })
  await expect(free.remove(letto.id)).rejects.toThrow('non è più sul disco')
})

it('prima di eliminare chiude anche le copertine e i metadati in lettura sul file', async () => {
  const background = new BackgroundSources()
  free = new FreeSpace(library, pool, { caches: [rar, pdf], covers }, background)
  const letto = await comic('Batman 3.cbr', 50)
  const cover = background.use({ path: letto.path, kind: 'rar' }, join(dir, 'temp'), (source) => source.read(0)).catch((error: unknown) => error)
  await vi.waitFor(() => expect(events).toEqual(['aperta']))

  expect(await free.remove(letto.id)).toBe(50)
  expect(await cover).toBeInstanceOf(InterruptedReading)
  expect(events).toEqual(['aperta', 'interrotta', 'chiusa, file presente'])
  expect(await exists(letto.path)).toBe(false)
})

it('un volume elimina tutti i suoi originali e le cache delle sue letture', async () => {
  const parts = [await comic('Halloween 1.cbr', 100), await comic('Halloween 2.cbz', 200)]
  const spec: CollectionSpec = {
    edition: 'dc-library', coverPart: 0, duplicates: [], excluded: [],
    parts: parts.map(({ path, id }, n) => ({ bookId: id, title: `Halloween ${n + 1}`, path, kind: 'rar', pages: ['0.png'], sizes: [[1, 1]], fingerprint: '1/2' }))
  }
  library.addCollection({ ...library.get(parts[0]!.id), id: 'volume', path: 'volume:volume', kind: 'collection', collection: spec, folder: null })
  const key = collectionSourceKey('volume', 1, spec.parts[1]!)
  await pool.get(key)
  const cache = await touch(rar, sourceCacheId(key), 'p.jpg')

  expect(await free.size('volume')).toBe(300)
  expect(await free.remove('volume')).toBe(300)

  expect(events).toEqual([`chiusa ${key}`])
  for (const { path, id } of parts) {
    expect(await exists(path)).toBe(false)
    expect(library.summary(id).missingSince).toEqual(expect.any(Number))
  }
  expect(library.summary('volume').missingSince).toEqual(expect.any(Number))
  expect(await exists(cache)).toBe(false)
})

it('dopo la scansione toglie cache e copertine orfane, ma non le copertine in grigio', async () => {
  const presente = await comic('Presente.cbr', 10)
  const sparito = await comic('Sparito.cbr', 10)
  await rm(sparito.path)
  await library.rescan()
  expect(library.summary(sparito.id).missingSince).toEqual(expect.any(Number))
  const spec: CollectionSpec = {
    edition: 'must-have', coverPart: 0, duplicates: [], excluded: [],
    parts: [{ bookId: presente.id, title: 'Presente', path: presente.path, kind: 'rar', pages: ['0.png'], sizes: [[1, 1]], fingerprint: '1/2' }]
  }
  library.addCollection({ ...library.get(presente.id), id: 'volume', path: 'volume:volume', kind: 'collection', collection: spec, folder: null })
  const volumeCache = sourceCacheId(collectionSourceKey('volume', 0, spec.parts[0]!))
  for (const id of [presente.id, sparito.id, 'rimosso', volumeCache]) await touch(rar, id, 'p.jpg')
  await touch(pdf, sparito.id, 'firma', '1.png')
  const volumeCover = collectionCoverKey(spec.parts[0]!)
  for (const id of [presente.id, sparito.id, 'rimosso', volumeCover]) await touch(covers, `${id}.jpg`)

  await free.pruneOrphans()

  expect((await readdir(rar)).sort()).toEqual([presente.id, volumeCache].sort())
  expect(await readdir(pdf)).toEqual([])
  expect((await readdir(covers)).sort()).toEqual([presente.id, sparito.id, volumeCover].map((id) => `${id}.jpg`).sort())
})

it('conta lo spazio di ogni file una volta sola e quello liberabile dai fumetti indicati', async () => {
  const letto = await comic('Letto.cbr', 1000)
  const nonLetto = await comic('Nuovo.cbr', 300)
  const sparito = await comic('Sparito.cbr', 50)
  await rm(sparito.path)
  await library.rescan()
  const spec: CollectionSpec = {
    edition: 'must-have', coverPart: 0, duplicates: [], excluded: [],
    parts: [{ bookId: letto.id, title: 'Letto', path: letto.path, kind: 'rar', pages: ['0.png'], sizes: [[1, 1]], fingerprint: '1/2' }]
  }
  library.addCollection({ ...library.get(letto.id), id: 'volume', path: 'volume:volume', kind: 'collection', collection: spec, folder: null })

  expect(await free.usage([])).toEqual({ total: 1300, reclaimable: 0 })
  expect(await free.usage(['volume', letto.id, sparito.id, 'inesistente'])).toEqual({ total: 1300, reclaimable: 1000 })
  expect(await free.usage([nonLetto.id])).toEqual({ total: 1300, reclaimable: 300 })
})

