// Géocodage des lieux d'exercice RPPS par l'API Adresse (BAN, data.gouv.fr) : gratuit,
// sans clé, adresses françaises. Sert à la carte et à la validation des fiches Google
// par la position (rayon de 50 m, seulement pour un lieu géocodé au numéro).

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LieuRpps } from "./google-correspondance.ts";

export interface Geo { lat: number; lng: number; geo_type: string; geo_score: number | null; geo_label: string | null }

export async function geocoder(l: { adresse?: string | null; code_postal?: string | null; commune?: string | null }): Promise<Geo | null> {
  // « 21 RUE DE SARLIEVE, LE TRIANGLE » : le complément gêne l'API, on garde la voie.
  const voie = (l.adresse ?? "").split(",")[0];
  const q = [voie, l.code_postal, l.commune].filter(Boolean).join(" ");
  if (!q.trim()) return null;
  const u = new URL("https://api-adresse.data.gouv.fr/search/");
  u.searchParams.set("q", q);
  u.searchParams.set("limit", "1");
  if (/^\d{5}$/.test(l.code_postal ?? "")) u.searchParams.set("postcode", l.code_postal!);
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const f = (await r.json())?.features?.[0];
    const c = f?.geometry?.coordinates;
    if (!Array.isArray(c) || c.length !== 2) return null;
    return { lat: c[1], lng: c[0], geo_type: String(f.properties?.type ?? "inconnu"), geo_score: typeof f.properties?.score === "number" ? f.properties.score : null,
      geo_label: typeof f.properties?.label === "string" ? f.properties.label.slice(0, 200) : null };
  } catch {
    return null;
  }
}

/**
 * Géocode les lieux qui ne le sont pas encore, ou dont on ignore la précision (lieux
 * géocodés avant le 16/11), et met la base à jour. Renvoie les lieux complétés.
 */
export async function completerGeo(db: any, lieux: any[]): Promise<any[]> {
  const out = [];
  for (const l of lieux) {
    if ((l.lat == null && !l.geo_tente) || (l.lat != null && l.geo_type == null)) {
      const g = await geocoder(l);
      const maj = g ? { ...g, geo_tente: true } : { geo_tente: true, geo_type: l.lat != null ? "inconnu" : null };
      if (l.id) await db.from("admin_reseau_lieux").update(maj).eq("id", l.id);
      out.push({ ...l, ...maj });
    } else out.push(l);
  }
  return out;
}

/** Lieux RPPS pour la comparaison avec les fiches Google. */
export function lieuxPourComparaison(lieux: any[]): LieuRpps[] {
  return lieux.map((l) => ({
    codePostal: l.code_postal ?? null, adresse: l.adresse ?? null,
    lat: l.lat ?? null, lng: l.lng ?? null, precis: l.geo_type === "housenumber",
  }));
}
