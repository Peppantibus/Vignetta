import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { describeOpenError, OPEN_ERROR } from './openError'
import { completePdf, completeRar4, completeRar5, completeZip } from './testArchives'

let dir: string
let counter = 0
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'vignetta-errori-')) })
afterAll(() => rm(dir, { recursive: true, force: true }))

async function file(bytes: Buffer, extension = '.cbr'): Promise<string> {
  const path = join(dir, `${counter++}${extension}`)
  await writeFile(path, bytes)
  return path
}

/** Come un download interrotto: intestazione e dati, ma non la chiusura. */
const truncated = (complete: Buffer): Buffer => Buffer.concat([complete.subarray(0, 8), Buffer.alloc(5000, 7)])
/** Uno ZIP vero comincia con la prima voce (50 4B 03 04), non con la chiusura come lo ZIP vuoto di prova. */
const zipStart = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(4, 1)])
const technical = new Error('File read error')

describe('messaggi comprensibili quando un fumetto non si apre', () => {
  it('file sparito dal disco', async () => {
    expect(await describeOpenError(join(dir, 'non-esiste.cbz'), technical)).toBe(OPEN_ERROR.missing)
  })

  it.each([
    ['ZIP', Buffer.concat([zipStart, completeZip('commento')])],
    ['RAR 4', completeRar4('dati')],
    ['RAR 5', completeRar5('dati')],
    ['PDF', completePdf('dati')]
  ])('%s troncato: forse il download non è finito', async (_name, complete) => {
    expect(await describeOpenError(await file(truncated(complete)), technical)).toBe(OPEN_ERROR.incomplete)
  })

  it('vuoto o pieno di zeri (spazio riservato da un download): incompleto', async () => {
    expect(await describeOpenError(await file(Buffer.alloc(0)), technical)).toBe(OPEN_ERROR.incomplete)
    expect(await describeOpenError(await file(Buffer.alloc(4096)), technical)).toBe(OPEN_ERROR.incomplete)
  })

  it('protetto da password: messaggio già esistente, anche per i RAR', async () => {
    const zip = await file(completeZip(), '.cbz')
    expect(await describeOpenError(zip, new Error('Archivio protetto da password: non supportato'))).toBe('Archivio protetto da password: non supportato')
    const pdf = await file(completePdf(), '.pdf')
    expect(await describeOpenError(pdf, new Error('Impossibile leggere il PDF: Il PDF richiede una password.'))).toBe('Impossibile leggere il PDF: Il PDF richiede una password.')
    const rar = await file(completeRar5())
    expect(await describeOpenError(rar, new Error('Password for encrypted file or header is not specified'))).toBe(OPEN_ERROR.password)
  })

  it('archivio completo ma illeggibile, o formato diverso: danneggiato o non supportato', async () => {
    expect(await describeOpenError(await file(completeRar4('dati')), technical)).toBe(OPEN_ERROR.damaged)
    expect(await describeOpenError(await file(Buffer.from('7z\xbc\xaf\x27\x1c dati', 'latin1'), '.cb7'), technical)).toBe(OPEN_ERROR.damaged)
    expect(await describeOpenError(await file(Buffer.from('<html>pagina di errore</html>'), '.cbz'), new Error('Non è un archivio ZIP valido'))).toBe(OPEN_ERROR.damaged)
  })

  it('cartella di immagini ancora presente: nessun controllo di completezza', async () => {
    const folder = join(dir, 'cartella')
    await mkdir(folder)
    expect(await describeOpenError(folder, technical)).toBe(OPEN_ERROR.damaged)
  })
})
