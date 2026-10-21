import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import workerScript from './pdfWorker.ps1?raw'

/** Tempo massimo per una singola richiesta al motore PDF di Windows. */
const REQUEST_TIMEOUT_MS = 45_000

/** Una sessione Windows.Data.Pdf fuori dal processo dell'interfaccia, senza moduli nativi aggiuntivi. */
export class PdfNative {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private nextId = 0
  private closed = false
  private stderr = ''
  private timer: NodeJS.Timeout | undefined

  constructor(private readonly timeoutMs = REQUEST_TIMEOUT_MS) {
    if (process.platform !== 'win32') throw new Error('La lettura dei PDF richiede Windows 10 o successivo.')
    const executable = join(process.env.SystemRoot ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
    this.child = spawn(executable, ['-NoProfile', '-NonInteractive', '-Mta', '-EncodedCommand', Buffer.from(workerScript, 'utf16le').toString('base64')], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
    })
    this.child.stderr.setEncoding('utf8').on('data', (chunk: string) => { this.stderr = (this.stderr + chunk).slice(-3000) })
    const lines = createInterface({ input: this.child.stdout })
    lines.on('line', (line) => {
      try {
        const response = JSON.parse(line) as { id: number; value?: unknown; error?: string }
        const job = this.pending.get(response.id)
        if (!job) return
        this.pending.delete(response.id)
        this.armTimer()
        if (response.error) job.reject(new Error(`Impossibile leggere il PDF: ${response.error}`))
        else job.resolve(response.value)
      } catch { this.fail(new Error('Risposta non valida dal lettore PDF di Windows.')) }
    })
    this.child.on('error', () => this.fail(new Error('Impossibile avviare il lettore PDF di Windows.')))
    this.child.stdin.on('error', () => this.fail(new Error('Il lettore PDF di Windows non risponde.')))
    this.child.once('exit', () => {
      lines.close()
      if (this.pending.size && this.stderr) console.error('Errore del motore PDF di Windows:', this.stderr)
      this.fail(new Error('Il lettore PDF di Windows si è chiuso.'))
    })
  }

  request<T>(request: Record<string, unknown>): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Il lettore PDF è chiuso.'))
    const id = ++this.nextId
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject })
      if (this.pending.size === 1) this.armTimer()
      this.child.stdin.write(`${JSON.stringify({ ...request, id })}\n`)
    })
  }

  /** Falso dopo un errore, un tempo scaduto o la chiusura: il processo non si riapre, serve una nuova sessione. */
  get alive(): boolean {
    return !this.closed
  }

  close(): void {
    this.fail(new Error('Il lettore PDF è chiuso.'))
  }

  /**
   * PowerShell risponde a una richiesta alla volta, nell'ordine di arrivo: il tempo massimo vale per quella in
   * lavorazione e riparte a ogni risposta. Contarlo da quando una pagina entra in coda farebbe scadere le ultime
   * di una lunga coda anche con il motore che procede regolarmente.
   */
  private armTimer(): void {
    clearTimeout(this.timer)
    this.timer = this.pending.size ? setTimeout(() => this.fail(new Error('Il lettore PDF di Windows ha impiegato troppo tempo.')), this.timeoutMs) : undefined
  }

  private fail(error: Error): void {
    this.closed = true
    clearTimeout(this.timer)
    for (const job of this.pending.values()) job.reject(error)
    this.pending.clear()
    if (this.child.exitCode === null) this.child.kill()
  }
}
