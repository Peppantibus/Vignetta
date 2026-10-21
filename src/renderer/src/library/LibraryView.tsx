import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { characterById, classifyBook, PUBLISHERS, type Classification } from '../../../shared/catalog/classify'
import { groupBySeries, readingDirectionOf, type SeriesGroup } from '../../../shared/series'
import { catalogBooks } from '../../../shared/collections'
import type { BookSummary, LibrarySnapshot, Publisher } from '../../../shared/types'
import { api } from '../api'
import { ContextMenu, type MenuItem } from '../components/ContextMenu'
import { Logo } from '../components/Logo'
import { BookOpen, BookOpenCheck, BookX, FolderOpen, FolderPlus, HardDrive, Info, Languages, Layers, Pencil, Plus, Search, Tags, Trash2, User, X, ZoomIn, ZoomOut } from '../components/icons'
import { ContinueReading } from './ContinueReading'
import { BookDetails } from './BookDetails'
import { archivedBooks, canDeleteFromDisk, formatBytes, recentlyAdded } from './books'
import { ClassifyDialog } from './ClassifyDialog'
import { FoldersDialog } from './FoldersDialog'
import { DeleteAllFromDiskDialog, DeleteFromDiskDialog, MissingFileDialog, useDiskUsage } from './FreeSpace'
import { heroOrderKey } from '../../../shared/heroOrder'
import { HeroView, NO_HERO, PublisherView, type HeroGroup } from './HeroViews'
import { SeriesView } from './SeriesView'
import { RenameDialog } from './RenameDialog'
import { RemoveBookDialog } from './RemoveDialogs'
import { CollectionDialog, ManageCollection, collectionEdition } from './CollectionDialog'
import { Shelf } from './Shelf'
import { LIBRARY_ZOOM_MAX, LIBRARY_ZOOM_MIN } from '../../../shared/settings'
import { stepLibraryZoom } from './libraryZoom'
import { useWindowEvent } from '../hooks'
import { matchesSearch, shelfItems } from './shelfItems'
import { BookRow, LibraryShelf, type ShelfHandlers } from './LibraryShelf'
import './library.css'

/** Le categorie, più «Archiviati»: gli albi il cui file è stato eliminato dal disco, con la loro cronologia. */
type Tab = 'all' | Publisher | 'archived'

/** Dove si trova l'utente nella libreria: scheda, poi eventualmente personaggio e serie. */
interface Route {
  tab: Tab
  hero: string | null
  series: string | null
}

const TABS: readonly { id: Tab; name: string }[] = [{ id: 'all', name: 'Tutti' }, ...PUBLISHERS, { id: 'archived', name: 'Archiviati' }]

const CONTINUE_LIMIT = 8
const RECENT_LIMIT = 12

/**
 * Mentre si legge la libreria non è montata: qui resta dove era l'utente (scheda, personaggio, serie e punto dello
 * scaffale), così chiudendo il fumetto si torna lì e non alla scheda Tutti.
 */
const lastPlace: { route: Route; scrollTop: number } = { route: { tab: 'all', hero: null, series: null }, scrollTop: 0 }

interface LibraryViewProps {
  library: LibrarySnapshot
  onOpenBook: (id: string) => void
}

