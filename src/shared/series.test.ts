import { describe, expect, it } from 'vitest'
import { displayTitleOf, groupBySeries, issueNumberOf, nextInSeries, readingDirectionOf, seriesNameOf } from './series'
import type { BookSummary, ComicMetadata } from './types'

let nextId = 0
function book(title: string, metadata: ComicMetadata | null = null, folder = 'C:\\Fumetti'): BookSummary {
  return {
    id: String(nextId++),
    title,
    path: `${folder}\\${title}.cbr`,
    kind: 'rar',
    pageCount: 50,
    currentPage: 0,
    finished: false,
    lastReadAt: null,
    canContinue: false,
    inProgress: false,
    addedAt: 0,
    direction: null,
    shiftPairs: false,
    metadata,
    classification: null
  }
}

// Esempi di titoli con numerazioni, sottotitoli e annotazioni editoriali.
const blue3 = book('Marvel Miniserie 047 - Spiderman Blue 3')
const blue1 = book('Marvel Miniserie 045 - Spiderman - Blue 1')
const blue2 = book('Marvel Miniserie 046 - Spiderman Blue 2')
const superman = book('Superman - Stagioni - Loeb-Sale - RW Lion (C2C)')
const allStar = book('Superman All Star')
const ragno = book('Uomo Ragno Corno (1 serie) 133')
const masterworks = book('Marvel Masterworks 001 Spider Man 1 Panini C2C edizione digitale')

describe('groupBySeries', () => {
  it('riconosce una serie dai nomi dei file e la ordina per numero', () => {
    const { groups, singles } = groupBySeries([blue3, superman, blue1, allStar, blue2, ragno, masterworks])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.books.map((b) => b.title)).toEqual([blue1.title, blue2.title, blue3.title])
    expect(groups[0]!.name).toBe('Marvel Miniserie - Spiderman - Blue')
    expect(singles.map((b) => b.title).sort()).toEqual([masterworks.title, superman.title, allStar.title, ragno.title].sort())
  })

  it('usa i metadati quando ci sono', () => {
    const a = book('blue_02_scan', { series: 'Spider-Man: Blue', number: '2' })
    const b = book('SMB n1 HQ', { series: 'Spider-Man: Blue', number: '1' })
    const { groups } = groupBySeries([a, b])
    expect(groups[0]!.name).toBe('Spider-Man: Blue')
    expect(groups[0]!.books).toEqual([b, a])
  })
})

describe('numeri e titoli', () => {
  it('prende il numero dell\'albo ignorando le parentesi', () => {
    expect(issueNumberOf(blue1)).toBe('1')
    expect(issueNumberOf(ragno)).toBe('133')
    expect(issueNumberOf(allStar)).toBeNull()
  })

  it('pulisce il nome della serie', () => {
    expect(seriesNameOf(blue2)).toBe('Marvel Miniserie - Spiderman Blue')
    expect(seriesNameOf(ragno)).toBe('Uomo Ragno Corno')
    expect(seriesNameOf(book('Tex Willer vol 3'))).toBe('Tex Willer')
    expect(seriesNameOf(book('Dylan Dog n. 12'))).toBe('Dylan Dog')
    expect(seriesNameOf(book('Saga #3'))).toBe('Saga')
    expect(seriesNameOf(book('Batman.-.HUSH.[Vol.02.di.12].[Scan].[ITA]'))).toBe('Batman - Hush')
    expect(seriesNameOf(book('Must Have 12 - Planet Hulk (2020) By Gruppo'))).toBe('Must Have - Planet Hulk')
    expect(seriesNameOf({ ...book('x'), customTitle: 'Sm RS 01 of 03' })).toBe('Sm RS')
    expect(groupBySeries([book('Saga 1 di 3'), book('Saga 2 di 3')]).groups).toHaveLength(1)
  })

  it('mostra "Serie #numero" quando ci sono i metadati', () => {
    expect(displayTitleOf(book('x', { series: 'Spider-Man: Blue', number: '2' }))).toBe('Spider-Man: Blue #2')
    expect(displayTitleOf(blue1)).toBe(blue1.title)
  })

  it('senza metadati mostra il nome del file ripulito, mentre la serie resta quella del nome vero', () => {
    const hush = [book('Batman.-.HUSH.[Vol.01.di.12].[Scan].[ITA]'), book('Batman.-.HUSH.[Vol.02.di.12].[Scan].[ITA]')]
    expect(displayTitleOf(hush[0]!)).toBe('Batman - Hush Vol. 01 di 12')
    expect(groupBySeries(hush).groups).toHaveLength(1)
    expect(displayTitleOf({ ...hush[0]!, customTitle: 'HUSH (mio)' })).toBe('HUSH (mio)')
  })
})

