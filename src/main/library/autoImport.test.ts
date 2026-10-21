import { EventEmitter } from 'node:events'
import { appendFile, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Library } from './library'
import { JsonStore } from './store'
import { AutoImport } from './autoImport'
import { INCOMPLETE_LIMIT_MS } from './scanner'
import { completePdf, completeRar4, completeRar5, completeZip } from '../sources/testArchives'

const native = vi.hoisted(() => ({ callbacks: new Map<string, (event: string, name: string) => void>(), watchers: new Map<string, EventEmitter>(), closed: 0, unreachable: false }))
vi.mock('node:fs', async (original) => ({ ...await original<typeof import('node:fs')>(), watch: (path: string, _options: unknown, callback: (event: string, name: string) => void) => {
  if (native.unreachable) throw new Error('ENOENT')
  native.callbacks.set(path, callback)
  const watcher = Object.assign(new EventEmitter(), { close: () => { native.closed++; native.callbacks.delete(path) } })
  native.watchers.set(path, watcher)
  return watcher
} }))

// Quante volte si controlla se un archivio è completo, per file: misura il lavoro fatto a ogni giro.
const checked = vi.hoisted(() => new Map<string, number>())
vi.mock('../sources/archiveComplete', async (original) => {
  const real = await original<typeof import('../sources/archiveComplete')>()
  return { ...real, isArchiveComplete: (path: string) => { checked.set(path, (checked.get(path) ?? 0) + 1); return real.isArchiveComplete(path) } }
})

let dir: string, folder: string, library: Library, store: JsonStore, importer: AutoImport
beforeEach(async () => {
  native.callbacks.clear(); native.watchers.clear(); native.closed = 0; native.unreachable = false
  dir = await mkdtemp(join(tmpdir(), 'vignetta-auto-'))
  folder = join(dir, 'fumetti'); await mkdir(folder)
  store = await JsonStore.load(join(dir, 'library.json')); library = new Library(store)
  await library.addFolder(folder)
  importer = new AutoImport(library, 25)
  importer.syncFolders()
})
afterEach(async () => { importer.close(); store.flushSync(); await rm(dir, { recursive: true, force: true }) })
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

it('importa dopo le notifiche, aspetta che il download smetta di crescere e poi rimane inattivo', async () => {
  importer.close()
  importer = new AutoImport(library, 200)
  importer.syncFolders()
  await wait(70)
  const file = join(folder, 'Batman 01.cbz')
  await writeFile(file, 'PK inizio')
  native.callbacks.get(folder)!('rename', 'Batman 01.cbz')
  for (let i = 0; i < 4; i++) {
    await wait(15); await appendFile(file, 'pezzo')
    native.callbacks.get(folder)!('change', 'Batman 01.cbz')
    expect(library.snapshot().books).toHaveLength(0)
  }
  await appendFile(file, completeZip()) // ultimo pezzo: la fine della directory centrale
  native.callbacks.get(folder)!('change', 'Batman 01.cbz')
  await vi.waitFor(() => expect(library.snapshot().books).toHaveLength(1))
  const id = library.snapshot().books[0]!.id
  library.updateBook(id, { customTitle: 'Titolo personale', currentPage: 12 })
  let updates = 0
  const off = store.onChange(() => { updates++ })
  await wait(100)
  expect(updates).toBe(0)
  native.callbacks.get(folder)!('change', 'Batman 01.cbz')
  await wait(80)
  expect(updates).toBe(0)
  expect(library.summary(id)).toMatchObject({ customTitle: 'Titolo personale', currentPage: 12 })
  off()
})

it('ignora i file temporanei e importa PDF/CBR/CBZ finali anche nelle sottocartelle', async () => {
  const nested = join(folder, 'nuovi'); await mkdir(nested)
  const partial = join(nested, 'Batman 01.pdf.part')
  await writeFile(partial, completePdf())
  native.callbacks.get(folder)!('rename', 'nuovi/Batman 01.pdf.part')
  await wait(90); expect(library.snapshot().books).toHaveLength(0)
  await rename(partial, join(nested, 'Batman 01.pdf'))
  await writeFile(join(nested, 'Batman 02.cbr'), completeRar4())
  await writeFile(join(nested, 'Batman 03.cbz'), completeZip())
  native.callbacks.get(folder)!('rename', 'nuovi')
  await vi.waitFor(() => expect(library.snapshot().books).toHaveLength(3))
  expect(library.snapshot().books.map((b) => b.kind).sort()).toEqual(['pdf', 'rar', 'zip'])
})

it('rispetta le esclusioni manuali e non cancella progressi se una sorgente sparisce', async () => {
  const file = join(folder, 'Batman.cbz'); await writeFile(file, completeZip())
  native.callbacks.get(folder)!('rename', 'Batman.cbz')
  await vi.waitFor(() => expect(library.snapshot().books).toHaveLength(1))
  const id = library.snapshot().books[0]!.id
  library.removeBook(id)
  native.callbacks.get(folder)!('rename', 'Batman.cbz')
  await wait(100); expect(library.snapshot().books).toHaveLength(0)
  const [added] = await library.addPaths([file])
  library.saveProgress(added!, 20, false, [20])
  await rm(file)
  native.callbacks.get(folder)!('rename', 'Batman.cbz')
  await wait(90)
  expect(library.summary(added!)).toMatchObject({ currentPage: 20 })
})

