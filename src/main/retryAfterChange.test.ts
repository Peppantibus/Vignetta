import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Library } from './library/library'
import { JsonStore } from './library/store'
import { CoverService } from './covers'
import { MetadataService } from './metadata/metadataService'
import { completeZip } from './sources/testArchives'
import { BookService } from './books'
import { fileSignature, openSource, SourcePool } from './sources'
import { OPEN_ERROR } from './sources/openError'
import { BackgroundSources } from './sources/background'

// Un download parziale fa fallire copertina e metadati: quando il file cambia si deve riprovare senza riavviare.
const fake = vi.hoisted(() => ({ fail: true, opened: 0 }))
vi.mock('electron', () => ({ nativeImage: { createFromBuffer: () => ({ isEmpty: () => true }) } }))
vi.mock('./sources', async (original) => ({ ...await original<typeof import('./sources')>(), openSource: async () => {
  fake.opened++
  if (fake.fail) throw new Error('Archivio troncato')
  return { pages: ['01.jpg', '02.jpg'], read: async () => Buffer.from('copertina'), readHead: async () => Buffer.alloc(0),
    readMetadata: async () => Buffer.from('<ComicInfo><Series>Lanterna Verde</Series><Number>1</Number></ComicInfo>'), close: async () => {} }
} }))

let dir: string, file: string, store: JsonStore, library: Library, id: string
beforeEach(async () => {
  fake.fail = true; fake.opened = 0
  dir = await mkdtemp(join(tmpdir(), 'vignetta-riprova-'))
  file = join(dir, 'Lanterna Verde 01.cbz')
  await writeFile(file, completeZip().subarray(0, 10))
  store = await JsonStore.load(join(dir, 'library.json'))
  library = new Library(store)
  ;[id] = (await library.addPaths([file])) as [string]
})
afterEach(async () => {
  vi.useRealTimers()
  store.flushSync()
  await rm(dir, { recursive: true, force: true })
})

/** Il download finisce: dimensione (e data) diverse. */
const finishDownload = (): Promise<void> => writeFile(file, completeZip('tutte le pagine'))

it('la copertina non riuscita non si ritenta a vuoto, ma si rigenera quando il file cambia', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const covers = new CoverService(join(dir, 'covers'), join(dir, 'temp'), library)
  expect(await covers.get(id)).toBeNull()
  expect(await covers.get(id)).toBeNull()
  expect(fake.opened).toBe(1)

  fake.fail = false
  await finishDownload()
  expect(await covers.get(id)).toMatchObject({ data: Buffer.from('copertina') })
  expect(fake.opened).toBe(2)
  expect(library.get(id).pageCount).toBe(2)
  warn.mockRestore()
})

it('una copertina interrotta da «Elimina dal disco» non conta come errore: se il file resta si genera', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  fake.fail = false
  await finishDownload()
  const background = new BackgroundSources()
  const covers = new CoverService(join(dir, 'covers'), join(dir, 'temp'), library, background)
  const unblock = await background.release([file])
  expect(await covers.get(id)).toBeNull()
  unblock() // eliminazione non riuscita: il file è ancora lì, con la stessa firma
  expect(await covers.get(id)).toMatchObject({ data: Buffer.from('copertina') })
  expect(warn).not.toHaveBeenCalled()
  warn.mockRestore()
})

it('un albo senza file non prova a generare la copertina, e ci riprova quando il file torna', async () => {
  fake.fail = false
  await finishDownload()
  const covers = new CoverService(join(dir, 'covers'), join(dir, 'temp'), library)
  library.beginRemoval([file]) // come durante «Elimina dal disco»
  expect(await covers.get(id)).toBeNull()
  expect(fake.opened).toBe(0)
  await library.endRemoval([file]) // eliminazione non riuscita: il file c'è ancora
  expect(await covers.get(id)).toMatchObject({ data: Buffer.from('copertina') })
})

it('un errore dei metadati non salva «nessun ComicInfo» e si riprova quando il file cambia', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
  const service = new MetadataService(library, join(dir, 'temp'))
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const runScheduled = async (): Promise<void> => {
    service.schedule()
    await vi.advanceTimersByTimeAsync(1500)
  }

  await runScheduled()
  await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1))
  expect(library.get(id).metadata).toBeUndefined()

  // Stesso file: nessun nuovo tentativo.
  await runScheduled()
  vi.useRealTimers()
  await realSleep(100)
  expect(fake.opened).toBe(1)
  expect(library.get(id).metadata).toBeUndefined()

  fake.fail = false
  await finishDownload()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  await runScheduled()
  await vi.waitFor(() => expect(library.get(id).metadata).toMatchObject({ series: 'Lanterna Verde', number: '1' }))
  expect(fake.opened).toBe(2)
  warn.mockRestore()
})

it("all'apertura spiega in italiano un download non finito, registra l'errore tecnico e con «Riprova» si apre", async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const target = () => library.sourceTarget(id)
  const pool = new SourcePool(2, () => openSource(target(), join(dir, 'rar')), () => fileSignature(target().path))
  const books = new BookService(library, pool, () => {})

  await expect(books.open(id)).rejects.toThrow(OPEN_ERROR.incomplete)
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('Apertura non riuscita'), expect.objectContaining({ message: 'Archivio troncato' }))

  fake.fail = false
  await finishDownload()
  expect((await books.open(id)).pageCount).toBe(2)
  warn.mockRestore()
})
