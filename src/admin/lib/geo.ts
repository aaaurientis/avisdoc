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

async function depuis(url: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(url, { signal: delai(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data?.features?.[0]?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length === 2) {
      return { lat: coords[1], lng: coords[0] }; // GeoJSON = [lng, lat]
    }
    return null;
  } catch {
    return null;
  }
}

export async function geocodeBAN(query: string, filtres: Filtres = {}): Promise<{ lat: number; lng: number } | null> {
  const q = query.trim();
  if (!q) return null;
  for (const source of SOURCES) {
    const r = await depuis(source(q, filtres));
    if (r) return r;
  }
  return null;
}

/**
 * Localise un lieu écrit librement (« Quimper », « Bourg-Saint-Maurice »,
 * « Route du Haut Morvan 58430 Arleuf »). Une recherche libre pouvait tomber sur une rue
 * homonyme à l'autre bout de la France (« rue de Bourg-Saint-Maurice » dans l'Aisne) ; on cherche
 * donc dans cet ordre :
 *   1. avec un code postal dans le texte : la recherche limitée à ce code postal ;
 *   2. sinon : une commune de ce nom ;
 *   3. en dernier recours : la recherche libre.
 */
export async function localiserLieu(lieu: string): Promise<{ lat: number; lng: number } | null> {
  const texte = lieu.trim();
  if (!texte) return null;
  const cp = texte.match(/\b(\d{5})\b/)?.[1];
  if (cp) {
    const r = await geocodeBAN(texte, { postcode: cp });
    if (r) return r;
    // La commune après le code postal (« … 58430 Arleuf ») si l'adresse exacte est introuvable.
    const commune = texte.slice(texte.indexOf(cp) + 5).trim();
    if (commune) {
      const c = await geocodeBAN(commune, { type: "municipality", postcode: cp });
      if (c) return c;
    }
  }
  return (await geocodeBAN(texte, { type: "municipality" })) ?? geocodeBAN(texte);
}
