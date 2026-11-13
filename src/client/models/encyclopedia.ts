import type { ModelRecipe } from '../../shared/data/types.ts';
import { mountHeroPreview } from './preview.ts';

const hero = document.querySelector<HTMLElement>('.hero[data-model]');
if (hero?.dataset.model) {
  try {
    const recipe = JSON.parse(hero.dataset.model) as ModelRecipe;
    if (recipe && typeof recipe.kind === 'string') {
      mountHeroPreview(hero, recipe);
    }
  } catch {
    // Ignore malformed data-model attribute and keep the static SVG reticle fallback.
  }
}
