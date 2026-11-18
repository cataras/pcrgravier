import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';

export type Article = CollectionEntry<'articles'>;
export type Page = CollectionEntry<'pages'>;
export type Category = CollectionEntry<'categories'>;
export type Author = CollectionEntry<'authors'>;

/** Adresses du site (mêmes chemins que l'ancien WordPress). */
export const url = {
  entry: (id: string) => `/${id}/`,
  category: (id: string) => `/category/${id}/`,
  author: (id: string) => `/author/${id}/`,
};

/** Adresses déjà prises par le site : une page du CMS ne peut pas les utiliser. */
const RESERVED = new Set(['admin', 'author', 'carte', 'category', 'contact', 'page', 'pagefind', 'recherche', 'rss.xml', '404', '_astro']);

const isPublished = ({ data }: { data: { draft?: boolean } }) => import.meta.env.DEV || !data.draft;

/** Réglages généraux (titre, citation, réseaux…) modifiables dans le CMS. */
export async function getSettings() {
  const entry = await getEntry('settings', 'site');
  if (!entry) throw new Error('Réglages introuvables : src/content/settings/site.json');
  return entry.data;
}

/** Articles publiés, du plus récent au plus ancien. */
export async function getArticles(): Promise<Article[]> {
  const all = await getCollection('articles', isPublished);
  return all.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** Pages libres créées dans le CMS (À propos, Vidéos…), à la racine du site. */
export async function getPages(): Promise<Page[]> {
  const pages = await getCollection('pages', isPublished);
  const articleIds = new Set((await getCollection('articles')).map((a) => a.id));
  for (const p of pages) {
    if (RESERVED.has(p.id) || articleIds.has(p.id)) {
      throw new Error(
        `La page « ${p.data.title} » utilise l'adresse /${p.id}/, déjà prise par ` +
          (articleIds.has(p.id) ? 'un article' : 'le site') + '. Renomme le fichier de la page.',
      );
    }
  }
  return pages;
}

/** Menu principal : Accueil, Carte, les pages cochées « dans le menu », puis Contact. */
export async function getNav() {
  const pages = (await getPages())
    .filter((p) => p.data.menu)
    .sort((a, b) => a.data.menuOrder - b.data.menuOrder || a.data.title.localeCompare(b.data.title));
  return [
    { label: 'Accueil', href: '/' },
    { label: 'Carte', href: '/carte/' },
    ...pages.map((p) => ({ label: p.data.menuLabel ?? p.data.title, href: url.entry(p.id) })),
    { label: 'Contact', href: '/contact/' },
  ];
}

/** Catégories triées, avec leur nombre d'articles. */
export async function getCategories() {
  const articles = await getArticles();
  const cats = await getCollection('categories');
  return cats
    .map((c) => ({ entry: c, count: articles.filter((a) => a.data.categories.some((r) => r.id === c.id)).length }))
    .sort((a, b) => a.entry.data.order - b.entry.data.order || a.entry.data.name.localeCompare(b.entry.data.name));
}

/** Première catégorie d'un article (affichée en pastille). */
export async function mainCategory(article: { data: { categories?: { id: string }[] } }) {
  const ref = article.data.categories?.[0];
  return ref ? getEntry('categories', ref.id) : undefined;
}

export async function getAuthor(article: { data: { author?: { id: string } } }) {
  return article.data.author ? getEntry('authors', article.data.author.id) : undefined;
}

export const formatDate = (d: Date) =>
  d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export const formatNumber = (n: number) => n.toLocaleString('fr-FR');

/** Version réduite d'une image (vignettes, partages sur les réseaux). */
export async function thumbnail(src: ImageMetadata, width: number, format: 'webp' | 'jpg' = 'webp') {
  return (await getImage({ src, width, format })).src;
}

/**
 * Résumé en texte brut d'un contenu Markdown (description pour les moteurs de
 * recherche et les partages) : premiers paragraphes, coupé proprement.
 */
export function excerpt(markdown = '', max = 160) {
  const paragraphs = markdown
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*https?:\/\/\S+\s*$/gm, ' ')
    .replace(/^#+\s*|^>\s*|[*_`~]|^-{3,}$/gm, '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  // on saute les intertitres et lignes courtes du début (« PRÉAMBULE »…)
  const start = paragraphs.findIndex((p) => p.length >= 80);
  const text = paragraphs.slice(Math.max(start, 0)).join(' ');
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:.–-]+$/, '') + '…';
}
