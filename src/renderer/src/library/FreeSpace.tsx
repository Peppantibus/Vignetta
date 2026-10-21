import { useEffect, useState } from 'react'
import { displayTitleOf } from '../../../shared/series'
import type { BookSummary, DiskUsage } from '../../../shared/types'
import { api, errorMessage } from '../api'
import { Check, HardDrive, Link, Search, Trash2 } from '../components/icons'
import { useWindowEvent } from '../hooks'
import { formatBytes, formatDate } from './books'
import { RemoveBookDialog } from './RemoveDialogs'

type Deletion =
  | { phase: 'idle' | 'confirm' | 'deleting' }
  | { phase: 'done'; freed: number }
  | { phase: 'error'; message: string }

/** Spazio occupato da un fumetto e stato della sua eliminazione dal disco. */
function useDeleteFromDisk(book: BookSummary): { size: number | null; state: Deletion; setState: (state: Deletion) => void; remove: () => Promise<void> } {
  const [size, setSize] = useState<number | null>(null)
  const [state, setState] = useState<Deletion>({ phase: 'idle' })

  useEffect(() => {
    let alive = true
    api.diskSize(book.id).then((bytes) => alive && setSize(bytes), () => {})
    return () => {
      alive = false
    }
  }, [book.id])

  const remove = async (): Promise<void> => {
    setState({ phase: 'deleting' })
    try {
      setState({ phase: 'done', freed: await api.deleteFromDisk(book.id) })
    } catch (error) {
      setState({ phase: 'error', message: errorMessage(error) })
    }
  }
  return { size, state, setState, remove }
}

const KEEP_NOTE = 'La scheda resta in libreria, in grigio, con progressi, stato e copertina.'

/** Conferma dal menu della libreria: eliminazione definitiva, senza Cestino. */
export function DeleteFromDiskDialog({ book, onClose }: { book: BookSummary; onClose: () => void }): React.JSX.Element {
  const { size, state, remove } = useDeleteFromDisk(book)
  const busy = state.phase === 'deleting'
  const close = (): void => {
    if (!busy) onClose()
  }
  useWindowEvent('keydown', (e) => e.key === 'Escape' && close())
  const title = displayTitleOf(book)
  const parts = book.collection?.parts.length ?? 0

  return (
    <div className="dialog-backdrop" onPointerDown={close}>
      <section className="dialog free-space-dialog" role="dialog" aria-label="Elimina dal disco" onPointerDown={(e) => e.stopPropagation()}>
        <header className="dialog__header">
          <h2>{state.phase === 'done' ? 'Spazio liberato' : parts ? 'Eliminare gli originali dal disco?' : 'Eliminare il file dal disco?'}</h2>
        </header>

        {state.phase === 'done' ? (
          <p className="free-space-dialog__text">
            <Check size={16} className="free-space-dialog__ok" />
            Liberati {formatBytes(state.freed)}. «{title}» resta in libreria con la sua cronologia.
          </p>
        ) : (
          <>
            <p className="free-space-dialog__title">
              «{title}»{size !== null && <span> · {formatBytes(size)}</span>}
            </p>
            <p className="free-space-dialog__text">
              {parts ? `Verranno eliminati i ${parts} albi originali di questo volume, ` : 'Il file verrà eliminato '}
              definitivamente, senza passare dal Cestino. {KEEP_NOTE} Se rimetti il file nella stessa cartella, con lo stesso nome,
              torna leggibile da solo.
            </p>
            {state.phase === 'error' && <p className="free-space__error">{state.message}</p>}
          </>
        )}

        <footer className="dialog__footer">
          {state.phase === 'done' ? (
            <button className="btn btn--primary" onClick={onClose} autoFocus>
              OK
            </button>
          ) : (
            <>
              <button className="btn btn--ghost" onClick={close} disabled={busy} autoFocus>
                Annulla
              </button>
              <button className="btn btn--danger" onClick={() => void remove()} disabled={busy}>
                <Trash2 size={16} />
                {busy ? 'Eliminazione…' : 'Elimina definitivamente'}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  )
}

/** Spazio dei fumetti, ricalcolato (con un piccolo ritardo) quando cambia la libreria. */
export function useDiskUsage(books: readonly BookSummary[], reclaimable: readonly BookSummary[]): DiskUsage | null {
  const [usage, setUsage] = useState<DiskUsage | null>(null)
  const ids = reclaimable.map((book) => book.id)
  const key = `${books.length}:${books.filter((b) => b.missingSince).length}:${ids.join()}`
  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      api.diskUsage(ids).then((result) => alive && setUsage(result), () => {})
    }, 400)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [key]) // la chiave riassume ciò che cambia lo spazio: albi aggiunti, eliminati o letti
  return usage
}

