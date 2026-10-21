import { useEffect, useRef, useState } from 'react'
import { applyOrder, moveBy, moveToTarget, reorderWithin } from '../../../shared/heroOrder'
import { displayTitleOf } from '../../../shared/series'
import type { BookSummary, Publisher } from '../../../shared/types'
import { ArrowLeft, CircleHelp, Play } from '../components/icons'
import { Banner, BannerBar, BlurredCover } from './Banner'
import { BookCard, Cover, titleHint } from './BookCard'
import { BookFacts, bookFacts } from './BookDetails'
import { nextToRead, progressLabel, progressOf, statusOf } from './books'
import { coverLayout, heroLayout } from './fitLayout'
import { shelfItems } from './shelfItems'
import { useAvailableSpace } from './useAvailableSpace'

/** I fumetti di un personaggio (o, con id NO_HERO, quelli senza personaggio riconosciuto). */
export interface HeroGroup {
  id: string
  name: string
  books: BookSummary[]
}

export const NO_HERO = '__none'

const COVERS_PER_TILE = 3
/** Spazi delle griglie, come `gap` in library.css (.hero-grid e .book-grid). */
const HERO_GAP = 22
const COVER_GAP = 22
const COVER_ROW_GAP = 38
/** Altezza della riga «Ordine di lettura» sopra le copertine, margine compreso. */
const TOOLBAR_SPACE = 56

const cardId = (bookId: string): string => `hero-book-${bookId}`
const KEY_OFFSETS: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1, Home: -Infinity, End: Infinity }

const DRAG_HELP = 'Trascina le copertine per scegliere il tuo ordine di lettura. Da tastiera: seleziona una copertina con Tab e spostala con Alt+frecce.'

function countLabel(books: readonly BookSummary[]): string {
  const read = books.filter((b) => b.finished).length
  const reading = books.filter((b) => statusOf(b) === 'reading').length
  const archived = books.filter((b) => b.missingSince).length
  return [
    `${books.length} ${books.length === 1 ? 'fumetto' : 'fumetti'}`,
    read > 0 ? `${read} letti` : null,
    reading > 0 ? `${reading} in corso` : null,
    archived > 0 ? `${archived} ${archived === 1 ? 'archiviato' : 'archiviati'}` : null
  ].filter(Boolean).join(' · ')
}

/** Il pulsante principale per un albo: riprende quello in corso, inizia uno nuovo, rilegge uno finito. */
function readAction(book: BookSummary): string {
  const status = statusOf(book)
  return status === 'reading' ? 'Riprendi' : status === 'finished' ? 'Rileggi' : 'Inizia'
}

const menuHandler =
  (book: BookSummary, onMenu: (book: BookSummary, x: number, y: number) => void) =>
  (e: React.MouseEvent): void => {
    e.preventDefault()
    onMenu(book, e.clientX, e.clientY)
  }

interface PublisherViewProps {
  publisher: Publisher
  heroes: readonly HeroGroup[]
  onOpenHero: (hero: HeroGroup) => void
  onMenu: (hero: HeroGroup, x: number, y: number) => void
}

/**
 * Un riquadro per ogni personaggio dell'editore, con le copertine dei suoi fumetti a ventaglio e, dietro, la prima
 * sfocata. Con un solo fumetto il riquadro lo apre direttamente: il sottotitolo dice a che punto è, come una copertina.
 * I riquadri riempiono lo spazio visibile e si rimpiccioliscono man mano che i personaggi aumentano (`heroLayout`).
 */
