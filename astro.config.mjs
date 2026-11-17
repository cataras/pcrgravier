// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import remarkEmbeds from './src/plugins/remark-embeds.mjs';
import rehypeGalleries from './src/plugins/rehype-galleries.mjs';

export default defineConfig({
  site: 'https://pcrgravier.cc',
  // Mêmes URLs que l'ancien WordPress : /parpaillon/, /category/aventure/, /page/2/…
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap()],
  image: {
    // Génère des versions WebP à plusieurs tailles (srcset) pour toutes les images
    layout: 'constrained',
    // tailles générées : inutile d'aller au-delà de 2200 px de large
    breakpoints: [640, 1080, 1600, 2200],
    responsiveStyles: true,
  },
  markdown: {
    remarkPlugins: [remarkEmbeds],
    rehypePlugins: [rehypeGalleries],
  },
});
