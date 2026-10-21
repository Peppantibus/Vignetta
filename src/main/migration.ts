import { existsSync } from 'node:fs'
import { cp, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

/** Nome della cartella dati usata quando il programma si chiamava "Nuvola". */
const PREVIOUS_DATA_FOLDER = 'Nuvola'

/**
 * Il programma si chiamava "Nuvola": al primo avvio con il nuovo nome ne recupera libreria,
 * progressi e copertine. La vecchia cartella resta com'è.
 */
export async function migrateFromPreviousName(appData: string, userData: string): Promise<void> {
  const previous = join(appData, PREVIOUS_DATA_FOLDER)
  const library = 'library.json'
  if (previous.toLowerCase() === userData.toLowerCase()) return
  if (existsSync(join(userData, library)) || !existsSync(join(previous, library))) return

  await mkdir(userData, { recursive: true })
  await cp(join(previous, library), join(userData, library))
  await cp(join(previous, 'covers'), join(userData, 'covers'), { recursive: true }).catch(() => {
    // senza copertine si rigenerano: non è un problema
  })
}
