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

Catégories existantes : Aventure, Escapade, Gear, Hack, Photo Dump.

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
