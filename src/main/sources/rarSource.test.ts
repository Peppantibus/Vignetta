import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cacheFileName, type RarJob } from './rarJob'
import { RarSource } from './rarSource'

// Worker RAR finto: elenca `fake.names` ed «estrae» scrivendo il nome della pagina nel file di cache.
// Con `fake.stuckAfter` l'estrazione si ferma dopo quel numero di pagine (archivio grande ancora in lavorazione).
const fake = vi.hoisted(() => ({ names: [] as string[], jobs: [] as string[], stuckAfter: Infinity, terminated: 0 }))
vi.mock('./rarWorker?nodeWorker', () => ({
  default: ({ workerData: job }: { workerData: RarJob }) => {
    fake.jobs.push(job.kind)
    let alive = true
    const worker = Object.assign(new EventEmitter(), {
      terminate: async () => {
        if (alive) {
          alive = false
          fake.terminated++
          worker.emit('exit', 1)
        }
        return 1
      }
    })
    setImmediate(async () => {
      if (job.kind === 'list') {
        worker.emit('message', { type: 'list', names: fake.names })
      } else {
        for (const [index, name] of job.files.entries()) {
          if (index >= fake.stuckAfter) return // resta al lavoro finché non viene fermato
          await writeFile(join(job.targetDir, cacheFileName(name)), name)
          if (!alive) return
          worker.emit('message', { type: 'file', name })
        }
      }
      if (alive) worker.emit('message', { type: 'done' })
    })
    return worker
  }
}))

let dir: string, archive: string, cache: string
beforeEach(async () => {
  fake.jobs = []
  fake.stuckAfter = Infinity
  fake.terminated = 0
  dir = await mkdtemp(join(tmpdir(), 'vignetta-rar-'))
  archive = join(dir, 'Lanterna Verde 01.cbr')
  cache = join(dir, 'cache')
})
afterEach(() => rm(dir, { recursive: true, force: true }))

/** Apre l'archivio, estrae tutte le pagine (come fa il lettore) e chiude. */
async function readAll(): Promise<readonly string[]> {
  const source = await RarSource.open(archive, cache)
  source.prefetchAll()
  await source.close()
  return source.pages
}

it("l'elenco delle pagine in cache vale solo per la stessa versione dell'archivio", async () => {
  // Download parziale: l'elenco contiene solo le prime pagine.
  fake.names = ['01.jpg', '02.jpg']
  await writeFile(archive, 'parziale')
  expect(await readAll()).toEqual(['01.jpg', '02.jpg'])
  expect(JSON.parse(await readFile(join(cache, 'pages.json'), 'utf8'))).toMatchObject({ pages: ['01.jpg', '02.jpg'] })

  // Stesso file: la cache basta, nessun nuovo elenco.
  fake.jobs = []
  expect(await readAll()).toEqual(['01.jpg', '02.jpg'])
  expect(fake.jobs).toEqual([])

  // Download finito: l'archivio cambia e l'elenco vecchio non vale più.
  fake.names = ['01.jpg', '02.jpg', '03.jpg', 'ComicInfo.xml']
  await writeFile(archive, 'archivio completo')
  const source = await RarSource.open(archive, cache)
  expect(source.pages).toEqual(['01.jpg', '02.jpg', '03.jpg'])
  expect(fake.jobs[0]).toBe('list')
  expect((await source.read(2)).toString()).toBe('03.jpg')
  expect((await source.readMetadata())?.toString()).toBe('ComicInfo.xml')
  await source.close()
})

it('ignora il vecchio formato della cache, senza firma', async () => {
  fake.names = ['01.jpg', '02.jpg', '03.jpg']
  await writeFile(archive, 'archivio')
  await readAll()
  await writeFile(join(cache, 'pages.json'), JSON.stringify(['01.jpg']))
  fake.jobs = []
  expect(await readAll()).toEqual(['01.jpg', '02.jpg', '03.jpg'])
  expect(fake.jobs[0]).toBe('list')
})

it("abort ferma l'estrazione in corso invece di aspettarne la fine", async () => {
  fake.names = ['01.jpg', '02.jpg', '03.jpg', '04.jpg']
  fake.stuckAfter = 2
  await writeFile(archive, 'archivio grande')
  const source = await RarSource.open(archive, cache)
  source.prefetchAll()
  expect((await source.read(0)).toString()).toBe('01.jpg')

  fake.terminated = 0
  source.abort()
  await source.close() // prima di abort la chiusura aspettava la fine dell'estrazione (qui: per sempre)
  expect(fake.terminated).toBe(1)
  await expect(source.read(3)).rejects.toThrow('interrotta')
  // Estrazione interrotta: nessun elenco completo in cache, la prossima apertura la riprende.
  await expect(readFile(join(cache, 'pages.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })

  fake.stuckAfter = Infinity
  const reopened = await RarSource.open(archive, cache)
  expect((await reopened.read(3)).toString()).toBe('04.jpg')
  await reopened.close()
})

it('anche aperto dalla cache trova il ComicInfo.xml, senza rileggere l’elenco', async () => {
  fake.names = ['01.jpg', '02.jpg', 'ComicInfo.xml']
  await writeFile(archive, 'archivio con metadati')
  await readAll()
  expect(JSON.parse(await readFile(join(cache, 'pages.json'), 'utf8'))).toMatchObject({ metadata: 'ComicInfo.xml' })
  fake.jobs = []
  const cached = await RarSource.open(archive, cache)
  expect((await cached.readMetadata())?.toString()).toBe('ComicInfo.xml') // prima: null
  expect(fake.jobs).toEqual(['extract'])
  await cached.close()

  // Cache scritta prima che si salvasse il nome: lo si cerca nell'elenco alla prima richiesta.
  const marker = JSON.parse(await readFile(join(cache, 'pages.json'), 'utf8'))
  delete marker.metadata
  await writeFile(join(cache, 'pages.json'), JSON.stringify(marker))
  fake.jobs = []
  const old = await RarSource.open(archive, cache)
  expect(fake.jobs).toEqual([])
  expect((await old.readMetadata())?.toString()).toBe('ComicInfo.xml')
  expect(fake.jobs).toEqual(['list', 'extract'])
  await old.close()

  // Senza ComicInfo.xml la cache lo ricorda: nessun elenco da rileggere.
  fake.names = ['01.jpg']
  await writeFile(archive, 'archivio senza metadati')
  await readAll()
  fake.jobs = []
  const plain = await RarSource.open(archive, cache)
  expect(await plain.readMetadata()).toBeNull()
  expect(fake.jobs).toEqual([])
  await plain.close()
})
