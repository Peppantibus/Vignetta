/**
 * Su Windows l'antivirus, l'indicizzazione o Google Drive possono tenere un file occupato per un attimo
 * (EPERM, EBUSY, EACCES): un'operazione sul disco si ripete qualche volta prima di arrendersi.
 */

const BUSY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])

export interface RetryOptions {
  attempts?: number
  pauseMs?: number
}

const DEFAULTS = { attempts: 5, pauseMs: 100 }

export function isBusyError(error: unknown): boolean {
  return BUSY_CODES.has((error as NodeJS.ErrnoException | null)?.code ?? '')
}

/** Ripete `operation` finché il file è occupato; gli altri errori passano subito. */
export async function retryWhileBusy<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { attempts, pauseMs } = { ...DEFAULTS, ...options }
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation()
    } catch (error) {
      if (attempt >= attempts || !isBusyError(error)) throw error
      await new Promise((resolve) => setTimeout(resolve, pauseMs))
    }
  }
}

/** Come `retryWhileBusy`, ma sincrona: serve alla chiusura dell'app, quando non c'è più tempo per l'asincrono. */
export function retryWhileBusySync<T>(operation: () => T, options: RetryOptions = {}): T {
  const { attempts, pauseMs } = { ...DEFAULTS, ...options }
  for (let attempt = 1; ; attempt++) {
    try {
      return operation()
    } catch (error) {
      if (attempt >= attempts || !isBusyError(error)) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pauseMs) // pausa senza consumare la CPU
    }
  }
}
