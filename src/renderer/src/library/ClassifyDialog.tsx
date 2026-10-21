import { useMemo, useState } from 'react'
import { characterById, charactersOf, PUBLISHERS, type Classification, type HeroPublisher } from '../../../shared/catalog/classify'
import { displayTitleOf } from '../../../shared/series'
import type { BookSummary, Publisher } from '../../../shared/types'
import { api } from '../api'
import { Check, RotateCcw, Search, X } from '../components/icons'
import { useWindowEvent } from '../hooks'
import { searchKey } from './books'

interface ClassifyDialogProps {
  book: BookSummary
  current: Classification
  onClose: () => void
}

const isHeroPublisher = (publisher: Publisher): publisher is HeroPublisher => publisher === 'marvel' || publisher === 'dc'

/** Correzione manuale di editore e personaggi; la scelta prevale sul riconoscimento automatico. */
export function ClassifyDialog({ book, current, onClose }: ClassifyDialogProps): React.JSX.Element {
  const [publisher, setPublisher] = useState<Publisher>(current.publisher)
  const [selected, setSelected] = useState<string[]>(current.characters)
  const [query, setQuery] = useState('')
  useWindowEvent('keydown', (e) => e.key === 'Escape' && onClose())

  const characters = useMemo(() => (isHeroPublisher(publisher) ? charactersOf(publisher) : []), [publisher])
  const visible = characters.filter((c) => searchKey(c.name).includes(searchKey(query.trim())))

  const choosePublisher = (next: Publisher): void => {
    setPublisher(next)
    // I personaggi appartengono a un editore: cambiandolo, la scelta riparte da zero.
    if (next !== publisher) setSelected([])
  }
  const toggle = (id: string): void => setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))

  const save = (): void => {
    void api.updateBook(book.id, { classification: { publisher, characters: isHeroPublisher(publisher) ? selected : [] } })
    onClose()
  }
  const restoreAutomatic = (): void => {
    void api.updateBook(book.id, { classification: null })
    onClose()
  }

  return (
    <div className="dialog-backdrop" onPointerDown={onClose}>
      <section className="dialog classify" role="dialog" aria-label="Classifica fumetto" onPointerDown={(e) => e.stopPropagation()}>
        <header className="dialog__header">
          <h2>Classifica</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Chiudi">
            <X size={18} />
          </button>
        </header>
        <p className="dialog__hint">
          {displayTitleOf(book)}
          {current.manual ? ' · classificato a mano' : ' · riconosciuto automaticamente'}
        </p>

        <div className="classify__publishers" role="radiogroup" aria-label="Categoria">
          {PUBLISHERS.map((p) => (
            <button key={p.id} role="radio" aria-checked={publisher === p.id} className={`chip classify__publisher classify__publisher--${p.id}`} onClick={() => choosePublisher(p.id)}>
              {p.name}
            </button>
          ))}
        </div>

        {isHeroPublisher(publisher) ? (
          <>
            <div className="classify__selected">
              {selected.length === 0 ? (
                <span className="classify__summary">Nessun personaggio: il fumetto andrà tra gli altri fumetti dell’editore.</span>
              ) : (
                selected.map((id) => (
                  <button key={id} className="classify__tag" onClick={() => toggle(id)} title="Togli">
                    {characterById(id)?.name ?? id}
                    <X size={12} />
                  </button>
                ))
              )}
            </div>
            <label className="search classify__search">
              <Search size={16} />
              <input placeholder="Cerca un personaggio" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus spellCheck={false} />
            </label>
            <ul className="classify__list">
              {visible.map((c) => (
                <li key={c.id}>
                  <button role="checkbox" aria-checked={selected.includes(c.id)} onClick={() => toggle(c.id)}>
                    <span className="classify__check">{selected.includes(c.id) && <Check size={13} strokeWidth={3} />}</span>
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="classify__summary">
            {publisher === 'manga' ? 'I manga vengono raggruppati per serie.' : 'Il fumetto andrà nella categoria Altri.'}
          </p>
        )}

        <footer className="dialog__footer">
          {current.manual && (
            <button className="btn btn--ghost classify__reset" onClick={restoreAutomatic}>
              <RotateCcw size={16} />
              Riconoscimento automatico
            </button>
          )}
          <button className="btn btn--ghost" onClick={onClose}>
            Annulla
          </button>
          <button className="btn btn--primary" onClick={save}>
            Salva
          </button>
        </footer>
      </section>
    </div>
  )
}