export function LibraryView({ library, onOpenBook }: LibraryViewProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [route, setRoute] = useState<Route>(lastPlace.route)
  const contentRef = useRef<HTMLElement>(null)
  useEffect(() => {
    lastPlace.route = route
  }, [route])
  useLayoutEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = lastPlace.scrollTop
  }, [])
  const [menu, setMenu] = useState<{ book: BookSummary; x: number; y: number } | null>(null)
  const [showFolders, setShowFolders] = useState(false)
  const [details, setDetails] = useState<BookSummary | null>(null)
  const [classifying, setClassifying] = useState<BookSummary | null>(null)
  const [renaming, setRenaming] = useState<BookSummary | null>(null)
  const [creating, setCreating] = useState<SeriesGroup | null>(null)
  const [managing, setManaging] = useState<BookSummary | null>(null)
  const [seriesMenu, setSeriesMenu] = useState<{ group: SeriesGroup; x: number; y: number } | null>(null)
  const [deleting, setDeleting] = useState<BookSummary | null>(null)
  const [missing, setMissing] = useState<BookSummary | null>(null)
  const [removing, setRemoving] = useState<BookSummary | null>(null)
  const { settings } = library
  const zoom = settings.libraryZoom
  const zoomBy = (direction: 1 | -1): void => {
    const next = stepLibraryZoom(zoom, direction)
    if (next !== zoom) void api.updateSettings({ libraryZoom: next })
  }
  const resetZoom = (): void => void api.updateSettings({ libraryZoom: 1 })

  // Ctrl+più / Ctrl+meno / Ctrl+0, come nel browser.
  useWindowEvent('keydown', (e) => {
    if (!e.ctrlKey || e.altKey || e.metaKey) return
    if (e.key === '+' || e.key === '=') zoomBy(1)
    else if (e.key === '-') zoomBy(-1)
    else if (e.key === '0') resetZoom()
    else return
    e.preventDefault()
  })

  // Ctrl+rotella: serve un ascoltatore non passivo, altrimenti Chromium ingrandisce tutta l'interfaccia.
  const zoomByRef = useRef(zoomBy)
  zoomByRef.current = zoomBy
  useEffect(() => {
    let lockedUntil = 0
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey || e.deltaY === 0) return
      e.preventDefault()
      if (e.timeStamp < lockedUntil) return // il touchpad manda molti eventi per un solo gesto
      lockedUntil = e.timeStamp + 120
      zoomByRef.current(e.deltaY < 0 ? 1 : -1)
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])
  const books = useMemo(() => catalogBooks(library.books), [library.books])

  const classifications = useMemo(() => new Map(books.map((b) => [b.id, classifyBook(b)])), [books])
  const classOf = (book: BookSummary): Classification => classifications.get(book.id)!

  const archived = useMemo(() => archivedBooks(books), [books])
  const readOnDisk = useMemo(() => books.filter((b) => b.finished && canDeleteFromDisk(b)), [books])
  const usage = useDiskUsage(books, readOnDisk)
  // Gli albi letti da eliminare tutti insieme: dalla barra in alto tutti, dal filtro «Letti» quelli dell'elenco.
  const [deletingRead, setDeletingRead] = useState<BookSummary[] | null>(null)
  const [heroMenu, setHeroMenu] = useState<{ hero: HeroGroup; x: number; y: number } | null>(null)
  const tabBooks = useMemo(
    () => (route.tab === 'all' ? books : route.tab === 'archived' ? archived : books.filter((b) => classifications.get(b.id)!.publisher === route.tab)),
    [books, archived, classifications, route.tab]
  )
  const tabCounts = useMemo(() => {
    const counts: Record<Tab, number> = { all: books.length, marvel: 0, dc: 0, manga: 0, other: 0, archived: archived.length }
    for (const c of classifications.values()) counts[c.publisher]++
    return counts
  }, [books.length, archived.length, classifications])

  const heroes = useMemo(() => heroGroupsOf(tabBooks, classifications, route.tab), [tabBooks, classifications, route.tab])
  const hero = route.hero ? (heroes.find((h) => h.id === route.hero) ?? null) : null
  const series = useMemo(() => groupBySeries(books).groups, [books])
  const openSeries = route.series ? (series.find((g) => g.key === route.series) ?? null) : null
  const tabName = TABS.find((t) => t.id === route.tab)!.name

  // Un albo senza file non si apre: si spiega cosa è rimasto e come riaverlo.
  const openBook = (id: string): void => {
    const book = library.books.find((b) => b.id === id)
    if (book?.missingSince) setMissing(book)
    else onOpenBook(id)
  }

  const goTo = (next: Partial<Route>): void => setRoute((current) => ({ ...current, ...next }))
  const openMenu = (book: BookSummary, x: number, y: number): void => setMenu({ book, x, y })
  const openSeriesView = (key: string): void => goTo({ series: key })
  // Un personaggio con un solo fumetto apre direttamente il fumetto; la sua pagina resta nel menu del tasto destro.
  const openHero = (hero: HeroGroup): void => {
    if (hero.books.length === 1) openBook(hero.books[0]!.id)
    else goTo({ hero: hero.id })
  }

  const openFiles = async (): Promise<void> => {
    const ids = await api.openFiles()
    if (ids.length === 1) openBook(ids[0]!)
  }

  const menuItems = (book: BookSummary): (MenuItem | 'separator')[] => [
    book.missingSince
      ? { label: 'Archiviato…', icon: <HardDrive size={16} />, onSelect: () => setMissing(book) }
      : { label: 'Leggi', icon: <BookOpen size={16} />, onSelect: () => onOpenBook(book.id) },
    { label: book.collection ? 'Gestisci volume…' : 'Dettagli', icon: <Info size={16} />, onSelect: () => book.collection ? setManaging(book) : setDetails(book) },
    { label: 'Rinomina…', icon: <Pencil size={16} />, onSelect: () => setRenaming(book) },
    { label: 'Classifica…', icon: <Tags size={16} />, onSelect: () => setClassifying(book) },
    ...(book.canContinue ? [{ label: 'Nascondi da Continua a leggere', icon: <X size={16} />, onSelect: () => void api.hideContinueReading(book.id) }] : []),
    'separator',
    book.finished || book.inProgress
      ? { label: 'Segna come da leggere', icon: <BookX size={16} />, onSelect: () => void api.markUnread(book.id) }
      : { label: 'Segna come letto', icon: <BookOpenCheck size={16} />, onSelect: () => void api.updateBook(book.id, { finished: true }) },
    ...(book.inProgress ? [{ label: 'Segna come letto', icon: <BookOpenCheck size={16} />, onSelect: () => void api.updateBook(book.id, { finished: true }) }] : []),
    readingDirectionOf(book, settings.defaultDirection) === 'rtl'
      ? { label: 'Leggi da sinistra a destra', icon: <Languages size={16} />, onSelect: () => void api.updateBook(book.id, { direction: 'ltr' }) }
      : { label: 'Leggi come manga (da destra)', icon: <Languages size={16} />, onSelect: () => void api.updateBook(book.id, { direction: 'rtl' }) },
    ...(!book.collection && !book.missingSince ? [{ label: 'Mostra in Esplora file', icon: <FolderOpen size={16} />, onSelect: () => void api.showInFolder(book.id) }] : []),
    'separator',
    ...(canDeleteFromDisk(book) ? [{ label: book.collection ? 'Elimina gli originali dal disco…' : 'Elimina dal disco…', icon: <HardDrive size={16} />, danger: true, onSelect: () => setDeleting(book) }] : []),
    { label: book.collection ? 'Sciogli volume · conserva gli originali' : 'Rimuovi dalla libreria', icon: <Trash2 size={16} />, danger: true, onSelect: () => setRemoving(book) }
  ]

  const shelfHandlers = { onOpenBook: openBook, onOpenSeries: openSeriesView, onMenu: openMenu, onSeriesMenu: (group: SeriesGroup, x: number, y: number): void => setSeriesMenu({ group, x, y }) }

  const content = (): React.JSX.Element => {
    // Cercando si vedono i singoli albi della scheda corrente.
    if (query.trim()) {
      return (
        <section>
          <h2 className="section-title section-title--spaced">Risultati in «{tabName}»</h2>
          <Shelf items={shelfItems(tabBooks.filter((b) => matchesSearch(b, query)), false)} emptyMessage="Nessun fumetto corrisponde alla ricerca." {...shelfHandlers} />
        </section>
      )
    }
    if (openSeries) {
      return <SeriesView group={openSeries} onBack={() => goTo({ series: null })} onOpenBook={openBook} onMenu={openMenu} onCreate={setCreating} />
    }
    if (hero) {
      const orderKey = heroOrderKey(route.tab, hero.id)
      return (
        <HeroView
          hero={hero}
          publisherName={tabName}
          order={library.heroOrder[orderKey]}
          onReorder={(ids) => void api.setHeroOrder(orderKey, ids)}
          onBack={() => goTo({ hero: null })}
          onOpenBook={openBook}
          onMenu={openMenu}
        />
      )
    }
    switch (route.tab) {
      case 'all':
        return <AllBooks books={books} groupSeries={settings.groupSeries} onDeleteRead={setDeletingRead} {...shelfHandlers} />
      case 'marvel':
      case 'dc':
        return <PublisherView publisher={route.tab} heroes={heroes} onOpenHero={openHero} onMenu={(hero, x, y) => setHeroMenu({ hero, x, y })} />
      case 'archived':
        return (
          <section>
            <p className="archived-view__hint">
              Albi eliminati dal disco con «Elimina dal disco», dal più recente. Progressi, stato e ordine di lettura restano
              qui. Per rileggerne uno riscarica il file e aprilo da qui per ricollegarlo; se torna nella stessa cartella con lo
              stesso nome si ricollega da solo.
            </p>
            <Shelf items={tabBooks.map((book) => ({ kind: 'book', book }))} emptyMessage="Nessun albo archiviato." {...shelfHandlers} />
          </section>
        )
      case 'manga':
      case 'other':
        return (
          <Shelf
            items={shelfItems(tabBooks, route.tab === 'manga' || settings.groupSeries)}
            emptyMessage={route.tab === 'manga' ? 'Nessun manga. I manga vengono riconosciuti dai metadati o se li leggi da destra a sinistra.' : 'Nessun fumetto in questa categoria.'}
            {...shelfHandlers}
          />
        )
    }
  }

  return (
    <div className="library">
      <header className="library__titlebar drag-region">
        <div className="brand">
          <Logo />
          <span>Vignetta</span>
        </div>
        <label className="search">
          <Search size={16} />
          <input type="search" placeholder={`Cerca in «${tabName}»`} value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} />
        </label>
        <div className="library__actions">
          {usage && (
            <span className="disk-usage" title="Spazio occupato dai fumetti della libreria">
              <HardDrive size={14} />
              {formatBytes(usage.total)}
              {usage.reclaimable > 0 && (
                <button onClick={() => setDeletingRead(readOnDisk)} title="Elimina dal disco gli albi letti, conservando la cronologia">
                  {formatBytes(usage.reclaimable)} liberabili
                </button>
              )}
            </span>
          )}
          <div className="zoom-control" role="group" aria-label="Dimensione della libreria">
            <button className="icon-btn" onClick={() => zoomBy(-1)} disabled={zoom <= LIBRARY_ZOOM_MIN} title="Riduci (Ctrl+meno)" aria-label="Riduci">
              <ZoomOut size={16} />
            </button>
            <button className="zoom-control__value" onClick={resetZoom} title="Torna al 100% (Ctrl+0)">
              {Math.round(zoom * 100)}%
            </button>
            <button className="icon-btn" onClick={() => zoomBy(1)} disabled={zoom >= LIBRARY_ZOOM_MAX} title="Ingrandisci (Ctrl+più o Ctrl+rotella)" aria-label="Ingrandisci">
              <ZoomIn size={16} />
            </button>
          </div>
          <button className="btn btn--ghost" onClick={() => setShowFolders(true)}>
            <FolderOpen size={16} />
            Cartelle
          </button>
          <button className="btn btn--primary" onClick={() => void openFiles()}>
            <Plus size={16} />
            Apri
          </button>
        </div>
      </header>

      <main
        ref={contentRef}
        className="library__content"
        style={{ zoom }}
        data-tab={route.tab}
        onScroll={(e) => (lastPlace.scrollTop = e.currentTarget.scrollTop)}
      >
        {books.length === 0 ? (
          <EmptyLibrary onAddFolder={() => void api.addFolder()} onOpenFiles={() => void openFiles()} />
        ) : (
          <>
            <nav className="tabs" role="tablist" aria-label="Categorie">
              {/* Le categorie vuote non si mostrano, tranne quella aperta (es. dopo aver tolto l'ultimo albo). */}
              {TABS.filter((tab) => tab.id === 'all' || tab.id === route.tab || tabCounts[tab.id] > 0).map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={route.tab === tab.id}
                  className={`tab tab--${tab.id}`}
                  onClick={() => setRoute({ tab: tab.id, hero: null, series: null })}
                >
                  {tab.name}
                  <span className="tab__count">{tabCounts[tab.id]}</span>
                </button>
              ))}
            </nav>
            {content()}
          </>
        )}
      </main>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.book)} onClose={() => setMenu(null)} />}
      {seriesMenu && <ContextMenu x={seriesMenu.x} y={seriesMenu.y} onClose={() => setSeriesMenu(null)} items={[
        { label: 'Apri serie', onSelect: () => openSeriesView(seriesMenu.group.key) },
        ...(collectionEdition(seriesMenu.group) ? [{ label: `Crea ${collectionEdition(seriesMenu.group)}…`, icon: <Layers size={16} />, onSelect: () => setCreating(seriesMenu.group) }] : [])
      ]} />}
      {creating && <CollectionDialog group={creating} onClose={() => setCreating(null)} onCreated={(book) => { setCreating(null); goTo({ series: null }); setManaging(book) }} />}
      {managing && <ManageCollection book={library.books.find((b) => b.id === managing.id) ?? managing} onClose={() => setManaging(null)} onRead={openBook} />}
      {showFolders && <FoldersDialog folders={library.folders} onClose={() => setShowFolders(false)} />}
      {details && <BookDetails book={books.find((b) => b.id === details.id) ?? details} onRead={openBook} onClose={() => setDetails(null)} onRename={(book) => {
        setDetails(null)
        setRenaming(book)
      }} />}
      {renaming && <RenameDialog book={books.find((b) => b.id === renaming.id) ?? renaming} onClose={() => setRenaming(null)} />}
      {deleting && <DeleteFromDiskDialog book={deleting} onClose={() => setDeleting(null)} />}
      {missing && <MissingFileDialog book={missing} onClose={() => setMissing(null)} />}
      {removing && <RemoveBookDialog book={removing} onClose={() => setRemoving(null)} />}
      {deletingRead && <DeleteAllFromDiskDialog books={deletingRead} onClose={() => setDeletingRead(null)} />}
      {heroMenu && <ContextMenu x={heroMenu.x} y={heroMenu.y} onClose={() => setHeroMenu(null)} items={[
        ...(heroMenu.hero.books.length === 1 ? [{ label: heroMenu.hero.books[0]!.missingSince ? 'Archiviato…' : 'Leggi', icon: <BookOpen size={16} />, onSelect: () => openBook(heroMenu.hero.books[0]!.id) }] : []),
        { label: `Apri la pagina di ${heroMenu.hero.name}`, icon: <User size={16} />, onSelect: () => goTo({ hero: heroMenu.hero.id }) }
      ]} />}
      {classifying && <ClassifyDialog book={classifying} current={classOf(classifying)} onClose={() => setClassifying(null)} />}
    </div>
  )
}

