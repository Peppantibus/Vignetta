import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { pageUrl } from '../../../shared/api'
import { fitSpread, type Box, type Spread } from '../../../shared/layout'
import type { FitMode, PageSize, ReadingDirection } from '../../../shared/types'
import { useElementSize } from '../hooks'
import { croppedAspect, hasBorders, NO_BORDERS, pairBorders, type Borders } from './borders'
import { loadImage } from './imageCache'
import { pageBorders } from './pageBorders'
import type { ZoomOrigin } from './useZoom'

export type ScrollEntry = 'start' | 'end'

/** Spostamento minimo (px) perché un trascinamento non valga come clic. */
const DRAG_THRESHOLD = 5

interface StageProps {
  bookId: string
  spread: Spread
  sizes: readonly (PageSize | null)[]
  direction: ReadingDirection
  fit: FitMode
  /** Nasconde i margini uniformi delle scansioni. */
  trimBorders: boolean
  zoom: number
  zoomOriginRef: RefObject<ZoomOrigin | null>
  scrollerRef: RefObject<HTMLDivElement | null>
  /** Dove posizionare lo scorrimento quando cambia schermata, se la pagina non entra nella finestra. */
  entryRef: RefObject<ScrollEntry>
  onSize: (page: number, size: PageSize) => void
  /** Registra soltanto le pagine decodificate della schermata mostrata. */
  onShown: (spread: Spread, decodedPages: readonly number[]) => void
  onClick: (event: React.MouseEvent<HTMLDivElement>) => void
  onWheel: (event: WheelEvent) => void
  onScroll: () => void
}

/** L'area in cui vengono disegnate le pagine della schermata corrente. */
export function Stage(props: StageProps): React.JSX.Element {
  const { bookId, spread, sizes, direction, fit, trimBorders, zoom, zoomOriginRef, scrollerRef, entryRef, onSize, onClick, onWheel, onScroll } = props
  const viewport = useElementSize(scrollerRef)
  const { shown, borders: found, pending } = useDecodedSpread(bookId, spread, trimBorders, onSize, props.onShown)
  const borders = found.length === 2 ? pairBorders(found[0]!, found[1]!) : found
  const boxes = fitSpread(
    shown.pages.map((page, i) => croppedAspect(sizes[page], borders[i]!)),
    viewport,
    fit
  )

  // A ogni nuova schermata si riparte dall'inizio (o dalla fine, tornando indietro), nel verso di lettura.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    scroller.scrollTop = entryRef.current === 'end' ? scroller.scrollHeight : 0
    scroller.scrollLeft = (direction === 'rtl') === (entryRef.current === 'start') ? scroller.scrollWidth : 0
  }, [shown, scrollerRef, entryRef, direction])

  useZoomAnchor(scrollerRef, zoom, zoomOriginRef)
  useNativeWheel(scrollerRef, onWheel)
  const pan = usePanning(scrollerRef)

  const pages = shown.pages.map((page, i) => ({ page, box: boxes[i]!, borders: borders[i]! }))
  if (direction === 'rtl') pages.reverse()
  const side = (i: number): string => (pages.length === 2 ? (i === 0 ? ' page--left' : ' page--right') : '')

  return (
    <div
      ref={scrollerRef}
      className={`stage stage--${fit}${zoom > 1 ? ' is-zoomed' : ''}`}
      onClick={(e) => {
        if (!pan.wasDrag()) onClick(e)
      }}
      onPointerDown={pan.onPointerDown}
      onPointerMove={pan.onPointerMove}
      onPointerUp={pan.onPointerUp}
      onScroll={onScroll}
    >
      <div className="stage__spread" key={shown.pages.join('-')}>
        {pages.map(({ page, box, borders }, i) => (
          <div key={page} className={`page${side(i)}`} style={{ width: Math.floor(box.width * zoom), height: Math.floor(box.height * zoom) }}>
            {/* Stessa modalità CORS di `loadImage`: così il browser riusa l'immagine già decodificata. */}
            <img src={pageUrl(bookId, page)} crossOrigin="anonymous" alt={`Pagina ${page + 1}`} draggable={false} style={croppedImage(box, borders, zoom)} />
          </div>
        ))}
      </div>
      {pending && (
        <div className="stage__loading">
          <div className="spinner" />
        </div>
      )}
    </div>
  )
}

/** Immagine intera spostata dentro la pagina, che ne mostra solo la parte senza bordi. */
function croppedImage(box: Box, borders: Borders, zoom: number): React.CSSProperties | undefined {
  if (!hasBorders(borders)) return undefined
  const width = (box.width * zoom) / (1 - borders.left - borders.right)
  const height = (box.height * zoom) / (1 - borders.top - borders.bottom)
  return { position: 'absolute', width, height, left: -borders.left * width, top: -borders.top * height }
}

interface ShownSpread {
  spread: Spread
  borders: readonly Borders[]
  key: string
}

const NOTHING: ShownSpread = { spread: { pages: [], wide: false }, borders: [], key: '' }

