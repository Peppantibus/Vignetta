import { createHash } from 'node:crypto'
import { extname } from 'node:path'

/** Lavori eseguiti dal worker RAR (la decompressione è sincrona e bloccherebbe il processo principale). */
export type RarJob =
  | { kind: 'list'; archive: string }
  | { kind: 'extract'; archive: string; targetDir: string; files: string[] }

export type RarMessage =
  | { type: 'list'; names: string[] }
  | { type: 'file'; name: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

/** Nome piatto e sicuro con cui una pagina dell'archivio viene salvata nella cache. */
export function cacheFileName(entryName: string): string {
  const hash = createHash('sha1').update(entryName).digest('hex').slice(0, 20)
  return hash + extname(entryName).toLowerCase()
}
