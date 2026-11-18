/**
 * Vidéos des articles : toute adresse Vimeo ou YouTube seule sur sa ligne.
 * Sert à la page Vidéos (case « Ajouter les vidéos des articles » dans le CMS).
 */
import { embedFor } from '../plugins/remark-embeds.mjs';
import type { Article } from './site';

const VIDEO = /^https?:\/\/(www\.|player\.|m\.)?(vimeo\.com|youtube\.com|youtu\.be)\/\S+$/;

/** Identifiant stable d'une vidéo (pour ne pas l'afficher deux fois). */
export function videoKey(raw: string) {
  const url = new URL(raw);
  const vimeo = url.pathname.match(/(?:^|\/)(\d{5,})/);
  if (url.hostname.includes('vimeo') && vimeo) return `vimeo:${vimeo[1]}`;
  const yt = url.searchParams.get('v') ?? url.pathname.split('/').filter(Boolean).at(-1);
  return `youtube:${yt}`;
}

export function videoUrls(body = '') {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => VIDEO.test(l));
}

/** Vidéos de tous les articles, de la plus récente à la plus ancienne. */
export function articleVideos(articles: Article[], exclude: string[] = []) {
  const seen = new Set(exclude.map(videoKey));
  const out: { key: string; html: string; article: Article }[] = [];
  for (const article of articles) {
    for (const url of videoUrls(article.body)) {
      const key = videoKey(url);
      const html = embedFor(url);
      if (seen.has(key) || !html) continue;
      seen.add(key);
      out.push({ key, html, article });
    }
  }
  return out;
}
