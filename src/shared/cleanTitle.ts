/**
 * Titolo leggibile ricavato dal nome del file, solo da mostrare: id, chiave della serie, classificazione e ricerca
 * continuano a usare il nome vero. Toglie quello che aggiungono scansioni e download: annotazioni tra parentesi
 * (anno, editore, gruppo), «c2c» con i crediti che lo seguono, «By …» dopo l'anno, codici HTML rimasti nel nome,
 * punti usati come spazi. Le parole TUTTE MAIUSCOLE di almeno quattro lettere diventano «Maiuscole».
 * Il numero dell'albo resta, anche se era tra parentesi («[Vol.01.di.12]»).
 *
 * "LANTERNA VERDE Rinascita (Planeta)(c2c)(12-2006)" → "Lanterna Verde Rinascita"
 */

const NAMED_ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }
/** "&#40;", "&#x28;", "&amp;"; nei nomi scaricati capita anche "& #40;". */
const ENTITY = /&(?:\s?#(\d{1,7})|\s?#x([\da-f]{1,6})|([a-z]+));/gi

/** Parentesi chiuse, con l'eventuale parola attaccata dopo ("(by Gruppo)XYZ"). */
const BRACKET = /[([{]([^()[\]{}]*)[)\]}][\p{L}\p{N}]*/gu
const UNCLOSED_BRACKET = /\s*[([{][^)\]}]*$/
/** Contenuto tra parentesi che è il numero dell'albo: "Vol.01.di.12", "n. 5", "01 of 03". */
const ISSUE_INSIDE = /^\s*(?:(?:vol(?:ume)?|tomo|n|nr|num(?:ero)?|no|parte|part|cap(?:itolo)?|issue|#)\.?\s*\d|\d+\s*(?:di|of|\/)\s*\d+\s*$)/iu

/** «By Gruppo» in fondo, solo subito dopo una parentesi o un anno: "Stand by me" resta com'è. */
const BY_CREDITS = /(?<=[)\]}]|(?<![\p{L}\p{N}])(?:19[3-9]\d|20[0-3]\d))\s+by\s.*$/iu
/**
 * «c2c» (copertina a copertina) e «scan» annunciano sempre la scansione: quello che segue sono i crediti.
 * Possono stare attaccati a una data ("2018 07c2c"), non a una parola ("Scanners").
 */
const C2C = /(?:\s+[-–—])?\s*(?<!\p{L})(?:c2c|scan)(?![\p{L}\p{N}]).*$/iu

/**
 * Rimasugli in fondo, tolti solo se il nome aveva annotazioni: anno o data (1930–2039, così «2099» resta),
 * editori italiani, separatori.
 */
const TRAILING_DATE = /\s+(?:19[3-9]\d|20[0-3]\d)(?:[\s.-]\d{1,2}){0,2}$/u
const TRAILING_PUBLISHER =
  /(?:\s+[-–—])?\s+(?:panini(?:\s+comics)?|rcs|planeta(?:\s+de\s?agostini)?|rw[\s-]?lion|lion|star\s+comics|j-?pop|edizioni\s+bd|magic\s+press|saldapress|mondadori|play\s?press|marvel\s+italia|planet\s+manga)$/iu
const EDGE_SEPARATORS = /^[\s\-–—,.:;]+|[\s\-–—,.:;]+$/gu

const ROMAN_NUMERAL = /^[IVXLCDM]+$/u

function decodeEntities(text: string): string {
  return text.replace(ENTITY, (match, decimal?: string, hex?: string, name?: string) => {
    if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? match
    const code = decimal ? Number(decimal) : Number.parseInt(hex!, 16)
    const valid = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
    return valid ? String.fromCodePoint(code) : match
  })
}

/** "Batman.-.HUSH.[Vol.01.di.12]": nei nomi senza spazi i punti fanno da spazio (non quelli dei decimali). */
function spaced(text: string): string {
  text = text.replace(/_/g, ' ')
  if (/\s/.test(text) || (text.match(/\./g)?.length ?? 0) < 2) return text
  return text.replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').replace(EDGE_SEPARATORS, '')
}

/** Toglie in fondo date ed editori finché ce ne sono ("… Panini 2024", "… RCS 2017 04 27"). */
function withoutTrailingNotes(text: string): string {
  for (let previous = ''; previous !== text; ) {
    previous = text
    text = collapse(text.replace(TRAILING_DATE, '').replace(TRAILING_PUBLISHER, ''))
  }
  return text
}

/** "HUSH" → "Hush", "X-MEN" → "X-Men"; restano sigle brevi (DC, USA) e numeri romani. */
function tidyCase(text: string): string {
  const words = text.split(' ').map((word) => {
    const letters = word.replace(/[^\p{L}]/gu, '')
    const shouting = letters.length >= 4 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()
    if (!shouting || ROMAN_NUMERAL.test(letters)) return word
    return word.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase())
  })
  return words.join(' ').replace(/^\p{Ll}/u, (letter) => letter.toUpperCase())
}

export interface CleanTitleOptions {
  /** Falso per il nome di una serie: anche il numero tra parentesi va tolto. */
  keepIssue?: boolean
}

export function cleanTitle(title: string, { keepIssue = true }: CleanTitleOptions = {}): string {
  let text = spaced(decodeEntities(title))
  let annotated = false
  const strip = (pattern: RegExp, replace: (match: string, inside: string) => string = () => ' '): void => {
    text = text.replace(pattern, (match: string, inside: string) => {
      const replacement = replace(match, inside)
      if (replacement.trim() !== match.trim()) annotated = true
      return replacement
    })
  }

  strip(BY_CREDITS)
  strip(BRACKET, (_, inside) => (keepIssue && ISSUE_INSIDE.test(inside) ? ` ${inside} ` : ' '))
  strip(UNCLOSED_BRACKET)
  strip(C2C)
  text = collapse(text)
  if (annotated) text = withoutTrailingNotes(text)
  text = text.replace(/(?<![\p{L}\p{N}])vol\.?\s*(?=\d)/giu, 'Vol. ')
  text = collapse(tidyCase(text))
  return text || title.trim()
}
