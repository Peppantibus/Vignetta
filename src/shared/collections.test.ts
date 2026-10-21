import { describe, expect, it } from 'vitest'
import { boundaryPages, catalogBooks, collectionPages, exactDuplicates, remapCollectionProgress } from './collections'
import { groupBySeries, nextInSeries } from './series'
import type { BookSummary, CollectionSpec } from './types'

export const spec: CollectionSpec = {
  edition: 'dc-library', coverPart: 0,
  parts: [0, 1, 2].map((n) => ({ bookId: `albo${n}`, title: `Batman ${n}`, path: `${n}.cbz`, kind: 'zip', pages: ['0.png', '1.png', '2.png', '3.png'], sizes: [[100, 200], [100, 200], [100, 200], [100, 200]], fingerprint: '1/2' })),
  duplicates: [{ ref: { part: 1, page: 0 }, original: { part: 0, page: 0 } }, { ref: { part: 2, page: 0 }, original: { part: 0, page: 0 } }],
  excluded: [{ part: 1, page: 0 }, { part: 2, page: 0 }]
}

describe('volumi virtuali', () => {
  it('limita i candidati ai primi e ultimi tre, senza ripetere quelli di un albo corto', () => {
    expect(boundaryPages(12)).toEqual([0, 1, 2, 9, 10, 11])
    expect(boundaryPages(4)).toEqual([0, 1, 2, 3])
    expect(boundaryPages(0)).toEqual([])
  })
  it('nasconde solo copie esatte tra albi e conserva la prima e le ripetizioni nello stesso albo', () => {
    expect(exactDuplicates([{ part: 0, page: 0, digest: 'a' }, { part: 0, page: 9, digest: 'a' }, { part: 1, page: 0, digest: 'a' }, { part: 1, page: 1, digest: 'b' }, { part: 2, page: 0, digest: 'a' }, { part: 2, page: 1, digest: null }])).toEqual(spec.duplicates)
  })
  it('concatena le pagine in ordine e ignora esclusioni non verificate', () => {
    expect(collectionPages({ ...spec, excluded: [...spec.excluded, { part: 0, page: 1 }] })).toEqual([
      { part: 0, page: 0 }, { part: 0, page: 1 }, { part: 0, page: 2 }, { part: 0, page: 3 },
      { part: 1, page: 1 }, { part: 1, page: 2 }, { part: 1, page: 3 }, { part: 2, page: 1 }, { part: 2, page: 2 }, { part: 2, page: 3 }
    ])
  })
  it('ripristina copie senza spostare la lettura dalla tavola originale', () => {
    expect(remapCollectionProgress(spec, { ...spec, excluded: [] }, 7, [0, 4, 7])).toEqual({ currentPage: 9, readPages: [0, 5, 9] })
  })
  it('nascondendo la pagina corrente usa la prossima conservata, senza contare la copia nascosta', () => {
    expect(remapCollectionProgress({ ...spec, excluded: [] }, spec, 4, [0, 4, 5])).toEqual({ currentPage: 4, readPages: [0, 4] })
  })
  it('rende visibile un solo volume e restituisce gli originali quando lo si scioglie', () => {
    const originals = spec.parts.map((p) => ({ id: p.bookId } as BookSummary))
    const volume = { id: 'volume', collection: { ...spec, parts: spec.parts.map(({ pages, sizes: _sizes, ...part }) => ({ ...part, pageCount: pages.length })) } } as BookSummary
    expect(catalogBooks([...originals, volume])).toEqual([volume])
    expect(catalogBooks(originals)).toEqual(originals)
    expect(groupBySeries([volume, { ...volume, id: 'altro' }]).singles).toHaveLength(2)
    expect(nextInSeries([...originals, volume], volume)).toBeNull()
  })
})
