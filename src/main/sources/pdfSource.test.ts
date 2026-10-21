import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readImageSize } from '../imageSize'
import { archiveKind, scanFolder } from '../library/scanner'
import { openSource } from '.'
import { PdfNative } from './pdfNative'
import { PdfSource, pdfRenderSize } from './pdfSource'
import { pruneCache } from './cache'

/** PDF vettoriale minimo nostro: testo, forme, pagina ruotata e ritaglio; nessun fumetto nei test. */
function fixture(extra = ''): Buffer {
  const commands = '0.2 0.4 0.8 rg 10 20 100 150 re f BT /F1 24 Tf 30 220 Td (Vignetta PDF) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 3 /Kids [3 0 R 4 0 R 5 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Rotate 90 /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /CropBox [50 50 250 350] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    `<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let text = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((value, index) => { offsets.push(text.length); text += `${index + 1} 0 obj\n${value}\nendobj\n` })
  const xref = text.length
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  text += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n${extra}`
  return Buffer.from(text, 'ascii')
}

let dir: string
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'vignetta-pdf-')) })
afterAll(() => rm(dir, { recursive: true, force: true }))

describe('PDF nel catalogo e dimensioni', () => {
  it('riconosce i PDF nella scansione, anche con estensione maiuscola', async () => {
    const file = join(dir, 'Scansione.PDF')
    await writeFile(file, fixture())
    expect(archiveKind(file)).toBe('pdf')
    expect(await scanFolder(dir)).toContainEqual({ path: file, kind: 'pdf' })
  })

  it('mantiene proporzioni, dimensioni limitate e almeno un pixel per lato', () => {
    expect(pdfRenderSize([200, 300])).toEqual([2133, 3200])
    expect(pdfRenderSize([300, 200])).toEqual([3200, 2133])
    expect(pdfRenderSize([1, 1e9])).toEqual([1, 3200])
    for (const size of [[0, 2], [-1, 10], [NaN, 10], [10, Infinity]] as const) expect(() => pdfRenderSize(size)).toThrow('Dimensioni')
  })

  it('conserva le cache più recenti e lascia intatti i file esterni alle cartelle di cache', async () => {
    const root = join(dir, 'cache-da-limitare')
    for (let i = 1; i <= 3; i++) {
      const folder = join(root, String(i))
      await mkdir(folder, { recursive: true })
      await writeFile(join(folder, 'pagina.png'), 'pagina di prova')
      await utimes(folder, new Date(i * 1000), new Date(i * 1000))
    }
    await writeFile(join(root, 'nota.txt'), 'conservare')
    await pruneCache(root, 2)
    expect((await readdir(root)).sort()).toEqual(['2', '3', 'nota.txt'])
    expect(await readFile(join(root, 'nota.txt'), 'utf8')).toBe('conservare')
  })
})

describe.skipIf(process.platform !== 'win32')('motore PDF reale di Windows', () => {
  it('prepara pagine vettoriali, ruotate e ritagliate nello stesso formato immagini degli archivi', async () => {
    const file = join(dir, 'Vettoriale.pdf')
    await writeFile(file, fixture())
    const source = await PdfSource.open(file, join(dir, 'cache-vettoriale'))
    try {
      expect(source.pages).toEqual(['1.png', '2.png', '3.png'])
      expect(source.pageSizes).toEqual([[2133, 3200], [3200, 2133], [2133, 3200]])
      for (let index = 0; index < 3; index++) expect(readImageSize(await source.read(index))).toEqual(source.pageSizes[index])
      expect(await source.readMetadata()).toBeNull()
      await expect(source.read(-1)).rejects.toThrow('inesistente')
      await expect(source.read(3)).rejects.toThrow('inesistente')
    } finally { await source.close() }
    await expect(source.read(0)).rejects.toThrow('chiuso')
  }, 20_000)

  it('riusa la cache dopo la chiusura e invalida la versione quando il documento cambia', async () => {
    const file = join(dir, 'Cache.pdf')
    const cache = join(dir, 'cache-versioni')
    await writeFile(file, fixture())
    const first = await PdfSource.open(file, cache)
    const bytes = await first.read(0)
    await first.close()
    const second = await PdfSource.open(file, cache)
    try {
      const same = await Promise.all([second.read(0), second.read(0)])
      expect(same[0]).toEqual(bytes)
      expect(same[1]).toEqual(bytes)
    } finally { await second.close() }
    await writeFile(file, fixture('% Documento aggiornato'))
    const third = await PdfSource.open(file, cache)
    try { expect(readImageSize(await third.read(0))).toEqual([2133, 3200]) }
    finally { await third.close() }
    expect((await readdir(cache)).length).toBe(2)
    expect(await readFile(file)).toEqual(fixture('% Documento aggiornato'))
  }, 20_000)

  it('apre un PDF con estensione CBR e gestisce richieste concorrenti', async () => {
    const file = join(dir, 'Estensione.cbr')
    await writeFile(file, fixture())
    const source = await openSource({ path: file, kind: 'rar' }, join(dir, 'cache-estensione'))
    try {
      const pages = await Promise.all([source.read(0), source.read(1), source.read(0)])
      expect(pages[0]).toEqual(pages[2])
      expect(readImageSize(pages[1]!)).toEqual([3200, 2133])
    } finally { await source.close() }
  }, 20_000)

  it('dopo un errore del motore di Windows avvia una nuova sessione invece di restare illeggibile', async () => {
    const file = join(dir, 'Ripresa.pdf')
    await writeFile(file, fixture())
    const source = await PdfSource.open(file, join(dir, 'cache-ripresa'))
    try {
      await source.read(0)
      // Come un tempo scaduto o PowerShell chiuso: la sessione non risponde più.
      const engine = (source as unknown as { native: { close(): void; alive: boolean } }).native
      engine.close()
      expect(engine.alive).toBe(false)
      expect(readImageSize(await source.read(1))).toEqual([3200, 2133])
      expect((source as unknown as { native: { alive: boolean } }).native.alive).toBe(true)
    } finally { await source.close() }
  }, 30_000)

  it('abort lascia perdere le pagine in coda e chiude subito il motore di Windows', async () => {
    const file = join(dir, 'Interrotto.pdf')
    await writeFile(file, fixture())
    const source = await PdfSource.open(file, join(dir, 'cache-interrotto'))
    const queued = [source.read(0), source.read(1), source.read(2)]
    source.abort()
    const results = await Promise.allSettled(queued)
    expect(results.some((result) => result.status === 'rejected')).toBe(true)
    await source.close()
    expect((source as unknown as { native: { alive: boolean } }).native.alive).toBe(false)
    await expect(source.read(0)).rejects.toThrow('chiuso')
  }, 20_000)

  it('il tempo massimo vale per la pagina in lavorazione, non da quando le pagine entrano in coda', async () => {
    const file = join(dir, 'Coda.pdf')
    await writeFile(file, fixture())
    const target = (n: number): string => join(dir, `coda-${n}.png`)
    const render = (native: PdfNative, n: number): Promise<unknown> => native.request({ kind: 'render', page: n % 3, width: 2133, height: 3200, target: target(n) })
    // Quanto impiega una pagina su questo PC, per scegliere un tempo massimo che una coda lunga supera di sicuro.
    const probe = new PdfNative()
    let single: number
    try {
      await probe.request({ kind: 'open', path: file })
      await render(probe, 0)
      const started = performance.now()
      await render(probe, 1)
      single = performance.now() - started
    } finally { probe.close() }
    const timeout = Math.max(1500, single * 4)
    const native = new PdfNative(timeout)
    try {
      await native.request({ kind: 'open', path: file })
      const started = performance.now()
      await Promise.all(Array.from({ length: Math.ceil((timeout * 2) / single) + 1 }, (_, n) => render(native, n)))
      expect(performance.now() - started).toBeGreaterThan(timeout)
      expect(native.alive).toBe(true)
    } finally { native.close() }
  }, 60_000)

  it('segnala un documento danneggiato senza lasciare aperto il processo di lettura', async () => {
    const file = join(dir, 'Danneggiato.pdf')
    await writeFile(file, '%PDF-1.7\ncontenuto non valido')
    await expect(PdfSource.open(file, join(dir, 'cache-danneggiato'))).rejects.toThrow('PDF')
  }, 20_000)
})
