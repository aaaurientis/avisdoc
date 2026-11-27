// Géocodage via l'API Adresse française (BAN) : gratuit, sans clé, CORS ouvert.
// Adapté aux adresses FR (adresses d'exercice des professionnels, lieux des journées).
//
// Deux points d'accès, même format de réponse : l'historique api-adresse.data.gouv.fr, et la
// Géoplateforme de l'IGN (data.geopf.fr), vers laquelle le service migre. Si le premier ne répond
// pas ou ne trouve rien, on essaie le second.

const SOURCES = [
  (q: string) => `https://api-adresse.data.gouv.fr/search/?limit=1&q=${encodeURIComponent(q)}`,
  (q: string) => `https://data.geopf.fr/geocodage/search?limit=1&q=${encodeURIComponent(q)}`,
];

async function depuis(url: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
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

export async function geocodeBAN(query: string): Promise<{ lat: number; lng: number } | null> {
  const q = query.trim();
  if (!q) return null;
  for (const source of SOURCES) {
    const r = await depuis(source(q));
    if (r) return r;
  }
  return null;
}
