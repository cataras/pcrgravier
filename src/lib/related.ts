import { getRide, haversine } from './rides';
import type { Article } from './site';

/**
 * Articles à lire ensuite : on privilégie les sorties proches
 * géographiquement, puis celles de la même catégorie.
 */
export async function getRelated(article: Article, all: Article[], count = 3): Promise<Article[]> {
  const here = await getRide(article);
  const cats = new Set(article.data.categories.map((c) => c.id));
  const main = article.data.categories[0]?.id;

  const scored = await Promise.all(
    all
      .filter((a) => a.id !== article.id)
      .map(async (a) => {
        let score = 0;
        const there = await getRide(a);
        if (here?.lat !== undefined && there?.lat !== undefined) {
          const d = haversine(here as { lat: number; lng: number }, there as { lat: number; lng: number });
          score += d < 50 ? 4 : d < 150 ? 3 : d < 400 ? 1.5 : 0;
        }
        if (main && a.data.categories[0]?.id === main) score += 2;
        else if (a.data.categories.some((c) => cats.has(c.id))) score += 1;
        // à score égal, l'article le plus proche dans le temps
        score -= Math.abs(a.data.date.valueOf() - article.data.date.valueOf()) / (1000 * 3600 * 24 * 365 * 20);
        return { a, score };
      }),
  );
  return scored.sort((x, y) => y.score - x.score).slice(0, count).map((x) => x.a);
}