type BulkDeletion =
  | { phase: 'confirm' }
  | { phase: 'deleting'; done: number }
  | { phase: 'done'; freed: number; failures: string[] }

/** «Elimina tutti dal disco» per gli albi letti: uno alla volta, un errore non ferma gli altri. */
export function DeleteAllFromDiskDialog({ books, onClose }: { books: readonly BookSummary[]; onClose: () => void }): React.JSX.Element {
  // L'elenco è fissato all'apertura: mentre si elimina, la libreria cambia sotto il dialogo.
  const [targets] = useState(books)
  const [size, setSize] = useState<number | null>(null)
  const [state, setState] = useState<BulkDeletion>({ phase: 'confirm' })
  const busy = state.phase === 'deleting'
  const close = (): void => {
    if (!busy) onClose()
  }
  useWindowEvent('keydown', (e) => e.key === 'Escape' && close())

  useEffect(() => {
    let alive = true
    Promise.all(targets.map((book) => api.diskSize(book.id).catch(() => 0))).then((sizes) => alive && setSize(sizes.reduce((a, b) => a + b, 0)))
    return () => {
      alive = false
    }
  }, [targets])

  const removeAll = async (): Promise<void> => {
    let freed = 0
    const failures: string[] = []
    for (const [index, book] of targets.entries()) {
      setState({ phase: 'deleting', done: index })
      try {
        freed += await api.deleteFromDisk(book.id)
      } catch (error) {
        failures.push(`«${displayTitleOf(book)}»: ${errorMessage(error)}`)
      }
    }
    setState({ phase: 'done', freed, failures })
  }

  return (
    <div className="dialog-backdrop" onPointerDown={close}>
      <section className="dialog free-space-dialog" role="dialog" aria-label="Elimina dal disco gli albi letti" onPointerDown={(e) => e.stopPropagation()}>
        <header className="dialog__header">
          <h2>{state.phase === 'done' ? 'Spazio liberato' : `Eliminare dal disco ${targets.length === 1 ? "l'albo letto" : `i ${targets.length} albi letti`}?`}</h2>
        </header>

        {state.phase === 'done' ? (
          <>
            <p className="free-space-dialog__text">
              <Check size={16} className="free-space-dialog__ok" />
              Liberati {formatBytes(state.freed)}. Gli albi restano in libreria con la loro cronologia.
            </p>
            {state.failures.map((failure) => (
              <p key={failure} className="free-space__error">
                {failure}
              </p>
            ))}
          </>
        ) : (
          <>
            <p className="free-space-dialog__title">
              {targets.length} {targets.length === 1 ? 'albo' : 'albi'}
              {size !== null && <span> · {formatBytes(size)}</span>}
            </p>
            <ul className="free-space-dialog__list">
              {targets.map((book) => (
                <li key={book.id}>{displayTitleOf(book)}</li>
              ))}
            </ul>
            <p className="free-space-dialog__text">
              I file vengono eliminati definitivamente, senza passare dal Cestino (per i volumi, tutti i loro originali). Le
              schede restano in libreria, in grigio, con progressi, stato e copertina.
            </p>
          </>
        )}

        <footer className="dialog__footer">
          {state.phase === 'done' ? (
            <button className="btn btn--primary" onClick={onClose} autoFocus>
              OK
            </button>
          ) : (
            <>
              <button className="btn btn--ghost" onClick={close} disabled={busy} autoFocus>
                Annulla
              </button>
              <button className="btn btn--danger" onClick={() => void removeAll()} disabled={busy}>
                <Trash2 size={16} />
                {state.phase === 'deleting' ? `Eliminazione ${state.done + 1} di ${targets.length}…` : 'Elimina tutti definitivamente'}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  )
}

/** Proposta a fine lettura: la scelta resta all'utente, con una seconda conferma. */
export function FreeSpaceOffer({ book }: { book: BookSummary }): React.JSX.Element {
  const { size, state, setState, remove } = useDeleteFromDisk(book)

  if (state.phase === 'done') {
    return (
      <div className="free-space is-done" role="status">
        <Check size={18} />
        <p>Eliminato dal disco: liberati {formatBytes(state.freed)}. La cronologia resta in libreria.</p>
      </div>
    )
  }

  const confirming = state.phase === 'confirm' || state.phase === 'deleting'
  return (
    <div className="free-space">
      <HardDrive size={18} />
      <p>
        {state.phase === 'error' ? (
          <span className="free-space__error">{state.message}</span>
        ) : confirming ? (
          'Eliminarlo definitivamente? Non passa dal Cestino.'
        ) : (
          <>
            {book.collection ? `Vuoi eliminare i ${book.collection.parts.length} originali dal disco` : 'Vuoi rimuoverlo dal disco'}
            {size !== null && ` e liberare ${formatBytes(size)}`}? Progressi e copertina restano in libreria.
          </>
        )}
      </p>
      {confirming ? (
        <span className="free-space__actions">
          <button className="btn btn--ghost" onClick={() => setState({ phase: 'idle' })} disabled={state.phase === 'deleting'}>
            Annulla
          </button>
          <button className="btn btn--danger" onClick={() => void remove()} disabled={state.phase === 'deleting'} autoFocus>
            {state.phase === 'deleting' ? 'Elimino…' : 'Sì, elimina'}
          </button>
        </span>
      ) : (
        <button className="btn" onClick={() => setState({ phase: 'confirm' })}>
          Elimina dal disco
        </button>
      )}
    </div>
  )
}

/** Aprendo un albo senza file si spiega cosa è rimasto e come riaverlo: rimettendo il file o ricollegandolo. */
export function MissingFileDialog({ book, onClose }: { book: BookSummary; onClose: () => void }): React.JSX.Element {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const close = (): void => {
    if (!confirmRemove) onClose()
  }
  useWindowEvent('keydown', (e) => e.key === 'Escape' && close())
  const title = displayTitleOf(book)
  const since = book.missingSince ? ` dal ${formatDate(book.missingSince)}` : ''
  const [candidates, setCandidates] = useState<{ id: string; path: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (book.collection) return
    let alive = true
    api.relinkCandidates(book.id).then((found) => alive && setCandidates(found), () => {})
    return () => {
      alive = false
    }
  }, [book.id, book.collection])

  const relink = async (path: string | null): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      if (await api.relinkBook(book.id, path)) onClose()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="dialog-backdrop" onPointerDown={close}>
        <section className="dialog free-space-dialog" role="dialog" aria-label="Albo archiviato" onPointerDown={(e) => e.stopPropagation()}>
          <header className="dialog__header">
            <h2>Albo archiviato</h2>
          </header>
          <p className="free-space-dialog__text">
            {book.collection ? `Gli originali di «${title}» non sono più sul disco${since}.` : `«${title}» non è più sul disco${since}.`} Progressi, stato e
            copertina sono conservati.{' '}
            {book.collection
              ? 'Per rileggerlo rimetti gli originali nella stessa cartella, con lo stesso nome, oppure ricollegali da «Gestisci volume».'
              : "Se rimetti il file nella stessa cartella con lo stesso nome torna da solo; se l'hai spostato o rinominato, ricollegalo."}
          </p>
          {!book.collection && (
            <p className="details__path" title={book.path}>
              {book.path}
            </p>
          )}
          {candidates.length > 0 && (
            <div className="relink">
              <p className="relink__label">Forse è questo file:</p>
              {candidates.map((candidate) => (
                <div key={candidate.id} className="relink__row">
                  <span title={candidate.path}>{candidate.path}</span>
                  <button className="btn btn--primary" disabled={busy} onClick={() => void relink(candidate.path)}>
                    <Link size={16} />
                    Ricollega
                  </button>
                </div>
              ))}
              <p className="relink__hint">Le due schede diventano una sola, con la cronologia di questa.</p>
            </div>
          )}
          {error && <p className="free-space__error">{error}</p>}
          <footer className="dialog__footer">
            <button className="btn btn--ghost" disabled={busy} onClick={() => setConfirmRemove(true)}>
              <Trash2 size={16} />
              {book.collection ? 'Sciogli volume' : 'Rimuovi dalla libreria'}
            </button>
            {!book.collection && (
              <button className="btn" disabled={busy} onClick={() => void relink(null)}>
                <Search size={16} />
                Cerca il file…
              </button>
            )}
            <button className="btn btn--primary" onClick={onClose} autoFocus={candidates.length === 0}>
              OK
            </button>
          </footer>
        </section>
      </div>
      {confirmRemove && <RemoveBookDialog book={book} onClose={() => setConfirmRemove(false)} onRemoved={onClose} />}
    </>
  )
}
