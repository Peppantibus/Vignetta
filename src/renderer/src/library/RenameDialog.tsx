import { useEffect, useRef, useState } from 'react'
import { characterById, classifyBook, PUBLISHERS } from '../../../shared/catalog/classify'
import { displayTitleOf } from '../../../shared/series'
import type { BookSummary } from '../../../shared/types'
import { api } from '../api'
import { RotateCcw, X } from '../components/icons'
import { useWindowEvent } from '../hooks'

/** Titolo personale con anteprima del riconoscimento: file e progressi mantengono la propria identità. */
export function RenameDialog({ book, onClose }: { book: BookSummary; onClose: () => void }): React.JSX.Element {
  const [title, setTitle] = useState(() => displayTitleOf(book))
  const [automatic, setAutomatic] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const name = title.replace(/\s+/g, ' ').trim()
  const preview = classifyBook({ ...book, customTitle: name || null, classification: automatic ? null : book.classification })
  const category = PUBLISHERS.find((p) => p.id === preview.publisher)!.name
  const characters = preview.characters.map((id) => characterById(id)?.name).filter(Boolean)
  const close = (): void => { if (!saving) onClose() }
  useWindowEvent('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  })
  useEffect(() => { inputRef.current?.select() }, [])

  const save = async (customTitle: string | null): Promise<void> => {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await api.updateBook(book.id, { customTitle, ...(automatic ? { classification: null } : {}) })
      onClose()
    } catch {
      setError('Impossibile salvare il titolo. Riprova.')
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop" onPointerDown={close}>
      <form className="dialog rename" role="dialog" aria-modal="true" aria-labelledby="rename-heading" onPointerDown={(event) => event.stopPropagation()} onSubmit={(event) => {
        event.preventDefault()
        if (name) void save(name)
      }}>
        <header className="dialog__header">
          <h2 id="rename-heading">Rinomina fumetto</h2>
          <button type="button" className="icon-btn" onClick={close} aria-label="Chiudi" disabled={saving}><X size={18} /></button>
        </header>
        <p className="dialog__hint" id="rename-hint">Il titolo viene usato nella libreria e nel riconoscimento automatico.</p>
        <label className="rename__label" htmlFor="rename-title">Titolo</label>
        <input ref={inputRef} id="rename-title" className="rename__input" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus disabled={saving} spellCheck={false} aria-describedby="rename-hint rename-category" />
        <p className="rename__preview" id="rename-category" aria-live="polite">
          {preview.manual ? 'Categoria manuale' : 'Categoria automatica'}: <strong>{category}</strong>
          {characters.length > 0 && ` · ${characters.join(', ')}`}
        </p>
        {book.classification && (
          <label className="rename__automatic">
            <input type="checkbox" checked={automatic} onChange={(event) => setAutomatic(event.target.checked)} disabled={saving} />
            Torna al riconoscimento automatico della categoria
          </label>
        )}
        <p className="rename__file">File: {book.path.split(/[\\/]/).at(-1)}</p>
        {error && <p className="rename__error" role="alert">{error}</p>}
        <footer className="dialog__footer">
          {book.customTitle && <button type="button" className="btn btn--ghost rename__restore" onClick={() => void save(null)} disabled={saving}><RotateCcw size={16} />Titolo originale</button>}
          <button type="button" className="btn btn--ghost" onClick={close} disabled={saving}>Annulla</button>
          <button type="submit" className="btn btn--primary" disabled={!name || saving}>{saving ? 'Salvataggio…' : 'Salva'}</button>
        </footer>
      </form>
    </div>
  )
}
