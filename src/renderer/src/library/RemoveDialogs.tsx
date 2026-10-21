import { useEffect, useState } from 'react'
import { displayTitleOf } from '../../../shared/series'
import type { BookSummary, FolderRemoval } from '../../../shared/types'
import { api, errorMessage } from '../api'
import { Trash2 } from '../components/icons'
import { useWindowEvent } from '../hooks'
import { progressLabel } from './books'

/**
 * Conferme prima di togliere schede dalla libreria: la cronologia (progressi, stato, titoli personali)
 * vive solo in library.json, e per gli albi archiviati è l'unico ricordo della lettura.
 */

interface ConfirmProps {
  label: string
  title: string
  confirm: string
  onConfirm: () => Promise<void>
  onClose: () => void
  children: React.ReactNode
}

/** Struttura comune: Annulla ha il fuoco, l'azione è rossa, un errore lascia il dialogo aperto. */
function ConfirmDialog({ label, title, confirm, onConfirm, onClose, children }: ConfirmProps): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = (): void => {
    if (!busy) onClose()
  }
  useWindowEvent('keydown', (e) => e.key === 'Escape' && close())

  const run = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch (cause) {
      setError(errorMessage(cause))
      setBusy(false)
    }
  }

  return (
    <div className="dialog-backdrop" onPointerDown={close}>
      <section className="dialog free-space-dialog" role="alertdialog" aria-label={label} onPointerDown={(e) => e.stopPropagation()}>
        <header className="dialog__header">
          <h2>{title}</h2>
        </header>
        {children}
        {error && <p className="free-space__error">{error}</p>}
        <footer className="dialog__footer">
          <button className="btn btn--ghost" onClick={close} disabled={busy} autoFocus>
            Annulla
          </button>
          <button className="btn btn--danger" onClick={() => void run()} disabled={busy}>
            <Trash2 size={16} />
            {confirm}
          </button>
        </footer>
      </section>
    </div>
  )
}

/** «Rimuovi dalla libreria» e «Sciogli volume»: cosa si perde e cosa resta sul disco. */
export function RemoveBookDialog({ book, onClose, onRemoved }: { book: BookSummary; onClose: () => void; onRemoved?: () => void }): React.JSX.Element {
  const title = displayTitleOf(book)
  const remove = async (): Promise<void> => {
    await api.removeBook(book.id)
    onClose()
    onRemoved?.()
  }

  if (book.collection) {
    return (
      <ConfirmDialog label="Sciogli volume" title="Sciogliere il volume?" confirm="Sciogli volume" onConfirm={remove} onClose={onClose}>
        <p className="free-space-dialog__title">
          «{title}» <span>· {book.collection.parts.length} albi</span>
        </p>
        <p className="free-space-dialog__text">
          Gli albi originali restano sul disco e le loro schede, con la loro cronologia, non vengono toccate. Del volume si
          perdono i progressi di lettura, la copertina scelta e le copie escluse.
        </p>
      </ConfirmDialog>
    )
  }

  return (
    <ConfirmDialog label="Rimuovi dalla libreria" title="Rimuovere dalla libreria?" confirm="Rimuovi dalla libreria" onConfirm={remove} onClose={onClose}>
      <p className="free-space-dialog__title">
        «{title}» <span>· {book.missingSince ? 'Archiviato' : progressLabel(book)}</span>
      </p>
      {book.missingSince ? (
        <p className="free-space__error">
          Il file non è più sul disco: questa scheda è l'unico ricordo della lettura. Progressi e stato andranno persi
          definitivamente.
        </p>
      ) : (
        <p className="free-space-dialog__text">
          Si perdono progressi, stato di lettura, titolo personale e classificazione. Il file resta sul disco e la scansione
          delle cartelle non lo riaggiungerà: per riaverlo trascinalo nella finestra o aprilo con «Apri».
        </p>
      )}
    </ConfirmDialog>
  )
}

/** Togliere una cartella dalla libreria toglie anche le schede dei suoi albi, con la loro cronologia. */
export function RemoveFolderDialog({ folder, onClose }: { folder: string; onClose: () => void }): React.JSX.Element {
  const [removal, setRemoval] = useState<FolderRemoval | null>(null)

  useEffect(() => {
    let alive = true
    api.folderRemoval(folder).then((found) => alive && setRemoval(found), () => {})
    return () => {
      alive = false
    }
  }, [folder])

  const remove = async (): Promise<void> => {
    await api.removeFolder(folder)
    onClose()
  }

  return (
    <ConfirmDialog label="Rimuovi cartella" title="Rimuovere la cartella dalla libreria?" confirm="Rimuovi cartella" onConfirm={remove} onClose={onClose}>
      <p className="details__path" title={folder}>
        {folder}
      </p>
      {removal === null ? (
        <p className="free-space-dialog__text">…</p>
      ) : removal.books === 0 ? (
        <p className="free-space-dialog__text">
          Nessun albo di questa cartella è in libreria. Vignetta smetterà di controllarla; i file sul disco non vengono toccati.
        </p>
      ) : (
        <>
          <p className="free-space-dialog__title">
            {countLabel(removal.books, 'albo', 'albi')}
            {historyLabel(removal) && <span> · {historyLabel(removal)}</span>}
          </p>
          <p className="free-space-dialog__text">
            Vignetta smetterà di controllare la cartella e toglierà dalla libreria i suoi albi con la loro cronologia
            (progressi, stato, titoli personali e classificazioni). I file sul disco non vengono toccati: se riaggiungi la
            cartella, i fumetti tornano come nuovi.
          </p>
          {removal.archived > 0 && (
            <p className="free-space__error">
              {removal.archived === 1 ? "Un albo è archiviato" : `${removal.archived} albi sono archiviati`}: il file non è più
              sul disco e la scheda è l'unico ricordo della lettura. Andrà perso definitivamente.
            </p>
          )}
        </>
      )}
    </ConfirmDialog>
  )
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/** «3 letti · 1 in corso · 2 archiviati», solo le voci presenti. */
function historyLabel({ finished, inProgress, archived }: FolderRemoval): string {
  return [
    finished && countLabel(finished, 'letto', 'letti'),
    inProgress && `${inProgress} in corso`,
    archived && countLabel(archived, 'archiviato', 'archiviati')
  ].filter(Boolean).join(' · ')
}
