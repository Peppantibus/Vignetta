import type { BookSummary, Publisher } from '../types'
import { DC_CHARACTERS, HERO_HINTS, IGNORED_PHRASES, MARVEL_CHARACTERS, PUBLISHER_HINTS, type CharacterEntry } from './characters'
import { MANGA_SERIES, MANGAKA } from './manga'

/**
 * Classifica i fumetti per editore (Marvel, DC, Manga, Altri) e per personaggio.
 * Ordine di priorità:
 *   1. la classificazione scelta a mano;
 *   2. l'editore dichiarato nei metadati;
 *   3. i manga (metadati, lettura da destra a sinistra, serie o autore nel dizionario dei manga);
 *   4. un editore riconoscibile nel titolo (Marvel, Corno, RW Lion, Planeta…);
 *   5. l'editore dei personaggi trovati nel titolo;
 *   6. altrimenti "Altri".
 */

export type HeroPublisher = 'marvel' | 'dc'

export interface Character {
  id: string
  name: string
  publisher: HeroPublisher
  /** L'eroe o la squadra a cui appartiene (cattivi, spalle, comprimari): vedi `characters.ts`. */
  family?: string
}

export interface Classification {
  publisher: Publisher
  /** Id dei personaggi, nell'ordine in cui compaiono nel titolo. */
  characters: string[]
  manual: boolean
}

/** Un manga riconosciuto dal dizionario, con il numero del volume se il titolo lo riporta. */
export interface MangaMatch {
  id: string
  name: string
  leftToRight: boolean
  number: string | null
}

export const PUBLISHERS: readonly { id: Publisher; name: string }[] = [
  { id: 'marvel', name: 'Marvel' },
  { id: 'dc', name: 'DC' },
  { id: 'manga', name: 'Manga' },
  { id: 'other', name: 'Altri' }
]

/** Frasi di più parole da cercare al massimo (il nome più lungo del dizionario ne ha 5). */
const MAX_PHRASE_WORDS = 6

interface Index {
  characters: Map<string, Character>
  /** Nome normalizzato → id del personaggio. */
  aliases: Map<string, string>
  /** Luogo, soprannome o testata normalizzati → id dell'eroe (vedi `HERO_HINTS`). */
  heroHints: Map<string, string>
  hints: Map<string, Publisher>
  ignored: readonly string[]
  /** Nome normalizzato → serie manga. */
  manga: Map<string, Omit<MangaMatch, 'number'>>
  mangaka: Set<string>
}

let index: Index | null = null

/** L'indice viene costruito una volta sola, alla prima classificazione. */
function getIndex(): Index {
  if (index) return index
  const characters = new Map<string, Character>()
  const aliases = new Map<string, string>()
  const add = (entries: readonly CharacterEntry[], publisher: HeroPublisher): void => {
    for (const [id, name, names, family] of entries) {
      characters.set(id, { id, name, publisher, ...(family ? { family } : {}) })
      // Il nome mostrato non viene cercato: alcuni (Tempesta, La Cosa…) sono parole comuni.
      for (const alias of names) aliases.set(normalize(alias), id)
    }
  }
  add(MARVEL_CHARACTERS, 'marvel')
  add(DC_CHARACTERS, 'dc')
  const heroHints = new Map<string, string>()
  for (const [id, names] of Object.entries(HERO_HINTS)) {
    for (const name of names) heroHints.set(normalize(name), id)
  }

  const hints = new Map<string, Publisher>()
  for (const [publisher, names] of Object.entries(PUBLISHER_HINTS) as [Publisher, readonly string[]][]) {
    for (const name of names) hints.set(normalize(name), publisher)
  }
  const manga = new Map<string, Omit<MangaMatch, 'number'>>()
  for (const [id, name, names, options] of MANGA_SERIES) {
    for (const alias of names) manga.set(normalize(alias), { id, name, leftToRight: options?.leftToRight ?? false })
  }

  index = { characters, aliases, heroHints, hints, ignored: IGNORED_PHRASES.map(normalize), manga, mangaka: new Set(MANGAKA.map(normalize)) }
  return index
}

