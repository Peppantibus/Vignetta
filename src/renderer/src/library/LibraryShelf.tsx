import { useMemo, useState } from 'react'
import type { SeriesGroup } from '../../../shared/series'
import type { BookSummary } from '../../../shared/types'
import { api } from '../api'
import { HardDrive, Layers } from '../components/icons'
import { BookCard, SeriesCard } from './BookCard'
import { canDeleteFromDisk, statusOf, type BookStatus } from './books'
import { Shelf } from './Shelf'
import { shelfItems, type ShelfItem, type Sort } from './shelfItems'

type Filter = 'all' | BookStatus

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tutti' },
  { value: 'reading', label: 'In corso' },
  { value: 'new', label: 'Da leggere' },
  { value: 'finished', label: 'Letti' }
]

export interface ShelfHandlers {
  onOpenBook: (id: string) => void
  onOpenSeries: (key: string) => void
  onMenu: (book: BookSummary, x: number, y: number) => void
  onSeriesMenu: (group: SeriesGroup, x: number, y: number) => void
}

interface LibraryShelfProps extends ShelfHandlers {
  title: string
  books: readonly BookSummary[]
  groupSeries: boolean
  /** Col filtro «Letti» si possono eliminare dal disco tutti gli albi letti di questo elenco. */
  onDeleteRead: (books: BookSummary[]) => void
}

/** Un elenco di albi con filtri per stato, pile delle serie e ordinamento: «La tua libreria», «Tutti i fumetti Marvel». */
export function LibraryShelf({ title, books, groupSeries, onDeleteRead, ...handlers }: LibraryShelfProps): React.JSX.Element {
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('title')
  const readOnDisk = useMemo(() => books.filter((b) => b.finished && canDeleteFromDisk(b)), [books])

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: books.length, new: 0, reading: 0, finished: 0 }
    for (const book of books) result[statusOf(book)]++
    return result
  }, [books])

  // Filtrando per stato si vedono i singoli albi, non le pile.
  const items = useMemo(
    () => (filter === 'all' ? shelfItems(books, groupSeries, sort) : shelfItems(books.filter((b) => statusOf(b) === filter), false, sort)),
    [books, groupSeries, filter, sort]
  )

  return (
    <section>
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        <div className="chips" role="tablist">
          {FILTERS.map((f) => (
            <button key={f.value} role="tab" aria-selected={filter === f.value} className="chip" onClick={() => setFilter(f.value)}>
              {f.label}
              <span className="chip__count">{counts[f.value]}</span>
            </button>
          ))}
        </div>
        <button
          className="chip chip--toggle"
          aria-pressed={groupSeries}
          onClick={() => void api.updateSettings({ groupSeries: !groupSeries })}
          title="Raccogli gli albi della stessa serie"
        >
          <Layers size={14} />
          Serie
        </button>
        {filter === 'finished' && readOnDisk.length > 0 && (
          <button className="chip chip--danger" onClick={() => onDeleteRead(readOnDisk)} title="Libera spazio: le schede restano in libreria con la cronologia">
            <HardDrive size={14} />
            Elimina tutti dal disco
            <span className="chip__count">{readOnDisk.length}</span>
          </button>
        )}
        <select className="sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordina">
          <option value="title">Titolo</option>
          <option value="recent">Letti di recente</option>
          <option value="added">Aggiunti di recente</option>
        </select>
      </div>
      <Shelf items={items} emptyMessage="Nessun fumetto in questo elenco." {...handlers} />
    </section>
  )
}

/** Una sola riga di copertine che scorre in orizzontale. */
export function BookRow({ items, onOpenBook, onOpenSeries, onMenu, onSeriesMenu }: ShelfHandlers & { items: readonly ShelfItem[] }): React.JSX.Element {
  return (
    <div className="book-row">
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
