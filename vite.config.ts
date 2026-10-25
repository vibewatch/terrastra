import { defineConfig } from 'vite';

// BASE_PATH: URL prefix when hosted below the domain root, e.g. "/terrastra/" on GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  // NOHMR=1: no live reload (for screenshot QA while files are being edited)
  server: { port: 5173, proxy: Object.fromEntries(['/api', '/signin', '/account', '/_next'].map(p => [p, 'http://localhost:3000'])) /* npm run dev:web */, hmr: process.env.NOHMR ? false : undefined },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    // three.js changes rarely: keep it in its own long-cached chunk, separate from app code.
    rollupOptions: { output: { manualChunks: id => (id.includes('/node_modules/three/') ? 'three' : undefined) } },
  },
  // module workers so the model builder worker can lazy-load hero packs (import.meta.glob code-splitting)
  worker: { format: 'es' },
});
