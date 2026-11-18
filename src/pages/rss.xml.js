import rss from '@astrojs/rss';
import { getEntry } from 'astro:content';
import { getSettings, getArticles } from '../lib/site';

export async function GET(context) {
  const site = await getSettings();
  const articles = await getArticles();
  return rss({
    title: site.title,
    description: site.description,
    site: context.site,
    items: await Promise.all(
      articles.map(async (a) => ({
        title: a.data.title,
        pubDate: a.data.date,
        link: `/${a.id}/`,
        categories: (await Promise.all(a.data.categories.map((r) => getEntry(r)))).map((c) => c?.data.name).filter(Boolean),
        author: a.data.author ? (await getEntry(a.data.author))?.data.name : undefined,
      })),
    ),
    customData: '<language>fr-fr</language>',
  });
}
