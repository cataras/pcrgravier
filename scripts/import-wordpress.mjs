#!/usr/bin/env node
/**
 * Import du contenu WordPress récupéré vers les collections Astro.
 *
 * Source : ../recuperation/contenu/*.md (+ dossiers d'images uploads)
 * Sortie : src/content/articles, src/content/pages, src/assets/uploads
 *
 * Usage :
 *   node scripts/import-wordpress.mjs [--uploads <dossier> ...]
 *
 * Plusieurs dossiers --uploads peuvent être passés (par ex. la sauvegarde
 * complète de wp-content/uploads quand elle arrivera) : le script cherche
 * chaque image dans tous ces dossiers. Il est rejouable tant que le contenu
 * n'a pas été retouché à la main — il écrase les fichiers générés.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(SITE, '..');
const SRC_CONTENT = path.join(ROOT, 'recuperation/contenu');

const args = process.argv.slice(2);
const uploadRoots = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--uploads' && args[i + 1]) uploadRoots.push(path.resolve(args[++i]));
}
if (!uploadRoots.length) uploadRoots.push(path.join(ROOT, 'recuperation/uploads'));

const OUT_ARTICLES = path.join(SITE, 'src/content/articles');
const OUT_PAGES = path.join(SITE, 'src/content/pages');
const OUT_IMAGES = path.join(SITE, 'src/assets/uploads');

// Pages WordPress sans intérêt à ne pas importer
const SKIP = new Set(['page-d-exemple']);

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif)$/i;

// ---------------------------------------------------------------- images

const safeDecode = (s) => {
  try { return decodeURIComponent(s); } catch { return s; }
};
/** Nom de fichier ASCII propre (accents retirés, %XX décodés). */
const cleanName = (p) =>
  safeDecode(p)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9/._-]+/g, '-');

/** Clé « de base » d'une image WordPress : sans -1024x683, -scaled, -e1234… */
const baseKey = (p) =>
  cleanName(p)
    .toLowerCase()
    .replace(/-(?:\d+x\d+|scaled|rotated|e\d{10,})(?=[.-])/g, '')
    .replace(/\.jpeg$/, '.jpg');

const exact = new Map(); // chemin relatif nettoyé -> fichier absolu
const byBase = new Map(); // baseKey -> [fichiers absolus]
for (const root of uploadRoots) {
  if (!fs.existsSync(root)) {
    console.warn(`⚠︎ dossier introuvable : ${root}`);
    continue;
  }
  for (const rel of fs.readdirSync(root, { recursive: true })) {
    if (!IMAGE_EXT.test(rel)) continue;
    const abs = path.join(root, rel);
    const key = cleanName(rel.split(path.sep).join('/'));
    if (!exact.has(key)) exact.set(key, abs);
    const b = baseKey(key);
    if (!byBase.has(b)) byBase.set(b, []);
    byBase.get(b).push(abs);
  }
}

/**
 * Un fichier est-il complet ? La Wayback Machine ne conserve que le premier
 * mégaoctet de certaines images : ces JPEG font exactement 1 048 576 octets
 * et n'ont pas de marqueur de fin (FF D9). Ils s'affichent avec le bas gris.
 */
const TRUNCATED_SIZE = 1024 * 1024;
const completeCache = new Map();
function isComplete(abs) {
  if (completeCache.has(abs)) return completeCache.get(abs);
  const size = fs.statSync(abs).size;
  let ok = size !== TRUNCATED_SIZE;
  if (ok && /\.jpe?g$/i.test(abs) && size > 2) {
    const fd = fs.openSync(abs, 'r');
    const end = Buffer.alloc(2);
    fs.readSync(fd, end, 0, 2, size - 2);
    fs.closeSync(fd);
    ok = end[0] === 0xff && end[1] === 0xd9;
  }
  completeCache.set(abs, ok);
  return ok;
}

const largest = (files) => files.reduce((a, b) => (fs.statSync(b).size > fs.statSync(a).size ? b : a));

/**
 * Trouve le meilleur fichier disponible pour un chemin d'upload WordPress :
 * la plus grande variante complète, sinon (faute de mieux) une variante tronquée.
 */
