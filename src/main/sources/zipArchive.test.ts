import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ZipArchive, type ZipEntry } from './zipArchive'

interface TestEntry {
  name: Buffer
  data: Buffer
  deflate?: boolean
  utf8Flag?: boolean
  unicodeExtra?: string
  encrypted?: boolean
  /** Dimensione decompressa scritta nella directory, se diversa da quella vera (archivio che mente). */
  declaredSize?: number
}

/** Scrittore ZIP minimo per i test: voci memorizzate o compresse, ZIP64 facoltativo. */
function buildZip(entries: TestEntry[], zip64 = false): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const stored = entry.deflate ? deflateRawSync(entry.data) : entry.data
    const flags = (entry.utf8Flag ? 0x0800 : 0) | (entry.encrypted ? 0x0001 : 0)
    const method = entry.deflate ? 8 : 0

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(flags, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(stored.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(entry.name.length, 26)
    locals.push(local, entry.name, stored)

    const extras: Buffer[] = []
    if (zip64) {
      const extra = Buffer.alloc(4 + 24)
      extra.writeUInt16LE(0x0001, 0)
      extra.writeUInt16LE(24, 2)
      extra.writeBigUInt64LE(BigInt(entry.data.length), 4)
      extra.writeBigUInt64LE(BigInt(stored.length), 12)
      extra.writeBigUInt64LE(BigInt(offset), 20)
      extras.push(extra)
    }
    if (entry.unicodeExtra) {
      const name = Buffer.from(entry.unicodeExtra, 'utf8')
      const extra = Buffer.alloc(4 + 5 + name.length)
      extra.writeUInt16LE(0x7075, 0)
      extra.writeUInt16LE(5 + name.length, 2)
      extra.writeUInt8(1, 4)
      name.copy(extra, 9)
      extras.push(extra)
    }
    const extra = Buffer.concat(extras)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(flags, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(zip64 ? 0xffffffff : stored.length, 20)
    central.writeUInt32LE(zip64 ? 0xffffffff : (entry.declaredSize ?? entry.data.length), 24)
    central.writeUInt16LE(entry.name.length, 28)
    central.writeUInt16LE(extra.length, 30)
    central.writeUInt32LE(zip64 ? 0xffffffff : offset, 42)
    centrals.push(central, entry.name, extra)

    offset += 30 + entry.name.length + stored.length
  }

  const directory = Buffer.concat(centrals)
  const tail: Buffer[] = []
  if (zip64) {
    const record = Buffer.alloc(56)
    record.writeUInt32LE(0x06064b50, 0)
    record.writeBigUInt64LE(BigInt(entries.length), 32)
    record.writeBigUInt64LE(BigInt(directory.length), 40)
    record.writeBigUInt64LE(BigInt(offset), 48)
    const locator = Buffer.alloc(20)
    locator.writeUInt32LE(0x07064b50, 0)
    locator.writeBigUInt64LE(BigInt(offset + directory.length), 8)
    tail.push(record, locator)
  }
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(zip64 ? 0xffff : entries.length, 10)
  end.writeUInt32LE(zip64 ? 0xffffffff : directory.length, 12)
  end.writeUInt32LE(zip64 ? 0xffffffff : offset, 16)
  return Buffer.concat([...locals, directory, ...tail, end])
}

const page = Buffer.from('JPEG finto '.repeat(5000))

describe('ZipArchive', () => {
  let dir: string
  const write = async (name: string, zip: Buffer): Promise<string> => {
    const path = join(dir, name)
    await writeFile(path, zip)
    return path
  }

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vignetta-zip-'))
  })
  afterAll(() => rm(dir, { recursive: true, force: true }))

  it('legge voci memorizzate e compresse', async () => {
    const path = await write(
      'base.cbz',
      buildZip([
        { name: Buffer.from('001.jpg'), data: page },
        { name: Buffer.from('002.jpg'), data: page, deflate: true }
      ])
    )
    const zip = await ZipArchive.open(path)
    expect(zip.entries.map((e) => [e.name, e.method, e.size])).toEqual([
      ['001.jpg', 0, page.length],
      ['002.jpg', 8, page.length]
    ])
    expect((await zip.read(zip.entries[0]!)).equals(page)).toBe(true)
    expect((await zip.read(zip.entries[1]!)).equals(page)).toBe(true)
    await zip.close()
  })

  it('legge solo l\'inizio di una voce, anche compressa', async () => {
    const path = await write('head.cbz', buildZip([{ name: Buffer.from('a.jpg'), data: page, deflate: true }]))
    const zip = await ZipArchive.open(path)
    const head = await zip.readHead(zip.entries[0]!, 1000)
    expect(head.length).toBeGreaterThanOrEqual(1000)
    expect(head.equals(page.subarray(0, head.length))).toBe(true)
    await zip.close()
  })

  it('decodifica i nomi in UTF-8, CP437 e dal campo Unicode di Info-ZIP', async () => {
    const path = await write(
      'nomi.cbz',
      buildZip([
        { name: Buffer.from('Città/pagina.jpg', 'utf8'), data: page, utf8Flag: true },
        { name: Buffer.from([0x50, 0x82, 0x2e, 0x6a, 0x70, 0x67]), data: page }, // "Pé.jpg" in CP437
        { name: Buffer.from('vecchio.jpg'), data: page, unicodeExtra: 'perché.jpg' }
      ])
    )
    const zip = await ZipArchive.open(path)
    expect(zip.entries.map((e) => e.name)).toEqual(['Città/pagina.jpg', 'Pé.jpg', 'perché.jpg'])
    await zip.close()
  })

  it('supporta ZIP64', async () => {
    const path = await write('grande.cbz', buildZip([{ name: Buffer.from('001.jpg'), data: page, deflate: true }], true))
    const zip = await ZipArchive.open(path)
    expect(zip.entries[0]).toMatchObject({ name: '001.jpg', size: page.length, localHeaderOffset: 0 })
    expect((await zip.read(zip.entries[0]!)).equals(page)).toBe(true)
    await zip.close()
  })

  it('una voce che si decomprime oltre la dimensione dichiarata viene fermata invece di riempire la memoria', async () => {
    const bomb = Buffer.alloc(4 * 1024 * 1024) // 4 MB di zeri diventano pochi KB compressi
    const zip = await ZipArchive.open(await write('bomba.cbz', buildZip([
      { name: Buffer.from('bugiarda.jpg'), data: bomb, deflate: true, declaredSize: 100 },
      { name: Buffer.from('enorme.jpg'), data: page, deflate: true, declaredSize: 0xfffffff0 },
      { name: Buffer.from('onesta.jpg'), data: page, deflate: true }
    ])))
    const [liar, huge, honest] = zip.entries as [ZipEntry, ZipEntry, ZipEntry]
    await expect(zip.read(liar)).rejects.toThrow('Voce ZIP danneggiata: bugiarda.jpg')
    await expect(zip.readHead(liar, 50)).rejects.toThrow('Voce ZIP danneggiata')
    await expect(zip.read(huge)).rejects.toThrow('Voce ZIP troppo grande: enorme.jpg')
    expect((await zip.read(honest)).equals(page)).toBe(true)
    const head = await zip.readHead(honest, 1000)
    expect(head.equals(page.subarray(0, head.length))).toBe(true)
    await zip.close()
  })

  it('rifiuta una directory centrale che dichiara di andare oltre la fine del file', async () => {
    const zip = buildZip([{ name: Buffer.from('a.jpg'), data: page }])
    zip.writeUInt32LE(0x7fffffff, zip.length - 22 + 12) // dimensione della directory
    await expect(ZipArchive.open(await write('directory.cbz', zip))).rejects.toThrow('Directory ZIP danneggiata')
  })

  it('segnala con chiarezza archivi non validi o protetti da password', async () => {
    await expect(ZipArchive.open(await write('rotto.cbz', Buffer.from('non sono uno zip')))).rejects.toThrow('Non è un archivio ZIP valido')
    const zip = await ZipArchive.open(await write('pw.cbz', buildZip([{ name: Buffer.from('a.jpg'), data: page, encrypted: true }])))
    await expect(zip.read(zip.entries[0]!)).rejects.toThrow('password')
    await zip.close()
  })
})