/** Raggruppa i fumetti per personaggio (un fumetto compare sotto ognuno dei suoi protagonisti). */
function heroGroupsOf(books: readonly BookSummary[], classifications: ReadonlyMap<string, Classification>, tab: Tab): HeroGroup[] {
  if (tab !== 'marvel' && tab !== 'dc') return []
  const groups = new Map<string, HeroGroup>()
  const add = (id: string, name: string, book: BookSummary): void => {
    const group = groups.get(id) ?? { id, name, books: [] }
    group.books.push(book)
    groups.set(id, group)
  }
  for (const book of books) {
    const { characters } = classifications.get(book.id)!
    if (characters.length === 0) add(NO_HERO, `Altri fumetti ${tab === 'marvel' ? 'Marvel' : 'DC'}`, book)
    for (const id of characters) add(id, characterById(id)?.name ?? id, book)
  }
  // Prima i personaggi con più fumetti; "altri fumetti" sempre in fondo.
  return [...groups.values()].sort(
    (a, b) => Number(a.id === NO_HERO) - Number(b.id === NO_HERO) || b.books.length - a.books.length || a.name.localeCompare(b.name, 'it')
  )
}

interface AllBooksProps extends ShelfHandlers {
  books: readonly BookSummary[]
  groupSeries: boolean
  onDeleteRead: (books: BookSummary[]) => void
}