function resolveImage(rel) {
  rel = rel.replace(/^\/+/, '').replace(/^(?:pcr-wordpress\/)?wp-content\/uploads\//, '');
  const key = cleanName(rel);
  const candidates = byBase.get(baseKey(key)) ?? (exact.has(key) ? [exact.get(key)] : []);
  if (!candidates.length) return null;
  const complete = candidates.filter(isComplete);
  if (complete.length) return largest(complete);
  const abs = largest(candidates);
  report.truncated.push(`${rel}\t(fichier tronqué : ${path.relative(ROOT, abs)})`);
  return abs;
}

const copied = new Map(); // abs source -> chemin relatif dans src/assets/uploads
function importImage(abs) {
  if (copied.has(abs)) return copied.get(abs);
  const root = uploadRoots.find((r) => abs.startsWith(r + path.sep));
  const rel = cleanName(path.relative(root, abs).split(path.sep).join('/'));
  const dest = path.join(OUT_IMAGES, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  jobs.push(() => saveImage(abs, dest));
  copied.set(abs, rel);
  return rel;
}

// Les originaux (jusqu'à 6000 px) restent dans recuperation/ ; le site garde
// une version de 2400 px maximum, largement suffisante à l'écran.
const MAX_SIZE = 2400;
const jobs = [];
async function saveImage(src, dest) {
  const img = sharp(src, { failOn: 'none' }).rotate(); // applique l'orientation EXIF
  const { width = 0, height = 0, format } = await img.metadata();
  if (Math.max(width, height) <= MAX_SIZE || !['jpeg', 'webp'].includes(format)) {
    fs.copyFileSync(src, dest);
    return;
  }
  try {
    await img
      .resize({ width: MAX_SIZE, height: MAX_SIZE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true })
      .toFile(dest);
  } catch (err) {
    // fichier tronqué / abîmé dans l'archive : on le garde tel quel et on le signale
    report.corrupt.push(`${path.relative(ROOT, src)}\t${err.message.split('\n')[0]}`);
    fs.copyFileSync(src, dest);
  }
}
async function runJobs(concurrency = 6) {
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length) await queue.shift()();
    })
  );
}

// ---------------------------------------------------------------- markdown

function parseFrontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  const data = {};
  if (!m) return { data, body: src };
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w_]+):\s*(.*)$/);
    if (!kv) continue;
    let [, k, v] = kv;
    v = v.trim();
    if (v.startsWith('[') && v.endsWith(']')) {
      data[k] = v.slice(1, -1).split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
    } else {
      data[k] = v.replace(/^"(.*)"$/, '$1');
    }
  }
  return { data, body: src.slice(m[0].length) };
}

const yamlStr = (s) => JSON.stringify(s ?? '');

const report = { missing: [], corrupt: [], truncated: [], embeds: 0 };

function convertBody(body, slug, depth) {
  const prefix = '../'.repeat(depth) + 'assets/uploads/';
  let firstImage = null;

  const imageMd = (alt, src) => {
    const abs = resolveImage(src);
    if (!abs) {
      report.missing.push(`${src.replace(/^.*wp-content\/uploads\//, '')}\t${slug}`);
      return `<!-- image manquante : ${src.replace(/^.*wp-content\/uploads\//, '')} -->`;
    }
    const rel = importImage(abs);
    firstImage ??= rel;
    const target = prefix + rel;
    return `![${alt}](${/[\s()]/.test(target) ? `<${target}>` : target})`;
  };

  let out = body
    // Titre H1 répété en tête de contenu : affiché par la mise en page
    .replace(/^\s*# .*\n+/, '')
    // Intégrations (iframes) → URL seule sur sa ligne, transformée en carte/vidéo au rendu
    .replace(/\[Intégration : [^\]]*\]\((\S+?)\)/g, (_, url) => {
      report.embeds++;
      return `\n${url.replace(/;sampleGraph=true/g, '')}\n`;
    })
    // Image cliquable (lien vers page d'attachement ou vers l'image) → image simple
    .replace(/\[!\[([^\]]*)\]\(([^)\s]+)\)\]\((\/[^)\s]*)\)/g, (_, alt, src) =>
      src.includes('/wp-content/uploads/') ? `\n${imageMd(alt, src)}\n` : _
    )
    // Images restantes hébergées sur le site
    .replace(/!\[([^\]]*)\]\((\/[^)\s]*wp-content\/uploads\/[^)\s]+)\)/g, (_, alt, src) => imageMd(alt, src))
    // Liens internes absolus vers l'ancien domaine → relatifs
    .replace(/\]\(https?:\/\/(?:www\.)?pcrgravier\.cc(\/[^)]*)\)/g, ']($1)');

  // Une image qui était seule dans un lien sur sa propre ligne laisse des lignes vides en trop
  out = out.replace(/\n{3,}/g, '\n\n').trim() + '\n';
  return { body: out, firstImage };
}

