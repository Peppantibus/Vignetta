import { stat } from 'node:fs/promises'
import { archiveFormatOf, isArchiveComplete } from './archiveComplete'
import { readFileHead } from './fileRead'

export const OPEN_ERROR = {
  missing: 'Il file non è più sul disco.',
  incomplete: 'Il file sembra incompleto: forse il download non è ancora finito.',
  password: 'Archivio protetto da password: non supportato',
  damaged: 'Il file sembra danneggiato o in un formato non supportato.'
} as const

/**
 * Messaggio in italiano per un fumetto che non si apre, al posto dei testi tecnici delle librerie
 * (es. «File read error» di node-unrar-js). L'errore originale va registrato da chi chiama.
 */
export async function describeOpenError(path: string, error: unknown): Promise<string> {
  const info = await stat(path).catch(() => null)
  if (!info) return OPEN_ERROR.missing
  if (info.isFile() && await looksIncomplete(path, info.size)) return OPEN_ERROR.incomplete

  const message = error instanceof Error ? error.message : String(error)
  if (/password/i.test(message)) {
    // I messaggi nostri (ZIP, PDF) sono già in italiano; quello di node-unrar-js no.
    return /protetto da password|richiede una password/i.test(message) ? message : OPEN_ERROR.password
  }
  return OPEN_ERROR.damaged
}

/** Archivio senza la sua chiusura, oppure vuoto o pieno di zeri (spazio riservato da un download). */
async function looksIncomplete(path: string, size: number): Promise<boolean> {
  try {
    if (size === 0) return true
    const head = await readFileHead(path, 8)
    // Un formato non riconosciuto con dati veri è un file di altro tipo, non un download a metà.
    if (!archiveFormatOf(head)) return head.every((byte) => byte === 0)
    return !(await isArchiveComplete(path))
  } catch {
    return false
  }
}
