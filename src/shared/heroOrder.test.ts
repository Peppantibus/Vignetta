import { describe, expect, it } from 'vitest'
import { applyOrder, heroOrderKey, moveBy, moveToTarget, reorderWithin } from './heroOrder'

const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
const ids = (list: { id: string }[]): string[] => list.map((i) => i.id)

describe('ordine di lettura personale', () => {
  it('senza ordine salvato lascia la sequenza data', () => {
    expect(ids(applyOrder(items, undefined))).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(applyOrder(items, []))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('segue l\'ordine salvato, ignora gli id spariti e accoda i nuovi', () => {
    expect(ids(applyOrder(items, ['c', 'x', 'a']))).toEqual(['c', 'a', 'b', 'd'])
  })

  it('sposta un elemento nella posizione del bersaglio', () => {
    expect(moveToTarget(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
    expect(moveToTarget(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
    expect(moveToTarget(['a', 'b'], 'a', 'a')).toBeNull()
    expect(moveToTarget(['a', 'b'], 'a', 'z')).toBeNull()
  })

  it("da tastiera sposta di un posto o fino ai bordi, senza uscire dall'elenco", () => {
    const ids = ['a', 'b', 'c', 'd']
    expect(moveBy(ids, 'b', 1)).toEqual(['a', 'c', 'b', 'd'])
    expect(moveBy(ids, 'b', -1)).toEqual(['b', 'a', 'c', 'd'])
    expect(moveBy(ids, 'c', -Infinity)).toEqual(['c', 'a', 'b', 'd'])
    expect(moveBy(ids, 'c', Infinity)).toEqual(['a', 'b', 'd', 'c'])
    expect(moveBy(ids, 'a', -1)).toBeNull()
    expect(moveBy(ids, 'x', 1)).toBeNull()
  })

  it('distingue lo stesso personaggio in schede diverse', () => {
    expect(heroOrderKey('marvel', 'spider-man')).not.toBe(heroOrderKey('dc', 'spider-man'))
  })
})

describe('ordine personale con albi archiviati', () => {
  it('riordina solo i presenti e lascia gli archiviati al loro posto', () => {
    // X e Y sono archiviati: l'utente sposta c in testa tra i presenti a, b, c.
    expect(reorderWithin(['a', 'X', 'b', 'Y', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'X', 'a', 'Y', 'b'])
    expect(reorderWithin(['a', 'b'], ['b', 'a'])).toEqual(['b', 'a'])
    expect(reorderWithin(['X', 'a'], ['a'])).toEqual(['X', 'a'])
  })
})
