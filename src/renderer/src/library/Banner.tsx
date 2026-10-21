import { useState } from 'react'
import { coverUrl, imageBookId } from '../../../shared/api'
import type { BookSummary } from '../../../shared/types'
import { Cover } from './BookCard'

/** La copertina di un albo, sfocata dal CSS dietro a fasce e riquadri; se manca resta lo sfondo sotto. */
export function BlurredCover({ book, className }: { book: BookSummary; className: string }): React.JSX.Element {
  return <BlurredImage key={imageBookId(book)} book={book} className={className} />
}

function BlurredImage({ book, className }: { book: BookSummary; className: string }): React.JSX.Element | null {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return <img className={className} src={coverUrl(imageBookId(book))} alt="" draggable={false} onError={() => setFailed(true)} />
}

interface BannerProps {
  /** L'albo in primo piano: la sua copertina sta a sinistra e, sfocata, sullo sfondo. */
  book: BookSummary
  /** Suggerimento della copertina, che apre l'albo come il pulsante principale. */
  coverTitle: string
  onOpen: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  /** Testo e pulsanti accanto alla copertina. */
  children: React.ReactNode
  /** Dopo il testo: a destra (es. gli altri albi in corso) o nell'angolo (pulsante per chiudere). */
  aside?: React.ReactNode
  /** Copertina più grande, quando la pagina parla di quel solo albo. */
  large?: boolean
}

/** Fascia in cima a una pagina della libreria: «Continua a leggere», pagina di un personaggio. */
export function Banner({ book, coverTitle, onOpen, onContextMenu, children, aside, large }: BannerProps): React.JSX.Element {
  return (
    <div className={large ? 'banner banner--large' : 'banner'} onContextMenu={onContextMenu}>
      <BlurredCover book={book} className="banner__backdrop" />
      <button className="banner__cover" onClick={onOpen} title={coverTitle} tabIndex={-1}>
        <Cover book={book} showStatus={false} />
      </button>
      <div className="banner__body">{children}</div>
      {aside}
    </div>
  )
}

/** Barra di avanzamento sotto il testo di una fascia (anche nelle miniature di «Anche in corso»). */
export function BannerBar({ value }: { value: number }): React.JSX.Element {
  return (
    <span className="banner__bar">
      <span style={{ width: `${value * 100}%` }} />
    </span>
  )
}
