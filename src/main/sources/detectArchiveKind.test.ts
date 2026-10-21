import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { detectArchiveKind } from '.'

let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vignetta-kind-'))
})
afterAll(() => rm(dir, { recursive: true, force: true }))

it.each([
  ['un .cbr che in realtà è uno ZIP', 'finto.cbr', Buffer.from([0x50, 0x4b, 0x07, 0x08, 0x50, 0x4b, 0x03, 0x04]), 'zip'],
  ['un .cbz che in realtà è un RAR', 'finto.cbz', Buffer.from('Rar!\x1a\x07\x00', 'latin1'), 'rar'],
  ['un file sconosciuto', 'boh.cbz', Buffer.from('ciao'), null],
  ['un PDF con estensione CBR', 'pdf.cbr', Buffer.from('%PDF-1.7'), 'pdf']
])('riconosce %s', async (_label, name, bytes, expected) => {
  const path = join(dir, name)
  await writeFile(path, bytes)
  expect(await detectArchiveKind(path)).toBe(expected)
})
