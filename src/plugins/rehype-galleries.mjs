/**
 * Mise en forme automatique des photos d'un article :
 *   - une image seule dans son paragraphe → grande photo (figure.photo)
 *   - plusieurs images consécutives (même paragraphe ou paragraphes qui se
 *     suivent) → galerie en grille (div.gallery)
 *
 * Les rédacteurs n'ont donc qu'à insérer leurs photos les unes après les
 * autres : la galerie se construit toute seule.
 */

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

function transform(parent) {
  const out = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    if (run.length === 1) {
      out.push({ type: 'element', tagName: 'figure', properties: { className: ['photo'] }, children: run });
    } else {
      out.push({
        type: 'element',
        tagName: 'div',
        properties: { className: ['gallery'], dataCount: String(run.length) },
        children: run.map((img) => ({ type: 'element', tagName: 'figure', properties: {}, children: [img] })),
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

export default function rehypeGalleries() {
  return (tree) => transform(tree);
}
