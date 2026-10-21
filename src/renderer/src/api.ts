import type { VignettaApi } from '../../shared/api'

declare global {
  interface Window {
    vignetta: VignettaApi
  }
}

/** Ponte verso il processo principale, esposto dal preload. */
export const api: VignettaApi = window.vignetta

/** Electron antepone il nome del canale IPC: all'utente serve solo il messaggio leggibile. */
export function errorMessage(cause: unknown): string {
  return (cause instanceof Error ? cause.message : String(cause)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
}
