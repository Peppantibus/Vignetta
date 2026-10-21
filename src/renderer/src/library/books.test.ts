import { describe, expect, it } from 'vitest'
import type { BookSummary } from '../../../shared/types'
import { archivedBooks, lastReadLabel, nextToRead, progressLabel, recentlyAdded } from './books'

function book(title: string, missingSince?: number): BookSummary {
  return {
    id: title,
    title,
    path: `D:\\Fumetti\\${title}.cbr`,
    kind: 'rar',
    pageCount: 50,
    currentPage: 0,
    finished: true,
    lastReadAt: null,
    canContinue: false,
    inProgress: false,
    addedAt: 0,
    direction: null,
    shiftPairs: false,
    metadata: null,
    classification: null,
    ...(missingSince ? { missingSince } : {})
  }
}

describe('scheda Archiviati', () => {
  it('contiene solo gli albi senza file, dal più recente archiviato e poi per titolo', () => {
    const books = [book('Blue 2', 100), book('Presente'), book('Blue 10', 100), book('Blue 1', 100), book('Halloween', 300)]
    expect(archivedBooks(books).map((b) => b.title)).toEqual(['Halloween', 'Blue 1', 'Blue 2', 'Blue 10'])
  })
})

describe('etichette della libreria', () => {
  it('mostra pagina e percentuale degli albi in corso', () => {
    expect(progressLabel({ ...book('In corso'), finished: false, inProgress: true, currentPage: 36, pageCount: 163 })).toBe('Pagina 37 di 163 · 23%')
    expect(progressLabel({ ...book('Nuovo'), finished: false })).toBe('50 pagine')
    expect(progressLabel(book('Letto'))).toBe('Letto')
  })

  it('dice quando è stato letto a giorni di calendario, non a 24 ore', () => {
    const now = new Date(2026, 9, 20, 9).getTime()
    expect(lastReadLabel(new Date(2026, 9, 20, 1).getTime(), now)).toBe('oggi')
    expect(lastReadLabel(new Date(2026, 9, 19, 23).getTime(), now)).toBe('ieri')
    expect(lastReadLabel(new Date(2026, 9, 16, 12).getTime(), now)).toBe('4 giorni fa')
    expect(lastReadLabel(new Date(2026, 9, 3, 12).getTime(), now)).toBe('il 3 ottobre')
  })
})

describe('Aggiunti di recente', () => {
  const day = 86_400_000
  const now = 100 * day
  const added = (title: string, daysAgo: number, finished = false): BookSummary => ({ ...book(title), finished, addedAt: now - daysAgo * day })

  it('propone gli albi nuovi e non iniziati degli ultimi 14 giorni, dal più recente', () => {
    const books = [added('Vecchio', 30), added('Ieri', 1), added('Oggi', 0), added('Letto', 0, true), added('Settimana', 7), ...['a', 'b', 'c', 'd'].map((t) => added(t, 60))]
    expect(recentlyAdded(books, now).map((b) => b.title)).toEqual(['Oggi', 'Ieri', 'Settimana'])
  })

  it('non propone niente se sono più di metà della libreria, come dopo la prima importazione', () => {
    expect(recentlyAdded([added('a', 1), added('b', 1), added('c', 40)], now)).toEqual([])
  })
})

describe('prossimo da leggere', () => {
  const unread = (title: string): BookSummary => ({ ...book(title), finished: false })
  const reading = (title: string, lastReadAt: number): BookSummary => ({ ...unread(title), inProgress: true, currentPage: 5, lastReadAt })

  it('riprende l’albo in corso letto più di recente, anche se nell’ordine viene dopo', () => {
    expect(nextToRead([book('Letto'), reading('Vecchio', 100), unread('Nuovo'), reading('Recente', 200)])?.title).toBe('Recente')
  })

  it('senza albi in corso propone il primo non letto nell’ordine dato', () => {
    expect(nextToRead([book('Letto'), unread('Secondo'), unread('Terzo')])?.title).toBe('Secondo')
  })

  it('se sono tutti letti non propone niente', () => {
    expect(nextToRead([book('A'), book('B')])).toBeNull()
  })
})