/** La scheda "Tutti": continua a leggere, aggiunti di recente e l'intera libreria. */
function AllBooks({ books, groupSeries, onDeleteRead, ...handlers }: AllBooksProps): React.JSX.Element {
  const continueReading = useMemo(
    () =>
      books
        .filter((b) => b.canContinue)
        .sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0))
        .slice(0, CONTINUE_LIMIT),
    [books]
  )
  const recent = useMemo(() => shelfItems(recentlyAdded(books), groupSeries, 'added').slice(0, RECENT_LIMIT), [books, groupSeries])

  return (
    <>
      {continueReading.length > 0 && (
        <ContinueReading books={continueReading} onOpen={handlers.onOpenBook} onMenu={handlers.onMenu} onHide={(id) => void api.hideContinueReading(id)} />
      )}

      {recent.length > 0 && (
        <section className="shelf">
          <h2 className="section-title">Aggiunti di recente</h2>
          <BookRow items={recent} {...handlers} />
        </section>
      )}

      <LibraryShelf title="La tua libreria" books={books} groupSeries={groupSeries} onDeleteRead={onDeleteRead} {...handlers} />
    </>
  )
}

function EmptyLibrary({ onAddFolder, onOpenFiles }: { onAddFolder: () => void; onOpenFiles: () => void }): React.JSX.Element {
  return (
    <div className="empty">
      <div className="empty__art">
        <Logo size={72} />
      </div>
      <h1>La tua libreria è vuota</h1>
      <p>Aggiungi la cartella dove tieni i fumetti, oppure trascina qui file CBZ, CBR, PDF o cartelle di immagini.</p>
      <div className="empty__actions">
        <button className="btn btn--primary" onClick={onAddFolder}>
          <FolderPlus size={16} />
          Aggiungi cartella
        </button>
        <button className="btn" onClick={onOpenFiles}>
          Apri un file
        </button>
      </div>
    </div>
  )
}
