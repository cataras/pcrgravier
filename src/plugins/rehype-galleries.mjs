/**
 * Mise en forme automatique des photos d'un article :
 *   - une image seule dans son paragraphe → grande photo (figure.photo)
 *   - plusieurs images consécutives (même paragraphe ou paragraphes qui se
 *     suivent) → galerie en grille (div.gallery)
 *
 * Les rédacteurs n'ont donc qu'à insérer leurs photos les unes après les
 * autres : la galerie se construit toute seule.
 *
 * Dans une galerie, chaque photo reçoit son format (largeur / hauteur, lu
 * dans le fichier) : les photos sont rangées en rangées de même hauteur,
 * sans recadrage, quel que soit leur sens (portrait ou paysage).
 * Le texte alternatif d'une photo (![légende](photo.jpg)) devient sa légende.
 */
import path from 'node:path';
import sharp from 'sharp';

const isBlank = (n) => n.type === 'text' && !n.value.trim();
const isImg = (n) => n.type === 'element' && n.tagName === 'img';
const isBr = (n) => n.type === 'element' && n.tagName === 'br';

/** Renvoie les <img> d'un paragraphe qui ne contient que des images, sinon null. */
function imagesOnly(node) {
  if (node.type !== 'element' || node.tagName !== 'p') return null;
  const imgs = [];
  for (const c of node.children) {
    if (isImg(c)) imgs.push(c);
    else if (!isBlank(c) && !isBr(c)) return null;
  }
  return imgs.length ? imgs : null;
}

/** Ajoute une légende sous la photo si elle a un texte alternatif. */
function figure(img, className) {
  const alt = String(img.properties?.alt ?? '').trim();
  const children = [img];
  if (alt) children.push({ type: 'element', tagName: 'figcaption', properties: {}, children: [{ type: 'text', value: alt }] });
  return { type: 'element', tagName: 'figure', properties: className ? { className } : {}, children };
}

function transform(parent) {
  const out = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    if (run.length === 1) {
      out.push(figure(run[0], ['photo']));
    } else {
      out.push({
        type: 'element',
        tagName: 'div',
        properties: { className: ['gallery'], dataCount: String(run.length) },
        children: run.map((img) => figure(img)),
      });
    }
    run = [];
  };

  for (const child of parent.children) {
    const imgs = imagesOnly(child);
    if (imgs) run.push(...imgs);
    else if (isBlank(child) || child.type === 'comment') {
      // les sauts de ligne et commentaires (images manquantes) ne cassent pas une galerie
      if (!run.length) out.push(child);
    } else {
      flush();
      out.push(child);
    }
  }
  flush();
  parent.children = out;
}

const ratios = new Map();
async function ratioOf(file) {
  if (!ratios.has(file)) {
    ratios.set(
      file,
      sharp(file)
        .metadata()
        .then(({ width, height, orientation }) => {
          if (!width || !height) return null;
          // photos tournées par l'appareil (EXIF) : largeur et hauteur inversées
          return orientation >= 5 ? height / width : width / height;
        })
        .catch(() => null),
    );
  }
  return ratios.get(file);
}

/** Donne à chaque photo de galerie son format (--r) pour la mise en rangées. */
async function addRatios(tree, base) {
  const jobs = [];
  const walk = (node) => {
    if (node.type === 'element' && node.tagName === 'div' && node.properties?.className?.includes('gallery')) {
      for (const fig of node.children) {
        const img = fig.children?.[0];
        const src = String(img?.properties?.src ?? '');
        if (!src || /^(https?:)?\/\//.test(src) || !base) continue;
        jobs.push(
          ratioOf(path.resolve(base, decodeURIComponent(src))).then((r) => {
            if (r) fig.properties.style = `--r:${r.toFixed(4)}`;
          }),
        );
      }
    }
    node.children?.forEach(walk);
  };
  walk(tree);
  await Promise.all(jobs);
}

export default function rehypeGalleries() {
  return async (tree, file) => {
    transform(tree);
    const source = file.path ?? file.history?.[0];
    await addRatios(tree, source ? path.dirname(source) : null);
  };
}
