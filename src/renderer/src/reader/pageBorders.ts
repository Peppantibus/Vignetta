import { createLimiter } from '../../../shared/limit'
import { detectBorders, NO_BORDERS, type Borders } from './borders'
import { loadImage } from './imageCache'

/**
 * Bordi di una pagina, calcolati su una miniatura larga 400 px ricavata dalla stessa immagine che si mostra
 * (`loadImage`): la pagina si chiede al processo principale una volta sola. Il risultato è piccolo e resta in
 * memoria per la sessione.
 */

const ANALYSIS_WIDTH = 400
const MAX_ENTRIES = 2000

const cache = new Map<string, Promise<Borders>>()
const limit = createLimiter(2)

export function pageBorders(url: string): Promise<Borders> {
  let borders = cache.get(url)
  if (!borders) {
    // Nel dubbio (pagina illeggibile, formato non decodificabile) la pagina resta intera.
    borders = limit(() => analyse(url)).catch(() => NO_BORDERS)
    cache.set(url, borders)
    while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!)
  }
  return borders
}

async function analyse(url: string): Promise<Borders> {
  const bitmap = await createImageBitmap(await loadImage(url), { resizeWidth: ANALYSIS_WIDTH, resizeQuality: 'medium' })
  const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  return detectBorders(context.getImageData(0, 0, context.canvas.width, context.canvas.height))
}
