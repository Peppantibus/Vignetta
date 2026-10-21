import { describe, expect, it } from 'vitest'
import type { BookSummary, ComicMetadata, ManualClassification } from '../types'
import { DC_CHARACTERS, HERO_HINTS, MARVEL_CHARACTERS } from './characters'
import { classifyBook, findCharacters, normalize } from './classify'

function book(title: string, extra: { metadata?: ComicMetadata; direction?: 'rtl'; classification?: ManualClassification } = {}): BookSummary {
  return {
    id: title,
    title,
    path: `C:\\Fumetti\\${title}.cbz`,
    kind: 'zip',
    pageCount: 50,
    currentPage: 0,
    finished: false,
    lastReadAt: null,
    canContinue: false,
    inProgress: false,
    addedAt: 0,
    direction: extra.direction ?? null,
    shiftPairs: false,
    metadata: extra.metadata ?? null,
    classification: extra.classification ?? null
  }
}

const classify = (title: string, extra?: Parameters<typeof book>[1]): [string, string[]] => {
  const result = classifyBook(book(title, extra))
  return [result.publisher, result.characters]
}

describe('classifyBook con titoli e annotazioni editoriali', () => {
  it.each([
    ['Marvel Miniserie 045 - Spiderman - Blue 1', 'marvel', ['spider-man']],
    ['Marvel Masterworks 001 Spider Man 1 Panini C2C edizione digitale', 'marvel', ['spider-man']],
    ['Uomo Ragno Corno (1 serie) 133', 'marvel', ['spider-man']],
    ['Must Have 04 - Wolverine Vecchio Logan (2020) edizione digitale', 'marvel', ['wolverine']],
    ['Superman - Stagioni - Loeb-Sale - RW Lion (C2C)', 'dc', ['superman']],
    ['Superman All Star', 'dc', ['superman']],
    ['Supergirl, la donna del domani Panini 2024 C2C edizione digitale', 'dc', ['supergirl']],
    ['LANTERNA VERDE Rinascita (Planeta)(c2c)(edizione digitale)', 'dc', ['green-lantern']]
  ])('%s → %s', (title, publisher, characters) => {
    expect(classify(title)).toEqual([publisher, characters])
  })
})

describe('classifyBook', () => {
  it('mette un fumetto sotto tutti i suoi protagonisti', () => {
    expect(classify('Batman v Superman - L\'alba della giustizia')).toEqual(['dc', ['batman', 'superman']])
  })

  it('riconosce i nomi storici italiani', () => {
    expect(classify('Nembo Kid 12')).toEqual(['dc', ['superman']])
    expect(classify('I Fantastici Quattro 45')).toEqual(['marvel', ['fantastic-four']])
    expect(classify("Il Punitore - Diario di guerra")).toEqual(['marvel', ['punisher']])
  })

  it('non si lascia ingannare da omonimi e parole comuni', () => {
    expect(classify('Flash Gordon - Il ritorno')).toEqual(['other', []])
    expect(classify('La tempesta')).toEqual(['other', []])
    expect(classify('Tex 700')).toEqual(['other', []])
  })

  it('usa l\'editore nel titolo anche senza personaggi riconosciuti', () => {
    expect(classify('Vertigo Essentials 3')).toEqual(['dc', []])
    expect(classify('Marvel Omnibus 7')).toEqual(['marvel', []])
  })

  it('riconosce i manga da metadati, senso di lettura o editore', () => {
    expect(classify('Kaze no Tabi 1', { metadata: { rightToLeft: true } })[0]).toBe('manga')
    expect(classify('One Piece 100', { direction: 'rtl' })[0]).toBe('manga')
    expect(classify('Berserk 41 (Planet Manga)')[0]).toBe('manga')
  })

  it("riconosce i manga dal dizionario o dall'autore", () => {
    expect(classify('Dragon Ball 01 Son Goku e i suoi compagni RCS 2017 04 27 C2C edizione digitale')).toEqual(['manga', []])
    expect(classify('Monster - Naoki Urasawa vol 01')).toEqual(['manga', []])
    expect(classify('Happy! - Naoki Urasawa 5')).toEqual(['manga', []])
    expect(classify('Devilman - Edizione definitiva')).toEqual(['manga', []])
    expect(classify('Holly e Benji 12')[0]).toBe('manga')
  })

  it('non scambia per manga omonimi e parole comuni', () => {
    expect(classify('Swamp Thing - Monster of the week')[0]).toBe('dc')
    expect(classify('Topolino e Pluto')[0]).toBe('other')
    expect(classify('Conan il barbaro 3')[0]).toBe('other')
  })

  it('dà la precedenza ai metadati', () => {
    expect(classify('Annual 2019', { metadata: { publisher: 'DC Comics', characters: 'Batman, Robin, Joker' } })).toEqual(['dc', ['batman']])
  })

  it('dà sempre la precedenza alla scelta manuale', () => {
    const result = classifyBook(book('Superman', { classification: { publisher: 'marvel', characters: ['thor'] } }))
    expect(result).toEqual({ publisher: 'marvel', characters: ['thor'], manual: true })
  })
})

