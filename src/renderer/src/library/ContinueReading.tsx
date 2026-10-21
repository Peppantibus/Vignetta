import { COLLECTION_LABEL } from '../../../shared/collections'
import { displayTitleOf } from '../../../shared/series'
import type { BookSummary } from '../../../shared/types'
import { Play, X } from '../components/icons'
import { Banner, BannerBar } from './Banner'
import { Cover, titleHint } from './BookCard'
import { lastReadLabel, progressLabel, progressOf } from './books'

interface ContinueReadingProps {
  /** Dal più recente: il primo va in evidenza, gli altri nella riga accanto. */
  books: readonly BookSummary[]
  onOpen: (id: string) => void
  onMenu: (book: BookSummary, x: number, y: number) => void
  onHide: (id: string) => void
}

const menuHandler =
  (book: BookSummary, onMenu: ContinueReadingProps['onMenu']) =>
  (e: React.MouseEvent): void => {
    e.preventDefault()
    onMenu(book, e.clientX, e.clientY)
  }

/** «Continua a leggere»: una fascia con l'ultimo albo letto, sullo sfondo la sua copertina sfocata. */
export function ContinueReading({ books, onOpen, onMenu, onHide }: ContinueReadingProps): React.JSX.Element {
  const [main, ...others] = books as [BookSummary, ...BookSummary[]]
  const title = displayTitleOf(main)
  const facts = [
    main.collection ? COLLECTION_LABEL : null,
    progressLabel(main),
    main.lastReadAt ? `letto ${lastReadLabel(main.lastReadAt)}` : null
  ].filter(Boolean)

  return (
    <section className="continue" aria-labelledby="continue-heading">
      <Banner
        book={main}
        coverTitle={`Riprendi ${title}`}
        onOpen={() => onOpen(main.id)}
        onContextMenu={menuHandler(main, onMenu)}
        aside={
          <>
            {others.length > 0 && (
              <div className="continue__others">
                <p className="continue__others-title">Anche in corso</p>
                <div className="continue__row">
                  {others.map((book) => (
                    <ContinueThumb key={book.id} book={book} onOpen={onOpen} onMenu={onMenu} onHide={onHide} />
                  ))}
                </div>
              </div>
            )}
            <button
              className="icon-btn banner__close"
              title="Nascondi da Continua a leggere"
              aria-label={`Nascondi ${title} da Continua a leggere`}
              onClick={() => onHide(main.id)}
            >
              <X size={16} />
            </button>
          </>
        }
      >
        <p className="banner__eyebrow" id="continue-heading">
          Continua a leggere
        </p>
        <h2 className="banner__title" title={titleHint(main)}>
          {title}
        </h2>
        <p className="banner__meta">{facts.join(' · ')}</p>
        <BannerBar value={progressOf(main)} />
        <button className="btn btn--primary banner__action" onClick={() => onOpen(main.id)}>
          <Play size={15} />
          Riprendi
        </button>
      </Banner>
    </section>
  )
}

function ContinueThumb({ book, onOpen, onMenu, onHide }: Omit<ContinueReadingProps, 'books'> & { book: BookSummary }): React.JSX.Element {
  const title = displayTitleOf(book)
  return (
    <div className="continue-thumb" onContextMenu={menuHandler(book, onMenu)}>
      <button className="continue-thumb__open" onClick={() => onOpen(book.id)} title={`Riprendi ${title}`}>
        <Cover book={book} showStatus={false} />
        <BannerBar value={progressOf(book)} />
        <span className="continue-thumb__title">{title}</span>
      </button>
      <button className="icon-btn continue-thumb__hide" tabIndex={-1} title="Nascondi da Continua a leggere" aria-label={`Nascondi ${title} da Continua a leggere`} onClick={() => onHide(book.id)}>
        <X size={13} />
      </button>
    </div>
  )
}
