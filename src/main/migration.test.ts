import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateFromPreviousName } from './migration'

describe('migrateFromPreviousName', () => {
  let appData: string
  let userData: string

  beforeEach(async () => {
    appData = await mkdtemp(join(tmpdir(), 'vignetta-migration-'))
    userData = join(appData, 'Vignetta')
  })
  afterEach(() => rm(appData, { recursive: true, force: true }))

  async function previousInstall(): Promise<void> {
    await mkdir(join(appData, 'Nuvola', 'covers'), { recursive: true })
    await writeFile(join(appData, 'Nuvola', 'library.json'), '{"vecchia":true}')
    await writeFile(join(appData, 'Nuvola', 'covers', 'abc.jpg'), 'copertina')
  }

  it('copia libreria e copertine dalla vecchia cartella', async () => {
    await previousInstall()
    await migrateFromPreviousName(appData, userData)
    expect(await readFile(join(userData, 'library.json'), 'utf8')).toBe('{"vecchia":true}')
    expect(existsSync(join(userData, 'covers', 'abc.jpg'))).toBe(true)
    expect(existsSync(join(appData, 'Nuvola', 'library.json'))).toBe(true) // la vecchia resta
  })

  it('non sovrascrive mai una libreria già presente', async () => {
    await previousInstall()
    await mkdir(userData, { recursive: true })
    await writeFile(join(userData, 'library.json'), '{"nuova":true}')
    await migrateFromPreviousName(appData, userData)
    expect(await readFile(join(userData, 'library.json'), 'utf8')).toBe('{"nuova":true}')
  })

  it('non fa nulla se non esiste una vecchia installazione', async () => {
    await migrateFromPreviousName(appData, userData)
    expect(existsSync(join(userData, 'library.json'))).toBe(false)
  })
})
