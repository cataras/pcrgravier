#!/usr/bin/env node
/**
 * Remet en place les photos retrouvées par les auteurs.
 *
 *   node scripts/reinject-photos.mjs <dossier> [<dossier>…] [--dry-run]
 *
 * Les photos peuvent être rangées n'importe comment dans les dossiers (sous-dossiers
 * compris) et porter leur nom d'origine : le script les reconnaît d'après le nom
 * du fichier, sans tenir compte des majuscules, de l'extension, ni des suffixes
 * ajoutés par WordPress (« -1024x683 », « -scaled »). Il :
 *
 *   1. remplace chaque « <!-- image manquante : … --> » des articles et des pages
 *      par la photo correspondante ;
 *   2. ajoute la photo de couverture aux articles qui l'avaient perdue ;
 *   3. remplace les photos abîmées (tronquées) listées dans images-abimees.txt.
 *
 * Les photos sont réduites à 2400 px maximum (largement assez pour le site, qui
 * fabrique ensuite ses propres tailles) et redressées selon leur orientation.
 * Les listes images-manquantes.txt et images-abimees.txt sont mises à jour.
 *
 * Avec --dry-run, rien n'est modifié : le script dit seulement ce qu'il ferait.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SITE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const UPLOADS = path.join(SITE, 'src/assets/uploads');
const CONTENT_DIRS = ['src/content/articles', 'src/content/pages'].map((d) => path.join(SITE, d));
const MISSING_LIST = path.join(SITE, 'images-manquantes.txt');
const DAMAGED_LIST = path.join(SITE, 'images-abimees.txt');
const MAX_SIZE = 2400;
const IMAGE_EXT = /\.(jpe?g|png|webp|tiff?|heic)$/i;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const folders = args.filter((a) => !a.startsWith('--'));
if (!folders.length) {
  console.error('Usage : node scripts/reinject-photos.mjs <dossier des photos> [--dry-run]');
  process.exit(1);
}

/** Clé de comparaison d'un nom de fichier. */
const keyOf = (file) =>
  path
    .basename(file)
    .normalize('NFC')
    .toLowerCase()
    .replace(IMAGE_EXT, '')
    .replace(/-scaled$/, '')
    .replace(/-\d{2,5}x\d{2,5}$/, '')
    .replace(/-scaled$/, '');

// ---------------------------------------------------------------- photos fournies
const provided = new Map(); // clé → chemin (la plus grande si plusieurs)
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (IMAGE_EXT.test(e.name) && !e.name.startsWith('.')) {
      const k = keyOf(e.name);
      const prev = provided.get(k);
      if (!prev || fs.statSync(p).size > fs.statSync(prev).size) provided.set(k, p);
    }
  }
};
for (const f of folders) {
  if (!fs.existsSync(f)) {
    console.error(`Dossier introuvable : ${f}`);
    process.exit(1);
  }
  walk(path.resolve(f));
}
console.log(`${provided.size} photos fournies.`);

const used = new Set();

/**
 * Copie (réduite) la photo fournie à l'emplacement attendu par le site.
 * Renvoie le chemin relatif à src/assets/uploads (l'extension peut changer).
 */
const jobs = [];
function place(wpPath, source) {
  const ext = path.extname(source).toLowerCase().replace('.jpeg', '.jpg');
  const outExt = ['.png', '.webp'].includes(ext) ? ext : '.jpg';
  // même dossier que sur WordPress, sans le suffixe de taille (« -819x1024 ») : c'est l'original
  const rel = wpPath.replace(IMAGE_EXT, '').replace(/-\d{2,5}x\d{2,5}$/, '') + outExt;
  const dest = path.join(UPLOADS, rel);
  used.add(source);
  if (!dryRun) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    let img = sharp(source).rotate().resize({ width: MAX_SIZE, height: MAX_SIZE, fit: 'inside', withoutEnlargement: true });
    img = outExt === '.png' ? img.png() : outExt === '.webp' ? img.webp({ quality: 88 }) : img.jpeg({ quality: 88, mozjpeg: true });
    jobs.push(img.toFile(dest));
  }
  return rel;
}

