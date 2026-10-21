import { crc32 } from 'node:zlib'

/**
 * Archivi minimi ma completi, generati per i test (mai fumetti veri): hanno l'intestazione
 * e la struttura di chiusura che `isArchiveComplete` cerca. `filler` cambia contenuto e dimensione.
 */

/** ZIP vuoto: solo la fine della directory centrale, con `filler` come commento. */
export function completeZip(filler = ''): Buffer {
  const comment = Buffer.from(filler, 'latin1')
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(comment.length, 20)
  return Buffer.concat([end, comment])
}

/** RAR 4: firma, intestazione principale e blocco ENDARC (C4 3D 7B 00 40 07 00). */
export function completeRar4(filler = ''): Buffer {
  const main = rar4Block(0x73, 0x0000, Buffer.alloc(6))
  const data = Buffer.from(filler, 'latin1')
  // Un blocco commento-segnaposto (tipo 0x7A, ignorato dai lettori) porta il contenuto variabile.
  const extra = data.length ? rar4Block(0x7a, 0x4000, data) : Buffer.alloc(0)
  return Buffer.concat([Buffer.from('Rar!\x1a\x07\x00', 'latin1'), main, extra, rar4Block(0x7b, 0x4000, Buffer.alloc(0))])
}

/** RAR 5: firma, intestazione principale e blocco «end of archive» (… 03 05 04 00). */
export function completeRar5(filler = ''): Buffer {
  const main = rar5Block([1, 0, 0])
  const data = Buffer.from(filler, 'latin1')
  return Buffer.concat([Buffer.from('Rar!\x1a\x07\x01\x00', 'latin1'), main, data, rar5Block([5, 4, 0])])
}

/** PDF ridotto all'essenziale per il controllo: intestazione e marcatore finale. */
export function completePdf(filler = ''): Buffer {
  return Buffer.from(`%PDF-1.4\n${filler}\n%%EOF\n`, 'latin1')
}

function rar4Block(type: number, flags: number, body: Buffer): Buffer {
  const header = Buffer.alloc(7)
  header.writeUInt8(type, 2)
  header.writeUInt16LE(flags, 3)
  header.writeUInt16LE(7 + body.length, 5)
  const block = Buffer.concat([header, body])
  block.writeUInt16LE(crc32(block.subarray(2)) & 0xffff, 0)
  return block
}

/** Blocco RAR 5 con campi da un byte (valori sotto 128): CRC32, dimensione, tipo, flag, … */
function rar5Block(fields: number[]): Buffer {
  const sized = Buffer.from([fields.length, ...fields])
  const crc = Buffer.alloc(4)
  crc.writeUInt32LE(crc32(sized))
  return Buffer.concat([crc, sized])
}
