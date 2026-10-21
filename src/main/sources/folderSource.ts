import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { compareNatural } from '../../shared/naturalSort'
import { readFileHead } from './fileRead'
import { isComicInfoName, isPageName, type PageSource } from './pageSource'

/** Cartella di immagini: le pagine sono i file immagine contenuti direttamente nella cartella. */
export class FolderSource implements PageSource {
  private constructor(
    private readonly dir: string,
    readonly pages: readonly string[]
  ) {}

  static async open(dir: string): Promise<FolderSource> {
    return new FolderSource(dir, await listPageFiles(dir))
  }

  read(index: number): Promise<Buffer> {
    return readFile(this.file(index))
  }

  readHead(index: number, bytes: number): Promise<Buffer> {
    return readFileHead(this.file(index), bytes)
  }

  async readMetadata(): Promise<Buffer | null> {
    const name = (await readdir(this.dir)).find(isComicInfoName)
    return name ? readFile(join(this.dir, name)) : null
  }

  async close(): Promise<void> {}

  private file(index: number): string {
    const name = this.pages[index]
    if (name === undefined) throw new RangeError(`Pagina ${index} inesistente`)
    return join(this.dir, name)
  }
}

export async function listPageFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter((e) => e.isFile() && isPageName(e.name))
    .map((e) => e.name)
    .sort(compareNatural)
}
