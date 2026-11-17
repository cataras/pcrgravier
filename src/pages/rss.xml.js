import rss from '@astrojs/rss';
import { SITE, getArticles } from '../lib/site';

export async function GET(context) {
  const articles = await getArticles();
  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site,
    items: articles.map((a) => ({
      title: a.data.title,
      pubDate: a.data.date,
      link: `/${a.id}/`,
      categories: a.data.categories,
      author: a.data.author,
    })),
    customData: '<language>fr-fr</language>',
  });
}
