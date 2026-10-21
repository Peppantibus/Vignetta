import { LIBRARY_ZOOM_MAX, LIBRARY_ZOOM_MIN } from '../../shared/settings'
import type { BookPatch, FitMode, ManualClassification, Publisher, ReaderSettings, ReadingDirection } from '../../shared/types'

/**
 * Le modifiche che arrivano dalla finestra vengono controllate prima di toccare library.json: solo i campi previsti,
 * con il tipo giusto. Un errore di programmazione (o una pagina compromessa) non deve poter scrivere campi come
 * `path` o `folder`, né valori che poi rompono la libreria all'apertura.
 */

const PUBLISHERS: readonly Publisher[] = ['marvel', 'dc', 'manga', 'other']
const DIRECTIONS: readonly ReadingDirection[] = ['ltr', 'rtl']
const FITS: readonly FitMode[] = ['screen', 'width']

function invalid(field: string): never {
  throw new Error(`Modifica non valida (${field}).`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boolean(value: unknown, field: string): boolean {
  return typeof value === 'boolean' ? value : invalid(field)
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  return allowed.includes(value as T) ? (value as T) : invalid(field)
}

function between(value: unknown, min: number, max: number, field: string): number {
  return typeof value === 'number' && value >= min && value <= max ? value : invalid(field)
}

function classification(value: unknown): ManualClassification | null {
  if (value === null) return null
  if (!isRecord(value) || !Array.isArray(value.characters) || value.characters.some((id) => typeof id !== 'string')) invalid('classification')
  return { publisher: oneOf(value.publisher, PUBLISHERS, 'classification'), characters: [...value.characters as string[]] }
}

/** Le modifiche a un albo: direzione, accoppiamento, stato, pagina, classificazione e titolo personale. */
export function bookPatch(input: unknown): BookPatch {
  if (!isRecord(input)) invalid('albo')
  const patch: BookPatch = {}
  for (const [field, value] of Object.entries(input)) {
    switch (field) {
      case 'direction':
        patch.direction = value === null ? null : oneOf(value, DIRECTIONS, field)
        break
      case 'shiftPairs':
      case 'finished':
        patch[field] = boolean(value, field)
        break
      case 'currentPage':
        patch.currentPage = Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : invalid(field)
        break
      case 'classification':
        patch.classification = classification(value)
        break
      case 'customTitle':
        // Titolo vuoto e spazi li controlla `Library.updateBook`.
        patch.customTitle = value === null || typeof value === 'string' ? value : invalid(field)
        break
      default:
        invalid(field)
    }
  }
  return patch
}

/** Le impostazioni che l'interfaccia può cambiare; la cartella della copia esterna passa solo dal selettore nativo. */
export function settingsPatch(input: unknown): Partial<ReaderSettings> {
  if (!isRecord(input)) invalid('impostazioni')
  const patch: Partial<ReaderSettings> = {}
  for (const [field, value] of Object.entries(input)) {
    switch (field) {
      case 'doublePage':
      case 'coverAlone':
      case 'groupSeries':
      case 'nightMode':
      case 'trimBorders':
        patch[field] = boolean(value, field)
        break
      case 'fit':
        patch.fit = oneOf(value, FITS, field)
        break
      case 'defaultDirection':
        patch.defaultDirection = oneOf(value, DIRECTIONS, field)
        break
      case 'nightIntensity':
        patch.nightIntensity = between(value, 0, 1, field)
        break
      case 'libraryZoom':
        patch.libraryZoom = between(value, LIBRARY_ZOOM_MIN, LIBRARY_ZOOM_MAX, field)
        break
      case 'externalBackupFolder':
        break // ignorata: si cambia con `setExternalBackupFolder`
      default:
        invalid(field)
    }
  }
  return patch
}
