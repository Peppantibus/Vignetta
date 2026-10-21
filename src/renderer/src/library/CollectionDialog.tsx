import { useEffect, useState } from 'react'
import { classifyBook } from '../../../shared/catalog/classify'
import { COLLECTION_LABEL, refKey } from '../../../shared/collections'
import { coverUrl, pageUrl } from '../../../shared/api'
import { displayTitleOf, type SeriesGroup } from '../../../shared/series'
import type { BookSummary, CollectionProgress } from '../../../shared/types'
import { api, errorMessage } from '../api'
import { X } from '../components/icons'
import { useWindowEvent } from '../hooks'
import { RemoveBookDialog } from './RemoveDialogs'

/** Un volume si crea da almeno due albi della stessa serie Marvel o DC, senza cartelle né altri volumi. */
export function canCreateCollection(group: SeriesGroup): boolean {
  const publisher = classifyBook(group.books[0]!).publisher
  return group.books.length >= 2 && ['marvel', 'dc'].includes(publisher) && !group.books.some((book) => book.collection || book.kind === 'folder' || classifyBook(book).publisher !== publisher)
}

export function CollectionDialog({ group, onClose, onCreated }: { group: SeriesGroup; onClose: () => void; onCreated: (book: BookSummary) => void }): React.JSX.Element {
  const [title, setTitle] = useState(group.name)
  const [books, setBooks] = useState(group.books)
  const [coverId, setCoverId] = useState(group.books[0]!.id)
  const [hide, setHide] = useState(true)
  const [jobId] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<CollectionProgress | null>(null)
  const [error, setError] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const close = (): void => {
    if (busy) { setCancelling(true); api.cancelCollection(jobId) }
    else onClose()
  }
  useWindowEvent('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); close() } })
  useEffect(() => api.onCollectionProgress((event) => { if (event.jobId === jobId) setProgress(event) }), [jobId])
  const move = (index: number, delta: number): void => {
    const next = [...books]
    ;[next[index], next[index + delta]] = [next[index + delta]!, next[index]!]
    setBooks(next)
  }
  const create = async (): Promise<void> => {
    setBusy(true); setError('')
    try {
      const book = await api.createCollection({ jobId, title, bookIds: books.map((b) => b.id), hideDuplicates: hide, coverPart: Math.max(0, books.findIndex((b) => b.id === coverId)) })
      onCreated(book)
    } catch (cause) {
      if (errorMessage(cause).includes('Creazione annullata')) onClose()
      else setError(errorMessage(cause))
      setBusy(false); setCancelling(false)
    }
  }
  return <div className="dialog-backdrop"><form className="dialog collection-dialog" role="dialog" aria-modal="true" aria-labelledby="collection-heading" onSubmit={(event) => { event.preventDefault(); if (!busy && title.trim() && books.length >= 2) void create() }}>
    <header className="dialog__header"><h2 id="collection-heading">Crea un volume</h2><button type="button" className="icon-btn" onClick={close} aria-label="Chiudi"><X size={18} /></button></header>
    <p className="dialog__hint">Un solo volume, numerazione continua. Gli albi originali restano disponibili in «Gestisci volume». Il volume usa i loro file: conservali sul disco.</p>
    <label className="rename__label" htmlFor="collection-title">Titolo del volume</label>
    <input id="collection-title" className="rename__input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus disabled={busy} />
    <p className="dialog__hint">Controlla l’ordine di lettura. Il pallino sceglie la copertina.</p>
    <ol className="collection-parts">{books.map((book, index) => <li key={book.id}>
      <input type="radio" name="cover" checked={coverId === book.id} onChange={() => setCoverId(book.id)} disabled={busy} aria-label={`Copertina: ${displayTitleOf(book)}`} />
      <img src={coverUrl(book.id)} alt="" /><span>{displayTitleOf(book)}</span>
      <button type="button" className="btn btn--ghost" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={`Sposta prima ${displayTitleOf(book)}`}>↑</button>
      <button type="button" className="btn btn--ghost" disabled={busy || index === books.length - 1} onClick={() => move(index, 1)} aria-label={`Sposta dopo ${displayTitleOf(book)}`}>↓</button>
      <button type="button" className="icon-btn" disabled={busy || books.length <= 2} onClick={() => { setBooks(books.filter((b) => b.id !== book.id)); if (coverId === book.id) setCoverId(books.find((b) => b.id !== book.id)!.id) }} aria-label={`Escludi ${displayTitleOf(book)}`}><X size={14} /></button>
    </li>)}</ol>
    <label className="rename__automatic"><input type="checkbox" checked={hide} onChange={(event) => setHide(event.target.checked)} disabled={busy} />Nascondi le copie esattamente identiche tra albi</label>
    <p className="dialog__hint">Confronto integrale delle prime e ultime 3 pagine. Scansioni simili e pagine diverse restano. Potrai ripristinare ogni copia esclusa.</p>
    {busy && <div role="status"><progress value={progress?.completed ?? 0} max={progress?.total ?? books.length} /><p>{cancelling ? 'Annullamento…' : `Analisi ${progress?.completed ?? 0}/${books.length} · ${progress?.title ?? ''}`}</p></div>}
    {error && <p className="rename__error" role="alert">{error}</p>}
    <footer className="dialog__footer"><button type="button" className="btn btn--ghost" onClick={close} disabled={cancelling}>{busy ? 'Annulla analisi' : 'Annulla'}</button><button className="btn btn--primary" disabled={busy || !title.trim() || books.length < 2}>Crea volume</button></footer>
  </form></div>
}

export function ManageCollection({ book, onClose, onRead }: { book: BookSummary; onClose: () => void; onRead: (id: string) => void }): React.JSX.Element {
  const spec = book.collection!
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<{ id: string; page: number; label: string } | null>(null)
  const [dissolving, setDissolving] = useState(false)
  const close = (): void => { if (dissolving) return; if (preview) setPreview(null); else if (!busy) onClose() }
  useWindowEvent('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); close() } })
  const run = async (action: () => Promise<unknown>): Promise<void> => { setBusy(true); setError(''); try { await action() } catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) } }
  const hidden = new Set(spec.excluded.map(refKey))
  return <><div className="dialog-backdrop"><section className="dialog collection-dialog" role="dialog" aria-modal="true" aria-labelledby="manage-heading">
    <header className="dialog__header"><h2 id="manage-heading">Gestisci volume</h2><button className="icon-btn" onClick={close} aria-label="Chiudi" disabled={busy}><X size={18} /></button></header>
    <h3>{displayTitleOf(book)}</h3><p className="dialog__hint">{COLLECTION_LABEL} · {spec.parts.length} albi · {book.pageCount} pagine · {spec.excluded.length} copie escluse</p>
    <p className="dialog__hint">Il volume e i progressi restano salvati alla chiusura. Conserva i file originali: il volume li usa per leggere le pagine.</p>
    <h3>Albi originali</h3><ol className="collection-parts">{spec.parts.map((part, index) => <li key={index}>
      <input type="radio" name="volume-cover" aria-label={`Copertina: ${part.title}`} checked={spec.coverPart === index} disabled={busy} onChange={() => void run(() => api.updateCollection(book.id, spec.excluded, index))} />
      <img src={coverUrl(part.bookId)} alt="" /><span title={part.path}>{part.title}<small>{part.pageCount} pagine · {part.path.split(/[\\/]/).at(-1)}</small></span>
      <button className="btn btn--ghost" disabled={busy} onClick={() => void run(async () => { const [id] = await api.addPaths([part.path]); if (!id) throw new Error('Originale non disponibile. Ricollegalo.'); onRead(id) })}>Leggi originale</button>
      <button className="btn btn--ghost" disabled={busy} onClick={() => void run(() => api.relinkCollection(book.id, index))}>Ricollega…</button>
    </li>)}</ol>
    <h3>Copie identiche</h3>
    {spec.duplicates.length === 0 ? <p className="dialog__hint">Nessuna copia esattamente identica trovata. Tutte le pagine sono incluse.</p> : <>
      <p className="dialog__hint">La prima occorrenza resta sempre. Togli la spunta per ripristinare una copia.</p>
      <div className="collection-duplicates">{spec.duplicates.map(({ ref, original }) => <div key={refKey(ref)}>
        <label><input type="checkbox" checked={hidden.has(refKey(ref))} disabled={busy} onChange={() => void run(() => api.updateCollection(book.id, hidden.has(refKey(ref)) ? spec.excluded.filter((r) => refKey(r) !== refKey(ref)) : [...spec.excluded, ref], spec.coverPart))} />Escludi · albo {ref.part + 1}, pagina {ref.page + 1} <small>(uguale ad albo {original.part + 1}, pagina {original.page + 1})</small></label>
        <button className="btn btn--ghost" onClick={() => setPreview({ id: spec.parts[ref.part]!.bookId, page: ref.page, label: `${spec.parts[ref.part]!.title} · pagina ${ref.page + 1}` })}>Vedi pagina</button>
      </div>)}</div>
      <button className="btn" disabled={busy || !spec.excluded.length} onClick={() => void run(() => api.updateCollection(book.id, [], spec.coverPart))}>Ripristina tutte le copie</button>
    </>}
    {error && <p className="rename__error" role="alert">{error}</p>}
    {busy && <p role="status">Salvataggio o verifica degli originali…</p>}
    <footer className="dialog__footer"><button className="btn btn--ghost" disabled={busy} onClick={() => setDissolving(true)}>Sciogli volume · conserva gli originali</button><button className="btn btn--primary" disabled={busy} onClick={() => onRead(book.id)}>Leggi volume</button></footer>
    {preview && <div className="collection-preview" onClick={() => setPreview(null)}><button className="btn">Chiudi anteprima</button><p>{preview.label}</p><img src={pageUrl(preview.id, preview.page)} alt={preview.label} /></div>}
  </section></div>
  {dissolving && <RemoveBookDialog book={book} onClose={() => setDissolving(false)} onRemoved={onClose} />}</>
}
