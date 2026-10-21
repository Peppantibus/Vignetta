import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Senza i commenti «//#region <file>» che indicano da dove viene ogni pezzo di codice: per i worker contengono il
// percorso completo del progetto sul PC di chi compila, che finirebbe nell'installer.
const build = { rolldownOptions: { experimental: { attachDebugInfo: 'none' as const } } }

export default defineConfig({
  main: { build },
  preload: { build },
  renderer: {
    build,
    plugins: [react()]
  }
})
