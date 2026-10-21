import { useEffect, useMemo, useRef, useState } from 'react'
import { imageBookId, pageUrl } from '../../../shared/api'
import { computeSpreads, spreadIndexOf } from '../../../shared/layout'
import { displayTitleOf, readingDirectionOf } from '../../../shared/series'
import type { BookSummary, PageSize, ReaderSettings } from '../../../shared/types'
import { api } from '../api'
import { ArrowLeft } from '../components/icons'
import { useFullscreen, useMouseActivity, useWindowEvent } from '../hooks'
import { loadImage } from './imageCache'
import { nightColor } from './nightMode'
import { LENS_DEFAULT_FACTOR, LENS_MAX_FACTOR, LENS_MIN_FACTOR, Magnifier, type Point } from './Magnifier'
import { EndCard, HelpOverlay } from './Overlays'
import { pageBorders } from './pageBorders'
import { PageOverview } from './PageOverview'
import { ReaderControls } from './ReaderControls'
import { Stage, type ScrollEntry } from './Stage'
import { useBook } from './useBook'
import { ZOOM_STEP, useZoom } from './useZoom'
import './reader.css'

/** Dopo quanto tempo senza muovere il mouse i controlli si nascondono. */
const CHROME_TIMEOUT_MS = 2200
/** Quanto deve restare fermo lo scorrimento a fine pagina prima che la rotella cambi pagina. */
const WHEEL_EDGE_PAUSE_MS = 300
const WHEEL_FLIP_COOLDOWN_MS = 250
/** Quota della finestra percorsa da Spazio / PagGiù in "adatta alla larghezza". */
const SCROLL_PAGE = 0.85
const SCROLL_NUDGE = 0.2

interface ReaderViewProps {
  book: BookSummary
  settings: ReaderSettings
  nextBook: BookSummary | null
  onOpenBook: (id: string) => void
  onClose: () => void
}

