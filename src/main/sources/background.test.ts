import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { BackgroundSources, InterruptedReading } from './background'
import type { PageSource } from './pageSource'

// Sorgenti finte: una lettura resta in attesa finché non arriva `abort`, come un'estrazione RAR lunga.
const fake = vi.hoisted(() => ({ events: [] as string[], opening: null as Promise<void> | null }))
vi.mock('./index', async (original) => ({ ...await original<typeof import('./index')>(), openSource: async (target: { path: string }) => {
  await fake.opening
  fake.events.push(`aperta ${target.path}`)
  let stop: () => void = () => {}
  // Come un worker RAR terminato: la lettura in corso fallisce con un errore suo.
  const stopped = new Promise<void>((_, reject) => (stop = () => reject(new Error('Il worker RAR si è chiuso'))))
  stopped.catch(() => {})
  return {
    pages: ['01.jpg', '02.jpg'],
    read: async (index: number) => {
      if (index === 1) await stopped // la seconda pagina «non finisce mai» da sola
      return Buffer.from(`pagina ${index}`)
    },
    readHead: async () => Buffer.alloc(0),
    readMetadata: async () => null,
    abort: () => { fake.events.push(`interrotta ${target.path}`); stop() },
    close: async () => { fake.events.push(`chiusa ${target.path}`) }
  } satisfies PageSource
} }))

const target = (path: string): { path: string; kind: 'rar' } => ({ path, kind: 'rar' })
/** Cartella temporanea delle letture: con le sorgenti finte resta vuota. */
const scratch = join(tmpdir(), 'vignetta-letture-finte')

describe('letture in background e «Elimina dal disco»', () => {
  it('release ferma la lettura in corso, aspetta che il file sia chiuso e impedisce di riaprirlo', async () => {
    fake.events = []
    const background = new BackgroundSources()
    const reading = background.use(target('C:/Fumetti/Batman.cbr'), scratch, async (source) => {
      await source.read(0)
      await source.read(1)
      return source.read(0) // dopo l'interruzione non si legge più nulla
    })
    await vi.waitFor(() => expect(fake.events).toEqual(['aperta C:/Fumetti/Batman.cbr']))

    const unblock = await background.release(['C:/Fumetti/Batman.cbr'])
    fake.events.push('rilasciata')
    await expect(reading).rejects.toBeInstanceOf(InterruptedReading)
    expect(fake.events).toEqual(['aperta C:/Fumetti/Batman.cbr', 'interrotta C:/Fumetti/Batman.cbr', 'chiusa C:/Fumetti/Batman.cbr', 'rilasciata'])

    // Finché l'eliminazione non è finita nessuno lo riapre; gli altri file non sono toccati.
    await expect(background.use(target('C:/Fumetti/Batman.cbr'), scratch, async () => 'letta')).rejects.toBeInstanceOf(InterruptedReading)
    await expect(background.use(target('C:/Fumetti/Altro.cbr'), scratch, async (source) => (await source.read(0)).toString())).resolves.toBe('pagina 0')
    unblock()
    await expect(background.use(target('C:/Fumetti/Batman.cbr'), scratch, async () => 'letta')).resolves.toBe('letta')
  })

  it("un file ancora in apertura viene chiuso appena aperto, e release lo aspetta", async () => {
    fake.events = []
    let opened: () => void = () => {}
    fake.opening = new Promise((resolve) => (opened = resolve))
    const background = new BackgroundSources()
    const reading = background.use(target('C:/Fumetti/Batman.cbr'), scratch, async (source) => (await source.read(0)).toString()).catch((error: unknown) => error)
    const released = background.release(['C:/Fumetti/Batman.cbr']).then(() => fake.events.push('rilasciata'))
    await Promise.resolve()
    expect(fake.events).toEqual([])
    fake.opening = null
    opened()
    await released
    expect(await reading).toBeInstanceOf(InterruptedReading)
    expect(fake.events).toEqual(['aperta C:/Fumetti/Batman.cbr', 'interrotta C:/Fumetti/Batman.cbr', 'chiusa C:/Fumetti/Batman.cbr', 'rilasciata'])
  })

  it.runIf(process.platform === 'win32')('riconosce il file anche scritto con altre maiuscole', async () => {
    fake.events = []
    const background = new BackgroundSources()
    const reading = background.use(target('C:/Fumetti/Batman.cbr'), scratch, (source) => source.read(1))
    await vi.waitFor(() => expect(fake.events).toHaveLength(1))
    const unblock = await background.release(['c:/fumetti/BATMAN.CBR'])
    await expect(reading).rejects.toBeInstanceOf(InterruptedReading)
    unblock()
  })

  it('due eliminazioni dello stesso file: resta bloccato finché non finisce anche la seconda', async () => {
    const background = new BackgroundSources()
    const first = await background.release(['C:/Fumetti/Batman.cbr'])
    const second = await background.release(['C:/Fumetti/Batman.cbr'])
    first()
    await expect(background.use(target('C:/Fumetti/Batman.cbr'), scratch, async () => 'letta')).rejects.toBeInstanceOf(InterruptedReading)
    second()
    await expect(background.use(target('C:/Fumetti/Batman.cbr'), scratch, async () => 'letta')).resolves.toBe('letta')
  })

  it('gli errori normali passano invariati e la sorgente viene chiusa', async () => {
    fake.events = []
    const background = new BackgroundSources()
    await expect(background.use(target('C:/Fumetti/Batman.cbr'), scratch, async () => { throw new Error('Nessuna pagina') })).rejects.toThrow('Nessuna pagina')
    expect(fake.events).toEqual(['aperta C:/Fumetti/Batman.cbr', 'chiusa C:/Fumetti/Batman.cbr'])
  })
})
