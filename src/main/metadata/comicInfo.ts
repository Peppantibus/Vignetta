import type { ComicMetadata } from '../../shared/types'

/**
 * Legge ComicInfo.xml (lo schema usato da ComicRack e dalla maggior parte dei programmi per fumetti).
 * Lo schema è piatto, un elemento per campo, quindi basta un'estrazione semplice
 * senza un parser XML completo. Le parti annidate (es. l'elenco <Pages>) vengono ignorate.
 */
export function parseComicInfo(xml: string): ComicMetadata | null {
  const root = /<ComicInfo\b[^>]*>([\s\S]*)<\/ComicInfo>/i.exec(xml)
  if (!root) return null

  const fields = new Map<string, string>()
  for (const [, tag, raw] of root[1]!.matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)) {
    const value = decodeText(raw!)
    if (value) fields.set(tag!.toLowerCase(), value)
  }

  const text = (tag: string): string | undefined => fields.get(tag)
  const integer = (tag: string): number | undefined => {
    const value = Number.parseInt(fields.get(tag) ?? '', 10)
    return Number.isFinite(value) && value > 0 ? value : undefined
  }

  const metadata: ComicMetadata = {
    title: text('title'),
    series: text('series'),
    number: text('number'),
    volume: integer('volume'),
    count: integer('count'),
    summary: text('summary'),
    year: integer('year'),
    month: integer('month'),
    publisher: text('publisher'),
    imprint: text('imprint'),
    characters: text('characters'),
    teams: text('teams'),
    writer: text('writer'),
    penciller: text('penciller'),
    inker: text('inker'),
    colorist: text('colorist'),
    letterer: text('letterer'),
    coverArtist: text('coverartist'),
    editor: text('editor'),
    genre: text('genre'),
    language: text('languageiso'),
    rightToLeft: text('manga')?.toLowerCase() === 'yesandrighttoleft' || undefined
  }

  // Togliamo i campi vuoti: il risultato viene salvato nella libreria.
  const present = Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined)) as ComicMetadata
  return Object.keys(present).length > 0 ? present : null
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeText(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (entity, code: string) => {
      if (code[0] === '#') {
        const value = code[1]?.toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10)
        // Un codice fuori dall'Unicode (file scritto male) resta com'è: non deve far perdere tutti i metadati.
        return isCharacter(value) ? String.fromCodePoint(value) : entity
      }
      return ENTITIES[code.toLowerCase()] ?? entity
    })
    .trim()
}

/** Carattere ammesso in un documento XML: niente zero, metà di coppie surrogate o valori oltre l'Unicode. */
function isCharacter(code: number): boolean {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
}
