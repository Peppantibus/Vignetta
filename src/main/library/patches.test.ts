import { describe, expect, it } from 'vitest'
import { bookPatch, settingsPatch } from './patches'

describe("modifiche che arrivano dall'interfaccia", () => {
  it("accetta quelle che l'interfaccia manda davvero, senza cambiarle", () => {
    const books = [
      { classification: { publisher: 'dc', characters: ['batman'] } }, { classification: null },
      { finished: false, currentPage: 0 }, { finished: true }, { direction: 'ltr' }, { direction: 'rtl' }, { direction: null },
      { shiftPairs: true }, { customTitle: 'Batman - Anno uno', classification: null }, { customTitle: null }
    ]
    for (const patch of books) expect(bookPatch(patch)).toEqual(patch)
    const settings = [
      { libraryZoom: 1.2 }, { groupSeries: false }, { doublePage: true }, { fit: 'width' }, { nightMode: true },
      { trimBorders: true }, { nightIntensity: 0 }, { coverAlone: false }, { defaultDirection: 'rtl' }
    ]
    for (const patch of settings) expect(settingsPatch(patch)).toEqual(patch)
  })

  it('rifiuta campi non previsti e valori del tipo sbagliato', () => {
    const books: unknown[] = [
      null, 'testo', [], { path: 'C:/altro.cbz' }, { folder: null }, { finished: 'sì' }, { currentPage: -1 }, { currentPage: 1.5 },
      { currentPage: '3' }, { direction: 'su' }, { classification: { publisher: 'image', characters: [] } },
      { classification: { publisher: 'dc', characters: [1] } }, { classification: { publisher: 'dc' } }, { customTitle: 3 }
    ]
    for (const patch of books) expect(() => bookPatch(patch), JSON.stringify(patch)).toThrow('Modifica non valida')
    const settings: unknown[] = [
      null, { nightIntensity: 2 }, { nightIntensity: Number.NaN }, { libraryZoom: 10 }, { libraryZoom: '1' },
      { fit: 'auto' }, { doublePage: 1 }, { theme: 'chiaro' }
    ]
    for (const patch of settings) expect(() => settingsPatch(patch), JSON.stringify(patch)).toThrow('Modifica non valida')
  })

  it('la cartella della copia esterna viene ignorata: si cambia solo dal selettore', () => {
    expect(settingsPatch({ externalBackupFolder: 'C:/altrove', nightMode: true })).toEqual({ nightMode: true })
  })

  it('una classificazione non porta con sé campi in più', () => {
    expect(bookPatch({ classification: { publisher: 'marvel', characters: ['spider-man'], extra: 1 } })).toEqual({ classification: { publisher: 'marvel', characters: ['spider-man'] } })
  })
})
