import type { ReadingDirection } from '../../../shared/types'
import { useEffect, useRef } from 'react'
import { ArrowRightLeft, BookOpen, ChevronLeft, ChevronRight, Columns2, Crop, Keyboard, LayoutGrid, Maximize, Minimize, Moon, MoveHorizontal, Search, X } from '../components/icons'

interface ReaderControlsProps {
  visible: boolean
  spreadIndex: number
  spreadCount: number
  pageLabel: string
  direction: ReadingDirection
  doublePage: boolean
  fitWidth: boolean
  trimBorders: boolean
  shiftPairs: boolean
  fullscreen: boolean
  zoom: number
  lens: boolean
  nightMode: boolean
  nightIntensity: number
  nightPanel: boolean
  onNightPanel: (open: boolean) => void
  onToggleNight: () => void
  onNightIntensity: (intensity: number) => void
  onSeek: (spreadIndex: number) => void
  onPrev: () => void
  onNext: () => void
  onToggleDouble: () => void
  onToggleDirection: () => void
  onToggleFit: () => void
  onToggleTrim: () => void
  onToggleShift: () => void
  onToggleFullscreen: () => void
  onHelp: () => void
  onOverview: () => void
  onZoomReset: () => void
  onToggleLens: () => void
  onHover: (hovering: boolean) => void
}

/** La barra di controllo in basso, che compare muovendo il mouse. */
export function ReaderControls(props: ReaderControlsProps): React.JSX.Element {
  const { spreadIndex, spreadCount, direction } = props
  const progress = spreadCount > 1 ? (spreadIndex / (spreadCount - 1)) * 100 : 100
  const rtl = direction === 'rtl'
  const nightRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!props.nightPanel) return
    toggleRef.current?.focus()
    const dismiss = (event: PointerEvent): void => {
      if (!nightRef.current?.contains(event.target as Node)) props.onNightPanel(false)
    }
    window.addEventListener('pointerdown', dismiss)
    return () => window.removeEventListener('pointerdown', dismiss)
  }, [props.nightPanel, props.onNightPanel])

  return (
    <div className={`reader-bottom${props.visible ? ' is-visible' : ''}`} onMouseEnter={() => props.onHover(true)} onMouseLeave={() => props.onHover(false)}>
      <div className="reader-bar">
        <button className="icon-btn" onClick={props.onPrev} aria-label="Pagina precedente">
          <ChevronLeft size={20} />
        </button>
        <input
          className="seek"
          type="range"
          min={0}
          max={Math.max(0, spreadCount - 1)}
          value={spreadIndex}
          onChange={(e) => props.onSeek(Number(e.target.value))}
          aria-label="Vai alla pagina"
          style={{ '--progress': `${progress}%` } as React.CSSProperties}
        />
        <button className="icon-btn" onClick={props.onNext} aria-label="Pagina successiva">
          <ChevronRight size={20} />
        </button>
        <button className="reader-bar__pages" onClick={props.onOverview} title="Panoramica delle pagine (G)">
          <LayoutGrid size={15} />
          {props.pageLabel}
        </button>
        {props.zoom !== 1 && (
          <button className="reader-bar__zoom" onClick={props.onZoomReset} title="Torna alla pagina adattata (0)">
            {Math.round(props.zoom * 100)}%
          </button>
        )}

        <span className="reader-bar__divider" />

        <button className="icon-btn" aria-pressed={props.doublePage} onClick={props.onToggleDouble} title="Doppia pagina (D)">
          <BookOpen size={18} />
        </button>
        {props.doublePage && (
          <button className="icon-btn" aria-pressed={props.shiftPairs} onClick={props.onToggleShift} title="Sposta l'accoppiamento delle pagine (O)">
            <Columns2 size={18} />
          </button>
        )}
        <button className="icon-btn" aria-pressed={rtl} onClick={props.onToggleDirection} title="Lettura manga, da destra a sinistra (M)">
          <ArrowRightLeft size={18} />
        </button>
        <button className="icon-btn" aria-pressed={props.lens} onClick={props.onToggleLens} title="Lente d'ingrandimento (L, o tieni premuto il tasto destro)">
          <Search size={18} />
        </button>
        <div className="night-control" ref={nightRef}>
          <button
            className="icon-btn"
            aria-label="Modalità notte"
            aria-pressed={props.nightMode}
            aria-expanded={props.nightPanel}
            aria-controls="night-panel"
            onClick={() => props.onNightPanel(!props.nightPanel)}
            title="Modalità notte (N)"
          >
            <Moon size={18} />
          </button>
          {props.nightPanel && (
            <section className="night-panel" id="night-panel" aria-label="Modalità notte" onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              event.stopPropagation()
              props.onNightPanel(false)
              nightRef.current?.querySelector('button')?.focus()
            }}>
              <header className="night-panel__header">
                <strong>Modalità notte</strong>
                <button className="icon-btn" aria-label="Chiudi modalità notte" onClick={() => {
                  props.onNightPanel(false)
                  nightRef.current?.querySelector('button')?.focus()
                }}><X size={16} /></button>
              </header>
              <button ref={toggleRef} className="night-panel__toggle" role="switch" aria-checked={props.nightMode} onClick={props.onToggleNight}>
                <span>Pagina più calda e scura</span>
                <span className="night-panel__switch" aria-hidden="true" />
              </button>
              <label className="night-panel__intensity">
                <span>Intensità <output>{Math.round(props.nightIntensity * 100)}%</output></span>
                <input type="range" min={0} max={100} step={1} value={Math.round(props.nightIntensity * 100)} onChange={(e) => props.onNightIntensity(Number(e.target.value) / 100)} aria-label="Intensità modalità notte" />
              </label>
            </section>
          )}
        </div>
        <button className="icon-btn" aria-pressed={props.fitWidth} onClick={props.onToggleFit} title="Adatta alla larghezza (W)">
          <MoveHorizontal size={18} />
        </button>
        <button className="icon-btn" aria-pressed={props.trimBorders} onClick={props.onToggleTrim} title="Ritaglia i bordi bianchi o neri (B)">
          <Crop size={18} />
        </button>
        <button className="icon-btn" onClick={props.onToggleFullscreen} title="Schermo intero (F)">
          {props.fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
        </button>
        <button className="icon-btn" onClick={props.onHelp} title="Scorciatoie da tastiera (?)">
          <Keyboard size={18} />
        </button>
      </div>
    </div>
  )
}
