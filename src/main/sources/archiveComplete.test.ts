import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32 } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isArchiveComplete } from './archiveComplete'
import { completePdf, completeRar4, completeRar5, completeZip } from './testArchives'

let dir: string
let counter = 0
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'vignetta-completo-')) })
afterAll(() => rm(dir, { recursive: true, force: true }))

async function check(bytes: Buffer): Promise<boolean> {
  const path = join(dir, `${counter++}.bin`)
  await writeFile(path, bytes)
  return isArchiveComplete(path)
}

/** Dati che sembrano casuali ma sono sempre gli stessi (come le immagini compresse di un fumetto). */
function noise(length: number): Buffer {
  const parts: Buffer[] = []
  for (let i = 0; parts.length * 32 < length; i++) parts.push(createHash('sha256').update(String(i)).digest())
  return Buffer.concat(parts).subarray(0, length)
}

/** Un archivio «grande»: intestazione, dati e chiusura, come un download vero. */
function withData(complete: Buffer, signatureLength: number): Buffer {
  return Buffer.concat([complete.subarray(0, signatureLength), noise(200_000), complete.subarray(signatureLength)])
}

/** Uno ZIP comincia con l'intestazione della prima voce (50 4B 03 04), seguita dai dati. */
function zipWithData(filler: string): Buffer {
  return Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), noise(200_000), completeZip(filler)])
}

const formats = [
  ['ZIP', zipWithData('commento')],
  ['RAR 4', withData(completeRar4(), 7)],
  ['RAR 5', withData(completeRar5(), 8)],
  ['PDF', withData(completePdf('contenuto'), 9)]
] as const

describe.each(formats)('%s', (_name, archive) => {
  it('intero è completo', async () => {
    expect(await check(archive)).toBe(true)
  })

  it('troncato in qualunque punto prima della chiusura è incompleto', async () => {
    // Il PDF può perdere solo l'a capo finale dopo «%%EOF»: il documento è già intero.
    const keep = _name === 'PDF' ? 2 : 1
    for (const cut of [8, 100, 100_000, 199_990, archive.length - 30, archive.length - 7, archive.length - keep]) {
      expect(await check(archive.subarray(0, cut)), `taglio a ${cut}`).toBe(false)
    }
  })
})

it('i blocchi finali brevi sono riconosciuti dai loro byte tipici', () => {
  expect(completeRar4().subarray(-7).toString('hex')).toBe('c43d7b00400700')
  expect(completeRar5().subarray(-8).toString('hex')).toBe('1d77565103050400')
})

it('un file vuoto, preallocato con zeri o di formato sconosciuto è incompleto', async () => {
  expect(await check(Buffer.alloc(0))).toBe(false)
  expect(await check(Buffer.alloc(50_000))).toBe(false)
  expect(await check(Buffer.from('non è un archivio'))).toBe(false)
})

it('un download preallocato con gli zeri in fondo è incompleto anche se l’inizio è già scritto', async () => {
  const archive = withData(completeRar5(), 8)
  expect(await check(Buffer.concat([archive.subarray(0, 100_000), Buffer.alloc(archive.length - 100_000)]))).toBe(false)
})

it('RAR 5 ammette dati di terzi dopo il blocco finale, ma ne verifica il CRC', async () => {
  const archive = withData(completeRar5(), 8)
  expect(await check(Buffer.concat([archive, Buffer.from('firma digitale aggiunta da un altro programma')]))).toBe(true)
  const damaged = Buffer.from(archive)
  damaged[damaged.length - 8] ^= 0xff
  expect(await check(damaged)).toBe(false)
})

it('RAR 4 accetta un blocco finale con CRC dei dati e numero di volume', async () => {
  const header = Buffer.alloc(13)
  header.writeUInt8(0x7b, 2)
  header.writeUInt16LE(0x4000 | 0x0002 | 0x0008, 3)
  header.writeUInt16LE(13, 5)
  header.writeUInt32LE(0x12345678, 7)
  header.writeUInt16LE(0, 11)
  header.writeUInt16LE(crc32(header.subarray(2)) & 0xffff, 0)
  const archive = withData(completeRar4(), 7)
  expect(await check(Buffer.concat([archive.subarray(0, -7), header]))).toBe(true)
})

it('ZIP con un commento che non sta nel file è incompleto', async () => {
  const archive = zipWithData('commento lungo')
  expect(await check(archive.subarray(0, archive.length - 3))).toBe(false)
})
