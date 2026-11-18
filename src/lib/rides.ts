/**
 * Fiche de sortie d'un article : distance, dénivelé, part de piste, lieu et tracé.
 *
 * Les chiffres viennent automatiquement des traces RideWithGPS collées dans
 * l'article (parcours ou sortie publics). Chaque trace est téléchargée une
 * seule fois puis gardée dans src/data/traces/ (à committer). Les champs
 * remplis à la main dans la « Fiche de sortie » du CMS sont prioritaires.
 *
 * Si RideWithGPS ne répond pas, l'article s'affiche simplement sans fiche.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Article } from './site';

const CACHE_DIR = path.resolve('src/data/traces');

export interface Trace {
  url: string;
  name: string;
  distance: number; // km
  elevation: number; // m D+
  unpaved?: number; // %
  place?: string;
  region?: string;
  country?: string;
  /** Nombre de jours (sorties enregistrées seulement) */
  days?: number;
  lat: number;
  lng: number;
  /** Tracé simplifié : [lat, lng][] */
  track: [number, number][];
}

export interface Ride {
  distance?: number;
  elevation?: number;
  unpaved?: number;
  place?: string;
  region?: string;
  days?: number;
  lat?: number;
  lng?: number;
  /** Liens vers les traces d'origine */
  links: string[];
  tracks: [number, number][][];
}

/** Adresses RideWithGPS présentes dans le texte d'un article. */
export function rideWithGpsRefs(body = '') {
  const refs: { type: 'route' | 'trip'; id: string }[] = [];
  for (const line of body.split('\n')) {
    const raw = line.trim();
    if (!/^https?:\/\/(www\.)?ridewithgps\.com\//.test(raw)) continue;
    const url = new URL(raw);
    let type = url.searchParams.get('type');
    let id = url.searchParams.get('id');
    const m = url.pathname.match(/^\/(routes|trips)\/(\d+)/);
    if (m) [type, id] = [m[1] === 'routes' ? 'route' : 'trip', m[2]];
    if ((type === 'route' || type === 'trip') && id && /^\d+$/.test(id)) refs.push({ type, id });
  }
  return refs;
}

/** Simplification de Douglas-Peucker (tolérance en degrés, ~30 m par défaut). */
export function simplify(points: [number, number][], tolerance = 0.0003): [number, number][] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * points[i][0] - dx * points[i][1] + bx * ay - by * ax) / len;
      if (d > max) [max, idx] = [d, i];
    }
    if (max > tolerance && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const round = (n: number, d = 5) => Math.round(n * 10 ** d) / 10 ** d;

const pending = new Map<string, Promise<Trace | undefined>>();

/** Trace RideWithGPS, depuis le cache local ou téléchargée puis mise en cache. */
export function getTrace(type: 'route' | 'trip', id: string): Promise<Trace | undefined> {
  const key = `${type}-${id}`;
  if (!pending.has(key)) pending.set(key, loadTrace(type, id, key));
  return pending.get(key)!;
}

async function loadTrace(type: 'route' | 'trip', id: string, key: string): Promise<Trace | undefined> {
  const file = path.join(CACHE_DIR, `${key}.json`);
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {}

  const page = `https://ridewithgps.com/${type}s/${id}`;
  try {
    const res = await fetch(`${page}.json`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const r = json.route ?? json.trip ?? json;
    const raw = (r.track_points ?? [])
      .filter((p: any) => typeof p.y === 'number' && typeof p.x === 'number')
      .map((p: any) => [p.y, p.x] as [number, number]);
    // jours distincts d'après l'horodatage des points (sorties enregistrées)
    const dates = new Set(
      (r.track_points ?? []).filter((p: any) => p.t).map((p: any) => new Date(p.t * 1000).toISOString().slice(0, 10)),
    );
    const trace: Trace = {
      url: page,
      name: r.name ?? '',
      distance: Math.round((r.distance ?? 0) / 100) / 10,
      elevation: Math.round(r.elevation_gain ?? 0),
      unpaved: typeof r.unpaved_pct === 'number' ? r.unpaved_pct : undefined,
      place: r.locality || undefined,
      region: r.administrative_area || undefined,
      country: r.country_code || undefined,
      days: dates.size || undefined,
      lat: round(r.first_lat ?? raw[0]?.[0] ?? 0),
      lng: round(r.first_lng ?? raw[0]?.[1] ?? 0),
      track: simplify(raw).map(([la, ln]) => [round(la), round(ln)]),
    };
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(file, JSON.stringify(trace) + '\n');
    return trace;
  } catch (e) {
    console.warn(`[traces] ${page} indisponible (${(e as Error).message}) : article sans fiche automatique.`);
    return undefined;
  }
}

const rides = new Map<string, Promise<Ride | undefined>>();

/** Fiche complète d'un article : traces RideWithGPS + champs saisis à la main (calculée une fois). */
export function getRide(article: Article): Promise<Ride | undefined> {
  if (!rides.has(article.id)) rides.set(article.id, computeRide(article));
  return rides.get(article.id)!;
}

async function computeRide(article: Article): Promise<Ride | undefined> {
  const traces = (await Promise.all(rideWithGpsRefs(article.body).map((r) => getTrace(r.type, r.id)))).filter(
    (t): t is Trace => !!t,
  );
  const manual = article.data.ride ?? {};
  const first = traces[0];
  const sum = (k: 'distance' | 'elevation') => (traces.length ? traces.reduce((s, t) => s + t[k], 0) : undefined);
  const ride: Ride = {
    distance: manual.distance ?? (sum('distance') !== undefined ? Math.round(sum('distance')!) : undefined),
    elevation: manual.elevation ?? sum('elevation'),
    // RideWithGPS renvoie -1 quand la part de piste est inconnue
    unpaved: manual.unpaved ?? (traces.length === 1 && (first.unpaved ?? -1) >= 0 ? first.unpaved : undefined),
    place: manual.place ?? first?.place,
    region: manual.region ?? first?.region,
    // l'horodatage des traces ne donne pas un nombre de jours fiable : saisie manuelle uniquement
    days: manual.days,
    lat: manual.lat ?? first?.lat,
    lng: manual.lng ?? first?.lng,
    links: traces.map((t) => t.url),
    tracks: traces.map((t) => t.track),
  };
  const hasData = ride.distance || ride.elevation || ride.place || ride.region || ride.lat !== undefined;
  return hasData ? ride : undefined;
}

/** Distance à vol d'oiseau en km. */
export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