/**
 * Mantiene visibile la schermata precedente finché le nuove pagine non sono decodificate
 * (e, col ritaglio attivo, misurate): così il cambio pagina è istantaneo, senza lampi neri né salti.
 */
function useDecodedSpread(
  bookId: string,
  spread: Spread,
  trim: boolean,
  onSize: StageProps['onSize'],
  onShown: StageProps['onShown']
): { shown: Spread; borders: readonly Borders[]; pending: boolean } {
  const key = `${spread.pages.join(',')}${trim ? '|bordi' : ''}`
  // Col ritaglio attivo la prima schermata aspetta i bordi, per non cambiare dimensione appena compare.
  const [shown, setShown] = useState<ShownSpread>(() => (trim ? NOTHING : { spread, borders: spread.pages.map(() => NO_BORDERS), key }))
  const latestOnSize = useRef(onSize)
  latestOnSize.current = onSize
  const latestOnShown = useRef(onShown)
  latestOnShown.current = onShown

  useEffect(() => {
    let cancelled = false
    const loads = spread.pages.map((page) =>
      loadImage(pageUrl(bookId, page)).then(
        (image) => {
          latestOnSize.current(page, [image.naturalWidth, image.naturalHeight])
          return true
        },
        () => false // una pagina illeggibile viene mostrata vuota, ma non conteggiata
      )
    )
    const borders = spread.pages.map((page) => (trim ? pageBorders(pageUrl(bookId, page)) : NO_BORDERS))
    void Promise.all([Promise.all(loads), Promise.all(borders)]).then(([decoded, found]) => {
      if (cancelled) return
      setShown({ spread, borders: found, key })
      latestOnShown.current(spread, spread.pages.filter((_, i) => decoded[i]))
    })
    return () => {
      cancelled = true
    }
    // `spread` cambia identità a ogni ricalcolo dell'impaginazione: conta solo quali pagine contiene.
  }, [bookId, key])

  return { shown: shown.spread, borders: shown.borders, pending: shown.key !== key }
}

/** Quando cambia lo zoom, tiene fermo sotto il cursore (o al centro) il punto che si stava guardando. */
function useZoomAnchor(scrollerRef: RefObject<HTMLDivElement | null>, zoom: number, originRef: RefObject<ZoomOrigin | null>): void {
  const previous = useRef(zoom)
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    const ratio = zoom / previous.current
    previous.current = zoom
    if (!scroller || ratio === 1) return
    const origin = originRef.current ?? { x: scroller.clientWidth / 2, y: scroller.clientHeight / 2 }
    scroller.scrollLeft = (scroller.scrollLeft + origin.x) * ratio - origin.x
    scroller.scrollTop = (scroller.scrollTop + origin.y) * ratio - origin.y
  }, [scrollerRef, zoom, originRef])
}

/**
 * La rotella va ascoltata con un listener non passivo: serve poter bloccare Ctrl+rotella,
 * che altrimenti ingrandirebbe tutta l'interfaccia invece della pagina.
 */
function useNativeWheel(scrollerRef: RefObject<HTMLDivElement | null>, onWheel: (event: WheelEvent) => void): void {
  const latest = useRef(onWheel)
  latest.current = onWheel
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const listener = (event: WheelEvent): void => latest.current(event)
    scroller.addEventListener('wheel', listener, { passive: false })
    return () => scroller.removeEventListener('wheel', listener)
  }, [scrollerRef])
}

/** Trascinamento con il tasto sinistro per spostarsi in una pagina più grande della finestra. */
function usePanning(scrollerRef: RefObject<HTMLDivElement | null>): {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
  wasDrag: () => boolean
} {
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null)
  const dragged = useRef(false)

  return {
    onPointerDown: (e) => {
      const scroller = scrollerRef.current
      dragged.current = false
      if (e.button !== 0 || !scroller) return
      const overflows = scroller.scrollWidth > scroller.clientWidth || scroller.scrollHeight > scroller.clientHeight
      if (!overflows) return
      drag.current = { x: e.clientX, y: e.clientY, left: scroller.scrollLeft, top: scroller.scrollTop, moved: false }
    },
    onPointerMove: (e) => {
      const state = drag.current
      const scroller = scrollerRef.current
      if (!state || !scroller) return
      const dx = e.clientX - state.x
      const dy = e.clientY - state.y
      if (!state.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      if (!state.moved) {
        state.moved = true
        scroller.setPointerCapture(e.pointerId)
        scroller.classList.add('is-panning')
      }
      scroller.scrollLeft = state.left - dx
      scroller.scrollTop = state.top - dy
    },
    onPointerUp: (e) => {
      const scroller = scrollerRef.current
      dragged.current = drag.current?.moved ?? false
      drag.current = null
      if (scroller?.hasPointerCapture(e.pointerId)) scroller.releasePointerCapture(e.pointerId)
      scroller?.classList.remove('is-panning')
    },
    /** Vero se il clic appena avvenuto concludeva un trascinamento (e quindi non deve sfogliare). */
    wasDrag: () => dragged.current
  }
}