export function PublisherView({ publisher, heroes, onOpenHero, onMenu }: PublisherViewProps): React.JSX.Element {
  const gridRef = useRef<HTMLDivElement>(null)
  const space = useAvailableSpace(gridRef, heroes.length > 0)
  const layout = space && heroLayout(heroes.length, space.width, space.height, HERO_GAP)
  if (heroes.length === 0) return <p className="no-results">Nessun fumetto in questa categoria.</p>
  return (
    <div
      ref={gridRef}
      className={`hero-grid hero-grid--${publisher}${layout ? ' hero-grid--fitted' : ''}`}
      style={layout ? { gridTemplateColumns: `repeat(${layout.columns}, ${layout.width}px)`, gridAutoRows: `${layout.height}px` } : undefined}
    >
      {heroes.map((hero) => {
        const covers = coverBooks(hero.books)
        const single = hero.books.length === 1 ? hero.books[0]! : null
        const progress = hero.books.reduce((sum, book) => sum + progressOf(book), 0) / hero.books.length
        return (
          <button
            key={hero.id}
            className={`hero-tile${hero.id === NO_HERO ? ' hero-tile--none' : ''}`}
            onClick={() => onOpenHero(hero)}
            onContextMenu={(e) => {
              e.preventDefault()
              onMenu(hero, e.clientX, e.clientY)
            }}
            title={single ? `Leggi ${displayTitleOf(single)}` : `Apri ${hero.name}`}
          >
            <BlurredCover book={covers.at(-1)!} className="hero-tile__backdrop" />
            <span className={`hero-tile__covers${single ? ' hero-tile__covers--single' : ''}`}>
              {covers.map((book, i) => (
                // Posizione 0 = in primo piano, 1 e 2 = dietro, a sinistra e a destra.
                <span key={book.id} className={`hero-tile__cover hero-tile__cover--${covers.length - 1 - i}`}>
                  <Cover book={book} showStatus={false} />
                </span>
              ))}
            </span>
            <span className="hero-tile__name">{hero.name}</span>
            <span className="hero-tile__meta">{single ? progressLabel(single) : countLabel(hero.books)}</span>
            {progress > 0 && (
              <span className="hero-tile__progress" title={`${Math.round(progress * 100)}% letto`}>
                <span style={{ width: `${progress * 100}%` }} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Le copertine da mostrare: prima i fumetti in lettura, poi gli altri; gli archiviati (in grigio) per ultimi. */
function coverBooks(books: readonly BookSummary[]): BookSummary[] {
  const rank = (b: BookSummary): number => (b.missingSince ? 3 : statusOf(b) === 'reading' ? 0 : statusOf(b) === 'new' ? 1 : 2)
  // Il primo elemento è quello in primo piano: va disegnato per ultimo.
  return [...books].sort((a, b) => rank(a) - rank(b)).slice(0, COVERS_PER_TILE).reverse()
}

interface HeroViewProps {
  hero: HeroGroup
  publisherName: string
  /** Ordine di lettura personale salvato per questo personaggio (id dei fumetti). */
  order: readonly string[] | undefined
  onReorder: (ids: string[]) => void
  onBack: () => void
  onOpenBook: (id: string) => void
  onMenu: (book: BookSummary, x: number, y: number) => void
}

/**
 * La pagina di un personaggio: una fascia col prossimo albo da leggere nel proprio ordine e, sotto, tutti i fumetti in
 * un elenco piatto che si trascina per scegliere quell'ordine; le copertine sono grandi quando gli albi sono pochi.
 * Con un solo albo la pagina è la sua scheda. Gli archiviati (file eliminato dal disco) stanno in una sezione a parte:
 * il loro posto nell'ordine personale resta salvato e torna se l'albo viene ricollegato.
 */
export function HeroView({ hero, publisherName, order, onReorder, onBack, onOpenBook, onMenu }: HeroViewProps): React.JSX.Element {
  const ordered = applyOrder(
    shelfItems(hero.books, false).flatMap((item) => (item.kind === 'book' ? [item.book] : [])),
    order
  )
  const books = ordered.filter((book) => !book.missingSince)
  const archived = ordered.filter((book) => book.missingSince)
  const next = nextToRead(books)

  return (
    <section>
      <button className="btn btn--ghost series-view__back" onClick={onBack}>
        <ArrowLeft size={16} />
        {publisherName}
      </button>
      {books.length === 0 ? (
        <>
          <header className="hero-view__header">
            <p className="series-view__eyebrow">{publisherName}</p>
            <h1>{hero.name}</h1>
            <p className="series-view__meta">{countLabel(hero.books)}</p>
          </header>
          <p className="no-results">{archived.length ? 'Tutti i fumetti di questo personaggio sono archiviati.' : 'Nessun fumetto.'}</p>
        </>
      ) : books.length === 1 ? (
        <SingleBook book={books[0]!} heading={`${publisherName} · ${hero.name}`} onOpenBook={onOpenBook} onMenu={onMenu} />
      ) : (
        <>
          <HeroBanner hero={hero} publisherName={publisherName} featured={next ?? books[0]!} next={next} onOpenBook={onOpenBook} onMenu={onMenu} />
          <ReadingOrder
            books={books}
            next={next}
            ordered={ordered}
            custom={Boolean(order?.length)}
            onReorder={onReorder}
            onOpenBook={onOpenBook}
            onMenu={onMenu}
          />
        </>
      )}
      {archived.length > 0 && (
        <section className="hero-view__archived">
          <h2 className="section-title section-title--spaced">
            Archiviati <span className="section-title__count">{archived.length}</span>
          </h2>
          <div className="book-grid">
            {archived.map((book) => (
              <BookCard key={book.id} book={book} onOpen={onOpenBook} onMenu={onMenu} />
            ))}
          </div>
        </section>
      )}
    </section>
  )
}

interface HeroBannerProps {
  hero: HeroGroup
  publisherName: string
  /** L'albo mostrato nella fascia: il prossimo, o il primo se sono tutti letti. */
  featured: BookSummary
  next: BookSummary | null
  onOpenBook: (id: string) => void
  onMenu: (book: BookSummary, x: number, y: number) => void
}

/** Fascia della pagina: nome, numeri e il pulsante per riprendere il percorso di lettura da dove si era rimasti. */
function HeroBanner({ hero, publisherName, featured, next, onOpenBook, onMenu }: HeroBannerProps): React.JSX.Element {
  const title = displayTitleOf(featured)
  return (
    <Banner book={featured} coverTitle={`${next ? readAction(featured) : 'Rileggi'} ${title}`} onOpen={() => onOpenBook(featured.id)} onContextMenu={menuHandler(featured, onMenu)}>
      <p className="banner__eyebrow">{publisherName}</p>
      <h1 className="banner__title">{hero.name}</h1>
      <p className="banner__meta">{countLabel(hero.books)}</p>
      <p className="banner__next">
        {next ? (
          <>
            {statusOf(next) === 'reading' ? 'Stai leggendo' : 'Prossimo'}: <strong title={titleHint(next)}>{title}</strong> · {progressLabel(next)}
          </>
        ) : (
          'Hai letto tutti i suoi fumetti.'
        )}
      </p>
      {next && statusOf(next) === 'reading' && <BannerBar value={progressOf(next)} />}
      <button className="btn btn--primary banner__action" onClick={() => onOpenBook(featured.id)}>
        <Play size={15} />
        {next ? readAction(next) : 'Rileggi dal primo'}
      </button>
    </Banner>
  )
}

interface SingleBookProps {
  book: BookSummary
  heading: string
  onOpenBook: (id: string) => void
  onMenu: (book: BookSummary, x: number, y: number) => void
}

/** Un personaggio con un solo albo: la pagina diventa la scheda di quell'albo, con trama e autori se ci sono. */
function SingleBook({ book, heading, onOpenBook, onMenu }: SingleBookProps): React.JSX.Element {
  const title = displayTitleOf(book)
  const metadata = book.metadata
  const facts = bookFacts(book).filter(([label]) => label !== 'Lettura')
  return (
    <>
      <Banner large book={book} coverTitle={`${readAction(book)} ${title}`} onOpen={() => onOpenBook(book.id)} onContextMenu={menuHandler(book, onMenu)}>
        <p className="banner__eyebrow">{heading}</p>
        <h1 className="banner__title" title={titleHint(book)}>
          {title}
        </h1>
        {metadata?.title && metadata.title !== title && <p className="banner__meta">«{metadata.title}»</p>}
        <p className="banner__meta">{statusOf(book) === 'new' ? 'Da leggere' : progressLabel(book)}</p>
        {statusOf(book) === 'reading' && <BannerBar value={progressOf(book)} />}
        <button className="btn btn--primary banner__action" onClick={() => onOpenBook(book.id)}>
          <Play size={15} />
          {readAction(book)}
        </button>
      </Banner>
      <div className="hero-view__details">
        <BookFacts facts={facts} />
        {metadata?.summary ? (
          <p className="details__summary">{metadata.summary}</p>
        ) : (
          <p className="details__hint">
            {metadata ? 'Il file non contiene una trama.' : 'Questo file non contiene metadati (ComicInfo.xml): trama e autori non sono disponibili.'}
          </p>
        )}
      </div>
    </>
  )
}

interface ReadingOrderProps {
  /** Gli albi sul disco, nell'ordine di lettura. */
  books: BookSummary[]
  next: BookSummary | null
  /** Tutti gli albi in ordine, archiviati compresi: servono per salvare l'ordine senza perderne il posto. */
  ordered: BookSummary[]
  custom: boolean
  onReorder: (ids: string[]) => void
  onOpenBook: (id: string) => void
  onMenu: (book: BookSummary, x: number, y: number) => void
}

/** L'ordine di lettura: copertine trascinabili (anche con Alt+frecce), grandi quando sono poche. */
function ReadingOrder({ books, next, ordered, custom, onReorder, onOpenBook, onMenu }: ReadingOrderProps): React.JSX.Element {
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  // Si misura il contenitore esterno, largo quanto la pagina: quello interno si stringe sulle copertine.
  const areaRef = useRef<HTMLDivElement>(null)
  const space = useAvailableSpace(areaRef)
  const layout = space && coverLayout(books.length, space.width, space.height - TOOLBAR_SPACE, COVER_GAP, COVER_ROW_GAP)
  const ids = books.map((book) => book.id)
  const save = (nextOrder: string[] | null): void => {
    if (nextOrder) onReorder(reorderWithin(ordered.map((book) => book.id), nextOrder))
  }
  const endDrag = (): void => {
    setDragging(null)
    setOver(null)
  }
  const drop = (target: string): void => {
    save(dragging ? moveToTarget(ids, dragging, target) : null)
    endDrag()
  }

  // Da tastiera: Alt+frecce sposta la copertina selezionata, Alt+Home/Fine al primo o all'ultimo posto.
  // Il fuoco torna sulla copertina spostata quando arriva il nuovo ordine.
  const refocus = useRef<string | null>(null)
  const sequence = ids.join()
  useEffect(() => {
    if (!refocus.current) return
    document.getElementById(cardId(refocus.current))?.focus()
    refocus.current = null
  }, [sequence])
  const onCardKey = (e: React.KeyboardEvent, id: string): void => {
    const offset = KEY_OFFSETS[e.key]
    if (!e.altKey || offset === undefined) return
    e.preventDefault()
    const moved = moveBy(ids, id, offset)
    if (!moved) return
    refocus.current = id
    save(moved)
  }

  return (
    <div ref={areaRef}>
      <div className="hero-view__order" style={layout ? { maxWidth: layout.columns * layout.width + (layout.columns - 1) * COVER_GAP } : undefined}>
        <div className="hero-view__toolbar">
          <h2 className="section-title">Ordine di lettura</h2>
          <span className="hero-view__help" title={DRAG_HELP} role="img" aria-label={DRAG_HELP}>
            <CircleHelp size={17} />
          </span>
          {custom && (
            <button className="btn btn--ghost" onClick={() => onReorder([])}>
              Ripristina ordine automatico
            </button>
          )}
        </div>
        <div
          className={`book-grid${layout ? ' book-grid--fitted' : ''}`}
          style={layout ? { gridTemplateColumns: `repeat(${layout.columns}, ${layout.width}px)` } : undefined}
        >
          {books.map((book, index) => (
            <BookCard
              key={book.id}
              book={book}
              onOpen={onOpenBook}
              onMenu={onMenu}
              position={custom ? index + 1 : undefined}
              next={book.id === next?.id}
              className={`${dragging === book.id ? 'book-card--dragging' : ''}${over === book.id && dragging !== book.id ? ' book-card--over' : ''}`.trim()}
              dragProps={{
                id: cardId(book.id),
                onKeyDown: (e) => onCardKey(e, book.id),
                draggable: true,
                onDragStart: (e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', book.id)
                  setDragging(book.id)
                },
                onDragOver: (e) => {
                  if (!dragging) return
                  e.preventDefault()
                  setOver(book.id)
                },
                onDrop: (e) => {
                  e.preventDefault()
                  drop(book.id)
                },
                onDragEnd: endDrag
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
