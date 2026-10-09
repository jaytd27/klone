import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // MuPDF uses top-level await and loads its .wasm relative to its own module,
  // so it must run as an ES module worker and skip dependency pre-bundling.
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['mupdf'] },
  build: { target: 'es2022' },
})
