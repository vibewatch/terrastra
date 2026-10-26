import { defineConfig } from 'vite';

// BASE_PATH: URL prefix when hosted below the domain root, e.g. "/terrastra/" on GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  // NOHMR=1: no live reload (for screenshot QA while files are being edited)
  server: { port: 5173, proxy: { '/api': 'http://localhost:8787' }, hmr: process.env.NOHMR ? false : undefined },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    // three.js changes rarely: keep it in its own long-cached chunk, separate from app code.
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'three', test: /\/node_modules\/three\// }] } } },
  },
  // module workers so the model builder worker can lazy-load hero packs (import.meta.glob code-splitting)
  worker: { format: 'es' },
});
