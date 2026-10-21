import { readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { BookKind } from '../../shared/types'
import { isArchiveComplete } from '../sources/archiveComplete'
import { isPageName } from '../sources/pageSource'

export interface FoundBook {
  path: string
  kind: BookKind
}

const ARCHIVE_KINDS: Record<string, BookKind> = {
  '.cbz': 'zip',
  '.zip': 'zip',
  '.cbr': 'rar',
  '.rar': 'rar',
  '.pdf': 'pdf'
}

export function archiveKind(path: string): BookKind | null {
  return ARCHIVE_KINDS[extname(path).toLowerCase()] ?? null
}

/**
 * Per quanto tempo un archivio senza la struttura di chiusura può ancora essere un download in corso.
 * Passato questo tempo senza modifiche lo si importa comunque: alcuni programmi non scrivono il blocco finale.
 */
export const INCOMPLETE_LIMIT_MS = 10 * 60_000

/**
 * Vero per un archivio incompleto (vedi `isArchiveComplete`) modificato negli ultimi minuti: probabilmente
 * un download non ancora finito, da non aggiungere adesso. Le cartelle di immagini non si controllano.
 */
export async function isStillDownloading(found: FoundBook, now = Date.now()): Promise<boolean> {
  if (found.kind === 'folder') return false
  const info = await stat(found.path).catch(() => null)
  if (!info || now - info.mtimeMs >= INCOMPLETE_LIMIT_MS) return false
  // Un file recente che non si riesce nemmeno a leggere è con ogni probabilità ancora aperto dal programma che lo scarica.
  return !(await isArchiveComplete(found.path).catch(() => false))
}

/**
 * Cerca i fumetti in una cartella e nelle sottocartelle:
 * ogni archivio è un fumetto, e ogni cartella che contiene direttamente immagini è un fumetto
 * (tipico dei manga divisi in capitoli: Serie/Capitolo 001/*.jpg).
 */
export async function scanFolder(root: string, maxDepth = 8): Promise<FoundBook[]> {
  const found: FoundBook[] = []

  async function visit(dir: string, depth: number): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return // cartella non leggibile: la saltiamo
    }

    if (entries.some((e) => e.isFile() && isPageName(e.name))) found.push({ path: dir, kind: 'folder' })

    const subdirs: string[] = []
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        subdirs.push(full)
      } else if (entry.isFile()) {
        const kind = archiveKind(entry.name)
        if (kind) found.push({ path: full, kind })
      }
    }
    if (depth < maxDepth) await Promise.all(subdirs.map((d) => visit(d, depth + 1)))
  }

  await visit(root, 0)
  return found
}
