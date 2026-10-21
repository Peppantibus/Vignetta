import { useState } from 'react'
import { displayTitleOf } from '../../../shared/series'
import type { BookSummary } from '../../../shared/types'
import { ArrowRight, Library, RotateCcw, X } from '../components/icons'
import { Cover } from '../library/BookCard'
import { canDeleteFromDisk } from '../library/books'
import { FreeSpaceOffer } from '../library/FreeSpace'

const SHORTCUTS: [keys: string[], action: string][] = [
  [['→', '←'], 'Pagina successiva / precedente (anche nei manga)'],
  [['Spazio', 'Maiusc+Spazio'], 'Avanti / indietro, scorrendo prima la pagina'],
  [['Rotella'], 'Sfoglia o scorre la pagina'],
  [['Home', 'Fine'], 'Prima / ultima pagina'],
  [['G'], 'Panoramica di tutte le pagine'],
  [['N'], 'Attiva o disattiva la modalità notte'],
  [['Ctrl+rotella', '+', '−'], 'Ingrandisci o rimpicciolisci fino al 50% (trascina per spostarti)'],
  [['0'], 'Torna alla pagina adattata (100%)'],
  [['Tasto destro', 'L'], "Lente d'ingrandimento (la rotella ne cambia la forza)"],
  [['D'], 'Pagina singola o doppia'],
  [['O'], "Sposta l'accoppiamento delle pagine"],
  [['M'], 'Lettura manga (da destra a sinistra)'],
  [['W'], 'Adatta alla finestra o alla larghezza'],
  [['B'], 'Ritaglia i bordi bianchi o neri delle scansioni'],
  [['F', 'F11'], 'Schermo intero'],
  [['Esc'], 'Chiudi lente o ingrandimento, esci dallo schermo intero, torna alla libreria'],
  [['?'], 'Mostra o nascondi questo aiuto']
]

export function HelpOverlay({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <div className="dialog-backdrop" onPointerDown={onClose}>
      <section className="dialog help" role="dialog" aria-label="Scorciatoie da tastiera" onPointerDown={(e) => e.stopPropagation()}>
        <header className="dialog__header">
          <h2>Scorciatoie da tastiera</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Chiudi">
            <X size={18} />
          </button>
        </header>
        <p className="dialog__hint">Puoi anche cliccare ai lati della pagina per sfogliare, e al centro per mostrare i controlli.</p>
        <dl className="help__list">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={action} className="help__row">
              <dt>
                {keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}

interface EndCardProps {
  book: BookSummary
  nextBook: BookSummary | null
  onNext: (id: string) => void
  onRestart: () => void
  onLibrary: () => void
  onDismiss: () => void
}

/** Compare quando si va oltre l'ultima pagina; propone il numero successivo della serie. */
export function EndCard({ book, nextBook, onNext, onRestart, onLibrary, onDismiss }: EndCardProps): React.JSX.Element {
  // Deciso all'apertura: dopo l'eliminazione la proposta resta visibile con la conferma.
  const [offerFreeSpace] = useState(() => canDeleteFromDisk(book))
  // Senza file non si torna alle pagine: chiudere riporta alla libreria.
  const deleted = !!book.missingSince
  return (
    <div className="dialog-backdrop" onPointerDown={deleted ? onLibrary : onDismiss}>
      <section className="dialog end-card" role="dialog" aria-label="Fine del fumetto" onPointerDown={(e) => e.stopPropagation()}>
        <p className="end-card__eyebrow">Hai finito</p>
        <h2 className="end-card__title">{displayTitleOf(book)}</h2>

        {nextBook && (
          <button className="end-card__next" onClick={() => onNext(nextBook.id)} autoFocus>
            <Cover book={nextBook} />
            <span>
              <span className="end-card__label">Prossimo</span>
              <span className="end-card__next-title">{displayTitleOf(nextBook)}</span>
              <span className="end-card__cta">
                Inizia a leggere <ArrowRight size={15} />
              </span>
            </span>
          </button>
        )}

        {offerFreeSpace && <FreeSpaceOffer book={book} />}

        <footer className="dialog__footer">
          {!deleted && (
            <button className="btn btn--ghost" onClick={onRestart}>
              <RotateCcw size={16} />
              Ricomincia
            </button>
          )}
          <button className={`btn${nextBook ? '' : ' btn--primary'}`} onClick={onLibrary} autoFocus={!nextBook}>
            <Library size={16} />
            Torna alla libreria
          </button>
        </footer>
      </section>
    </div>
  )
}
