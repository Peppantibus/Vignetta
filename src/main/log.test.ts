import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LOG_NAME, LogFile, logLine, logTimestamp, OLD_LOG_NAME, RendererConsole } from './log'

let root: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'vignetta-log-')) })
afterEach(() => rm(root, { recursive: true, force: true }))

const at = new Date(2026, 9, 16, 9, 5, 7, 42)

describe('registro su file', () => {
  it('scrive data e ora locali, livello e messaggio; gli errori con il loro stack', () => {
    expect(logTimestamp(at)).toBe('2026-10-16 09:05:07.042')
    expect(logLine('AVVISO', ['Copia non riuscita', 3], at)).toBe('2026-10-16 09:05:07.042 [AVVISO] Copia non riuscita 3\n')
    const error = new Error('File read error')
    const line = logLine('ERRORE', ['Apertura non riuscita:', error], at)
    expect(line.startsWith('2026-10-16 09:05:07.042 [ERRORE] Apertura non riuscita: Error: File read error\n')).toBe(true)
    expect(line).toContain('log.test.ts') // lo stack
  })

  it('crea la cartella solo quando serve e accoda le righe senza far aspettare chi scrive', async () => {
    const dir = join(root, 'logs')
    const log = new LogFile(dir, 1024 * 1024, () => at)
    expect(await readdir(root)).toEqual([])
    log.write('INFO', 'uno')
    log.write('AVVISO', 'due')
    await log.flush()
    log.write('ERRORE', 'tre')
    await log.flush()
    log.writeSync('ERRORE', 'quattro') // per gli errori fatali: subito, senza aspettare il ciclo
    await log.flush()
    const text = await readFile(join(dir, LOG_NAME), 'utf8')
    expect(text.split('\n').filter(Boolean).map((line) => line.slice(24))).toEqual(['[INFO] uno', '[AVVISO] due', '[ERRORE] tre', '[ERRORE] quattro'])
  })

  it('oltre il limite il registro diventa vignetta.old.log (uno solo) e si riparte', async () => {
    const dir = root
    await writeFile(join(dir, OLD_LOG_NAME), 'vecchissimo')
    await writeFile(join(dir, LOG_NAME), 'x'.repeat(900))
    const log = new LogFile(dir, 1000, () => at)
    log.write('INFO', 'a'.repeat(150)) // 900 + ~185 > 1000
    await log.flush()
    expect((await readFile(join(dir, OLD_LOG_NAME), 'utf8'))).toBe('x'.repeat(900))
    expect(await readFile(join(dir, LOG_NAME), 'utf8')).toBe(logLine('INFO', ['a'.repeat(150)], at))

    for (let i = 0; i < 20; i++) log.write('INFO', 'riga', i)
    await log.flush()
    expect((await readdir(dir)).sort()).toEqual([LOG_NAME, OLD_LOG_NAME])
    expect((await stat(join(dir, LOG_NAME))).size).toBeLessThanOrEqual(1000)
    expect((await stat(join(dir, OLD_LOG_NAME))).size).toBeLessThanOrEqual(1000)
  })

  it('con una cartella non scrivibile non lancia errori', async () => {
    const blocked = join(root, 'file')
    await writeFile(blocked, '')
    const log = new LogFile(join(blocked, 'logs'))
    const stderr = process.stderr.write
    process.stderr.write = (() => true) as typeof process.stderr.write
    try {
      log.write('ERRORE', 'perso')
      await log.flush()
      expect(() => log.writeSync('ERRORE', 'perso')).not.toThrow()
    } finally {
      process.stderr.write = stderr
    }
  })
})

describe("errori dell'interfaccia nel registro", () => {
  it('registra avvisi ed errori con il nome del file, una volta al minuto per lo stesso messaggio', () => {
    const lines: string[] = []
    let now = 0
    const console = new RendererConsole((level, text) => lines.push(`[${level}] ${text}`), () => now)
    const source = 'file:///C:/Programmi/Vignetta/resources/app.asar/out/renderer/assets/index-abc.js'
    console.message({ level: 'info', message: 'pronto', sourceId: source, lineNumber: 1 })
    console.message({ level: 'debug', message: 'dettaglio', sourceId: source, lineNumber: 1 })
    console.message({ level: 'error', message: 'Uncaught (in promise) Error: Fumetto non trovato', sourceId: source, lineNumber: 12 })
    console.message({ level: 'warning', message: 'Immagine lenta', sourceId: '', lineNumber: 0 })
    now = 59_000
    console.message({ level: 'error', message: 'Uncaught (in promise) Error: Fumetto non trovato', sourceId: source, lineNumber: 12 })
    now = 60_000
    console.message({ level: 'error', message: 'Uncaught (in promise) Error: Fumetto non trovato', sourceId: source, lineNumber: 12 })
    expect(lines).toEqual([
      '[ERRORE] Interfaccia: Uncaught (in promise) Error: Fumetto non trovato (index-abc.js:12)',
      '[AVVISO] Interfaccia: Immagine lenta',
      '[ERRORE] Interfaccia: Uncaught (in promise) Error: Fumetto non trovato (index-abc.js:12)'
    ])
  })
})
