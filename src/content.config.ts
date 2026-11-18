import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Le CMS écrit une chaîne vide ('') quand un champ facultatif est laissé vide :
 * on la traite comme « pas de valeur ».
 */
const blank = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), schema.optional());

/** Réglages généraux, modifiables depuis le CMS (src/content/settings/site.json) */
const settings = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/settings' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      tagline: z.string(),
      description: z.string(),
      quote: z.string(),
      hero: image(),
      heroAlt: z.string().default(''),
      email: z.email(),
      instagram: blank(z.url()),
      facebook: blank(z.url()),
      footer: z.string().default(''),
    }),
});

/** Auteurs : le nom du fichier sert d'adresse (/author/julien/) */
const authors = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/authors' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      photo: blank(image()),
      instagram: blank(z.url()),
    }),
});

/** Catégories : le nom du fichier sert d'adresse (/category/aventure/) */
const categories = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/categories' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      order: z.number().default(99),
      cover: blank(image()),
    }),
});

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      /** Résumé pour les moteurs de recherche et les partages (sinon : début du texte) */
      description: blank(z.string()),
      date: z.coerce.date(),
      author: blank(reference('authors')),
      categories: z.array(reference('categories')).default([]),
      cover: blank(image()),
      draft: z.boolean().default(false),
      /**
       * Fiche de sortie. Remplie automatiquement depuis les traces RideWithGPS
       * de l'article (voir src/lib/rides.ts) ; ce qui est saisi ici l'emporte.
       */
      ride: blank(
        z.object({
          distance: blank(z.coerce.number()),
          elevation: blank(z.coerce.number()),
          unpaved: blank(z.coerce.number().min(0).max(100)),
          days: blank(z.coerce.number().int().positive()),
          place: blank(z.string()),
          region: blank(z.string()),
          lat: blank(z.coerce.number().min(-90).max(90)),
          lng: blank(z.coerce.number().min(-180).max(180)),
        }),
      ),
    }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: blank(z.string()),
      cover: blank(image()),
      /** Afficher la page dans le menu principal */
      menu: z.boolean().default(false),
      /** Texte du lien dans le menu (par défaut : le titre) */
      menuLabel: blank(z.string()),
      menuOrder: z.number().default(50),
      /** Ajoute sous le texte les vidéos (Vimeo, YouTube) de tous les articles */
      videos: z.boolean().default(false),
      draft: z.boolean().default(false),
    }),
});

export const collections = { settings, authors, categories, articles, pages };
