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
      preserveEntrySignatures: 'allow-extension',
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            { name: 'three', test: /\/node_modules\/three\//, includeDependenciesRecursively: false },
            { name: 'astro-ephem', test: /\/src\/shared\/lib\/astro\//, includeDependenciesRecursively: false },
            { name: 'lessons-free', test: /\/src\/client\/lessons\/(?:free-bundle\.ts|free-senior\.ts|catalog\.ts|catalog-meta\.json|l-earth\.ts|l-land\.ts|l-home\.ts|geo(?:-cn2?)?\.ts|climate\.ts|figs\.ts|kit\.ts|models\.ts|shuffle\.ts|stage\.ts|astro\/(?:l-earthmoon|free-solar|draw|stage|sunspots|types)\.ts)/, includeDependenciesRecursively: false },
            { name: 'lessons-ssbs', test: /\/src\/client\/lessons\/ssbs\//, includeDependenciesRecursively: false },
            { name: 'pro-lessons-astro', test: /\/src\/client\/lessons\/(?:pro-astro-bundle\.ts|astro\/(?:data\.ts|l-(?!earthmoon\.ts)))/, includeDependenciesRecursively: false },
            { name: 'pro-lessons-china', test: /\/src\/client\/lessons\/(?:pro-china-bundle\.ts|l-china)/, includeDependenciesRecursively: false },
            { name: 'pro-lessons-world', test: /\/src\/client\/lessons\/(?:pro-world-bundle\.ts|l-world\.ts|l-regions\.ts|l-human\.ts)/, includeDependenciesRecursively: false },
            { name: 'pro-lessons-earth', test: /\/src\/client\/lessons\/(?:pro-earth-bundle\.ts|l-earth2\.ts|l-maps\.ts|l-physical\.ts|l-climate\.ts|l-senior)/, includeDependenciesRecursively: false },
            { name: 'pro-lessons-exams', test: /\/src\/client\/lessons\/(?:pro-bundle\.ts|data\.ts|l-grade-banks\.ts)/, includeDependenciesRecursively: false },
          ],
        },
      },
    },
  },
  // module workers so the model builder worker can lazy-load hero packs (import.meta.glob code-splitting)
  worker: { format: 'es' },
});