it('gli albi rimossi a mano non si ricontrollano a ogni giro', async () => {
  const removed = join(folder, 'Rimosso.cbz'); await writeFile(removed, completeZip())
  native.callbacks.get(folder)!('rename', 'Rimosso.cbz')
  await vi.waitFor(() => expect(library.snapshot().books).toHaveLength(1))
  library.removeBook(library.snapshot().books[0]!.id)
  checked.clear()
  const fresh = join(folder, 'Nuovo.cbz'); await writeFile(fresh, completeZip('nuovo'))
  native.callbacks.get(folder)!('rename', 'Nuovo.cbz')
  await vi.waitFor(() => expect(library.snapshot().books.map((b) => b.path)).toEqual([fresh]))
  expect(checked.get(removed)).toBeUndefined() // prima: controllato a ogni notifica della cartella
  expect(checked.get(fresh)).toBe(1)
})

it('smette di osservare le cartelle rimosse e chiude le sottoscrizioni con l’app', async () => {
  await writeFile(join(folder, 'Batman.cbz'), completeZip())
  native.callbacks.get(folder)!('rename', 'Batman.cbz')
  library.removeFolder(folder); importer.syncFolders()
  await wait(90)
  expect(library.snapshot().books).toHaveLength(0)
  expect(native.closed).toBe(1)
  expect(native.callbacks.has(folder)).toBe(false)
  await library.addFolder(folder); importer.syncFolders()
  importer.close()
  expect(native.closed).toBe(2)
})

it('recupera i cambiamenti con il ritorno nell’app anche senza una notifica, ma non più spesso del necessario', async () => {
  importer.close()
  importer = new AutoImport(library, 25, INCOMPLETE_LIMIT_MS, 300)
  importer.syncFolders()
  await wait(70)
  await writeFile(join(folder, 'Batman.cbz'), completeZip())
  importer.refresh() // appena avviata: le cartelle sono state appena controllate
  await wait(150)
  expect(library.snapshot().books).toHaveLength(0)
  await wait(200)
  importer.refresh()
  await vi.waitFor(() => expect(library.snapshot().books).toHaveLength(1))
})

it('una cartella che torna raggiungibile si controlla subito al ritorno nell’app', async () => {
  importer.close()
  importer = new AutoImport(library, 25, INCOMPLETE_LIMIT_MS, 60_000)
  native.unreachable = true // disco scollegato all'avvio
  importer.syncFolders()
  await wait(70)
  importer.refresh()
  await writeFile(join(folder, 'Batman.cbz'), completeZip())
  native.unreachable = false // ricollegato
  importer.refresh()
  await vi.waitFor(() => expect(library.snapshot().books).toHaveLength(1))
  // Un watcher che si interrompe viene ricreato, e la cartella ricontrollata, al ritorno successivo.
  native.watchers.get(folder)!.emit('error', new Error('disco staccato'))
  await writeFile(join(folder, 'Robin.cbz'), completeZip('altro'))
  importer.refresh()
  await vi.waitFor(() => expect(library.snapshot().books).toHaveLength(2))
})

it('non importa un download in pausa finché l’archivio non è completo', async () => {
  const archive = completeRar5('tutte le pagine del fumetto')
  const file = join(folder, 'Lanterna Verde 01.cbr')
  await writeFile(file, archive.subarray(0, 30))
  native.callbacks.get(folder)!('rename', 'Lanterna Verde 01.cbr')
  // La pausa dura molte rilevazioni stabili: prima bastavano due per importarlo.
  await wait(400)
  expect(library.snapshot().books).toHaveLength(0)
  await appendFile(file, archive.subarray(30))
  native.callbacks.get(folder)!('change', 'Lanterna Verde 01.cbr')
  await vi.waitFor(() => expect(library.snapshot().books).toHaveLength(1))
  expect(library.snapshot().books[0]).toMatchObject({ path: file, kind: 'rar' })
})

it('importa comunque un archivio senza chiusura rimasto fermo oltre il limite', async () => {
  importer.close()
  importer = new AutoImport(library, 25, 300)
  importer.syncFolders()
  await wait(70)
  const started = Date.now()
  await writeFile(join(folder, 'Senza blocco finale.cbz'), completeZip('pagine').subarray(0, 25))
  native.callbacks.get(folder)!('rename', 'Senza blocco finale.cbz')
  await wait(150)
  expect(library.snapshot().books).toHaveLength(0)
  await vi.waitFor(() => expect(library.snapshot().books).toHaveLength(1), { timeout: 2000 })
  expect(Date.now() - started).toBeGreaterThanOrEqual(300)
})
