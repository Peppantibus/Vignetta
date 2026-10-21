import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { completeZip } from '../sources/testArchives'
import { Library } from './library'
import { JsonStore } from './store'

// Quante volte si chiede lo stato di ogni file: misura il lavoro dei controlli di presenza.
const stats = vi.hoisted(() => new Map<string, number>())
vi.mock('node:fs/promises', async (original) => {
  const real = await original<typeof import('node:fs/promises')>()
  return { ...real, stat: ((path: string, ...rest: unknown[]) => {
    stats.set(String(path), (stats.get(String(path)) ?? 0) + 1)
    return (real.stat as (...args: unknown[]) => unknown)(path, ...rest)
  }) as typeof real.stat }
})

let dir: string, store: JsonStore, library: Library
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vignetta-presenza-'))
  store = await JsonStore.load(join(dir, 'library.json'))
  library = new Library(store)
})
afterEach(async () => {
  store.flushSync()
  await rm(dir, { recursive: true, force: true })
})

it('controlli chiesti insieme (es. venti file importati) diventano al massimo due giri', async () => {
  const folder = join(dir, 'fumetti')
  await mkdir(folder)
  const comics = ['Batman 1.cbz', 'Batman 2.cbz', 'Batman 3.cbz'].map((name) => join(folder, name))
  for (const comic of comics) await writeFile(comic, completeZip(comic))
  await library.addFolder(folder)
  expect(library.snapshot().books).toHaveLength(3)

  await rm(comics[2]!)
  stats.clear()
  await Promise.all(Array.from({ length: 10 }, () => library.checkPresence()))
  for (const comic of comics) expect(stats.get(comic)).toBeLessThanOrEqual(2) // prima: 10 volte ciascuno
  const missing = library.snapshot().books.filter((book) => book.missingSince).map((book) => book.path)
  expect(missing).toEqual([comics[2]])
})
