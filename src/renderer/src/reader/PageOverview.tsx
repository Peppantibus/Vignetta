import { useEffect, useRef, useState } from 'react'
import { aspectOf, type Spread } from '../../../shared/layout'
import type { PageSize, ReadingDirection } from '../../../shared/types'
import { X } from '../components/icons'
import { pageThumbnail } from './thumbnails'

interface PageOverviewProps {
  bookId: string
  spreads: readonly Spread[]
  currentIndex: number
  sizes: readonly (PageSize | null)[]
  direction: ReadingDirection
  onSelect: (spreadIndex: number) => void
  onClose: () => void
}

/** Griglia di tutte le schermate dell'albo, per saltare a un punto preciso. */
export function PageOverview({ bookId, spreads, currentIndex, sizes, direction, onSelect, onClose }: PageOverviewProps): React.JSX.Element {
  const currentRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center' })
    currentRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div className="overview" role="dialog" aria-label="Panoramica delle pagine">
      <header className="overview__header">
        <h2>Pagine</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Chiudi">
          <X size={20} />
        </button>
      </header>
      <div className="overview__grid">
        {spreads.map((spread, index) => (
          <button
            key={spread.pages.join('-')}
            ref={index === currentIndex ? currentRef : undefined}
            className={`overview__item${index === currentIndex ? ' is-current' : ''}`}
            onClick={() => onSelect(index)}
          >
            {/* Nei manga le pagine di una coppia vanno da destra a sinistra; la griglia resta nel verso consueto. */}
            <span className="overview__pages" dir={direction}>
              {spread.pages.map((page) => (
                <Thumbnail key={page} bookId={bookId} page={page} aspect={aspectOf(sizes[page])} />
              ))}
            </span>
            <span className="overview__label">{spread.pages.map((p) => p + 1).join('–')}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Miniatura generata solo quando sta per entrare nella zona visibile. */
function Thumbnail({ bookId, page, aspect }: { bookId: string; page: number; aspect: number }): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    let cancelled = false
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        observer.disconnect()
        pageThumbnail(bookId, page).then(
          (url) => !cancelled && setSrc(url),
          () => {}
        )
      },
      { rootMargin: '400px' }
    )
    observer.observe(element)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [bookId, page])

  return (
    <span ref={ref} className="overview__thumb" style={{ aspectRatio: aspect }}>
      {src && <img src={src} alt="" draggable={false} />}
    </span>
  )
}