/** Minuscole, senza accenti, punteggiatura sostituita da spazi: "L'Uomo-Ragno" → "l uomo ragno". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

interface Phrase {
  text: string
  /** Parole del testo normalizzato e posizione della parola che segue la frase. */
  words: readonly string[]
  end: number
}

/** Le parole del testo normalizzato; le frasi ignorate diventano "|", che nessuna frase attraversa. */
function wordsOf(text: string, ignored: readonly string[]): string[] {
  let normalized = ` ${normalize(text)} `
  for (const phrase of ignored) normalized = normalized.replaceAll(` ${phrase} `, ' | ')
  return normalized.trim().split(' ')
}

/** Tutte le sequenze di parole consecutive del testo, nell'ordine in cui iniziano. */
function phrasesOf(text: string, ignored: readonly string[] = []): Phrase[] {
  const words = wordsOf(text, ignored)
  const phrases: Phrase[] = []
  for (let start = 0; start < words.length; start++) {
    for (let length = 1; length <= MAX_PHRASE_WORDS && start + length <= words.length; length++) {
      const phrase = words.slice(start, start + length)
      if (phrase.includes('|')) break // non si attraversano le frasi ignorate
      phrases.push({ text: phrase.join(' '), words, end: start + length })
    }
  }
  return phrases
}

/** Parole che possono stare tra il nome della serie e il numero del volume ("vol. 3", "n. 12"). */
const VOLUME_WORDS = new Set(['vol', 'volume', 'tomo', 'n', 'nr', 'no', 'num', 'numero'])

/** Il numero che segue il nome della serie, se c'è: "Dragon Ball 01 … 2017" → "1" (e non l'anno). */
function numberAfter(words: readonly string[], position: number): string | null {
  let i = position
  while (VOLUME_WORDS.has(words[i] ?? '')) i++
  const word = words[i]
  return word && /^\d+$/.test(word) ? String(Number.parseInt(word, 10)) : null
}

/**
 * Id dei personaggi nominati nel testo, senza ripetizioni. In ogni punto vince il nome più lungo e le sue parole non
 * si usano più: "Doomsday Clock" è Watchmen e non anche Doomsday, "Batman che ride" non è anche Batman.
 * `aliases` può essere un altro elenco di nomi (gli indizi deboli di `HERO_HINTS`).
 */
export function findCharacters(text: string | undefined, aliases: ReadonlyMap<string, string> = getIndex().aliases): string[] {
  if (!text) return []
  const { ignored } = getIndex()
  const words = wordsOf(text, ignored)
  const found = new Set<string>()
  for (let start = 0; start < words.length; ) {
    let match: { id: string; end: number } | null = null
    for (let end = start + 1; end <= Math.min(words.length, start + MAX_PHRASE_WORDS); end++) {
      const phrase = words.slice(start, end)
      if (phrase.includes('|')) break
      const id = aliases.get(phrase.join(' '))
      if (id) match = { id, end }
    }
    if (match) found.add(match.id)
    start = match?.end ?? start + 1
  }
  return [...found]
}

/**
 * Toglie i personaggi la cui famiglia è già tra quelli trovati: "X-Men - La saga di Fenice Nera" resta solo sotto gli
 * X-Men, "Spider-Man - L'ultima caccia di Kraven" solo sotto Spider-Man. Da soli tengono il proprio riquadro.
 */
export function withoutFamilyMembers(ids: readonly string[]): string[] {
  const present = new Set(ids)
  return ids.filter((id) => {
    const family = characterById(id)?.family
    return !family || !present.has(family)
  })
}

/** La serie manga nominata nel testo (la più lunga, se più nomi si sovrappongono). */
export function findManga(text: string | undefined): MangaMatch | null {
  if (!text) return null
  const { manga } = getIndex()
  let best: { phrase: Phrase; series: Omit<MangaMatch, 'number'> } | null = null
  for (const phrase of phrasesOf(text)) {
    const series = manga.get(phrase.text)
    if (series && (!best || phrase.text.length > best.phrase.text.length)) best = { phrase, series }
  }
  return best ? { ...best.series, number: numberAfter(best.phrase.words, best.phrase.end) } : null
}

