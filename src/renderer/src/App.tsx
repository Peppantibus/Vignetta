import { useEffect, useState } from 'react'
import { applyLibraryUpdate } from '../../shared/libraryUpdate'
import { nextInSeries } from '../../shared/series'
import type { LibrarySnapshot } from '../../shared/types'
import { api } from './api'
import { useFileDrop } from './hooks'
import { LibraryView } from './library/LibraryView'
import { ReaderView } from './reader/ReaderView'
import './app.css'

export function App(): React.JSX.Element {
  const [library, setLibrary] = useState<LibrarySnapshot | null>(null)
  const [readingId, setReadingId] = useState<string | null>(null)

  useEffect(() => {
    void api.getLibrary().then(setLibrary)
    // Le modifiche arrivate prima della libreria intera sono già comprese in quella.
    return api.onLibraryChanged((update) => setLibrary((library) => library && applyLibraryUpdate(library, update)))
  }, [])

  // Fumetti aperti da Esplora file: quello passato all'avvio e quelli richiesti con l'app già aperta.
  useEffect(() => {
    const take = (): void => void api.takeOpenRequest().then((id) => id && setReadingId(id))
    const unsubscribe = api.onOpenRequested(take)
    take()
    return unsubscribe
  }, [])

  const dragging = useFileDrop(async (paths) => {
    const ids = await api.addPaths(paths)
    if (ids.length === 1) setReadingId(ids[0]!)
  })

  if (!library) return <div className="app-splash" />

  const book = readingId ? library.books.find((b) => b.id === readingId) : undefined

  return (
    <>
      {book ? (
        <ReaderView
          key={`${book.id}:${book.contentVersion ?? 0}`}
          book={book}
          settings={library.settings}
          nextBook={nextInSeries(library.books, book)}
          onOpenBook={setReadingId}
          onClose={() => setReadingId(null)}
        />
      ) : (
        <LibraryView library={library} onOpenBook={setReadingId} />
      )}
      {dragging && (
        <div className="drop-overlay">
          <div className="drop-overlay__box">Rilascia per aggiungere alla libreria</div>
        </div>
      )}
    </>
  )
}
