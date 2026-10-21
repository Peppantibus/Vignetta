import type { Stats } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import type { PageSize } from '../../shared/types'

/** Accesso uniforme alle pagine di un fumetto, qualunque sia il formato. */
export interface PageSource {
  /** Nomi delle pagine in ordine di lettura. */
  readonly pages: readonly string[]
  /** Dimensioni già note senza preparare tutte le immagini, per i documenti PDF. */
  readonly pageSizes?: readonly (PageSize | null)[]
  read(index: number): Promise<Buffer>
  /** Legge almeno i primi `bytes` byte (o tutta la pagina se più corta): basta per conoscerne le dimensioni. */
  readHead(index: number, bytes: number): Promise<Buffer>
  /** Contenuto di ComicInfo.xml, se presente. */
  readMetadata(): Promise<Buffer | null>
  /** Avvia in background la preparazione di tutte le pagine, se il formato ne trae vantaggio. */
  prefetchAll?(): void
  /** Interrompe subito i lavori in background (es. l'estrazione di un RAR): il file sta per sparire o è cambiato. */
  abort?(): void
  close(): Promise<void>
}

const IMAGE_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp'
}

export function mimeOf(name: string): string {
  return IMAGE_MIME[extname(name).toLowerCase()] ?? 'application/octet-stream'
}

/** Percorso interno all'archivio con le barre uniformate, e il nome del file. */
function splitEntryName(name: string): { normalized: string; base: string } {
  const normalized = name.replaceAll('\\', '/')
  return { normalized, base: normalized.slice(normalized.lastIndexOf('/') + 1) }
}

/** Vero per il file dei metadati ComicInfo.xml, in qualunque cartella dell'archivio. */
export function isComicInfoName(name: string): boolean {
  return splitEntryName(name).base.toLowerCase() === 'comicinfo.xml'
}

/** Vero per le immagini da mostrare, esclusi i file di servizio di macOS. */
export function isPageName(name: string): boolean {
  const { normalized, base } = splitEntryName(name)
  return extname(base).toLowerCase() in IMAGE_MIME && !base.startsWith('._') && !normalized.includes('__MACOSX/')
}

/**
 * Versione del file su disco (dimensione e data di modifica): se cambia, errori e cache legati alla
 * versione precedente non valgono più. Per le cartelle cambia quando si aggiungono o tolgono file.
 */
export async function fileSignature(path: string): Promise<string> {
  return statSignature(await stat(path))
}

/** La stessa firma, da un `stat` già fatto. */
export function statSignature(info: Stats): string {
  return `${info.size}/${info.mtimeMs}`
}
