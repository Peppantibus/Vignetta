import { useEffect, useState } from 'react'
import type { BackupStatus } from '../../../shared/types'
import { api, errorMessage } from '../api'
import { FolderOpen, FolderPlus, HardDrive, RefreshCw, Trash2, X } from '../components/icons'
import { useWindowEvent } from '../hooks'
import { RemoveFolderDialog } from './RemoveDialogs'

interface FoldersDialogProps {
  folders: string[]
  onClose: () => void
}

/** Elenco delle cartelle tenute d'occhio dalla libreria. */
export function FoldersDialog({ folders, onClose }: FoldersDialogProps): React.JSX.Element {
  const [scanning, setScanning] = useState(false)
  /** Cartella in attesa di conferma: con la conferma aperta Esc e il clic fuori chiudono solo quella. */
  const [removing, setRemoving] = useState<string | null>(null)
  const close = (): void => {
    if (!removing) onClose()
  }
  useWindowEvent('keydown', (e) => e.key === 'Escape' && close())

  const rescan = async (): Promise<void> => {
    setScanning(true)
    try {
      await api.rescan()
    } finally {
      setScanning(false)
    }
  }

  return (
    <>
      <div className="dialog-backdrop" onPointerDown={close}>
        <section className="dialog" role="dialog" aria-label="Cartelle della libreria" onPointerDown={(e) => e.stopPropagation()}>
          <header className="dialog__header">
            <h2>Cartelle della libreria</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Chiudi">
              <X size={18} />
            </button>
          </header>

          <p className="dialog__hint">Vignetta cerca i fumetti (CBZ, CBR e cartelle di immagini) in queste cartelle e nelle loro sottocartelle.</p>

          {folders.length === 0 ? (
            <div className="folders-empty">Nessuna cartella ancora.</div>
          ) : (
            <ul className="folders-list">
              {folders.map((folder) => (
                <li key={folder}>
                  <FolderOpen size={18} />
                  <span title={folder}>{folder}</span>
                  <button className="icon-btn" onClick={() => setRemoving(folder)} aria-label="Rimuovi cartella" title="Rimuovi dalla libreria">
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <footer className="dialog__footer">
            <button className="btn btn--ghost" onClick={() => void rescan()} disabled={scanning}>
              <RefreshCw size={16} className={scanning ? 'is-spinning' : undefined} />
              {scanning ? 'Aggiornamento…' : 'Aggiorna'}
            </button>
            <button className="btn btn--primary" onClick={() => void api.addFolder()}>
              <FolderPlus size={16} />
              Aggiungi cartella
            </button>
          </footer>

          <ExternalBackup />
        </section>
      </div>
      {removing && <RemoveFolderDialog folder={removing} onClose={() => setRemoving(null)} />}
    </>
  )
}

/** Seconda copia giornaliera della libreria in una cartella scelta dall'utente (altro disco o cartella sincronizzata). */
function ExternalBackup(): React.JSX.Element {
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void api.backupStatus().then((next) => !cancelled && setStatus(next))
    return () => {
      cancelled = true
    }
  }, [])

  const change = async (action: () => Promise<BackupStatus>): Promise<void> => {
    setBusy(true)
    setFailure(null)
    try {
      setStatus(await action())
    } catch (error) {
      setFailure(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const folder = status?.folder ?? null
  return (
    <div className="backup-section">
      <h3>Copia di sicurezza esterna</h3>
      <p className="dialog__hint">
        Una volta al giorno, e alla chiusura, Vignetta copia la libreria (cronologia e progressi) anche in questa cartella.
        Scegline una su un altro disco o sincronizzata nel cloud: si conservano le ultime 30 copie.
      </p>
      {folder ? (
        <div className="folders-list">
          <div className="backup-row">
            <HardDrive size={18} />
            <span title={folder}>{folder}</span>
          </div>
        </div>
      ) : (
        <div className="folders-empty">{status ? 'Nessuna copia esterna.' : '…'}</div>
      )}
      {folder && status && (
        <p className={`backup-status${status.error ? ' backup-status--error' : ''}`} role="status">
          {status.error
            ? status.error
            : status.lastCopyAt
              ? `Ultima copia: ${copyTime(status.lastCopyAt)}`
              : 'Nessuna copia ancora: verrà fatta alla prossima modifica della libreria.'}
        </p>
      )}
      {failure && <p className="backup-status backup-status--error" role="alert">{failure}</p>}
      <footer className="dialog__footer">
        {folder && (
          <button className="btn btn--ghost" onClick={() => void change(api.clearBackupFolder)} disabled={busy}>
            Non usare
          </button>
        )}
        <button className="btn" onClick={() => void change(api.chooseBackupFolder)} disabled={busy}>
          <FolderOpen size={16} />
          Scegli cartella…
        </button>
      </footer>
    </div>
  )
}

function copyTime(at: number): string {
  const date = new Date(at)
  const time = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === new Date().toDateString()) return `oggi alle ${time}`
  return `${date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })} alle ${time}`
}
