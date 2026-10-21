import type { BookSummary } from '../../../shared/types'
import type { SeriesGroup } from '../../../shared/series'
import { BookCard, SeriesCard } from './BookCard'
import type { ShelfItem } from './shelfItems'

interface ShelfProps {
  items: readonly ShelfItem[]
  emptyMessage: string
  onOpenBook: (id: string) => void
  onOpenSeries: (key: string) => void
  onMenu: (book: BookSummary, x: number, y: number) => void
  onSeriesMenu?: (group: SeriesGroup, x: number, y: number) => void
}

/** Griglia di copertine: fumetti singoli e serie raccolte in pile. */
export function Shelf({ items, emptyMessage, onOpenBook, onOpenSeries, onMenu, onSeriesMenu }: ShelfProps): React.JSX.Element {
  if (items.length === 0) return <p className="no-results">{emptyMessage}</p>
  return (
    <div className="book-grid">
      {items.map((item) =>
        item.kind === 'series' ? (
          <SeriesCard key={item.group.key} group={item.group} onOpen={onOpenSeries} onMenu={onSeriesMenu} />
        ) : (
          <BookCard key={item.book.id} book={item.book} onOpen={onOpenBook} onMenu={onMenu} />
        )
      )}
    </div>
  )
}
