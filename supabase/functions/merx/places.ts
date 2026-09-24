// Google Places : le téléphone du standard, l'adresse exacte, le site officiel.
//
// C'est ce qui manquait le plus au commercial. Le registre donne l'identité légale,
// le site donne parfois un formulaire — mais le NUMÉRO qu'on compose pour demander
// le responsable QSE, personne ne le donnait. Merx conseillait « passez par le
// standard » sans jamais dire lequel.
//
// La clé GOOGLE_MAPS_KEY est déjà posée sur le projet et sert ailleurs dans le Hub.
// Places est payant à l'appel : on ne l'interroge donc qu'à l'APPROFONDISSEMENT
// d'une fiche, jamais pendant une recherche qui en brasserait des centaines.
//
// Tout échec est silencieux : une clé absente, un quota atteint ou un établissement
// introuvable ne doivent jamais faire échouer un approfondissement.

const URL_RECHERCHE = "https://places.googleapis.com/v1/places:searchText";

/** La dernière raison pour laquelle Places n'a rien rendu, pour pouvoir la dire. */
let dernierEchec: string | null = null;
export const echecPlaces = () => dernierEchec;
/** Par paquets de dix : cent entreprises tiennent en une dizaine de secondes. */
const PAR_VAGUE = 10;
const TIMEOUT_MS = 6_000;

/** Ce que Google connaît d'un établissement. */
export interface LieuTrouve {
  nom: string | null;
  adresse: string | null;
  telephone: string | null;
  site: string | null;
  /** L'adresse de la fiche Google : c'est elle qu'on cite comme source. */
  source: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * L'établissement qui correspond le mieux à ce nom, dans cette ville.
 *
 * On demande peu de champs : chacun coûte, et on ne veut que de quoi appeler.
 */
export async function chercherLieu(nom: string, ville: string | null): Promise<LieuTrouve | null> {
  const cle = Deno.env.get("GOOGLE_MAPS_KEY");
  if (!cle) {
    dernierEchec = "aucune clé GOOGLE_MAPS_KEY sur le projet";
    return null;
  }
  if (!nom.trim()) return null;

  try {
    const res = await fetch(URL_RECHERCHE, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": cle,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri",
      },
      body: JSON.stringify({
        textQuery: [nom.trim(), ville?.trim()].filter(Boolean).join(" "),
        languageCode: "fr",
        regionCode: "FR",
        maxResultCount: 1,
      }),
    });
    if (!res.ok) {
      // L'échec ne doit plus être muet : une clé restreinte par référent HTTP est
      // refusée depuis un serveur, et pendant des semaines la recherche a rendu des
      // fiches sans téléphone sans que personne sache pourquoi.
      dernierEchec = `Google Places a répondu ${res.status}${res.status === 403 ? " — la clé est probablement restreinte aux appels depuis un navigateur" : ""}`;
      return null;
    }

    const data = await res.json();
    const p = (data?.places ?? [])[0];
    if (!p) return null;

    return {
      nom: p.displayName?.text ?? null,
      adresse: p.formattedAddress ?? null,
      // Le format national se compose tel quel depuis la France.
      telephone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null,
      site: p.websiteUri ?? null,
      source: p.id ? `https://www.google.com/maps/place/?q=place_id:${p.id}` : null,
    };
  } catch (e) {
    dernierEchec = `Google Places injoignable : ${e instanceof Error ? e.message : String(e)}`;
    return null; // Places est un bonus : il ne fait jamais échouer un approfondissement.
  }
}

/**
 * Le même travail, pour toute une recherche.
 *
 * Le standard, l'adresse exacte et le site officiel de cent entreprises d'un coup. Il
 * fallait jusqu'ici approfondir fiche par fiche pour les obtenir, et la recherche
 * rendait des fiches sans un numéro à composer — moins utiles qu'une recherche Google.
 *
 * Places est facturé à l'appel : environ un euro cinquante pour cent entreprises. Le
 * jeu en vaut la chandelle, un commercial ne fait rien d'une fiche sans téléphone.
 * Par vagues de dix pour ne pas saturer, et tout échec reste silencieux.
 */
export async function chercherLieux(
  demandes: { cle: string; nom: string; ville: string | null }[],
): Promise<Map<string, LieuTrouve>> {
  const trouves = new Map<string, LieuTrouve>();
  dernierEchec = null;
  if (!Deno.env.get("GOOGLE_MAPS_KEY")) {
    dernierEchec = "aucune clé GOOGLE_MAPS_KEY sur le projet";
    return trouves;
  }
  for (let i = 0; i < demandes.length; i += PAR_VAGUE) {
    const vague = demandes.slice(i, i + PAR_VAGUE);
    const lieux = await Promise.all(vague.map((d) => chercherLieu(d.nom, d.ville)));
    vague.forEach((d, j) => {
      const l = lieux[j];
      if (l) trouves.set(d.cle, l);
    });
  }
  return trouves;
}
