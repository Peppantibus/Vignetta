import { classifyBook, mangaOf } from './catalog/classify'
import { cleanTitle } from './cleanTitle'
import { compareNatural } from './naturalSort'
import type { BookSummary, ReadingDirection } from './types'

/**
 * Riconoscimento delle serie. Se il fumetto ha i metadati (ComicInfo.xml) si usano quelli; poi il dizionario
 * dei manga (così "Dragon Ball 01 Son Goku…" e "Dragon Ball 02 Kamehameha" stanno insieme);
 * altrimenti si ricava la serie dal nome del file togliendo numeri e annotazioni tra parentesi:
 * "Marvel Miniserie 046 - Spiderman Blue 2" e "Marvel Miniserie 047 - Spiderman Blue 3"
 * diventano entrambi "marvel miniserie spiderman blue".
 */

export interface SeriesGroup {
  key: string
  name: string
  /** In ordine di uscita. */
  books: BookSummary[]
}

/** Annotazioni tra parentesi (anno, edizione, gruppo di scansione…): non distinguono una serie. */
const BRACKETS = /\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g
/** Parole che introducono il numero dell'albo ("vol. 2", "n. 15", "#3"): fanno parte del numero, non del titolo. */
const ISSUE_WORDS = /(?<![\p{L}\p{N}])(?:vol(?:ume)?|tomo|n|nr|num(?:ero)?|no|cap(?:itolo)?|ch(?:apter)?|issue|albo)\.?\s*(?=\d)|#\s*(?=\d)/giu
/** Numeri isolati, non quelli dentro una parola come "c2c" o "X-23". */
const STANDALONE_NUMBERS = /(?<![\p{L}\p{N}-])\d+(?:[.,]\d+)?(?![\p{L}\p{N}])/gu

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** "01 of 03", "2 di 5": numero e totale dell'albo. */
const ISSUE_OF_TOTAL = /(?<![\p{L}\p{N}])\d+\s*(?:of|di|\/)\s*\d+(?![\p{L}\p{N}])/giu

function withoutNumbers(title: string): string {
  return title.replace(BRACKETS, ' ').replace(ISSUE_OF_TOTAL, ' ').replace(ISSUE_WORDS, ' ').replace(STANDALONE_NUMBERS, ' ')
}

/** Il titolo scelto a mano guida anche il raggruppamento, mantenendo intatti i metadati originali. */
function forSeries(book: BookSummary): BookSummary {
  return book.customTitle ? { ...book, title: book.customTitle, metadata: null } : book
}

export function seriesKeyOf(book: BookSummary): string {
  if (book.collection) return `volume:${book.id}`
  book = forSeries(book)
  return normalize(book.metadata?.series ?? mangaOf(book)?.name ?? withoutNumbers(book.title))
}

/** Nome leggibile della serie: dai metadati, o dal titolo pulito senza numeri e separatori rimasti vuoti. */
export function seriesNameOf(book: BookSummary): string {
  const custom = Boolean(book.customTitle)
  book = forSeries(book)
  if (book.metadata?.series) return book.metadata.series
  const manga = mangaOf(book)
  if (manga) return manga.name
  return withoutNumbers(custom ? book.title : cleanTitle(book.title, { keepIssue: false }))
    .split(/\s+[-–—]\s+|\s+[-–—]$|^[-–—]\s+/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' - ')
}

/** Numero dell'albo: dai metadati, o l'ultimo numero isolato del titolo (escluse le parentesi). */
export function issueNumberOf(book: BookSummary): string | null {
  book = forSeries(book)
  if (book.metadata?.number) return book.metadata.number
  const manga = mangaOf(book)
  if (manga?.number) return manga.number
  const numbers = book.title.replace(BRACKETS, ' ').match(STANDALONE_NUMBERS)
  return numbers ? String(Number.parseFloat(numbers.at(-1)!.replace(',', '.'))) : null
}

/** Titolo personale, poi "Serie #numero" dai metadati, infine il nome del file ripulito (vedi `cleanTitle`). */
export function displayTitleOf(book: BookSummary): string {
  if (book.customTitle) return book.customTitle
  const series = book.metadata?.series
  if (!series) return cleanTitle(book.title)
  const number = book.metadata?.number
  return number ? `${series} #${number}` : series
}

/**
 * Senso di lettura: quello scelto per il fumetto; altrimenti da destra a sinistra per i manga
 * (riconosciuti da metadati, dizionario o categoria), tranne i manhwa coreani; infine quello predefinito.
 */
export function readingDirectionOf(book: BookSummary, fallback: ReadingDirection): ReadingDirection {
  if (book.direction) return book.direction
  if (mangaOf(book)?.leftToRight) return 'ltr'
  if (book.metadata?.rightToLeft || classifyBook(book).publisher === 'manga') return 'rtl'
  return fallback
}

function compareIssues(a: BookSummary, b: BookSummary): number {
  const numberA = Number.parseFloat(issueNumberOf(a) ?? '')
  const numberB = Number.parseFloat(issueNumberOf(b) ?? '')
  if (Number.isFinite(numberA) && Number.isFinite(numberB) && numberA !== numberB) return numberA - numberB
  return compareNatural(displayTitleOf(a), displayTitleOf(b))
}

/** Raccoglie le serie con almeno due albi; gli altri fumetti restano singoli. */
export function groupBySeries(books: readonly BookSummary[]): { groups: SeriesGroup[]; singles: BookSummary[] } {
  const byKey = new Map<string, BookSummary[]>()
  for (const book of books) {
    const key = seriesKeyOf(book)
    byKey.set(key, [...(byKey.get(key) ?? []), book])
  }

  const groups: SeriesGroup[] = []
  const singles: BookSummary[] = []
  for (const [key, members] of byKey) {
    if (members.length < 2) {
      singles.push(...members)
      continue
    }
    const ordered = [...members].sort(compareIssues)
    groups.push({ key, name: seriesNameOf(ordered[0]!), books: ordered })
  }
  return { groups, singles }
}

const parentOf = (path: string): string => path.slice(0, Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/')))

/** Il fumetto da leggere dopo: il numero successivo della serie, o il file successivo nella stessa cartella. */
export function nextInSeries(books: readonly BookSummary[], current: BookSummary): BookSummary | null {
  if (current.collection) return null
  // Gli albi senza file non si possono aprire: si propone il primo successivo ancora sul disco.
  books = books.filter((book) => !book.collection && (!book.missingSince || book.id === current.id))
  const key = seriesKeyOf(current)
  const series = books.filter((b) => seriesKeyOf(b) === key)
  const siblings =
    series.length > 1
      ? series.sort(compareIssues)
      : books.filter((b) => parentOf(b.path) === parentOf(current.path)).sort((a, b) => compareNatural(a.path, b.path))
  return siblings[siblings.findIndex((b) => b.id === current.id) + 1] ?? null
}