// ---------------------------------------------------------------- import

for (const dir of [OUT_ARTICLES, OUT_PAGES, OUT_IMAGES]) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

const AUTHOR_IDS = { 'Julien Sommier': 'julien', 'Sims Teuteul': 'sims' };
const slugify = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const files = fs.readdirSync(SRC_CONTENT).filter((f) => f.endsWith('.md'));
let nArticles = 0;
let nPages = 0;

for (const file of files) {
  const { data, body } = parseFrontmatter(fs.readFileSync(path.join(SRC_CONTENT, file), 'utf8'));
  const slug = (data.url_origine?.match(/pcrgravier\.cc\/([^/]+)\/?$/)?.[1]) ?? file.replace(/\.md$/, '');
  if (SKIP.has(slug)) continue;
  const isPage = data.type === 'page';

  const { body: content, firstImage } = convertBody(body, slug, 2);

  let cover = null;
  if (data.image_a_la_une) {
    const abs = resolveImage(data.image_a_la_une);
    if (abs) cover = importImage(abs);
    else report.missing.push(`${data.image_a_la_une}\t${slug} (image à la une)`);
  }
  cover ??= firstImage;

  const fm = ['---', `title: ${yamlStr(data.titre)}`];
  if (!isPage) {
    fm.push(`date: ${data.date || '2018-01-01'}`);
    // auteurs et catégories : identifiants des fichiers de src/content/authors et src/content/categories
    if (data.auteur) fm.push(`author: ${AUTHOR_IDS[data.auteur] ?? slugify(data.auteur)}`);
    fm.push(`categories: [${(data.categories ?? []).map(slugify).join(', ')}]`);
  }
  const menuOrder = { videos: 1, 'a-propos': 2 }[slug];
  if (isPage && menuOrder) fm.push('menu: true', `menuOrder: ${menuOrder}`);
  if (cover) fm.push(`cover: ${yamlStr('../../assets/uploads/' + cover)}`);
  fm.push('---', '');

  const outDir = isPage ? OUT_PAGES : OUT_ARTICLES;
  fs.writeFileSync(path.join(outDir, `${slug}.md`), fm.join('\n') + '\n' + content);
  isPage ? nPages++ : nArticles++;
}

await runJobs();

const missingFile = path.join(SITE, 'images-manquantes.txt');
fs.writeFileSync(missingFile, [...new Set(report.missing)].sort().join('\n') + '\n');

console.log(`✓ ${nArticles} articles, ${nPages} pages`);
console.log(`✓ ${copied.size} images copiées dans src/assets/uploads`);
console.log(`✓ ${report.embeds} intégrations (cartes, vidéos)`);
console.log(`⚠︎ ${new Set(report.missing).size} images manquantes → ${path.relative(ROOT, missingFile)}`);
const damaged = [...new Set([...report.truncated, ...report.corrupt])].sort();
const corruptFile = path.join(SITE, 'images-abimees.txt');
fs.writeFileSync(corruptFile, damaged.join('\n') + (damaged.length ? '\n' : ''));
console.log(`⚠︎ ${new Set(report.truncated).size} images utilisées sont tronquées (aucune version complète trouvée) → ${path.relative(ROOT, corruptFile)}`);
