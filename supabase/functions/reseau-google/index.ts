// Edge Function : la fiche Google Maps d'un praticien, par l'API Places (New).
//
// Conditions de Google Maps Platform : seul l'identifiant de la fiche (place_id)
// est conservé, par `reseau-action` ; le contenu (téléphone, horaires, note, avis)
// est renvoyé pour affichage et n'est JAMAIS écrit en base.
//
// Actions :
//   • chercher { praticien_id }            — fiches candidates, l'opérateur choisit
//   • details  { praticien_id, avis? }     — la fiche rattachée, en direct
//
// Coût maîtrisé : masque de champs minimal, avis chargés seulement à la demande,
// quota quotidien compté en base (plafond réglable par variables d'environnement).
// Clé : GOOGLE_PLACES_KEY si elle existe, sinon GOOGLE_MAPS_KEY (celle de Merx).
//
// Déploiement : supabase functions deploy reseau-google

/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { clientService, cors, json, verifierAccesSante } from "../_shared/acces-sante.ts";
import { POPULATION_LIBELLE } from "../_shared/reseau-rpps.ts";

const RECHERCHE = "https://places.googleapis.com/v1/places:searchText";
const DETAILS = "https://places.googleapis.com/v1/places/";
// La clé du projet est restreinte aux appels venant du Hub (référent HTTP), comme pour Merx.
const REFERENT_HUB = "https://admin.avisdoc.fr/";
const PLAFONDS = {
  recherche: Number(Deno.env.get("RESEAU_GOOGLE_PLAFOND_RECHERCHE") ?? 100),
  details: Number(Deno.env.get("RESEAU_GOOGLE_PLAFOND_DETAILS") ?? 300),
  details_avis: Number(Deno.env.get("RESEAU_GOOGLE_PLAFOND_AVIS") ?? 100),
};

const CHAMPS_RECHERCHE = "places.id,places.displayName,places.formattedAddress,places.primaryTypeDisplayName,places.businessStatus";
const CHAMPS_DETAILS = [
  "id", "displayName", "formattedAddress", "nationalPhoneNumber", "websiteUri", "googleMapsUri",
  "regularOpeningHours.weekdayDescriptions", "rating", "userRatingCount", "businessStatus", "primaryTypeDisplayName",
].join(",");

const quotaAtteint = "Quota Google du jour atteint : les informations Google reviennent demain.";

async function appelGoogle(url: string, init: RequestInit, cle: string, masque: string): Promise<any> {
  const r = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10_000),
    headers: { ...(init.headers ?? {}), "X-Goog-Api-Key": cle, "X-Goog-FieldMask": masque, Referer: REFERENT_HUB },
  });
  if (!r.ok) {
    const corps = (await r.text().catch(() => "")).slice(0, 200);
    console.error("Google Places", r.status, corps);
    if (r.status === 403) throw new Error("Google refuse la clé : vérifiez que l'API Places (New) est activée pour la clé serveur.");
    throw new Error(`Google Maps a répondu ${r.status}. Réessayez.`);
  }
  return r.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  const acces = await verifierAccesSante(req);
  if ("refus" in acces) return acces.refus;

  const cle = (Deno.env.get("GOOGLE_PLACES_KEY") ?? Deno.env.get("GOOGLE_MAPS_KEY") ?? "").trim();
  if (!cle) return json({ error: "Aucune clé Google n'est configurée sur le projet (GOOGLE_PLACES_KEY)." }, 500);

  const corps = await req.json().catch(() => ({}));
  const db = clientService();
  const { data: p } = await db
    .from("admin_reseau_praticiens")
    .select("id, nom, prenom, population, google_place_id, admin_reseau_lieux(commune, code_postal, raison_sociale)")
    .eq("id", String(corps.praticien_id ?? ""))
    .maybeSingle();
  if (!p) return json({ error: "Praticien introuvable." }, 404);

  const compter = async (type: keyof typeof PLAFONDS) => {
    const { data, error } = await db.rpc("admin_reseau_compter_appel_google", { t: type, plafond: PLAFONDS[type] });
    if (error) throw new Error(error.message);
    return data === true;
  };

  try {
    if (corps.action === "chercher") {
      if (!(await compter("recherche"))) return json({ error: quotaAtteint }, 429);
      const communes = [...new Set((p.admin_reseau_lieux ?? []).map((l: any) => l.commune).filter(Boolean))];
      const requete = [`Dr ${p.prenom} ${p.nom}`, POPULATION_LIBELLE[p.population as keyof typeof POPULATION_LIBELLE], communes[0]]
        .filter(Boolean).join(" ");
      const d = await appelGoogle(RECHERCHE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ textQuery: requete, languageCode: "fr", regionCode: "FR", maxResultCount: 5 }),
      }, cle, CHAMPS_RECHERCHE);
      const candidats = (d?.places ?? []).map((x: any) => ({
        place_id: x.id,
        nom: x.displayName?.text ?? "",
        adresse: x.formattedAddress ?? "",
        categorie: x.primaryTypeDisplayName?.text ?? null,
        ferme: x.businessStatus === "CLOSED_PERMANENTLY",
      }));
      return json({ requete, candidats });
    }

    if (corps.action === "details") {
      if (!p.google_place_id) return json({ error: "Aucune fiche Google n'est rattachée à ce praticien." }, 400);
      const avecAvis = corps.avis === true;
      if (!(await compter(avecAvis ? "details_avis" : "details"))) return json({ error: quotaAtteint }, 429);
      const masque = avecAvis ? `${CHAMPS_DETAILS},reviews` : CHAMPS_DETAILS;
      const x = await appelGoogle(`${DETAILS}${encodeURIComponent(p.google_place_id)}?languageCode=fr&regionCode=FR`, { method: "GET" }, cle, masque);
      // Renvoyé pour affichage seulement : rien de ce contenu n'est enregistré.
      return json({
        place_id: x.id,
        nom: x.displayName?.text ?? "",
        adresse: x.formattedAddress ?? null,
        telephone: x.nationalPhoneNumber ?? null,
        site: x.websiteUri ?? null,
        lien: x.googleMapsUri ?? null,
        categorie: x.primaryTypeDisplayName?.text ?? null,
        horaires: x.regularOpeningHours?.weekdayDescriptions ?? [],
        note: x.rating ?? null,
        nombreAvis: x.userRatingCount ?? null,
        statut: x.businessStatus ?? null,
        avis: avecAvis
          ? (x.reviews ?? []).map((a: any) => ({
            auteur: a.authorAttribution?.displayName ?? "",
            lienAuteur: a.authorAttribution?.uri ?? null,
            note: a.rating ?? null,
            quand: a.relativePublishTimeDescription ?? "",
            texte: a.text?.text ?? a.originalText?.text ?? "",
          }))
          : null,
      });
    }

    return json({ error: "Action inconnue." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
