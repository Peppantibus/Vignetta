import { useCallback, useEffect, useRef, useState } from 'react'
import type { PageSize } from '../../../shared/types'
import { api, errorMessage } from '../api'
import { detectSplitSpreads } from './splitSpreads'

export type BookState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; pageCount: number; startPage: number }

export interface UseBook {
  state: BookState
  /** Dimensioni delle pagine: arrivano dal processo principale o dalle immagini già caricate. */
  sizes: readonly (PageSize | null)[]
  /** Tavole doppie seguite dalle loro metà (vuoto finché l'analisi non è conclusa). */
  splitSpreads: readonly number[]
  reportSize: (page: number, size: PageSize) => void
  /** Ritenta l'apertura dopo un errore (es. un download che nel frattempo è finito). */
  retry: () => void
}

export function useBook(bookId: string, assetId = bookId): UseBook {
  const [state, setState] = useState<BookState>({ status: 'loading' })
  const [sizes, setSizes] = useState<readonly (PageSize | null)[]>([])
  const [sizesComplete, setSizesComplete] = useState(false)
  /** null finché il fumetto non è stato analizzato. */
  const [splitSpreads, setSplitSpreads] = useState<number[] | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })

    // Le dimensioni possono arrivare prima o dopo la risposta di apertura: le uniamo in entrambi i casi.
    const unsubscribe = api.onPageSizes((event) => {
      if (event.bookId !== bookId || (event.contentVersion && assetId !== `${bookId}~${event.contentVersion}`)) return
      setSizes((previous) => {
        const next = [...previous]
        for (const [page, size] of Object.entries(event.sizes)) next[Number(page)] = size
        return next
      })
      if (event.done) setSizesComplete(true)
    })

    api.openBook(bookId).then(
      (opened) => {
        if (cancelled) return
        setSizes((previous) => opened.sizes.map((size, i) => previous[i] ?? size))
        if (!opened.sizes.includes(null)) setSizesComplete(true)
        setSplitSpreads(opened.splitSpreads)
        const { book } = opened
        setState({ status: 'ready', pageCount: opened.pageCount, startPage: book.finished ? 0 : Math.min(book.currentPage, opened.pageCount - 1) })
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: errorMessage(error) })
      }
    )

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [bookId, attempt])

  // Analisi delle tavole doppie: una volta sola per fumetto, quando tutte le dimensioni sono note.
  const latestSizes = useRef(sizes)
  latestSizes.current = sizes
  const analysed = state.status === 'ready' && splitSpreads !== null
  useEffect(() => {
    if (state.status !== 'ready' || analysed || !sizesComplete) return
    let cancelled = false
    void detectSplitSpreads(assetId, latestSizes.current).then((found) => {
      if (cancelled) return
      setSplitSpreads(found)
      api.saveSplitSpreads(bookId, found)
    })
    return () => {
      cancelled = true
    }
  }, [bookId, assetId, state.status, analysed, sizesComplete])

  const reportSize = useCallback((page: number, size: PageSize) => {
    setSizes((previous) => {
      const known = previous[page]
      if (known && known[0] === size[0] && known[1] === size[1]) return previous
      const next = [...previous]
      next[page] = size
      return next
    })
  }, [])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { state, sizes, splitSpreads: splitSpreads ?? NONE, reportSize, retry }
}

const NONE: readonly number[] = []
