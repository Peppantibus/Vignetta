import { describe, expect, it } from 'vitest'
import { computeSpreads, fitSpread, splitSpreadCandidates, spreadIndexOf } from './layout'
import { compareNatural } from './naturalSort'
import type { PageSize } from './types'

const P: PageSize = [1000, 1500] // pagina verticale
const W: PageSize = [2000, 1500] // splash page orizzontale

const pagesOf = (sizes: PageSize[], opts: Partial<Parameters<typeof computeSpreads>[2]> = {}): number[][] =>
  computeSpreads(sizes.length, sizes, { doublePage: true, coverAlone: true, shiftPairs: false, ...opts }).map((s) => s.pages)

describe('computeSpreads', () => {
  it('in pagina singola mostra una pagina per schermata', () => {
    expect(computeSpreads(3, [P, W, P], { doublePage: false, coverAlone: true, shiftPairs: false })).toEqual([
      { pages: [0], wide: false },
      { pages: [1], wide: true },
      { pages: [2], wide: false }
    ])
  })

  it('in doppia pagina tiene la copertina da sola e accoppia le altre', () => {
    expect(pagesOf([P, P, P, P, P])).toEqual([[0], [1, 2], [3, 4]])
  })

  it('senza copertina separata accoppia dalla prima pagina', () => {
    expect(pagesOf([P, P, P, P], { coverAlone: false })).toEqual([[0, 1], [2, 3]])
  })

  it('mostra da sola la splash page e la pagina che la precede', () => {
    expect(pagesOf([P, P, W, P, P])).toEqual([[0], [1], [2], [3, 4]])
  })

  it('lascia da sola l\'ultima pagina dispari', () => {
    expect(pagesOf([P, P, P, P])).toEqual([[0], [1, 2], [3]])
  })

  it('lo spostamento di una pagina cambia gli accoppiamenti', () => {
    expect(pagesOf([P, P, P, P, P], { shiftPairs: true })).toEqual([[0], [1], [2, 3], [4]])
  })

  it('tratta le pagine di dimensione sconosciuta come verticali', () => {
    expect(computeSpreads(3, [], { doublePage: true, coverAlone: true, shiftPairs: false }).map((s) => s.pages)).toEqual([[0], [1, 2]])
  })
})

describe('spreadIndexOf', () => {
  it('trova la schermata che contiene la pagina', () => {
    const spreads = computeSpreads(5, [P, P, P, P, P], { doublePage: true, coverAlone: true, shiftPairs: false })
    expect(spreadIndexOf(spreads, 4)).toBe(2)
    expect(spreadIndexOf(spreads, 99)).toBe(2)
  })

  it('una tavola duplicata porta allo stesso disegno, intero o diviso in metà', () => {
    const options = { coverAlone: true, shiftPairs: false, splitSpreads: [2] }
    const double = computeSpreads(6, [P, P, W, P, P, P], { ...options, doublePage: true })
    expect(double[spreadIndexOf(double, 2)]!.pages).toEqual([3, 4])
    const single = computeSpreads(6, [P, P, W, P, P, P], { ...options, doublePage: false })
    expect(single[spreadIndexOf(single, 4)]!.pages).toEqual([2])
  })
})

describe('tavole doppie seguite dalle loro metà', () => {
  // pagina 2 = tavola intera, pagine 3 e 4 = le sue metà
  const sizes = [P, P, W, P, P, P, P]

  it('in doppia pagina affianca le metà e salta la tavola intera', () => {
    expect(pagesOf(sizes, { splitSpreads: [2] })).toEqual([[0], [1], [3, 4], [5, 6]])
  })

  it('non accoppia mai una metà con la pagina che la precede', () => {
    expect(pagesOf([P, P, P, W, P, P], { splitSpreads: [3] })).toEqual([[0], [1, 2], [4, 5]])
  })

  it('in pagina singola mostra la tavola intera e salta le metà', () => {
    const spreads = computeSpreads(sizes.length, sizes, { doublePage: false, coverAlone: true, shiftPairs: false, splitSpreads: [2] })
    expect(spreads.map((s) => s.pages)).toEqual([[0], [1], [2], [5], [6]])
  })

  it('propone come candidate solo le tavole seguite da due pagine con proporzioni compatibili', () => {
    const half: PageSize = [1000, 1538] // due metà affiancate ≈ proporzioni di W
    expect(splitSpreadCandidates([P, W, half, half, P, W, P])).toEqual([1])
    expect(splitSpreadCandidates([W, P, [3000, 1000]])).toEqual([])
  })
})

describe('fitSpread', () => {
  it('adatta allo schermo limitando l\'altezza', () => {
    expect(fitSpread([0.5, 0.5], { width: 2000, height: 1000 }, 'screen')).toEqual([
      { width: 500, height: 1000 },
      { width: 500, height: 1000 }
    ])
  })

  it('adatta allo schermo limitando la larghezza', () => {
    expect(fitSpread([2], { width: 1000, height: 1000 }, 'screen')).toEqual([{ width: 1000, height: 500 }])
  })

  it('adatta alla larghezza anche se supera l\'altezza', () => {
    expect(fitSpread([0.5], { width: 1000, height: 800 }, 'width')).toEqual([{ width: 1000, height: 2000 }])
  })
})

describe('compareNatural', () => {
  it('ordina i numeri come farebbe una persona', () => {
    expect(['p10.jpg', 'p2.jpg', 'p1.jpg'].sort(compareNatural)).toEqual(['p1.jpg', 'p2.jpg', 'p10.jpg'])
  })
})