// ---------------------------------------------------------------- 1. images manquantes dans le texte
const MARKER = /(\*\*)?<!-- image manquante : ([^>]+?) -->(\*\*)?/g;
const resolvedMissing = new Set(); // « chemin\tslug »
let inText = 0;
for (const dir of CONTENT_DIRS) {
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const full = path.join(dir, file);
    const slug = file.replace(/\.md$/, '');
    const before = fs.readFileSync(full, 'utf8');
    const after = before.replace(MARKER, (m, _b1, wpPath, _b2) => {
      const src = provided.get(keyOf(wpPath));
      if (!src) return m;
      const rel = place(wpPath.trim(), src);
      inText++;
      resolvedMissing.add(`${wpPath.trim()}\t${slug}`);
      console.log(`  ${slug} : ${wpPath.trim()} ← ${path.basename(src)}`);
      // les ** autour d'une photo l'empêcheraient d'entrer dans une galerie
      return `![](../../assets/uploads/${rel})`;
    });
    if (after !== before && !dryRun) fs.writeFileSync(full, after);
  }
}

// ---------------------------------------------------------------- 2. photos de couverture perdues
let covers = 0;
const missingLines = fs.existsSync(MISSING_LIST) ? fs.readFileSync(MISSING_LIST, 'utf8').split('\n').filter(Boolean) : [];
for (const line of missingLines) {
  const m = line.match(/^(.+?)\t(\S+) \(image à la une\)$/);
  if (!m) continue;
  const [, wpPath, slug] = m;
  const src = provided.get(keyOf(wpPath));
  const full = CONTENT_DIRS.map((d) => path.join(d, `${slug}.md`)).find((f) => fs.existsSync(f));
  if (!src || !full) continue;
  const text = fs.readFileSync(full, 'utf8');
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) continue;
  resolvedMissing.add(`${wpPath}\t${slug} (image à la une)`);
  if (/^cover:/m.test(fm[1])) continue; // déjà une couverture (première photo de l'article)
  const rel = place(wpPath, src);
  covers++;
  console.log(`  ${slug} : couverture ${wpPath} ← ${path.basename(src)}`);
  // ajoute « cover: » à la fin de l'en-tête de l'article
  if (!dryRun) fs.writeFileSync(full, text.replace(/^(---\n[\s\S]*?)\n---/, (_, head) => `${head}\ncover: "../../assets/uploads/${rel}"\n---`));
}

// ---------------------------------------------------------------- 3. photos abîmées
let repaired = 0;
const damagedLines = fs.existsSync(DAMAGED_LIST) ? fs.readFileSync(DAMAGED_LIST, 'utf8').split('\n').filter(Boolean) : [];
const keptDamaged = [];
for (const line of damagedLines) {
  const wpPath = line.split('\t')[0];
  const src = provided.get(keyOf(wpPath));
  const current = path.join(UPLOADS, wpPath);
  if (!src || !fs.existsSync(current)) {
    keptDamaged.push(line);
    continue;
  }
  // même chemin et même extension que la photo abîmée, pour ne rien changer dans les articles
  used.add(src);
  repaired++;
  console.log(`  réparée : ${wpPath} ← ${path.basename(src)}`);
  if (!dryRun) {
    const ext = path.extname(current).toLowerCase();
    let img = sharp(src).rotate().resize({ width: MAX_SIZE, height: MAX_SIZE, fit: 'inside', withoutEnlargement: true });
    img = ext === '.png' ? img.png() : ext === '.webp' ? img.webp({ quality: 88 }) : img.jpeg({ quality: 88, mozjpeg: true });
    jobs.push(img.toBuffer().then((buf) => fs.writeFileSync(current, buf)));
  }
}

await Promise.all(jobs);

// ---------------------------------------------------------------- listes et bilan
if (!dryRun) {
  fs.writeFileSync(MISSING_LIST, missingLines.filter((l) => !resolvedMissing.has(l)).join('\n') + '\n');
  fs.writeFileSync(DAMAGED_LIST, keptDamaged.join('\n') + (keptDamaged.length ? '\n' : ''));
}
const unused = [...provided.values()].filter((p) => !used.has(p));
console.log(`\n✓ ${inText} photos remises dans les articles`);
console.log(`✓ ${covers} photos de couverture ajoutées`);
console.log(`✓ ${repaired} photos abîmées remplacées`);
if (unused.length) {
  console.log(`⚠︎ ${unused.length} photos fournies sans correspondance (noms différents ?) :`);
  for (const u of unused.slice(0, 30)) console.log(`   ${path.relative(process.cwd(), u)}`);
  if (unused.length > 30) console.log(`   … et ${unused.length - 30} autres`);
}
if (dryRun) console.log('\n(--dry-run : aucun fichier modifié)');
else console.log('\nVérifier le résultat avec « npm run dev », puis committer.');
