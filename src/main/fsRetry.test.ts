import { describe, expect, it } from 'vitest'
import { retryWhileBusy, retryWhileBusySync } from './fsRetry'

const busy = (code: string): NodeJS.ErrnoException => Object.assign(new Error(code), { code })

/** Operazione che fallisce con i codici indicati, uno per tentativo, e poi riesce. */
function failing(codes: string[]): { run: () => string; calls: () => number } {
  let calls = 0
  return {
    run: () => {
      const code = codes[calls++]
      if (code) throw busy(code)
      return 'fatto'
    },
    calls: () => calls
  }
}

describe('operazioni sul disco con file occupato', () => {
  it('riprova finché il file è occupato e poi riesce', async () => {
    const operation = failing(['EPERM', 'EBUSY', 'EACCES'])
    expect(await retryWhileBusy(async () => operation.run(), { pauseMs: 1 })).toBe('fatto')
    expect(operation.calls()).toBe(4)
  })

  it('si arrende dopo i tentativi previsti e lancia l\'ultimo errore', async () => {
    const operation = failing(['EPERM', 'EPERM', 'EPERM'])
    await expect(retryWhileBusy(async () => operation.run(), { attempts: 3, pauseMs: 1 })).rejects.toMatchObject({ code: 'EPERM' })
    expect(operation.calls()).toBe(3)
  })

  it('non ripete gli errori che non dipendono da un file occupato', async () => {
    const operation = failing(['ENOENT'])
    await expect(retryWhileBusy(async () => operation.run(), { pauseMs: 1 })).rejects.toMatchObject({ code: 'ENOENT' })
    expect(operation.calls()).toBe(1)
  })

  it('la versione sincrona si comporta allo stesso modo', () => {
    const operation = failing(['EBUSY', 'EPERM'])
    expect(retryWhileBusySync(operation.run, { pauseMs: 1 })).toBe('fatto')
    expect(operation.calls()).toBe(3)

    const stubborn = failing(['EPERM', 'EPERM'])
    expect(() => retryWhileBusySync(stubborn.run, { attempts: 2, pauseMs: 1 })).toThrow('EPERM')
    const missing = failing(['ENOENT'])
    expect(() => retryWhileBusySync(missing.run, { pauseMs: 1 })).toThrow('ENOENT')
    expect(missing.calls()).toBe(1)
  })
})
