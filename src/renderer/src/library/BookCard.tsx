import { useState } from 'react'
import { coverUrl, imageBookId } from '../../../shared/api'
import { editionName } from '../../../shared/collections'
import { displayTitleOf, readingDirectionOf, type SeriesGroup } from '../../../shared/series'
import type { BookSummary } from '../../../shared/types'
import { Check, Ellipsis, HardDrive, Layers, Play } from '../components/icons'
import { hueOf, nextToRead, progressLabel, progressOf, statusOf, type BookStatus } from './books'

/** Copertine già mostrate in questa sessione: tornando alla libreria compaiono subito, senza dissolvenza. */
const loadedCovers = new Set<string>()

interface CoverProps {
  book: BookSummary
  /** Etichette e avanzamento del singolo albo (nascosti nelle pile delle serie). */
  showStatus?: boolean
}

/**
 * Copertina con segnaposto colorato finché l'immagine non è pronta (o se non è disponibile).
 * Quando cambia il numero di pagine (es. un albo letto per intero dopo un download finito) una copertina
 * mancante viene richiesta di nuovo; quelle già mostrate restano in cache.
 */
export function Cover({ book, showStatus = true }: CoverProps): React.JSX.Element {
  return <CoverImage key={`${imageBookId(book)}|${book.pageCount ?? ''}`} book={book} showStatus={showStatus} />
}

function CoverImage({ book, showStatus }: CoverProps): React.JSX.Element {
  const assetId = imageBookId(book)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>(() => (loadedCovers.has(assetId) ? 'ready' : 'loading'))
  const status = statusOf(book)

  return (
    <div
      className={`cover${book.missingSince ? ' is-missing' : ''}${showStatus && status === 'finished' ? ' is-finished' : ''}`}
      style={{ '--hue': hueOf(book.id) } as React.CSSProperties}
    >
      {state !== 'ready' && <div className="cover__placeholder">{state === 'missing' && <span>{displayTitleOf(book)}</span>}</div>}
      {state !== 'missing' && (
        <img
          className={`cover__image${state === 'ready' ? ' is-ready' : ''}`}
          src={coverUrl(imageBookId(book))}
          alt=""
          loading="lazy"
          draggable={false}
          onLoad={() => {
            loadedCovers.add(assetId)
            setState('ready')
          }}
          onError={() => setState('missing')}
        />
      )}
      {showStatus && !book.collection && readingDirectionOf(book, 'ltr') === 'rtl' && <span className="cover__badge cover__badge--manga">Manga</span>}
      {showStatus && book.collection && <span className="cover__badge">{editionName(book.collection.edition)}</span>}
      {showStatus && status === 'finished' && (
        <span className="cover__done" title="Letto">
          <Check size={14} strokeWidth={3} />
        </span>
      )}
      {showStatus && status === 'reading' && <ProgressBar value={progressOf(book)} />}
      {showStatus && book.missingSince && (
        <span className="cover__missing" title="Archiviato: il file non è più sul disco, progressi e stato restano qui">
          <HardDrive size={12} />
          Archiviato
        </span>
      )}
    </div>
  )
}

function ProgressBar({ value }: { value: number }): React.JSX.Element {
  return (
    <div className="cover__progress">
      <div style={{ width: `${value * 100}%` }} />
    </div>
  )
}

interface BookCardProps {
  book: BookSummary
  onOpen: (id: string) => void
  onMenu: (book: BookSummary, x: number, y: number) => void
  /** Numero dell'albo, mostrato nella vista di una serie. */
  issue?: string | null
  /** Classi aggiuntive e gestori del trascinamento, per le griglie riordinabili. */
  className?: string
  /** Posizione nell'ordine di lettura personale, mostrata sulla copertina. */
  position?: number
  /** Il prossimo albo da leggere nel percorso (pagina di un personaggio): bordo arancione e «Prossimo». */
  next?: boolean
  dragProps?: React.ButtonHTMLAttributes<HTMLButtonElement>
}

const READ_LABELS: Record<BookStatus, string> = { new: 'Leggi', reading: 'Riprendi', finished: 'Rileggi' }

/** Il nome del file nel suggerimento, se il titolo mostrato è stato ripulito o scelto a mano. */
export function titleHint(book: BookSummary): string {
  const title = displayTitleOf(book)
  return title === book.title ? title : `${title}
${book.title}`
}

/**
 * Un albo nella griglia. Al passaggio del mouse compaiono «Leggi» e «⋯» (lo stesso menu del tasto destro):
 * sono fratelli del pulsante principale, perché un pulsante non può contenerne altri, e restano fuori
 * dall'ordine di Tab, così la tastiera passa da una copertina all'altra come prima.
 */
export function BookCard({ book, onOpen, onMenu, issue, className, position, next, dragProps }: BookCardProps): React.JSX.Element {
  const title = displayTitleOf(book)
  const label = [position !== undefined ? `${position}º` : null, next ? 'Prossimo' : null].filter(Boolean).join(' · ')
  return (
    <div
      className={['book-card', next ? 'book-card--next' : null, className].filter(Boolean).join(' ')}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(book, e.clientX, e.clientY)
      }}
    >
      <button {...dragProps} className="book-card__open" onClick={() => onOpen(book.id)} title={titleHint(book)}>
        <Cover book={book} />
        {issue && <span className="book-card__issue">N. {issue}</span>}
        {label && <span className="book-card__issue">{label}</span>}
        <span className="book-card__title">{title}</span>
        <span className="book-card__meta">{progressLabel(book)}</span>
      </button>
      <span className="book-card__actions">
        {!book.missingSince && (
          <button className="book-card__read" tabIndex={-1} onClick={() => onOpen(book.id)}>
            <Play size={12} />
            {READ_LABELS[statusOf(book)]}
          </button>
        )}
        <button
          className="book-card__more"
          tabIndex={-1}
          title="Altre azioni"
          aria-label={`Altre azioni per ${title}`}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            onMenu(book, rect.left, rect.bottom + 4)
          }}
        >
          <Ellipsis size={18} />
        </button>
      </span>
    </div>
  )
}

/** L'albo da proporre per una serie: quello in corso più recente, poi il primo non letto (tra quelli sul disco). */
export function featuredIssue(group: SeriesGroup): BookSummary {
  return nextToRead(group.books.filter((b) => !b.missingSince)) ?? group.books[0]!
}

export function seriesProgressLabel(group: SeriesGroup): string {
  const read = group.books.filter((b) => b.finished).length
  const total = group.books.length
  if (read === total) return `${total} albi · tutti letti`
  return read > 0 ? `${total} albi · ${read} letti` : `${total} albi`
}

/** Una serie in libreria: la copertina dell'albo da leggere, con gli altri impilati dietro. */
export function SeriesCard({ group, onOpen, onMenu }: { group: SeriesGroup; onOpen: (key: string) => void; onMenu?: (group: SeriesGroup, x: number, y: number) => void }): React.JSX.Element {
  const read = group.books.filter((b) => b.finished).length
  return (
    <button className="book-card series-card" onClick={() => onOpen(group.key)} title={group.name} onContextMenu={(event) => { event.preventDefault(); onMenu?.(group, event.clientX, event.clientY) }}>
      <span className="series-card__stack">
        <Cover book={featuredIssue(group)} showStatus={false} />
        <span className="series-card__count">
          <Layers size={12} />
          {group.books.length}
        </span>
        {read > 0 && <ProgressBar value={read / group.books.length} />}
      </span>
      <span className="book-card__title">{group.name}</span>
      <span className="book-card__meta">{seriesProgressLabel(group)}</span>
    </button>
  )
}
