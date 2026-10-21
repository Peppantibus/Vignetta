import { pageUrl } from '../../../shared/api'
import { splitSpreadCandidates } from '../../../shared/layout'
import type { PageSize } from '../../../shared/types'

/**
 * Riconosce le tavole doppie seguite nel file dalle loro due metà (tipico degli scan "C2C").
 * Ogni metà della tavola e la pagina corrispondente vengono ridotte a una piccola miniatura
 * in scala di grigi e confrontate con la correlazione, che ignora luminosità e contrasto:
 * spesso la tavola intera e le metà sono scansioni con colori diversi.
 *
 * Soglia tarata su 9 fumetti reali: le metà vere stanno sopra 0,70, le pagine diverse sotto 0,40.
 */

const THUMB_WIDTH = 32
const THUMB_HEIGHT = 48
/** Correlazione minima perché due miniature siano considerate lo stesso disegno. */
const SAME_IMAGE_MIN_CORRELATION = 0.55

type Thumbnail = Float32Array

interface Crop {
  x: number
  y: number
  width: number
  height: number
}

export async function detectSplitSpreads(bookId: string, sizes: readonly (PageSize | null)[]): Promise<number[]> {
  const found: number[] = []
  // Ogni pagina si scarica una volta sola, anche se serve a due tavole vicine (la seconda metà di una è la tavola dopo).
  const blobs = new Map<number, Promise<Blob>>()
  const blobOf = (page: number): Promise<Blob> => {
    let blob = blobs.get(page)
    if (!blob) blobs.set(page, (blob = pageBlob(pageUrl(bookId, page))))
    return blob
  }
  for (const index of splitSpreadCandidates(sizes)) {
    for (const page of blobs.keys()) if (page < index) blobs.delete(page) // le tavole sono in ordine: queste non servono più
    try {
      if ((await halvesSimilarity(blobOf, index, sizes[index]!)) >= SAME_IMAGE_MIN_CORRELATION) found.push(index)
    } catch {
      // pagina illeggibile: nel dubbio la tavola resta com'è
    }
  }
  return found
}

/** Quanto le due pagine dopo la tavola somigliano alle sue metà (in entrambi gli ordini, per i manga). */
async function halvesSimilarity(blobOf: (page: number) => Promise<Blob>, index: number, [width, height]: PageSize): Promise<number> {
  const half = Math.floor(width / 2)
  // Le due metà sono ritagli della stessa immagine.
  const [spread, next, afterNext] = await Promise.all([blobOf(index), blobOf(index + 1), blobOf(index + 2)])
  const [first, second] = await Promise.all([thumbnail(next), thumbnail(afterNext)])
  const [left, right] = await Promise.all([
    thumbnail(spread, { x: 0, y: 0, width: half, height }),
    thumbnail(spread, { x: half, y: 0, width: width - half, height })
  ])
  // Entrambe le metà devono somigliare: conta la peggiore delle due.
  const inOrder = Math.min(correlation(left, first), correlation(right, second))
  const reversed = Math.min(correlation(right, first), correlation(left, second))
  return Math.max(inOrder, reversed)
}

async function pageBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob()
}

async function thumbnail(blob: Blob, crop?: Crop): Promise<Thumbnail> {
  // createImageBitmap decodifica e riduce fuori dal thread dell'interfaccia.
  const options: ImageBitmapOptions = { resizeWidth: THUMB_WIDTH, resizeHeight: THUMB_HEIGHT, resizeQuality: 'medium' }
  const bitmap = crop
    ? await createImageBitmap(blob, crop.x, crop.y, crop.width, crop.height, options)
    : await createImageBitmap(blob, options)

  const context = new OffscreenCanvas(THUMB_WIDTH, THUMB_HEIGHT).getContext('2d')!
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const { data } = context.getImageData(0, 0, THUMB_WIDTH, THUMB_HEIGHT)

  const gray = new Float32Array(THUMB_WIDTH * THUMB_HEIGHT)
  for (let i = 0; i < gray.length; i++) gray[i] = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!
  return gray
}

/** Correlazione di Pearson: 1 = stesso disegno, 0 = nessuna relazione. */
function correlation(a: Thumbnail, b: Thumbnail): number {
  const n = a.length
  let meanA = 0
  let meanB = 0
  for (let i = 0; i < n; i++) {
    meanA += a[i]!
    meanB += b[i]!
  }
  meanA /= n
  meanB /= n

  let covariance = 0
  let varianceA = 0
  let varianceB = 0
  for (let i = 0; i < n; i++) {
    const x = a[i]! - meanA
    const y = b[i]! - meanB
    covariance += x * y
    varianceA += x * x
    varianceB += y * y
  }
  // Una pagina uniforme (es. tutta bianca) non ha forma da confrontare.
  return varianceA > 0 && varianceB > 0 ? covariance / Math.sqrt(varianceA * varianceB) : 0
}
