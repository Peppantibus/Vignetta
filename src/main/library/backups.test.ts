import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DailyBackup, describeBackupError, localDay } from './backups'

let root: string, file: string, dir: string, day: string
const backup = (keep = 7): DailyBackup => new DailyBackup(file, dir, { keep, label: 'Copia di prova', today: () => day })
const saved = (d: string): Promise<string> => readFile(join(dir, `library-${d}.json`), 'utf8')

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'vignetta-backup-'))
  file = join(root, 'library.json')
  dir = join(root, 'backups')
  day = '2026-10-16'
})
afterEach(() => rm(root, { recursive: true, force: true }))

describe('copie giornaliere della libreria', () => {
  it('copia lo stato salvato una volta al giorno, anche con l\'app lasciata aperta', async () => {
    await writeFile(file, '{"books":{"a":1}}')
    const job = backup()
    await job.run()
    expect(await saved('2026-10-16')).toBe('{"books":{"a":1}}')

    // Stesso giorno: le modifiche successive non sovrascrivono la copia del mattino.
    await writeFile(file, '{"books":{"a":2}}')
    await job.run()
    expect(await saved('2026-10-16')).toBe('{"books":{"a":1}}')

    // Giorno nuovo senza riavvio: la prima modifica fa la copia del giorno.
    day = '2026-10-17'
    await job.run()
    expect(await saved('2026-10-17')).toBe('{"books":{"a":2}}')
  })

  it('dopo un riavvio nello stesso giorno conserva la prima copia', async () => {
    await writeFile(file, '{"v":1}')
    await backup().run()
    await writeFile(file, '{"v":2}')
    await backup().run()
    expect(await saved('2026-10-16')).toBe('{"v":1}')
  })

  it('conserva solo le copie più recenti e non tocca altri file', async () => {
    await mkdir(dir)
    for (let d = 1; d <= 9; d++) await writeFile(join(dir, `library-2026-10-0${d}.json`), '{}')
    await writeFile(join(dir, 'nota.txt'), 'mia')
    await writeFile(file, '{}')
    day = '2026-10-10'
    await backup(3).run()
    expect((await readdir(dir)).sort()).toEqual(['library-2026-10-08.json', 'library-2026-10-09.json', 'library-2026-10-10.json', 'nota.txt'])
  })

  it('non copia una libreria illeggibile o assente', async () => {
    await backup().run()
    await writeFile(file, '{"books": tronc')
    day = '2026-10-17'
    await backup().run()
    expect(await readdir(dir).catch(() => [])).toEqual([])
  })

  it('usa il giorno locale', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('copia di sicurezza esterna', () => {
  let external: string, clock: number
  const copies = async (): Promise<string[]> => (await readdir(external)).sort()
  const outside = (folder: string | null = external): DailyBackup =>
    new DailyBackup(file, folder, { keep: 30, label: 'Copia esterna di prova', today: () => day, now: () => clock })

  beforeEach(() => {
    external = join(root, 'Drive', 'Vignetta')
    clock = 1_000_000
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('fa la prima copia del giorno, non la sovrascrive al riavvio e la aggiorna alla chiusura', async () => {
    await writeFile(file, '{"v":1}')
    await outside().run()
    expect(await readFile(join(external, 'library-2026-10-16.json'), 'utf8')).toBe('{"v":1}')

    // Riavvio nello stesso giorno: la copia resta quella di prima.
    await writeFile(file, '{"v":2}')
    const restarted = outside()
    await restarted.run()
    expect(await readFile(join(external, 'library-2026-10-16.json'), 'utf8')).toBe('{"v":1}')

    // Chiusura: la copia del giorno prende lo stato più recente, senza lasciare file temporanei.
    await writeFile(file, '{"v":3}')
    await restarted.refresh()
    expect(await readFile(join(external, 'library-2026-10-16.json'), 'utf8')).toBe('{"v":3}')
    expect(await copies()).toEqual(['library-2026-10-16.json'])
  })

  it('conserva le 30 copie più recenti senza toccare gli altri file della cartella', async () => {
    await mkdir(external, { recursive: true })
    for (let d = 1; d <= 31; d++) await writeFile(join(external, `library-2026-09-${String(d).padStart(2, '0')}.json`), '{}')
    for (const other of ['desktop.ini', 'library.json', 'library-copia.json', 'note.txt']) await writeFile(join(external, other), 'non mio')
    await writeFile(file, '{}')
    await outside().run()

    const names = await copies()
    const dated = names.filter((name) => /^library-\d{4}-\d{2}-\d{2}\.json$/.test(name))
    expect(dated).toHaveLength(30)
    expect(dated[0]).toBe('library-2026-09-03.json')
    expect(dated.at(-1)).toBe('library-2026-10-16.json')
    expect(names).toEqual(expect.arrayContaining(['desktop.ini', 'library.json', 'library-copia.json', 'note.txt']))
    expect(await readFile(join(external, 'desktop.ini'), 'utf8')).toBe('non mio')
  })

  it("con la cartella irraggiungibile non blocca nulla, registra l'errore e riprova solo a una modifica successiva", async () => {
    await writeFile(file, '{"v":1}')
    // Un file al posto della cartella: mkdir fallisce come con un disco scollegato.
    await mkdir(join(root, 'Drive'))
    await writeFile(external, 'non sono una cartella')
    const job = outside()
    await job.run()
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(await readFile(file, 'utf8')).toBe('{"v":1}') // la libreria resta com'è
    const failed = await job.status()
    expect(failed).toMatchObject({ folder: external, lastCopyAt: null })
    expect(failed.error).toBe(describeBackupError(Object.assign(new Error(), { code: 'EEXIST' })))

    // Nessun ciclo: una modifica subito dopo non ritenta, una dopo un minuto sì.
    await job.run()
    expect(console.warn).toHaveBeenCalledTimes(1)
    await rm(external)
    clock += 61_000
    await job.run()
    expect(await readFile(join(external, 'library-2026-10-16.json'), 'utf8')).toBe('{"v":1}')
    expect(await job.status()).toEqual({ folder: external, lastCopyAt: clock, error: null })
  })

  it('cambiando cartella fa subito la prima copia; togliendola smette senza cancellare le copie', async () => {
    await writeFile(file, '{"v":1}')
    const job = outside(null)
    await job.run()
    expect(await job.status()).toEqual({ folder: null, lastCopyAt: null, error: null })

    await job.setFolder(external)
    expect(await copies()).toEqual(['library-2026-10-16.json'])

    const second = join(root, 'Altro disco')
    await job.setFolder(second)
    expect(await readdir(second)).toEqual(['library-2026-10-16.json'])

    await job.setFolder(null)
    await writeFile(file, '{"v":2}')
    day = '2026-10-17'
    await job.run()
    await job.refresh()
    expect(await readdir(second)).toEqual(['library-2026-10-16.json'])
    expect(await copies()).toEqual(['library-2026-10-16.json'])
  })

  it("dopo un riavvio ricava la data dell'ultima copia dalla cartella", async () => {
    await writeFile(file, '{}')
    await outside().run()
    const written = (await stat(join(external, 'library-2026-10-16.json'))).mtimeMs
    expect((await outside().status()).lastCopyAt).toBe(written)
  })

  it('se la cartella sparisce dopo l’ultima copia, lo stato lo dice subito', async () => {
    await writeFile(file, '{}')
    const job = outside()
    await job.run()
    await rm(external, { recursive: true })
    const reopened = await outside().status()
    expect(reopened).toEqual({ folder: external, lastCopyAt: null, error: describeBackupError(Object.assign(new Error(), { code: 'ENOENT' })) })
  })
})
