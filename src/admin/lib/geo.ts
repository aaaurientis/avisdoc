// Géocodage via l'API Adresse française (BAN, data.gouv.fr) : gratuit, sans clé,
// CORS ouvert. Adapté aux adresses FR (adresses d'exercice des professionnels).

export async function geocodeBAN(query: string): Promise<{ lat: number; lng: number } | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const res = await fetch(`https://api-adresse.data.gouv.fr/search/?limit=1&q=${encodeURIComponent(q)}`);
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
