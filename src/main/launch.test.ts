import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bookId, Library } from './library/library'
import { JsonStore } from './library/store'
import { comicPathsFromArgs, LaunchRequests } from './launch'

describe('fumetti dalla riga di comando', () => {
  it('tiene solo i formati supportati e ignora eseguibile e opzioni', () => {
    const argv = ['C:\\App\\Vignetta.exe', '--allow-file-access-from-files', '--original-process-start-time=1', 'D:\\Fumetti\\Batman 01.cbz', 'note.txt', '.', 'D:\\Fumetti\\Killing Joke.PDF']
    expect(comicPathsFromArgs(argv, 'C:\\')).toEqual(['D:\\Fumetti\\Batman 01.cbz', 'D:\\Fumetti\\Killing Joke.PDF'])
  })

  it('risolve i percorsi relativi rispetto alla cartella di lancio', () => {
    expect(comicPathsFromArgs(['Vignetta.exe', 'Manga\\One Piece 01.cbr'], 'D:\\Fumetti')).toEqual(['D:\\Fumetti\\Manga\\One Piece 01.cbr'])
  })
})

describe('richieste di apertura', () => {
  let dir: string, store: JsonStore, library: Library
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vignetta-launch-'))
    store = await JsonStore.load(join(dir, 'library.json'))
    library = new Library(store)
  })
  afterEach(async () => { store.flushSync(); await rm(dir, { recursive: true, force: true }) })

  it('aggiunge il fumetto, avvisa l\'interfaccia e consegna la richiesta una volta sola', async () => {
    const file = join(dir, 'Batman 01.cbz')
    await writeFile(file, 'PK')
    let notified = 0
    const launch = new LaunchRequests(library, () => notified++)

    await launch.open(['Vignetta.exe', file], dir)
    expect(notified).toBe(1)
    expect(library.snapshot().books.map((b) => b.id)).toEqual([bookId(file)])
    expect(launch.take()).toBe(bookId(file))
    expect(launch.take()).toBeNull()
  })

  it('riapre un fumetto già in libreria senza toccarne i progressi', async () => {
    const file = join(dir, 'Batman 01.cbz')
    await writeFile(file, 'PK')
    await library.addPaths([file])
    library.saveProgress(bookId(file), 12, false)
    const launch = new LaunchRequests(library, () => {})

    await launch.open(['Vignetta.exe', file], dir)
    expect(launch.take()).toBe(bookId(file))
    expect(library.summary(bookId(file)).currentPage).toBe(12)
  })

  it('ignora file inesistenti o non supportati', async () => {
    let notified = 0
    const launch = new LaunchRequests(library, () => notified++)
    await launch.open(['Vignetta.exe', join(dir, 'sparito.cbz'), join(dir, 'foto.jpg')], dir)
    expect(notified).toBe(0)
    expect(launch.take()).toBeNull()
    expect(library.snapshot().books).toEqual([])
  })
})
