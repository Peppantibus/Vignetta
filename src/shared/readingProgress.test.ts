import { describe, expect, it } from 'vitest'
import { addReadPages, canContinueReading, continueThreshold, isInProgress, readPagesOf, startedAfter, startedThreshold } from './readingProgress'

const progress = { pageCount: 200, currentPage: 0, lastReadAt: 1, finished: false, readPages: [] as number[] }

describe('soglia di Continua a leggere', () => {
  it.each([[200, 40], [150, 30], [32, 7], [196, 40], [239, 48], [1, 1]])('%i pagine richiedono %i pagine viste', (count, expected) => {
    expect(continueThreshold(count)).toBe(expected)
  })

  it('aspetta di conoscere il numero di pagine', () => {
    expect(continueThreshold(null)).toBe(Infinity)
    expect(continueThreshold(0)).toBe(Infinity)
    expect(canContinueReading({ ...progress, pageCount: null, readPages: [0, 1, 2] })).toBe(false)
  })

  it('non attribuisce le pagine saltate e non riconta quelle già viste', () => {
    const readPages = addReadPages(progress, [0, 100, 101, 100, -1, 200, NaN, 1.5])
    expect(readPages).toEqual([0, 100, 101])
    expect(addReadPages({ ...progress, readPages }, [100, 101])).toEqual(readPages)
    expect(canContinueReading({ ...progress, currentPage: 100, readPages })).toBe(false)
  })

  it('include esattamente al 20% ed esclude gli albi terminati', () => {
    const readPages = Array.from({ length: 40 }, (_, i) => i)
    expect(canContinueReading({ ...progress, readPages: readPages.slice(1) })).toBe(false)
    expect(canContinueReading({ ...progress, readPages })).toBe(true)
    expect(canContinueReading({ ...progress, readPages, finished: true })).toBe(false)
    expect(canContinueReading({ ...progress, readPages, lastReadAt: null })).toBe(false)
  })

  it('stima la lettura precedente dalla posizione solo in assenza del nuovo conteggio', () => {
    const legacy = { pageCount: 200, currentPage: 39, lastReadAt: 1, finished: false }
    expect(readPagesOf(legacy)).toHaveLength(40)
    expect(canContinueReading(legacy)).toBe(true)
    expect(canContinueReading({ ...legacy, currentPage: 3 })).toBe(false)
    expect(readPagesOf({ ...legacy, lastReadAt: null })).toEqual([])
    expect(readPagesOf({ ...legacy, readPages: [] })).toEqual([])
  })
})

describe('soglia di «In corso»', () => {
  it.each([[200, 20], [150, 15], [32, 4], [1, 1]])('%i pagine richiedono %i pagine viste', (count, expected) => {
    expect(startedThreshold(count)).toBe(expected)
  })

  it('aspetta di conoscere il numero di pagine', () => {
    expect(startedThreshold(null)).toBe(Infinity)
    expect(startedAfter({ ...progress, pageCount: null, lastReadAt: null }, [0, 1, 2])).toBe(false)
  })

  it('è permanente; senza il nuovo campo vale la vecchia regola; i terminati non lo sono', () => {
    expect(isInProgress({ ...progress, started: false })).toBe(false)
    expect(isInProgress({ ...progress, started: true })).toBe(true)
    expect(isInProgress(progress)).toBe(true)
    expect(isInProgress({ ...progress, lastReadAt: null })).toBe(false)
    expect(isInProgress({ ...progress, started: true, finished: true })).toBe(false)
  })
})
