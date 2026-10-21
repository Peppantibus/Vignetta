/**
 * Pagine già scaricate e decodificate, pronte da mostrare senza attese.
 * Il limite è basso perché una pagina decodificata può occupare decine di MB.
 */
const MAX_IMAGES = 8
const cache = new Map<string, Promise<HTMLImageElement>>()

export function loadImage(url: string): Promise<HTMLImageElement> {
  let image = cache.get(url)
  if (image) {
    cache.delete(url) // reinserita in fondo: è la più recente
  } else {
    const element = new Image()
    // In modalità CORS (il protocollo la consente) i pixel restano leggibili: l'analisi dei bordi lavora sulla
    // stessa immagine già decodificata, senza chiedere la pagina una seconda volta al processo principale.
    element.crossOrigin = 'anonymous'
    element.src = url
    image = element.decode().then(() => element)
    image.catch(() => cache.delete(url))
  }
  cache.set(url, image)
  while (cache.size > MAX_IMAGES) cache.delete(cache.keys().next().value!)
  return image
}
