import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Tiene solo le `keep` cartelle di cache usate più di recente (RAR estratti, PDF preparati): chi apre un fumetto
 * aggiorna la data di modifica della sua cartella. I file sciolti nella radice non si toccano, i fumetti originali mai.
 */
export async function pruneCache(root: string, keep: number): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const dirs = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const path = join(root, entry.name)
    return { path, usedAt: (await stat(path)).mtimeMs }
  }))
  dirs.sort((a, b) => b.usedAt - a.usedAt)
  await Promise.all(dirs.slice(keep).map((dir) => rm(dir.path, { recursive: true, force: true })))
}
