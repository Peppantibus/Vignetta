import { open, type FileHandle } from 'node:fs/promises'
import { promisify } from 'node:util'
import { constants, inflateRaw, inflateRawSync, type ZlibOptions } from 'node:zlib'
import { readAt } from './fileRead'

/**
 * Lettore ZIP minimo, sufficiente per i CBZ: legge la directory centrale in fondo al file e
 * decomprime le singole voci su richiesta (memorizzate o "deflate", i soli metodi usati in pratica).
 * Supporta ZIP64 (archivi oltre 4 GB) e i nomi in UTF-8 o nella vecchia codifica CP437.
 * Specifica: PKWARE APPNOTE.TXT.
 */

export interface ZipEntry {
  name: string
  /** 0 = memorizzata, 8 = deflate. */
  method: number
  compressedSize: number
  size: number
  localHeaderOffset: number
  encrypted: boolean
}

const SIGNATURE = {
  endOfCentralDirectory: 0x06054b50,
  zip64EndLocator: 0x07064b50,
  zip64End: 0x06064b50,
  centralFile: 0x02014b50,
  localFile: 0x04034b50
} as const

const STORED = 0
const DEFLATE = 8
/** Valore che, in un campo a 32 bit, rimanda al campo extra ZIP64. */
const ZIP64_MARKER = 0xffffffff
/** Il commento finale può arrivare a 64 KB: la fine della directory centrale sta negli ultimi 64 KB + 22 byte. */
const MAX_END_SEARCH = 0xffff + 22
/** Nessuna pagina arriva a tanto: oltre, l'archivio è danneggiato o costruito apposta per esaurire la memoria. */
const MAX_ENTRY_BYTES = 512 * 1024 * 1024

const inflateRawAsync = promisify(inflateRaw)

export class ZipArchive {
  private readonly dataOffsets = new Map<ZipEntry, number>()

  private constructor(
    private readonly file: FileHandle,
    readonly entries: readonly ZipEntry[]
  ) {}

  static async open(path: string): Promise<ZipArchive> {
    const file = await open(path, 'r')
    try {
      return new ZipArchive(file, await readCentralDirectory(file))
    } catch (error) {
      await file.close()
      throw error
    }
  }

  /** Contenuto completo, decompresso. */
  async read(entry: ZipEntry): Promise<Buffer> {
    const raw = await this.readRaw(entry, entry.compressedSize)
    return entry.method === STORED ? raw : inflate(entry, raw)
  }

  /**
   * Almeno i primi `bytes` byte decompressi (o tutta la voce, se più corta).
   * Per le voci compresse si decomprime solo un tratto iniziale, senza leggere il resto.
   */
  async readHead(entry: ZipEntry, bytes: number): Promise<Buffer> {
    if (entry.method === STORED) return this.readRaw(entry, Math.min(bytes, entry.size))
    // Il deflate raramente comprime meno di 1:1 sulle immagini; un margine copre le intestazioni.
    const raw = await this.readRaw(entry, Math.min(entry.compressedSize, bytes + 4096))
    return inflate(entry, raw, raw.length < entry.compressedSize)
  }

  close(): Promise<void> {
    return this.file.close()
  }

  private async readRaw(entry: ZipEntry, length: number): Promise<Buffer> {
    if (entry.encrypted) throw new Error('Archivio protetto da password: non supportato')
    if (entry.method !== STORED && entry.method !== DEFLATE) throw new Error(`Metodo di compressione non supportato (${entry.method})`)
    if (entry.size > MAX_ENTRY_BYTES || entry.compressedSize > MAX_ENTRY_BYTES) throw new Error(`Voce ZIP troppo grande: ${entry.name}`)
    return readAt(this.file, await this.dataOffset(entry), length)
  }

  /** Inizio dei dati di una voce: dopo l'intestazione locale, la cui lunghezza va letta dal file. */
  private async dataOffset(entry: ZipEntry): Promise<number> {
    let offset = this.dataOffsets.get(entry)
    if (offset === undefined) {
      const header = await readAt(this.file, entry.localHeaderOffset, 30)
      if (header.readUInt32LE(0) !== SIGNATURE.localFile) throw new Error(`Voce ZIP danneggiata: ${entry.name}`)
      offset = entry.localHeaderOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28)
      this.dataOffsets.set(entry, offset)
    }
    return offset
  }
}

/**
 * Decomprime senza superare la dimensione dichiarata dalla voce: un archivio che mente (pochi KB che diventano
 * gigabyte) non riempie la memoria. `partial` decomprime solo il tratto letto, per `readHead`.
 */