export function ReaderView(props: ReaderViewProps): React.JSX.Element {
  const { state, sizes, splitSpreads, reportSize, retry } = useBook(props.book.id, imageBookId(props.book))

  if (state.status !== 'ready') {
    return (
      <div className="reader">
        <TopBar title={displayTitleOf(props.book)} visible fullscreen={false} onBack={props.onClose} />
        <div className="reader__message">
          {state.status === 'loading' ? (
            <div className="spinner" />
          ) : (
            <>
              <h2>Impossibile aprire il fumetto</h2>
              <p>{state.message}</p>
              <div className="reader__message-actions">
                <button className="btn btn--primary" onClick={retry} autoFocus>
                  Riprova
                </button>
                <button className="btn" onClick={props.onClose}>
                  Torna alla libreria
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }
  if (state.pageCount === 0) {
    return (
      <div className="reader">
        <TopBar title={displayTitleOf(props.book)} visible fullscreen={false} onBack={props.onClose} />
        <div className="reader__message">
          <h2>Nessuna pagina trovata</h2>
          <p>Questo file non contiene immagini leggibili.</p>
        </div>
      </div>
    )
  }
  return <Reader {...props} pageCount={state.pageCount} startPage={state.startPage} sizes={sizes} splitSpreads={splitSpreads} reportSize={reportSize} />
}

interface ReaderProps extends ReaderViewProps {
  pageCount: number
  startPage: number
  sizes: readonly (PageSize | null)[]
  splitSpreads: readonly number[]
  reportSize: (page: number, size: PageSize) => void
}

function Reader({ book, settings, nextBook, onOpenBook, onClose, pageCount, startPage, sizes, splitSpreads, reportSize }: ReaderProps): React.JSX.Element {
  const direction = readingDirectionOf(book, settings.defaultDirection)
  const rtl = direction === 'rtl'
  const { doublePage, coverAlone, fit, trimBorders } = settings

  const spreads = useMemo(
    () => computeSpreads(pageCount, sizes, { doublePage, coverAlone, shiftPairs: book.shiftPairs, splitSpreads }),
    [pageCount, sizes, doublePage, coverAlone, book.shiftPairs, splitSpreads]
  )

  // La posizione è la prima pagina della schermata: resta stabile se l'impaginazione cambia.
  const [anchor, setAnchor] = useState(startPage)
  const index = spreadIndexOf(spreads, anchor)
  const spread = spreads[index]!

  const [ending, setEnding] = useState(false)
  const [help, setHelp] = useState(false)
  const [overview, setOverview] = useState(false)
  const [nightPanel, setNightPanel] = useState(false)
  const { zoom, originRef: zoomOriginRef, zoomBy, reset: resetZoom } = useZoom()

  // Lente: attiva tenendo premuto il tasto destro, oppure fissa con L.
  const [lensHeld, setLensHeld] = useState(false)
  const [lensPinned, setLensPinned] = useState(false)
  const [lensFactor, setLensFactor] = useState(LENS_DEFAULT_FACTOR)
  const lensActive = lensHeld || lensPinned
  const lastPointer = useRef<Point | null>(null)
  const [pinned, setPinned] = useState(false)
  const [hoveringChrome, setHoveringChrome] = useState(false)
  const [fullscreen, toggleFullscreen] = useFullscreen()
  const mouseActive = useMouseActivity(CHROME_TIMEOUT_MS)
  const chromeVisible = mouseActive || pinned || hoveringChrome || nightPanel

  const scrollerRef = useRef<HTMLDivElement>(null)
  const entryRef = useRef<ScrollEntry>('start')
  const lastScrollAt = useRef(0)
  const wheelLockedUntil = useRef(0)

  // Prepara in anticipo le schermate vicine (e i loro bordi, se il ritaglio è attivo).
  useEffect(() => {
    for (const i of [index + 1, index + 2, index - 1]) {
      for (const page of spreads[i]?.pages ?? []) {
        const url = pageUrl(imageBookId(book), page)
        loadImage(url).then(
          (image) => reportSize(page, [image.naturalWidth, image.naturalHeight]),
          () => {}
        )
        if (trimBorders) void pageBorders(url)
      }
    }
  }, [book.id, index, spreads, reportSize, trimBorders])

  // ---------- Navigazione ----------

  const goTo = (target: number, entry: ScrollEntry = 'start'): void => {
    if (target >= spreads.length) {
      setEnding(true)
      return
    }
    entryRef.current = entry
    setEnding(false)
    setAnchor(spreads[Math.max(0, target)]!.pages[0]!)
  }
  // Destra = avanti e sinistra = indietro sempre, anche nei manga: cambia solo la disposizione delle pagine.
  const next = (): void => goTo(index + 1)
  const prev = (): void => goTo(index - 1, 'end')

  /** Se la pagina è più alta della finestra la scorre; restituisce false se è già al bordo. */
  const scrollBy = (fraction: number): boolean => {
    const scroller = scrollerRef.current
    if (!scroller || !overflowsVertically(scroller)) return false
    const max = scroller.scrollHeight - scroller.clientHeight
    if (fraction > 0 ? scroller.scrollTop >= max - 2 : scroller.scrollTop <= 2) return false
    scroller.scrollBy({ top: fraction * scroller.clientHeight, behavior: 'smooth' })
    return true
  }
  const forward = (): void => {
    if (!scrollBy(SCROLL_PAGE)) next()
  }
  const backward = (): void => {
    if (!scrollBy(-SCROLL_PAGE)) prev()
  }

  // ---------- Impostazioni ----------

  const toggleDouble = (): void => void api.updateSettings({ doublePage: !doublePage })
  const toggleFit = (): void => {
    resetZoom()
    void api.updateSettings({ fit: fit === 'screen' ? 'width' : 'screen' })
  }
  const toggleLens = (): void => setLensPinned((pinned) => !pinned)
  const toggleNight = (): void => void api.updateSettings({ nightMode: !settings.nightMode })
  const toggleTrim = (): void => void api.updateSettings({ trimBorders: !trimBorders })
  const toggleDirection = (): void => void api.updateBook(book.id, { direction: rtl ? 'ltr' : 'rtl' })
  const toggleShift = (): void => void api.updateBook(book.id, { shiftPairs: !book.shiftPairs })

  // ---------- Input ----------

  useWindowEvent('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return
    if (e.key === 'n' || e.key === 'N') {
      if (!e.repeat) toggleNight()
      e.preventDefault()
      return
    }
    if (nightPanel && e.key === 'Escape') {
      setNightPanel(false)
      e.preventDefault()
      return
    }
    // Le frecce e Home/Fine nel pannello regolano il cursore, senza sfogliare il fumetto.
    if ((e.target as HTMLElement).closest('.night-panel')) return
    if (help || ending || overview) {
      if (e.key === 'Escape' || e.key === '?' || ((e.key === 'g' || e.key === 'G') && overview)) {
        setHelp(false)
        setEnding(false)
        setOverview(false)
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case 'ArrowRight':
        next()
        break
      case 'ArrowLeft':
        prev()
        break
      case 'ArrowDown':
        if (!scrollBy(SCROLL_NUDGE)) next()
        break
      case 'ArrowUp':
        if (!scrollBy(-SCROLL_NUDGE)) prev()
        break
      case ' ':
        if (e.shiftKey) backward()
        else forward()
        break
      case 'PageDown':
        forward()
        break
      case 'PageUp':
        backward()
        break
      case 'Home':
        goTo(0)
        break
      case 'End':
        goTo(spreads.length - 1)
        break
      case 'f':
      case 'F':
      case 'F11':
        toggleFullscreen()
        break
      case 'd':
      case 'D':
        toggleDouble()
        break
      case 'o':
      case 'O':
        if (doublePage) toggleShift()
        break
      case 'm':
      case 'M':
        toggleDirection()
        break
      case 'w':
      case 'W':
        toggleFit()
        break
      case 'b':
      case 'B':
        if (!e.repeat) toggleTrim()
        break
      case '+':
      case '=':
        zoomBy(ZOOM_STEP)
        break
      case '-':
        zoomBy(1 / ZOOM_STEP)
        break
      case '0':
        resetZoom()
        break
      case 'l':
      case 'L':
        toggleLens()
        break
      case 'g':
      case 'G':
        setOverview(true)
        break
      case '?':
        setHelp(true)
        break
      case 'Escape':
        if (lensPinned) setLensPinned(false)
        else if (zoom > 1) resetZoom() // la pagina rimpicciolita è un modo di leggere: Esc non la annulla
        else if (fullscreen) toggleFullscreen()
        else onClose()
        break
      case 'Backspace':
        onClose()
        break
      default:
        return
    }
    e.preventDefault()
  })

  const onWheel = (e: WheelEvent): void => {
    const scroller = scrollerRef.current
    if (!scroller || e.deltaY === 0) return

    // Ctrl+rotella (o il pizzico sul touchpad) ingrandisce attorno al cursore.
    if (e.ctrlKey) {
      e.preventDefault()
      const rect = scroller.getBoundingClientRect()
      zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, { x: e.clientX - rect.left, y: e.clientY - rect.top })
      return
    }
    // Con la lente attiva la rotella ne regola l'ingrandimento.
    if (lensActive) {
      e.preventDefault()
      setLensFactor((f) => Math.min(LENS_MAX_FACTOR, Math.max(LENS_MIN_FACTOR, f * (e.deltaY < 0 ? 1.15 : 1 / 1.15))))
      return
    }

    const now = performance.now()
    if (now < wheelLockedUntil.current) return

    if (overflowsVertically(scroller)) {
      // Cambia pagina solo se lo scorrimento era già fermo al bordo, non per l'inerzia della rotella.
      const atBottom = scroller.scrollTop >= scroller.scrollHeight - scroller.clientHeight - 2
      const atTop = scroller.scrollTop <= 2
      if (now - lastScrollAt.current < WHEEL_EDGE_PAUSE_MS) return
      if (e.deltaY > 0 && atBottom) next()
      else if (e.deltaY < 0 && atTop) prev()
      else return
    } else if (e.deltaY > 0) {
      next()
    } else {
      prev()
    }
    wheelLockedUntil.current = now + WHEEL_FLIP_COOLDOWN_MS
  }

  const onStageClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    const x = e.clientX / window.innerWidth
    if (x < 0.3) prev()
    else if (x > 0.7) next()
    else setPinned((p) => !p)
  }

  const pageLabel = `${spread.pages.map((p) => p + 1).join('–')} / ${pageCount}`

  // Il tasto destro tenuto premuto mostra la lente; il rilascio può avvenire anche fuori dalla finestra.
  useWindowEvent('pointerup', (e) => {
    if (e.button === 2) setLensHeld(false)
  })
  useWindowEvent('pointermove', (e) => (lastPointer.current = { x: e.clientX, y: e.clientY }))

  return (
    <div
      className={`reader${chromeVisible ? '' : ' hide-cursor'}${lensActive ? ' has-lens' : ''}`}
      style={{ '--night-color': nightColor(settings.nightMode ? settings.nightIntensity : 0) } as React.CSSProperties}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        lastPointer.current = { x: e.clientX, y: e.clientY }
        if (e.button === 2) setLensHeld(true)
      }}
    >
      <Stage
        bookId={imageBookId(book)}
        spread={spread}
        sizes={sizes}
        direction={direction}
        fit={fit}
        trimBorders={trimBorders}
        zoom={zoom}
        zoomOriginRef={zoomOriginRef}
        scrollerRef={scrollerRef}
        entryRef={entryRef}
        onSize={reportSize}
        onShown={(shown, decodedPages) => api.saveProgress(
          book.id, shown.pages[0]!, spreadIndexOf(spreads, shown.pages[0]!) === spreads.length - 1, decodedPages
        )}
        onClick={onStageClick}
        onWheel={onWheel}
        onScroll={() => (lastScrollAt.current = performance.now())}
      />

      <TopBar title={displayTitleOf(book)} visible={chromeVisible} fullscreen={fullscreen} onBack={onClose} onHover={setHoveringChrome} />

      <ReaderControls
        visible={chromeVisible}
        spreadIndex={index}
        spreadCount={spreads.length}
        pageLabel={pageLabel}
        direction={direction}
        doublePage={doublePage}
        fitWidth={fit === 'width'}
        trimBorders={trimBorders}
        shiftPairs={book.shiftPairs}
        fullscreen={fullscreen}
        zoom={zoom}
        lens={lensActive}
        nightMode={settings.nightMode}
        nightIntensity={settings.nightIntensity}
        nightPanel={nightPanel}
        onNightPanel={setNightPanel}
        onToggleNight={toggleNight}
        onNightIntensity={(nightIntensity) => void api.updateSettings({ nightIntensity })}
        onSeek={goTo}
        onPrev={prev}
        onNext={next}
        onToggleDouble={toggleDouble}
        onToggleDirection={toggleDirection}
        onToggleFit={toggleFit}
        onToggleTrim={toggleTrim}
        onToggleShift={toggleShift}
        onToggleFullscreen={toggleFullscreen}
        onHelp={() => setHelp(true)}
        onOverview={() => setOverview(true)}
        onZoomReset={resetZoom}
        onToggleLens={toggleLens}
        onHover={setHoveringChrome}
      />

      {lensActive && <Magnifier factor={lensFactor} start={lastPointer.current} />}
      {overview && (
        <PageOverview
          bookId={imageBookId(book)}
          spreads={spreads}
          currentIndex={index}
          sizes={sizes}
          direction={direction}
          onSelect={(target) => {
            setOverview(false)
            goTo(target)
          }}
          onClose={() => setOverview(false)}
        />
      )}
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
      {ending && (
        <EndCard
          book={book}
          nextBook={nextBook}
          onNext={onOpenBook}
          onRestart={() => goTo(0)}
          onLibrary={onClose}
          onDismiss={() => setEnding(false)}
        />
      )}
    </div>
  )
}

interface TopBarProps {
  title: string
  visible: boolean
  fullscreen: boolean
  onBack: () => void
  onHover?: (hovering: boolean) => void
}

function TopBar({ title, visible, fullscreen, onBack, onHover }: TopBarProps): React.JSX.Element {
  return (
    <header
      className={`reader-top drag-region${visible ? ' is-visible' : ''}${fullscreen ? ' is-fullscreen' : ''}`}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
    >
      <button className="btn btn--ghost" onClick={onBack}>
        <ArrowLeft size={16} />
        Libreria
      </button>
      <span className="reader-top__title">{title}</span>
    </header>
  )
}

function overflowsVertically(scroller: HTMLElement): boolean {
  return scroller.scrollHeight > scroller.clientHeight + 2
}
