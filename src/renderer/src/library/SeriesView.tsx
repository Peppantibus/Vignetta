import { issueNumberOf, type SeriesGroup } from '../../../shared/series'
import type { BookSummary } from '../../../shared/types'
import { ArrowLeft, BookOpen } from '../components/icons'
import { BookCard, Cover, featuredIssue, seriesProgressLabel } from './BookCard'
import { statusOf } from './books'
import { collectionEdition } from './CollectionDialog'

interface SeriesViewProps {
  group: SeriesGroup
  onBack: () => void
  onOpenBook: (id: string) => void
  onMenu: (book: BookSummary, x: number, y: number) => void
  onCreate: (group: SeriesGroup) => void
}

/** Tutti gli albi di una serie, in ordine, con il pulsante per riprendere da dove si era rimasti. */
export function SeriesView({ group, onBack, onOpenBook, onMenu, onCreate }: SeriesViewProps): React.JSX.Element {
  const featured = featuredIssue(group)
  const issue = issueNumberOf(featured)
  const allRead = group.books.every((b) => b.finished)
  const action = allRead
    ? { label: 'Rileggi dal primo', book: group.books[0]! }
    : statusOf(featured) === 'reading'
      ? { label: issue ? `Continua il n. ${issue}` : 'Continua', book: featured }
      : { label: issue ? `Inizia dal n. ${issue}` : 'Inizia', book: featured }

  // Dettagli comuni presi dai metadati, se presenti.
  const withMetadata = group.books.find((b) => b.metadata)?.metadata
  const facts = [withMetadata?.publisher, yearsOf(group)].filter(Boolean).join(' · ')

  return (
    <section className="series-view">
      <button className="btn btn--ghost series-view__back" onClick={onBack}>
        <ArrowLeft size={16} />
        Libreria
      </button>

      <header className="series-view__hero">
        <div className="series-view__cover">
          <Cover book={featured} showStatus={false} />
        </div>
        <div className="series-view__info">
          <p className="series-view__eyebrow">Serie</p>
          <h1>{group.name}</h1>
          <p className="series-view__meta">
            {seriesProgressLabel(group)}
            {facts && ` · ${facts}`}
          </p>
          <button className="btn btn--primary" onClick={() => onOpenBook(action.book.id)}>
            <BookOpen size={16} />
            {action.label}
          </button>
          {collectionEdition(group) && <button className="btn" onClick={() => onCreate(group)}>Crea {collectionEdition(group)}</button>}
        </div>
      </header>

      <div className="book-grid">
        {group.books.map((book) => (
          <BookCard key={book.id} book={book} issue={issueNumberOf(book)} onOpen={onOpenBook} onMenu={onMenu} />
        ))}
      </div>
    </section>
  )
}

function yearsOf(group: SeriesGroup): string | null {
  const years = group.books.map((b) => b.metadata?.year).filter((y): y is number => y !== undefined)
  if (years.length === 0) return null
  const first = Math.min(...years)
  const last = Math.max(...years)
  return first === last ? String(first) : `${first}–${last}`
}