describe('famiglie di personaggi', () => {
  it('mette sotto l’eroe o la squadra i comprimari nominati insieme a lui', () => {
    expect(classify('Must Have 13 X Men La Saga Della Fenice Nera 2020')).toEqual(['marvel', ['x-men']])
    expect(classify('Must Have 08 Spider Man Chi È Miles Morales 2020')).toEqual(['marvel', ['spider-man']])
    expect(classify("Spider-Man - L'ultima caccia di Kraven")).toEqual(['marvel', ['spider-man']])
    expect(classify('Spiderman Universe 01 - Venom 01')).toEqual(['marvel', ['spider-man']])
    expect(classify('Batman-The Killing Joke')).toEqual(['dc', ['batman']])
    expect(classify('Capitan America contro Teschio Rosso')).toEqual(['marvel', ['captain-america']])
  })

  it('dà il proprio riquadro a chi compare da solo', () => {
    expect(classify('Harley Quinn - Raccolta 1')).toEqual(['dc', ['harley-quinn']])
    expect(classify('Joker - Killer Smile')).toEqual(['dc', ['joker']])
    expect(classify('Venom 01')).toEqual(['marvel', ['venom']])
    expect(classify('Il ritorno di Teschio Rosso')).toEqual(['marvel', ['red-skull']])
    expect(classify('Black Cat 01')).toEqual(['marvel', ['black-cat']])
  })

  it('mette sempre sotto l’eroe le sue versioni alternative', () => {
    expect(classify('Uomo Ragno 2099 n 00 Speciale')).toEqual(['marvel', ['spider-man']])
    expect(classify('Miles Morales 01')).toEqual(['marvel', ['spider-man']])
    expect(classify('Spider-Gwen - Ghost-Spider 1')).toEqual(['marvel', ['spider-man']])
    expect(classify('Batman Beyond 2.0')).toEqual(['dc', ['batman']])
  })

  it('tiene separati due eroi principali', () => {
    expect(classify('Wolverine e gli X-Men')).toEqual(['marvel', ['wolverine', 'x-men']])
    expect(classify('Batman/Superman - I migliori del mondo')).toEqual(['dc', ['batman', 'superman']])
  })

  it('usa il nome più lungo dove due nomi si sovrappongono', () => {
    expect(classify('Doomsday Clock 1')).toEqual(['dc', ['watchmen']])
    expect(classify('Il Batman che ride')).toEqual(['dc', ['batman-who-laughs']])
  })

  it('usa luoghi e soprannomi solo se il fumetto non nomina nessun personaggio', () => {
    expect(classify('Gotham Central 1')).toEqual(['dc', ['batman']])
    expect(classify('Il ritorno del Cavaliere Oscuro')).toEqual(['dc', ['batman']])
    expect(classify('Harley Quinn e le sirene di Gotham')).toEqual(['dc', ['harley-quinn']])
    expect(classify("Lex Luthor: Uomo d'acciaio")).toEqual(['dc', ['lex-luthor']])
  })

  it('ignora le frasi che contengono un nome ma parlano d’altro', () => {
    expect(classify('Robin Hood - La leggenda')).toEqual(['other', []])
    expect(classify('Rogue One - Una storia di Star Wars')).toEqual(['other', []])
    expect(classify('Goblin Slayer 3')).toEqual(['other', []])
  })
})

