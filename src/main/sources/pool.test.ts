import { expect, it, vi } from 'vitest'
import { SourcePool } from '.'
import type { PageSource } from './pageSource'

it('non chiude un archivio espulso finché una lettura è in corso', async () => {
  const close = vi.fn(async () => {})
  const source = { close } as unknown as PageSource
  const pool = new SourcePool(1, async () => source)
  let finish!: () => void
  let started!: () => void
  const ready = new Promise<void>((resolve) => { started = resolve })
  const pending = pool.use('a', async () => { started(); await new Promise<void>((resolve) => { finish = resolve }) })
  await ready
  await pool.get('b')
  expect(close).not.toHaveBeenCalled()
  finish()
  await pending
  expect(close).toHaveBeenCalledTimes(1)
  await pool.closeAll()
  expect(close).toHaveBeenCalledTimes(2)
})
it('release chiude solo le sorgenti indicate, dopo le letture in corso', async () => {
  const closed: string[] = []
  const pool = new SourcePool(3, async (id) => ({ close: async () => { closed.push(id) } }) as unknown as PageSource)
  await pool.get('b')
  let finish!: () => void
  let started!: () => void
  const ready = new Promise<void>((resolve) => { started = resolve })
  const reading = pool.use('a', async () => { started(); await new Promise<void>((resolve) => { finish = resolve }) })
  await ready
  let released = false
  const release = pool.release((id) => id === 'a').then(() => { released = true })
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(released).toBe(false)
  expect(closed).toEqual([])
  finish()
  await reading
  await release
  expect(closed).toEqual(['a'])
  await pool.closeAll()
  expect(closed).toEqual(['a', 'b'])
})
it('riprova una sorgente dopo un errore di apertura', async () => {
  const factory = vi.fn().mockRejectedValueOnce(new Error('File assente')).mockResolvedValue({ close: async () => {} })
  const pool = new SourcePool(1, factory)
  await expect(pool.use('a', async () => {})).rejects.toThrow('File assente')
  await pool.use('a', async () => {})
  expect(factory).toHaveBeenCalledTimes(2)
  await pool.closeAll()
})
it("all'apertura riapre la sorgente se il file è cambiato, dopo le letture in corso", async () => {
  let version = 'parziale'
  const closed: string[] = []
  let opened = 0
  const pool = new SourcePool(2, async () => {
    const name = `${version}#${++opened}`
    return { pages: [name], close: async () => { closed.push(name) } } as unknown as PageSource
  }, async () => version)
  expect((await pool.fresh('a')).pages).toEqual(['parziale#1'])
  expect((await pool.fresh('a')).pages).toEqual(['parziale#1'])

  let finish!: () => void
  let started!: () => void
  const ready = new Promise<void>((resolve) => { started = resolve })
  const reading = pool.use('a', async () => { started(); await new Promise<void>((resolve) => { finish = resolve }) })
  await ready
  version = 'completo'
  const reopened = pool.fresh('a')
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(closed).toEqual([])
  finish()
  await reading
  expect((await reopened).pages).toEqual(['completo#2'])
  expect(closed).toEqual(['parziale#1'])
  await pool.closeAll()
})

it("release e il cambio di versione interrompono i lavori in background, l'espulsione normale no", async () => {
  const aborted: string[] = []
  let version = 'v1'
  const pool = new SourcePool(1, async (id) => ({ abort: () => aborted.push(id), close: async () => {} }) as unknown as PageSource, async () => version)
  await pool.get('a')
  await pool.get('b') // espelle «a»: la sua estrazione può finire e restare in cache
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(aborted).toEqual([])
  version = 'v2'
  await pool.fresh('b')
  expect(aborted).toEqual(['b'])
  await pool.release((id) => id === 'b')
  expect(aborted).toEqual(['b', 'b'])
})
