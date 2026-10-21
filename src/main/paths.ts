/**
 * Windows non distingue maiuscole e minuscole nei percorsi: `D:\Fumetti` e `d:\fumetti` sono la stessa cartella.
 * Cartelle osservate, esclusioni e file da eliminare si confrontano quindi con questa chiave, mai come testo.
 */
export function pathKey(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path
}

export function samePath(a: string, b: string): boolean {
  return pathKey(a) === pathKey(b)
}