describe('manga dal dizionario', () => {
  const dragonBall1 = book('Dragon Ball 01 Son Goku e i suoi compagni RCS 2017 04 27 C2C edizione digitale')
  const dragonBall2 = book('Dragon Ball 02 La sfera del drago RCS 2017 05 04 C2C edizione digitale')
  const monster1 = book('Monster - Naoki Urasawa vol 01')
  const monster2 = book('Monster - Naoki Urasawa vol 02')

  it('raccoglie i volumi anche se i sottotitoli sono diversi', () => {
    const { groups } = groupBySeries([dragonBall2, monster2, dragonBall1, monster1])
    expect(groups.map((g) => [g.name, g.books.map(issueNumberOf)])).toEqual([
      ['Dragon Ball', ['1', '2']],
      ['Monster', ['1', '2']]
    ])
  })

  it('prende il numero subito dopo il nome della serie, non la data in fondo', () => {
    expect(issueNumberOf(dragonBall1)).toBe('1')
  })

  it('apre i manga da destra a sinistra, ma i manhwa da sinistra a destra', () => {
    expect(readingDirectionOf(dragonBall1, 'ltr')).toBe('rtl')
    expect(readingDirectionOf(book('Solo Leveling 3'), 'ltr')).toBe('ltr')
    expect(readingDirectionOf({ ...dragonBall1, direction: 'ltr' }, 'ltr')).toBe('ltr') // edizione ribaltata
  })
})

describe('readingDirectionOf', () => {
  it('rispetta la scelta del lettore, poi i metadati, poi l\'impostazione generale', () => {
    const manga = book('One Piece 1', { rightToLeft: true })
    expect(readingDirectionOf(manga, 'ltr')).toBe('rtl')
    expect(readingDirectionOf({ ...manga, direction: 'ltr' }, 'ltr')).toBe('ltr')
    expect(readingDirectionOf(blue1, 'ltr')).toBe('ltr')
  })
})

describe('nextInSeries', () => {
  it('propone il numero successivo della serie', () => {
    const books = [blue3, blue1, blue2, superman]
    expect(nextInSeries(books, blue1)).toBe(blue2)
    expect(nextInSeries(books, blue3)).toBeNull()
  })

  it('senza serie usa il file successivo nella stessa cartella', () => {
    const a = book('Alpha', null, 'C:\\Varie')
    const b = book('Beta', null, 'C:\\Varie')
    expect(nextInSeries([b, a], a)).toBe(b)
  })

  it('salta gli albi eliminati dal disco, anche subito dopo aver eliminato quello appena letto', () => {
    const deleted = { ...blue1, missingSince: 1 }
    expect(nextInSeries([blue3, deleted, { ...blue2, missingSince: 1 }, superman], deleted)).toBe(blue3)
  })
})

describe('titoli personali', () => {
  it('mostra il titolo scelto anche in presenza di ComicInfo.xml, senza modificare i metadati', () => {
    const original = book('parte 1', { series: 'Titolo originale', number: '9' })
    const renamed = { ...original, customTitle: 'Batman - Parte 1' }
    expect(displayTitleOf(renamed)).toBe('Batman - Parte 1')
    expect(seriesNameOf(renamed)).toBe('Batman - Parte')
    expect(issueNumberOf(renamed)).toBe('1')
    expect(displayTitleOf({ ...renamed, customTitle: null })).toBe('Titolo originale #9')
    expect(original.metadata).toEqual({ series: 'Titolo originale', number: '9' })
  })

  it('raggruppa e ordina le parti rinominate, aggiornando il prossimo albo', () => {
    const a = { ...book('parte 1'), customTitle: 'Batman - Parte 1' }
    const b = { ...book('parte 2'), customTitle: 'Batman - Parte 2' }
    const { groups } = groupBySeries([b, a])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.name).toBe('Batman - Parte')
    expect(groups[0]!.books).toEqual([a, b])
    expect(nextInSeries([b, a], a)).toBe(b)
  })
})
