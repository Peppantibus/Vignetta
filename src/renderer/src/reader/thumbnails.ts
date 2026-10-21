import { pageUrl } from '../../../shared/api'
import { createLimiter } from '../../../shared/limit'

/**
 * Miniature delle pagine per la panoramica. Mostrare le pagine originali rimpicciolite
 * occuperebbe decine di MB ciascuna una volta decodificate: le riduciamo invece con
 * createImageBitmap (fuori dal thread dell'interfaccia) e teniamo solo il piccolo risultato.
 */

const THUMB_WIDTH = 240
const MAX_THUMBNAILS = 600

const cache = new Map<string, Promise<string>>()
const limit = createLimiter(3)

/** URL (blob:) della miniatura di una pagina. */
export function pageThumbnail(bookId: string, page: number): Promise<string> {
  const key = `${bookId}/${page}`
  let thumbnail = cache.get(key)
  if (!thumbnail) {
    thumbnail = limit(() => render(pageUrl(bookId, page)))
    thumbnail.catch(() => cache.delete(key))
    cache.set(key, thumbnail)
    evictOldest()
  }
  return thumbnail
}

async function render(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob()
  const bitmap = await createImageBitmap(blob, { resizeWidth: THUMB_WIDTH, resizeQuality: 'high' })
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  bitmap.close()
  return URL.createObjectURL(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 }))
}

function evictOldest(): void {
  while (cache.size > MAX_THUMBNAILS) {
    const [key, thumbnail] = cache.entries().next().value!
    cache.delete(key)
    thumbnail.then(URL.revokeObjectURL, () => {})
  }
}
