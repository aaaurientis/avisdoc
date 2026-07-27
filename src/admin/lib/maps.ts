// Lien profond Google Maps (aucune clé API requise).

export function mapsUrl(adresse: string, ville?: string): string {
  const query = ville ? `${adresse}, ${ville}` : adresse;
  return (
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(query)
  );
}
