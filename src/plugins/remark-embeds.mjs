/**
 * Transforme une URL seule sur sa ligne en intégration :
 *   - RideWithGPS (parcours / sorties)
 *   - Strava (activités, parcours)
 *   - Vimeo, YouTube
 *
 * Dans un article, il suffit donc de coller l'adresse de la carte ou de la
 * vidéo sur une ligne à part, sans aucun code.
 */
import { visit } from 'unist-util-visit';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function embedFor(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');
  const p = url.pathname;
  let m;

  // RideWithGPS : /embeds?type=route&id=…, /routes/123, /trips/123
  if (host === 'ridewithgps.com') {
    let type = url.searchParams.get('type');
    let id = url.searchParams.get('id');
    if ((m = p.match(/^\/(routes|trips)\/(\d+)/))) {
      type = m[1] === 'routes' ? 'route' : 'trip';
      id = m[2];
    }
    if (!type || !id) return null;
    const src = `https://ridewithgps.com/embeds?type=${type}&id=${id}&metricUnits=true&sampleGraph=true`;
    return `<div class="embed embed-map"><iframe src="${esc(src)}" title="Carte RideWithGPS" loading="lazy" allowfullscreen></iframe></div>`;
  }

  // Strava : /activities/123 ou /routes/123 (widget officiel)
  if (host === 'strava.com' && (m = p.match(/^\/(activities|routes)\/(\d+)/))) {
    const type = m[1] === 'activities' ? 'activity' : 'route';
    return (
      `<div class="embed embed-strava"><div class="strava-embed-placeholder" data-embed-type="${type}" data-embed-id="${m[2]}" data-style="standard"></div>` +
      `<script src="https://strava-embeds.com/embed.js" async></script>` +
      `<noscript><a href="${esc(url.href)}">Voir sur Strava</a></noscript></div>`
    );
  }

  // Vimeo : vimeo.com/123 ou player.vimeo.com/video/123
  if ((host === 'vimeo.com' && (m = p.match(/^\/(\d+)/))) || (host === 'player.vimeo.com' && (m = p.match(/^\/video\/(\d+)/)))) {
    const src = `https://player.vimeo.com/video/${m[1]}?dnt=1&color=6b7b5d&title=0&byline=0&portrait=0`;
    return `<div class="embed embed-video"><iframe src="${esc(src)}" title="Vidéo Vimeo" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
  }

  // YouTube
  let yt = null;
  if (host === 'youtu.be') yt = p.slice(1);
  if ((host === 'youtube.com' || host === 'm.youtube.com') && p === '/watch') yt = url.searchParams.get('v');
  if (host === 'youtube.com' && (m = p.match(/^\/(?:embed|shorts)\/([\w-]+)/))) yt = m[1];
  if (yt && /^[\w-]+$/.test(yt)) {
    return `<div class="embed embed-video"><iframe src="https://www.youtube-nocookie.com/embed/${yt}" title="Vidéo YouTube" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  return null;
}

export default function remarkEmbeds() {
  return (tree) => {
    visit(tree, 'paragraph', (node, index, parent) => {
      if (!parent || index == null) return;
      const kids = node.children.filter((c) => !(c.type === 'text' && !c.value.trim()));
      if (kids.length !== 1) return;
      const only = kids[0];
      let href = null;
      if (only.type === 'link' && only.children.length === 1 && only.children[0].type === 'text' && only.children[0].value.trim() === only.url) href = only.url;
      else if (only.type === 'text' && /^https?:\/\/\S+$/.test(only.value.trim())) href = only.value.trim();
      if (!href) return;
      const html = embedFor(href);
      if (html) parent.children[index] = { type: 'html', value: html };
    });
  };
}
