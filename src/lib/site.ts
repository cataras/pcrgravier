import { getCollection, type CollectionEntry } from 'astro:content';

export const SITE = {
  title: 'PCR GRAVIER',
  tagline: 'All Roads Bike Adventures',
  description:
    'PCR Gravier est un collectif de cyclistes réunis autour d’une passion pour l’aventure à vélo et une attirance certaine pour les chemins de traverse.',
  quote: '« Il suffit de rouler pour avoir des histoires à raconter »',
  email: 'pcrgravier@gmail.com',
  social: {
    instagram: 'https://www.instagram.com/pcrgravier/',
    facebook: 'https://www.facebook.com/pcrgravier/',
  },
  footer: 'Droits réservés Castors Lapons – Maximum Offroad',
};

export const NAV = [
  { label: 'Accueil', href: '/' },
  { label: 'Vidéos', href: '/videos/' },
  { label: 'À propos', href: '/a-propos/' },
  { label: 'Contact', href: '/contact/' },
];

/** Auteurs : identifiant d'URL (repris de l'ancien site : /author/julien/) */
export const AUTHORS: Record<string, string> = {
  'Julien Sommier': 'julien',
  'Sims Teuteul': 'sims',
};

export const PAGE_SIZE = 12;

export const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const authorSlug = (name?: string) => (name ? (AUTHORS[name] ?? slugify(name)) : undefined);

export type Article = CollectionEntry<'articles'>;

/** Articles publiés, du plus récent au plus ancien. */
export async function getArticles(): Promise<Article[]> {
  const all = await getCollection('articles', ({ data }) => import.meta.env.DEV || !data.draft);
  return all.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export async function getCategories() {
  const counts = new Map<string, number>();
  for (const a of await getArticles()) for (const c of a.data.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, slug: slugify(name), count })).sort((a, b) => a.name.localeCompare(b.name));
}

export const formatDate = (d: Date) =>
  d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