describe('dizionario', () => {
  it('ha famiglie coerenti: l’eroe esiste, è dello stesso editore e non appartiene a sua volta a una famiglia', () => {
    for (const entries of [MARVEL_CHARACTERS, DC_CHARACTERS]) {
      const byId = new Map(entries.map((entry) => [entry[0], entry]))
      const wrong = entries.filter(([, , , family]) => family && (!byId.has(family) || byId.get(family)![3])).map(([id]) => id)
      expect(wrong).toEqual([])
    }
  })

  it('ha indizi deboli (luoghi, soprannomi) che puntano a personaggi esistenti', () => {
    const ids = new Set([...MARVEL_CHARACTERS, ...DC_CHARACTERS].map(([id]) => id))
    expect(Object.keys(HERO_HINTS).filter((id) => !ids.has(id))).toEqual([])
  })

  it('non cerca parole italiane comuni che sono anche nomi di personaggi', () => {
    const common = ['tempesta', 'bestia', 'visione', 'fenice', 'la cosa', 'angelo', 'vespa', 'avvoltoio', 'pinguino', 'spaventapasseri', 'mandarino', 'metallo', 'incantatrice', 'cacciatrice', 'colosso', 'scorpione', 'camaleonte', 'sciacallo', 'lucertola', 'oracolo', 'parassita', 'mutanti']
    const aliases = new Set([...MARVEL_CHARACTERS, ...DC_CHARACTERS].flatMap(([, , names]) => names.map(normalize)))
    expect(common.filter((word) => aliases.has(word))).toEqual([])
  })

  it('non contiene nomi assegnati a due personaggi diversi', () => {
    const owner = new Map<string, string>()
    const clashes: string[] = []
    const entries: [string, readonly string[]][] = [...MARVEL_CHARACTERS, ...DC_CHARACTERS].map(([id, , aliases]) => [id, aliases])
    for (const [id, aliases] of [...entries, ...Object.entries(HERO_HINTS)]) {
      for (const alias of new Set(aliases.map(normalize))) {
        const previous = owner.get(alias)
        if (previous && previous !== id) clashes.push(`${alias}: ${previous} / ${id}`)
        owner.set(alias, id)
      }
    }
    expect(clashes).toEqual([])
  })

  it('confronta parole intere', () => {
    expect(findCharacters('Thorgal')).toEqual([])
    expect(findCharacters('Spider-Woman')).toEqual(['spider-woman'])
  })
})

describe('riconoscimento dopo la rinomina', () => {
  it('sposta parte 1 da Altri a DC / Batman usando il titolo personale', () => {
    const original = book('parte 1')
    expect(classifyBook(original).publisher).toBe('other')
    expect(classifyBook({ ...original, customTitle: 'Batman - Parte 1' })).toEqual({ publisher: 'dc', characters: ['batman'], manual: false })
  })

  it('sostituisce gli indizi del vecchio nome e permette di tornare al titolo originale', () => {
    const original = book('Dragon Ball 1')
    expect(classifyBook({ ...original, customTitle: 'Batman - Parte 1' }).publisher).toBe('dc')
    expect(classifyBook({ ...original, customTitle: null }).publisher).toBe('manga')
    expect(classifyBook({ ...book('parte 1'), customTitle: 'One Piece 1' }).publisher).toBe('manga')
  })

  it('rispetta la classificazione manuale e permette il ritorno esplicito all’automatico', () => {
    const renamed = { ...book('parte 1', { classification: { publisher: 'other', characters: [] } }), customTitle: 'Batman - Parte 1' }
    expect(classifyBook(renamed)).toMatchObject({ publisher: 'other', manual: true })
    expect(classifyBook({ ...renamed, classification: null })).toMatchObject({ publisher: 'dc', characters: ['batman'], manual: false })
  })
})