async function inflate(entry: ZipEntry, raw: Buffer, partial = false): Promise<Buffer> {
  const options: ZlibOptions = { maxOutputLength: Math.max(1, entry.size) }
  try {
    return partial ? inflateRawSync(raw, { ...options, finishFlush: constants.Z_SYNC_FLUSH }) : await inflateRawAsync(raw, options)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') throw new Error(`Voce ZIP danneggiata: ${entry.name}`)
    throw error
  }
}

async function readCentralDirectory(file: FileHandle): Promise<ZipEntry[]> {
  const { size } = await file.stat()
  const tailStart = Math.max(0, size - MAX_END_SEARCH)
  const tail = await readAt(file, tailStart, size - tailStart)

  let end = -1
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === SIGNATURE.endOfCentralDirectory) {
      end = i
      break
    }
  }
  if (end === -1) throw new Error('Non è un archivio ZIP valido')

  let count = tail.readUInt16LE(end + 10)
  let directorySize = tail.readUInt32LE(end + 12)
  let directoryOffset = tail.readUInt32LE(end + 16)

  // ZIP64: i valori veri stanno in un record separato, indicato dal "locator" appena prima della fine.
  if (count === 0xffff || directorySize === ZIP64_MARKER || directoryOffset === ZIP64_MARKER) {
    const locator = end - 20
    if (locator >= 0 && tail.readUInt32LE(locator) === SIGNATURE.zip64EndLocator) {
      const record = await readAt(file, Number(tail.readBigUInt64LE(locator + 8)), 56)
      if (record.readUInt32LE(0) !== SIGNATURE.zip64End) throw new Error('Archivio ZIP64 danneggiato')
      count = Number(record.readBigUInt64LE(32))
      directorySize = Number(record.readBigUInt64LE(40))
      directoryOffset = Number(record.readBigUInt64LE(48))
    }
  }

  if (directoryOffset + directorySize > size) throw new Error('Directory ZIP danneggiata')
  const directory = await readAt(file, directoryOffset, directorySize)
  const entries: ZipEntry[] = []
  let offset = 0
  for (let i = 0; i < count; i++) {
    if (directory.readUInt32LE(offset) !== SIGNATURE.centralFile) throw new Error('Directory ZIP danneggiata')
    const flags = directory.readUInt16LE(offset + 8)
    const nameLength = directory.readUInt16LE(offset + 28)
    const extraLength = directory.readUInt16LE(offset + 30)
    const commentLength = directory.readUInt16LE(offset + 32)
    const nameBytes = directory.subarray(offset + 46, offset + 46 + nameLength)
    const extra = directory.subarray(offset + 46 + nameLength, offset + 46 + nameLength + extraLength)

    const entry: ZipEntry = {
      name: flags & 0x0800 ? nameBytes.toString('utf8') : decodeCp437(nameBytes),
      method: directory.readUInt16LE(offset + 10),
      compressedSize: directory.readUInt32LE(offset + 20),
      size: directory.readUInt32LE(offset + 24),
      localHeaderOffset: directory.readUInt32LE(offset + 42),
      encrypted: (flags & 0x0001) !== 0
    }
    applyExtraFields(entry, extra)
    entries.push(entry)
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

/** Campi extra: valori ZIP64 (0x0001) e nome Unicode di Info-ZIP (0x7075). */
function applyExtraFields(entry: ZipEntry, extra: Buffer): void {
  let offset = 0
  while (offset + 4 <= extra.length) {
    const id = extra.readUInt16LE(offset)
    const length = extra.readUInt16LE(offset + 2)
    const data = extra.subarray(offset + 4, offset + 4 + length)
    if (id === 0x0001) {
      // Presenti solo i campi che nella directory valgono 0xFFFFFFFF, sempre in quest'ordine.
      let position = 0
      const next = (): number => Number(data.readBigUInt64LE((position += 8) - 8))
      if (entry.size === ZIP64_MARKER) entry.size = next()
      if (entry.compressedSize === ZIP64_MARKER) entry.compressedSize = next()
      if (entry.localHeaderOffset === ZIP64_MARKER) entry.localHeaderOffset = next()
    } else if (id === 0x7075 && data.length > 5 && data[0] === 1) {
      entry.name = data.subarray(5).toString('utf8')
    }
    offset += 4 + length
  }
}

/** Caratteri 128-255 della codifica CP437, usata per i nomi negli ZIP più vecchi. */
const CP437_HIGH =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ '

function decodeCp437(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += byte < 128 ? String.fromCharCode(byte) : CP437_HIGH[byte - 128]
  return text
}
