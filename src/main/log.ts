import { appendFileSync, mkdirSync } from 'node:fs'
import { appendFile, mkdir, rename, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { format } from 'node:util'

/** Oltre questa dimensione il registro diventa `vignetta.old.log` (uno solo) e se ne comincia uno nuovo. */
export const LOG_MAX_BYTES = 1024 * 1024
export const LOG_NAME = 'vignetta.log'
export const OLD_LOG_NAME = 'vignetta.old.log'

export type LogLevel = 'INFO' | 'AVVISO' | 'ERRORE'

/** Data e ora locali `AAAA-MM-GG HH:MM:SS.mmm`, come si leggono sull'orologio di Windows. */
export function logTimestamp(date: Date): string {
  const pad = (n: number, length = 2): string => String(n).padStart(length, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

/** Una riga del registro; gli errori portano con sé lo stack sulle righe successive. */
export function logLine(level: LogLevel, args: readonly unknown[], date = new Date()): string {
  return `${logTimestamp(date)} [${level}] ${format(...args)}\n`
}

/**
 * Registro su file del processo principale, senza librerie: le righe si accodano in memoria
 * e un solo ciclo le scrive in append, così chi registra non aspetta mai il disco.
 */
export class LogFile {
  private pending: string[] = []
  private writing: Promise<void> | null = null
  /** Dimensione attuale del file, letta una volta e poi tenuta aggiornata. */
  private size: number | null = null

  constructor(
    readonly dir: string,
    private readonly maxBytes = LOG_MAX_BYTES,
    private readonly now = (): Date => new Date()
  ) {}

  get file(): string {
    return join(this.dir, LOG_NAME)
  }

  write(level: LogLevel, ...args: unknown[]): void {
    this.pending.push(logLine(level, args, this.now()))
    this.writing ??= this.drain()
  }

  /** Attende che le righe già registrate siano sul disco. */
  async flush(): Promise<void> {
    while (this.writing) await this.writing
  }

  /** Scrittura immediata, per gli errori che possono chiudere il processo prima del ciclo asincrono. */
  writeSync(level: LogLevel, ...args: unknown[]): void {
    const text = this.pending.splice(0).join('') + logLine(level, args, this.now())
    try {
      mkdirSync(this.dir, { recursive: true })
      appendFileSync(this.file, text)
      if (this.size !== null) this.size += Buffer.byteLength(text)
    } catch {
      // senza registro si continua comunque
    }
  }

  private async drain(): Promise<void> {
    try {
      while (this.pending.length) {
        const text = this.pending.splice(0).join('')
        const bytes = Buffer.byteLength(text)
        await mkdir(this.dir, { recursive: true })
        this.size ??= await stat(this.file).then((info) => info.size, () => 0)
        if (this.size > 0 && this.size + bytes > this.maxBytes) {
          await rename(this.file, join(this.dir, OLD_LOG_NAME)) // sostituisce il vecchio registro precedente
          this.size = 0
        }
        await appendFile(this.file, text)
        this.size += bytes
      }
    } catch (error) {
      // Non su console.error: rientrerebbe qui. Le righe di questo giro si perdono, il registro non è indispensabile.
      this.size = null
      process.stderr.write(`Registro su file non scritto: ${String(error)}\n`)
    } finally {
      this.writing = null
    }
  }
}

/**
 * Copia nel registro avvisi ed errori del processo principale (che nell'app installata non si vedono),
 * le eccezioni non gestite e le promesse rifiutate senza gestione. La console resta come prima.
 */
export function captureMainLog(log: LogFile): void {
  const levels = { warn: 'AVVISO', error: 'ERRORE' } as const
  for (const method of ['warn', 'error'] as const) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]): void => {
      original(...args)
      log.write(levels[method], ...args)
    }
  }
  // «Monitor»: registra senza cambiare il comportamento normale di Electron per gli errori fatali.
  process.on('uncaughtExceptionMonitor', (error, origin) => log.writeSync('ERRORE', `Eccezione non gestita (${origin}):`, error))
  process.on('unhandledRejection', (reason) => console.error('Promessa rifiutata senza gestione:', reason))
}

/** Lo stesso messaggio dell'interfaccia ripetuto (es. a ogni pagina girata) si registra al massimo una volta in questo tempo. */
const RENDERER_REPEAT_MS = 60_000

/** Un messaggio della console dell'interfaccia, come lo passa l'evento `console-message` di Electron. */
export interface ConsoleMessage {
  level: string
  message: string
  sourceId: string
  lineNumber: number
}

/**
 * Avvisi ed errori dell'interfaccia (eccezioni, promesse rifiutate senza gestione, console.error di React) nel
 * registro: senza, un problema nella finestra dell'app installata non lascerebbe traccia.
 */
export class RendererConsole {
  private readonly recent = new Map<string, number>()

  constructor(
    private readonly write: (level: LogLevel, text: string) => void,
    private readonly now = Date.now
  ) {}

  message({ level, message, sourceId, lineNumber }: ConsoleMessage): void {
    if (level !== 'warning' && level !== 'error') return
    const at = this.now()
    const key = `${level}|${message}`
    if (at - (this.recent.get(key) ?? -Infinity) < RENDERER_REPEAT_MS) return
    if (this.recent.size >= 500) {
      for (const [old, time] of this.recent) if (at - time >= RENDERER_REPEAT_MS) this.recent.delete(old)
    }
    this.recent.set(key, at)
    // Del file basta il nome: il percorso dell'app installata non aggiunge nulla.
    const source = sourceId ? ` (${sourceId.slice(sourceId.lastIndexOf('/') + 1)}:${lineNumber})` : ''
    this.write(level === 'error' ? 'ERRORE' : 'AVVISO', `Interfaccia: ${message}${source}`)
  }
}
