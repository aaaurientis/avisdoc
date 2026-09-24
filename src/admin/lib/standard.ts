// Le standard de l'entreprise, cherché depuis le navigateur.
//
// La clé Google Maps est restreinte aux appels venus de admin.avisdoc.fr — c'est la
// bonne pratique pour une clé publique, et c'est pourquoi la fonction Merx, qui tourne
// sur un serveur sans page d'origine, se fait refuser avec un 403. Elle n'a jamais
// rendu un seul numéro.
//
// Depuis le navigateur, la même clé fonctionne : la page EST l'origine autorisée.
//
// On interroge donc Places au moment où l'on ouvre une fiche qui n'a pas de numéro,
// et l'on enregistre ce qu'on trouve. Un appel par fiche réellement consultée, au lieu
// de deux cents par recherche : c'est à la fois ce qui marche et ce qui coûte le moins.

import { fetchMapsKey } from "./googleMaps";
import { supabaseAdmin } from "../data/supabaseAdmin";

const URL_RECHERCHE = "https://places.googleapis.com/v1/places:searchText";

export interface Standard {
  telephone: string | null;
  site: string | null;
  adresse: string | null;
  source: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Ce que Google connaît de cet établissement. Null si la clé manque ou qu'on ne trouve rien. */
export async function chercherStandard(nom: string, ville: string | null): Promise<Standard | null> {
  const cle = await fetchMapsKey();
  if (!cle || !nom.trim()) return null;
  try {
    const res = await fetch(URL_RECHERCHE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": cle,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri",
      },
      body: JSON.stringify({
        textQuery: [nom.trim(), ville?.trim()].filter(Boolean).join(" "),
        languageCode: "fr",
        regionCode: "FR",
        maxResultCount: 1,
      }),
    });
    if (!res.ok) return null;
    const p = ((await res.json())?.places ?? [])[0];
    if (!p) return null;
    return {
      telephone: p.nationalPhoneNumber ?? null,
      site: p.websiteUri ?? null,
      adresse: p.formattedAddress ?? null,
      source: p.id ? `https://www.google.com/maps/place/?q=place_id:${p.id}` : null,
    };
  } catch {
    return null;
  }
}

/**
 * Complète une fiche qui n'a ni numéro ni site, et enregistre ce qu'on trouve.
 *
 * On n'écrase jamais ce qui est déjà là : on ne remplit que les cases vides. Rend true
 * quand quelque chose a été ajouté, pour que l'écran se rafraîchisse.
 */
export async function completerStandard(p: {
  id: string;
  name: string;
  city: string | null;
  contact_phone: string | null;
  website: string | null;
}): Promise<boolean> {
  if (p.contact_phone && p.website) return false;
  const s = await chercherStandard(p.name, p.city);
  if (!s || (!s.telephone && !s.site)) return false;

  const patch: Record<string, string> = {};
  if (!p.contact_phone && s.telephone) patch.contact_phone = s.telephone;
  if (!p.website && s.site) patch.website = s.site;
  if (Object.keys(patch).length === 0) return false;
  if (s.source) patch.contact_source = s.source;

  const { error } = await supabaseAdmin.from("admin_prospects").update(patch).eq("id", p.id);
  return !error;
}