/** Il manga a cui appartiene un fumetto, cercato nel titolo e nei metadati. */
export function mangaOf(book: BookSummary): MangaMatch | null {
  return findManga(book.customTitle ?? book.title) ?? findManga(book.metadata?.series) ?? findManga(book.metadata?.title)
}

/** Vero se il testo nomina un autore di manga. */
function mentionsMangaka(text: string | undefined): boolean {
  if (!text) return false
  const { mangaka } = getIndex()
  return phrasesOf(text).some((phrase) => mangaka.has(phrase.text))
}

export function findPublisherHint(text: string | undefined): Publisher | null {
  if (!text) return null
  const { hints, ignored } = getIndex()
  for (const phrase of phrasesOf(text, ignored)) {
    const publisher = hints.get(phrase.text)
    if (publisher) return publisher
  }
  return null
}

export function characterById(id: string): Character | undefined {
  return getIndex().characters.get(id)
}

/** Personaggi di un editore, in ordine alfabetico (per la scelta manuale). */
export function charactersOf(publisher: HeroPublisher): Character[] {
  return [...getIndex().characters.values()].filter((c) => c.publisher === publisher).sort((a, b) => a.name.localeCompare(b.name, 'it'))
}

export function classifyBook(book: BookSummary): Classification {
  if (book.classification) return { ...book.classification, manual: true }

  const { metadata } = book
  const title = book.customTitle ?? book.title
  // I campi vengono analizzati separatamente: un nome non deve "attraversare" due campi.
  const named = [
    ...new Set([
      ...listed(metadata?.characters),
      ...listed(metadata?.teams),
      ...findCharacters(title),
      ...findCharacters(metadata?.series),
      ...findCharacters(metadata?.title)
    ])
  ]
  // Luoghi e soprannomi ("Gotham Central", "Il ritorno del Cavaliere Oscuro") contano solo senza personaggi nominati.
  const { heroHints } = getIndex()
  const characters = named.length ? named : [...new Set([title, metadata?.series, metadata?.title].flatMap((text) => findCharacters(text, heroHints)))]

  const publisher =
    findPublisherHint(metadata?.publisher) ??
    findPublisherHint(metadata?.imprint) ??
    (isManga(book) ? 'manga' : null) ??
    findPublisherHint(title) ??
    findPublisherHint(metadata?.series) ??
    publisherOfCharacters(characters) ??
    'other'

  const own = publisher === 'marvel' || publisher === 'dc' ? characters.filter((id) => characterById(id)?.publisher === publisher) : []
  return { publisher, characters: withoutFamilyMembers(own), manual: false }
}

function isManga(book: BookSummary): boolean {
  const { metadata } = book
  return (
    metadata?.rightToLeft === true ||
    book.direction === 'rtl' ||
    mangaOf(book) !== null ||
    [book.customTitle ?? book.title, metadata?.series, metadata?.writer, metadata?.penciller].some(mentionsMangaka)
  )
}

/** Elenco di nomi separati da virgole (campo Characters/Teams di ComicInfo.xml). */
function listed(names: string | undefined): string[] {
  return (names ?? '').split(/[,;]/).flatMap((name) => findCharacters(name))
}

/** L'editore della maggioranza dei personaggi (a parità, quello del primo nominato). */
function publisherOfCharacters(ids: readonly string[]): HeroPublisher | null {
  const counts: Record<HeroPublisher, number> = { marvel: 0, dc: 0 }
  for (const id of ids) {
    const publisher = characterById(id)?.publisher
    if (publisher) counts[publisher]++
  }
  if (counts.marvel === 0 && counts.dc === 0) return null
  if (counts.marvel !== counts.dc) return counts.marvel > counts.dc ? 'marvel' : 'dc'
  return characterById(ids[0]!)!.publisher
}
