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
    // Lesson packs are grouped by curriculum so no single lazy bundle exceeds the size budget.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /\/node_modules\/three\// },
            { name: 'lessons-astro', test: /\/src\/client\/lessons\/astro\/(?:data|l-)/ },
            { name: 'lessons-ssbs', test: /\/src\/client\/lessons\/ssbs\// },
            { name: 'lessons-china', test: /\/src\/client\/lessons\/(?:l-china|geo-cn)/ },
            { name: 'lessons-earth', test: /\/src\/client\/lessons\/(?:l-earth|l-maps|l-land|l-physical|l-climate)/ },
            { name: 'lessons-world', test: /\/src\/client\/lessons\/(?:l-world|l-regions|l-human|l-senior|l-home)/ },
          ],
        },
      },
    },
  },
  // module workers so the model builder worker can lazy-load hero packs (import.meta.glob code-splitting)
  worker: { format: 'es' },
});
