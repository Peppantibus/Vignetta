import { displayTitleOf, issueNumberOf, seriesNameOf } from '../../../shared/series'
import type { BookKind, BookSummary, ComicMetadata } from '../../../shared/types'
import { api } from '../api'
import { BookOpen, FolderOpen, Pencil, X } from '../components/icons'
import { useWindowEvent } from '../hooks'
import { Cover } from './BookCard'
import { formatDate, progressLabel, statusOf } from './books'

const FORMATS: Record<BookKind, string> = { zip: 'CBZ', rar: 'CBR', pdf: 'PDF', folder: 'Cartella di immagini', collection: 'Volume virtuale' }

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

/** Campi dei metadati mostrati come elenco, nell'ordine dei crediti di un albo. */
const CREDITS: [keyof ComicMetadata, string][] = [
  ['writer', 'Testi'],
  ['penciller', 'Disegni'],
  ['inker', 'Chine'],
  ['colorist', 'Colori'],
  ['letterer', 'Lettering'],
  ['coverArtist', 'Copertina'],
  ['editor', 'Curatore'],
  ['publisher', 'Editore'],
  ['genre', 'Genere']
]

/** Crediti, uscita, pagine, formato, lettura e stato del file, come coppie «etichetta, valore». */
export function bookFacts(book: BookSummary): [string, string][] {
  const metadata = book.metadata
  const facts: [string, string][] = []
  for (const [field, label] of CREDITS) {
    const value = metadata?.[field]
    if (typeof value === 'string') facts.push([label, value])
  }
  if (metadata?.year) facts.push(['Uscita', metadata.month ? `${MONTHS[metadata.month - 1] ?? ''} ${metadata.year}`.trim() : String(metadata.year)])
  if (book.pageCount) facts.push(['Pagine', String(book.pageCount)])
  facts.push(['Formato', FORMATS[book.kind]], ['Lettura', statusOf(book) === 'new' ? 'Da leggere' : progressLabel(book)])
  if (book.missingSince) facts.push(['File', `Archiviato dal ${formatDate(book.missingSince)} (non più sul disco)`])
  return facts
}

/** Elenco dei dati di un fumetto (vedi `bookFacts`). */
export function BookFacts({ facts }: { facts: readonly [string, string][] }): React.JSX.Element {
  return (
    <dl className="details__facts">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

interface BookDetailsProps {
  book: BookSummary
  onRead: (id: string) => void
  onClose: () => void
  onRename: (book: BookSummary) => void
}

/** Scheda di un fumetto: crediti, trama e dati del file. */
export function BookDetails({ book, onRead, onClose, onRename }: BookDetailsProps): React.JSX.Element {
  useWindowEvent('keydown', (e) => e.key === 'Escape' && onClose())
  const metadata = book.metadata
  const title = displayTitleOf(book)
  const issue = issueNumberOf(book)

  return (
    <div className="dialog-backdrop" onPointerDown={onClose}>
      <section className="dialog details" role="dialog" aria-label={`Dettagli di ${title}`} onPointerDown={(e) => e.stopPropagation()}>
        <button className="icon-btn details__close" onClick={onClose} aria-label="Chiudi">
          <X size={18} />
        </button>

        <div className="details__layout">
          <div className="details__cover">
            <Cover book={book} />
          </div>
          <div className="details__body">
            <p className="details__eyebrow">
              {seriesNameOf(book)}
              {issue && ` · n. ${issue}`}
            </p>
            <h2>{title}</h2>
            {metadata?.title && metadata.title !== title && <p className="details__story">«{metadata.title}»</p>}

            <BookFacts facts={bookFacts(book)} />

            {metadata?.summary && <p className="details__summary">{metadata.summary}</p>}
            {!metadata && <p className="details__hint">{book.customTitle ? 'Titolo scelto nella libreria. Questo file non contiene metadati (ComicInfo.xml).' : 'Questo file non contiene metadati (ComicInfo.xml): titolo e serie sono ricavati dal nome del file.'}</p>}
            <p className="details__path" title={book.path}>
              {book.path}
            </p>
          </div>
        </div>

        <footer className="dialog__footer">
          <button className="btn btn--ghost" onClick={() => onRename(book)}><Pencil size={16} />Rinomina…</button>
          {!book.missingSince && (
            <button className="btn btn--ghost" onClick={() => void api.showInFolder(book.id)}>
              <FolderOpen size={16} />
              Mostra in Esplora file
            </button>
          )}
          <button className="btn btn--primary" onClick={() => onRead(book.id)} autoFocus>
            <BookOpen size={16} />
            Leggi
          </button>
        </footer>
      </section>
    </div>
  )
}
