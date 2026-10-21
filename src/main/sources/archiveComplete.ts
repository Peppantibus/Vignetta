import { open } from 'node:fs/promises'
import { crc32 } from 'node:zlib'
import { readAt } from './fileRead'

/**
 * Riconosce se un archivio è arrivato fino in fondo, leggendo solo l'inizio e la coda del file.
 * Serve a non importare un download ancora in corso: ZIP, RAR e PDF scrivono una struttura
 * di chiusura che manca finché il file è parziale. Nessuna decompressione.
 */

export type ArchiveFormat = 'zip' | 'rar' | 'pdf'

/** Formato vero dai primi byte ("PK", "Rar!", "%PDF-"); null se non è riconoscibile. */
export function archiveFormatOf(head: Buffer): ArchiveFormat | null {
  if (head[0] === 0x50 && head[1] === 0x4b) return 'zip'
  if (head.subarray(0, 4).toString('latin1') === 'Rar!') return 'rar'
  if (head.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf'
  return null
}

/** ZIP: la fine della directory centrale sta negli ultimi 22 byte più un commento di al massimo 64 KB. */
const ZIP_TAIL = 0xffff + 22
const ZIP_END_SIGNATURE = 0x06054b50
/** PDF: il marcatore finale «%%EOF» è nell'ultimo KB (dopo può esserci solo qualche a capo). */
const PDF_TAIL = 1024
/** RAR5 permette dati di terzi (es. firme) dopo il blocco finale: lo si cerca negli ultimi 4 KB. */
const RAR_TAIL = 4096
const RAR5_SIGNATURE = Buffer.from('Rar!\x1a\x07\x01\x00', 'latin1')
const RAR4_END_TYPE = 0x7b
const RAR5_END_TYPE = 5

/**
 * Vero se l'archivio ha la sua struttura di chiusura. Un file vuoto, con un formato non
 * riconosciuto dai primi byte (per esempio un download preallocato pieno di zeri) o troncato è incompleto.
 */
export async function isArchiveComplete(path: string): Promise<boolean> {
  const file = await open(path, 'r')
  try {
    const { size } = await file.stat()
    const head = await readAt(file, 0, Math.min(size, 8))
    const format = archiveFormatOf(head)
    if (!format) return false
    const tailLength = Math.min(size, format === 'zip' ? ZIP_TAIL : format === 'pdf' ? PDF_TAIL : RAR_TAIL)
    const tail = await readAt(file, size - tailLength, tailLength)
    switch (format) {
      case 'zip':
        return hasZipEnd(tail)
      case 'pdf':
        return tail.includes('%%EOF', 0, 'latin1')
      case 'rar':
        return head.equals(RAR5_SIGNATURE) ? hasRar5End(tail) : hasRar4End(tail)
    }
  } finally {
    await file.close()
  }
}

/** Firma della fine della directory centrale (PKWARE APPNOTE 4.3.16), con un commento che sta nel file. */
function hasZipEnd(tail: Buffer): boolean {
  for (let at = tail.length - 22; at >= 0; at--) {
    if (tail.readUInt32LE(at) !== ZIP_END_SIGNATURE) continue
    if (at + 22 + tail.readUInt16LE(at + 20) <= tail.length) return true
  }
  return false
}

/**
 * RAR 1.5–4.x: il file termina con il blocco ENDARC (tipo 0x7B). Intestazione: CRC16 (2 byte, parte bassa
 * del CRC32 dal campo tipo in poi), tipo (1), flag (2), dimensione (2), eventuali campi facoltativi.
 * Di solito sono i 7 byte C4 3D 7B 00 40 07 00; si accettano anche i blocchi con CRC dei dati o numero di volume.
 */
function hasRar4End(tail: Buffer): boolean {
  for (let size = 7; size <= Math.min(64, tail.length); size++) {
    const at = tail.length - size
    if (tail[at + 2] !== RAR4_END_TYPE || tail.readUInt16LE(at + 5) !== size) continue
    if ((crc32(tail.subarray(at + 2)) & 0xffff) === tail.readUInt16LE(at)) return true
  }
  return false
}

/**
 * RAR 5: blocco «end of archive» (specifica RAR 5.0 di RARLAB): CRC32 (4 byte) dell'intestazione dal campo
 * dimensione in poi, dimensione (vint), tipo = 5 (vint), flag (vint), flag di fine archivio (vint).
 * Esempio tipico: 1D 77 56 51 03 05 04 00. Il CRC32 rende trascurabile un riconoscimento per caso nei dati.
 */
function hasRar5End(tail: Buffer): boolean {
  for (let at = tail.length - 8; at >= 0; at--) {
    const size = readVint(tail, at + 4)
    if (!size || size.bytes > 3) continue
    const start = at + 4 + size.bytes
    const end = start + size.value
    if (size.value < 3 || end > tail.length) continue
    if (readVint(tail, start)?.value !== RAR5_END_TYPE) continue
    if (crc32(tail.subarray(at + 4, end)) === tail.readUInt32LE(at)) return true
  }
  return false
}

/** Intero a lunghezza variabile del RAR 5: 7 bit per byte, il bit alto indica che segue un altro byte. */
function readVint(buffer: Buffer, at: number): { value: number; bytes: number } | null {
  let value = 0
  for (let i = 0; i < 4 && at + i < buffer.length; i++) {
    const byte = buffer[at + i]!
    value += (byte & 0x7f) * 2 ** (7 * i)
    if (!(byte & 0x80)) return { value, bytes: i + 1 }
  }
  return null
}
