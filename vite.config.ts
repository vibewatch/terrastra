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
      input: {
        main: 'index.html',
        encyclopedia: 'src/client/models/encyclopedia.ts',
      },
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /\/node_modules\/three\// },
            { name: 'shared-lib', test: /\/src\/shared\/lib\// },
            { name: 'lessons-ssbs', test: /\/src\/client\/lessons\/ssbs\// },
            { name: 'lessons-free', test: /\/src\/client\/lessons\/(?:free-bundle\.ts|catalog\.ts|catalog-meta\.json|l-earth\.ts|l-land\.ts|l-home\.ts|geo(?:-cn2?)?\.ts|climate\.ts|figs\.ts|kit\.ts|models\.ts|shuffle\.ts|stage\.ts|astro\/(?:l-earthmoon|draw|stage|sunspots|types)\.ts)/ },
            { name: 'pro-lessons-astro', test: /\/src\/client\/lessons\/(?:pro-astro-bundle\.ts|astro\/(?:data\.ts|l-(?!earthmoon\.ts)))/ },
            { name: 'pro-lessons-china', test: /\/src\/client\/lessons\/l-china/ },
            { name: 'pro-lessons-earth', test: /\/src\/client\/lessons\/(?:pro-bundle\.ts|data\.ts|l-earth2\.ts|l-maps\.ts|l-physical\.ts|l-climate\.ts|l-grade-banks\.ts)/ },
            { name: 'pro-lessons-world', test: /\/src\/client\/lessons\/(?:l-world\.ts|l-regions\.ts|l-human\.ts|l-senior)/ },
          ],
        },
      },
    },
  },
  // module workers so the model builder worker can lazy-load hero packs (import.meta.glob code-splitting)
  worker: { format: 'es' },
});
