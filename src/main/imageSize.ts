import type { PageSize } from '../shared/types'

/**
 * Dimensioni di un'immagine lette dalla sua intestazione, senza decodificarla.
 * Formati: JPEG (con la rotazione EXIF), PNG, GIF, WebP (VP8, VP8L, VP8X), BMP e AVIF.
 * Restituisce null se il formato non è riconosciuto o se i byte non bastano
 * (in quel caso si riprova con l'immagine intera).
 */
export function readImageSize(bytes: Uint8Array): PageSize | null {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  try {
    if (startsWith(bytes, [0xff, 0xd8])) return jpegSize(data)
    if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return [data.getUint32(16), data.getUint32(20)]
    if (ascii(bytes, 0, 4) === 'GIF8') return [data.getUint16(6, true), data.getUint16(8, true)]
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return webpSize(bytes, data)
    if (ascii(bytes, 0, 2) === 'BM') return [Math.abs(data.getInt32(18, true)), Math.abs(data.getInt32(22, true))]
    if (ascii(bytes, 4, 4) === 'ftyp') return avifSize(bytes, data)
  } catch {
    // RangeError: l'intestazione prosegue oltre i byte letti
  }
  return null
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, i) => bytes[i] === value)
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

/** Marcatori JPEG "Start Of Frame" che contengono le dimensioni (esclusi DHT, JPG e DAC). */
const isStartOfFrame = (marker: number): boolean => marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc

function jpegSize(data: DataView): PageSize | null {
  let orientation = 1
  let offset = 2
  while (offset + 4 <= data.byteLength) {
    if (data.getUint8(offset) !== 0xff) return null
    const marker = data.getUint8(offset + 1)
    if (marker === 0xff) {
      offset++ // byte di riempimento
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2 // marcatori senza contenuto
      continue
    }
    const length = data.getUint16(offset + 2)
    if (marker === 0xe1) orientation = exifOrientation(data, offset + 4) ?? orientation
    if (isStartOfFrame(marker)) {
      const height = data.getUint16(offset + 5)
      const width = data.getUint16(offset + 7)
      // Le foto ruotate tramite EXIF vengono mostrate ruotate dal browser: scambiamo i lati.
      return orientation >= 5 ? [height, width] : [width, height]
    }
    offset += 2 + length
  }
  return null
}

/** Orientamento EXIF (tag 0x0112) dal segmento APP1, se presente. */
function exifOrientation(data: DataView, start: number): number | null {
  if (data.getUint32(start) !== 0x45786966) return null // "Exif"
  const tiff = start + 6
  const little = data.getUint16(tiff) === 0x4949 // "II" = little endian, "MM" = big endian
  const directory = tiff + data.getUint32(tiff + 4, little)
  const entries = data.getUint16(directory, little)
  for (let i = 0; i < entries; i++) {
    const entry = directory + 2 + i * 12
    if (data.getUint16(entry, little) === 0x0112) return data.getUint16(entry + 8, little)
  }
  return null
}

function webpSize(bytes: Uint8Array, data: DataView): PageSize | null {
  switch (ascii(bytes, 12, 4)) {
    case 'VP8 ':
      return [data.getUint16(26, true) & 0x3fff, data.getUint16(28, true) & 0x3fff]
    case 'VP8L': {
      const bits = data.getUint32(21, true)
      return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1]
    }
    case 'VP8X':
      return [uint24(bytes, 24) + 1, uint24(bytes, 27) + 1]
    default:
      return null
  }
}

function uint24(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)
}

/** AVIF/HEIF: le dimensioni stanno nel box "ispe" (image spatial extents). */
function avifSize(bytes: Uint8Array, data: DataView): PageSize | null {
  for (let i = 8; i + 16 <= bytes.length; i++) {
    if (bytes[i] === 0x69 && ascii(bytes, i, 4) === 'ispe') return [data.getUint32(i + 8), data.getUint32(i + 12)]
  }
  return null
}
