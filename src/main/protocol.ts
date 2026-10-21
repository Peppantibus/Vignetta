import { protocol } from 'electron'
import { PROTOCOL } from '../shared/api'
import type { BookService, ImageData } from './books'
import type { CoverService } from './covers'

/** Da chiamare prima di `app.ready`. */
export function registerSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: PROTOCOL, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])
}

/**
 * Serve le immagini all'interfaccia:
 *   vignetta://page/<id>/<indice>  una pagina
 *   vignetta://cover/<id>          la copertina ridotta
 */
export function handleImageProtocol(books: BookService, covers: CoverService): void {
  protocol.handle(PROTOCOL, async (request) => {
    const url = new URL(request.url)
    const [assetId = '', index = ''] = url.pathname.slice(1).split('/')
    const [id = '', revision] = assetId.split('~')
    try {
      let image: ImageData | null = null
      if (url.host === 'page') image = await books.page(id, Number(index), revision === undefined ? undefined : Number(revision))
      else if (url.host === 'cover') image = await covers.get(id)
      if (!image) return new Response(null, { status: 404 })

      return new Response(new Uint8Array(image.data), {
        // CORS: l'interfaccia legge i pixel delle pagine per riconoscere le tavole duplicate.
        headers: { 'content-type': image.mime, 'cache-control': 'max-age=31536000, immutable', 'access-control-allow-origin': '*' }
      })
    } catch (error) {
      console.warn(`Immagine non disponibile: ${request.url}`, error)
      return new Response(null, { status: 404 })
    }
  })
}
