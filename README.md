# PCR Gravier — site statique

Reconstruction de pcrgravier.cc (ancien WordPress) avec [Astro](https://astro.build).
Le site est une collection de fichiers HTML : aucun serveur PHP, aucune base de données.

## Commandes

```bash
npm install        # une seule fois
npm run dev        # aperçu en direct sur http://localhost:4321
npm run build      # génère le site dans dist/
npm run preview    # sert dist/ pour vérifier avant mise en ligne
```

## Écrire un article

Créer un fichier `src/content/articles/<adresse-de-l-article>.md` :

```markdown
---
title: "Titre de l'article"
date: 2026-11-17
author: "Julien Sommier"
categories: ["Aventure"]
cover: "../../assets/uploads/2026/11/photo-de-couverture.jpg"
---

Du texte en Markdown…

![](../../assets/uploads/2026/11/photo-1.jpg)

![](../../assets/uploads/2026/11/photo-2.jpg)
![](../../assets/uploads/2026/11/photo-3.jpg)
![](../../assets/uploads/2026/11/photo-4.jpg)

https://ridewithgps.com/routes/12345678
```

- **Une photo seule** dans son paragraphe s'affiche en grand.
- **Plusieurs photos à la suite** forment automatiquement une galerie.
- **Une adresse seule sur sa ligne** devient une intégration : RideWithGPS
  (parcours ou sortie), Strava (activité ou parcours), Vimeo ou YouTube.
- Les photos peuvent être envoyées en pleine résolution : elles sont
  redimensionnées et converties en WebP au moment du build.
- `draft: true` dans l'en-tête masque l'article en production.

Dans l'en-tête d'un article, `author` et `categories` contiennent
l'identifiant d'un fichier de `src/content/authors` ou `src/content/categories`
(par exemple `author: julien`, `categories: [aventure]`). Dans le CMS, ce sont
des listes déroulantes.

## Ce qui se gère depuis le CMS

| Rubrique | Fichiers | Rôle |
| --- | --- | --- |
| Articles | `src/content/articles/` | Récits, avec auteur, catégories et brouillon |
| Pages | `src/content/pages/` | Pages libres à la racine (`/a-propos/`). « Dans le menu » + position pour les afficher dans le menu |
| Catégories | `src/content/categories/` | Nom, ordre, photo et présentation de la page catégorie |
| Auteurs | `src/content/authors/` | Nom, photo, Instagram et présentation de la page auteur |
| Réglages du site | `src/content/settings/site.json` | Nom, slogan, citation et photo d'accueil, e-mail, réseaux, pied de page |

Le menu se construit tout seul : « Accueil », les pages cochées « Dans le
menu » (triées par position), puis « Contact ». Une page ne peut pas avoir la
même adresse qu'un article ou qu'une rubrique du site (`category`, `author`,
`contact`, `recherche`…) : la construction s'arrête avec un message clair.

## Fiche de sortie, carte et articles liés

- **Fiche de sortie** (en tête d'article) : distance, dénivelé, part de piste,
  durée et lieu de départ. Elle est remplie automatiquement à partir des cartes
  RideWithGPS collées dans l'article (parcours ou sorties publics) ; les champs
  `ride:` de l'en-tête (« Fiche de sortie » dans le CMS) l'emportent.
- Les traces sont téléchargées une seule fois et gardées dans
  `src/data/traces/` (à committer, pour ne pas dépendre de RideWithGPS à chaque
  build). Si RideWithGPS ne répond pas, l'article s'affiche sans fiche.
- **Carte** (`/carte/`) : tracé et point de départ de chaque sortie qui a une
  trace ou des coordonnées (`ride.lat` / `ride.lng`). Carte vectorielle
  MapLibre sur fond OpenFreeMap, avec ombrage du relief et courbes de niveau
  calculés à partir des altitudes publiques AWS Terrain Tiles : gratuit, sans
  compte ni clé. Une couleur par catégorie. MapLibre (~270 Ko compressés) n'est
  téléchargé qu'à l'approche de la carte.
- **À lire aussi** : les trois articles les plus proches géographiquement, puis
  de la même catégorie.
- **Galeries** : rangées de même hauteur sans recadrage ; le texte alternatif
  d'une photo (`![légende](photo.jpg)`) devient sa légende. La visionneuse se
  manie aux flèches, au clavier ou en glissant du doigt.

⚠︎ Astro garde en cache le rendu des articles (`.astro/`, `node_modules/.astro`).
Après une modification des plugins de `src/plugins/`, supprimer ces dossiers
pour voir le résultat en local.

## Recherche

`npm run build` lance [Pagefind](https://pagefind.app) après Astro : il
fabrique un index de recherche statique dans `dist/pagefind/`, utilisé par la
page `/recherche/` (aucun serveur ni service extérieur). Avec `npm run dev`,
l'index n'existe pas : tester la recherche avec `npm run build && npm run preview`.

## Import depuis WordPress

`scripts/import-wordpress.mjs` convertit le contenu récupéré
(`../recuperation/contenu`) et copie les images utilisées dans
`src/assets/uploads`. Les images introuvables sont listées dans
`images-manquantes.txt` et laissées en commentaire dans les articles.

Quand la sauvegarde complète arrivera, relancer l'import en ajoutant son
dossier `uploads` :

```bash
node scripts/import-wordpress.mjs --uploads ../recuperation/uploads --uploads ../sauvegarde/wp-content/uploads
```

⚠︎ Le script réécrit tout `src/content` : à n'utiliser que pendant la
migration, pas après des retouches manuelles des articles.

## Formulaire de contact

La page `/contact/` utilise [Web3Forms](https://web3forms.com) (gratuit, sans
serveur). Créer une clé avec l'adresse du collectif puis la placer dans un
fichier `.env` :

```
PUBLIC_WEB3FORMS_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Sans clé, la page affiche simplement l'adresse e-mail.

## URLs

Les adresses de l'ancien site sont conservées : `/parpaillon/`,
`/category/aventure/`, `/author/julien/`, `/page/2/`… Le flux RSS est
désormais `/rss.xml` (l'ancien `/feed/` est à rediriger chez l'hébergeur).
