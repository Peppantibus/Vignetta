import { resolve } from 'node:path'
import type { Library } from './library/library'
import { archiveKind } from './library/scanner'

/**
 * Fumetti passati sulla riga di comando (doppio clic da Esplora file, «Apri con»).
 * Si scartano l'eseguibile, gli argomenti di Electron/Chromium e i file di altri formati;
 * i percorsi relativi valgono rispetto alla cartella da cui è stata lanciata l'istanza.
 */
export function comicPathsFromArgs(argv: readonly string[], cwd: string): string[] {
  return argv.filter((arg) => !arg.startsWith('-') && archiveKind(arg) !== null).map((arg) => resolve(cwd, arg))
}

/**
 * Fumetti da aprire su richiesta di Windows. L'interfaccia potrebbe non essere ancora pronta
 * (primo avvio), quindi l'ultima richiesta resta in attesa finché l'interfaccia non la ritira.
 */
export class LaunchRequests {
  private pending: string | null = null

  constructor(
    private readonly library: Library,
    private readonly notify: () => void
  ) {}

  async open(argv: readonly string[], cwd: string): Promise<void> {
    const paths = comicPathsFromArgs(argv, cwd)
    if (paths.length === 0) return
    // Come col trascinamento: il fumetto entra in libreria (o si ritrova quello già presente) e si apre.
    const [id] = await this.library.addPaths(paths)
    if (!id) return
    this.pending = id
    this.notify()
  }

  take(): string | null {
    const id = this.pending
    this.pending = null
    return id
  }
}
