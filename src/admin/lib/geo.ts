// Géocodage via l'API Adresse française (BAN) : gratuit, sans clé, CORS ouvert.
// Adapté aux adresses FR (adresses d'exercice des professionnels, lieux des journées).
//
// Deux points d'accès, même format de réponse : l'historique api-adresse.data.gouv.fr, et la
// Géoplateforme de l'IGN (data.geopf.fr), vers laquelle le service migre. Si le premier ne répond
// pas ou ne trouve rien, on essaie le second.

/** Filtres de recherche : un type (« municipality » = commune) et/ou un code postal. */
interface Filtres {
  type?: "municipality" | "street" | "housenumber" | "locality";
  postcode?: string;
}

const parametres = (q: string, f: Filtres) => {
  const p = new URLSearchParams({ limit: "1", q });
  if (f.type) p.set("type", f.type);
  if (f.postcode) p.set("postcode", f.postcode);
  return p.toString();
};

const SOURCES = [
  (q: string, f: Filtres) => `https://api-adresse.data.gouv.fr/search/?${parametres(q, f)}`,
  (q: string, f: Filtres) => `https://data.geopf.fr/geocodage/search?${parametres(q, f)}`,
];

/** Délai d'attente compatible avec tous les navigateurs (AbortSignal.timeout manque avant Safari 16). */
function delai(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

/** Un résultat de recherche : position, département (code), nom de la commune, pertinence. */
export interface Resultat {
  lat: number;
  lng: number;
  dep: string;
  nom: string;
  score: number;
}

const departementDe = (p: { context?: string; citycode?: string }): string =>
  (p.context?.split(",")[0] ?? "").trim() || (p.citycode?.startsWith("97") ? p.citycode.slice(0, 3) : p.citycode?.slice(0, 2) ?? "");

async function rechercher(url: string): Promise<Resultat[]> {
  try {
    const res = await fetch(url, { signal: delai(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.features ?? [])
      .map((f: { geometry?: { coordinates?: number[] }; properties?: Record<string, unknown> }) => {
        const c = f?.geometry?.coordinates;
        const p = (f?.properties ?? {}) as { context?: string; citycode?: string; city?: string; name?: string; score?: number };
        return Array.isArray(c) && c.length === 2
          ? { lat: c[1], lng: c[0], dep: departementDe(p), nom: String(p.city ?? p.name ?? ""), score: Number(p.score ?? 0) }
          : null;
      })
      .filter(Boolean) as Resultat[];
  } catch {
    return [];
  }
}

/** Les résultats de la première source qui en donne. */
async function chercher(q: string, filtres: Filtres, limite = 1): Promise<Resultat[]> {
  for (const source of SOURCES) {
    const r = await rechercher(source(q, filtres).replace("limit=1", `limit=${limite}`));
    if (r.length) return r;
  }
  return [];
}

export async function geocodeBAN(query: string, filtres: Filtres = {}): Promise<{ lat: number; lng: number } | null> {
  const q = query.trim();
  if (!q) return null;
  const [r] = await chercher(q, filtres);
  return r ? { lat: r.lat, lng: r.lng } : null;
}

const normaliser = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const outreMer = (dep: string) => dep.startsWith("97") || dep.startsWith("98");

/**
 * Localise un lieu écrit librement (« Quimper », « Saint-Just », « Route du Haut Morvan 58430 Arleuf »).
 *   1. Avec un code postal dans le texte : la recherche limitée à ce code postal (puis la commune
 *      qui le suit).
 *   2. Sinon : les communes de ce nom. Un nom porté par plusieurs communes (une dizaine de
 *      « Saint-Just ») est départagé par `departements` (ceux où le client a ses autres journées,
 *      par ordre de préférence), sinon la métropole est préférée à l'outre-mer.
 *   3. En dernier recours : la recherche libre.
 * Une recherche libre seule tombait sur une rue homonyme (Bourg-Saint-Maurice dans l'Aisne).
 */
export async function localiserLieu(lieu: string, departements: string[] = []): Promise<Resultat | null> {
  const texte = lieu.trim();
  if (!texte) return null;
  const cp = texte.match(/\b(\d{5})\b/)?.[1];
  if (cp) {
    const [r] = await chercher(texte, { postcode: cp });
    if (r) return r;
    const commune = texte.slice(texte.indexOf(cp) + 5).trim();
    if (commune) {
      const [c] = await chercher(commune, { type: "municipality", postcode: cp });
      if (c) return c;
    }
  }
  const candidats = await chercher(texte, { type: "municipality" }, 10);
  if (candidats.length) {
    const memeNom = candidats.filter((c) => normaliser(c.nom) === normaliser(texte));
    const choix = memeNom.length ? memeNom : candidats;
    for (const d of departements) {
      const dansLeDep = choix.find((c) => c.dep === d);
      if (dansLeDep) return dansLeDep;
    }
    return choix.find((c) => !outreMer(c.dep)) ?? choix[0];
  }
  const [libre] = await chercher(texte, {});
  return libre ?? null;
}
