// Edge Function : la fiche Google Maps d'un praticien, par l'API Places (New).
//
// Conditions de Google Maps Platform : seul l'identifiant de la fiche (place_id)
// est conservé, par `reseau-action` ; le contenu (téléphone, horaires, note, avis)
// est renvoyé pour affichage et n'est JAMAIS écrit en base.
//
// Actions :
//   • chercher { praticien_id }            — fiches candidates, l'opérateur choisit
//   • details  { praticien_id, avis? }     — la fiche rattachée, en direct
//   • auto     { departement }             — recherche automatique des fiches
//                                            encore « à chercher » (tâche de fond)
//
// Coût maîtrisé : masque de champs minimal, avis chargés seulement à la demande,
// quota quotidien compté en base (plafond réglable par variables d'environnement).
// Clé : GOOGLE_PLACES_KEY si elle existe, sinon GOOGLE_MAPS_KEY (celle de Merx).
//
// Déploiement : supabase functions deploy reseau-google

/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { clientService, cors, json, verifierAccesSante } from "../_shared/acces-sante.ts";
import { appelGoogle, chercherFiches, cleGoogle, compterAppel, demarrerRechercheGoogle, QUOTA_ATTEINT, requeteFiche } from "../_shared/google-places.ts";
import { estDepartement } from "../_shared/reseau-rpps.ts";

const DETAILS = "https://places.googleapis.com/v1/places/";
const CHAMPS_DETAILS = [
  "id", "displayName", "formattedAddress", "nationalPhoneNumber", "websiteUri", "googleMapsUri",
  "regularOpeningHours.weekdayDescriptions", "rating", "userRatingCount", "businessStatus", "primaryTypeDisplayName",
].join(",");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  const acces = await verifierAccesSante(req);
  if ("refus" in acces) return acces.refus;

  const cle = cleGoogle();
  if (!cle) return json({ error: "Aucune clé Google n'est configurée sur le projet (GOOGLE_PLACES_KEY)." }, 500);

  const corps = await req.json().catch(() => ({}));
  const db = clientService();

  if (corps.action === "auto") {
    const dep = String(corps.departement ?? "").toUpperCase();
    if (!estDepartement(dep)) return json({ error: "Département inconnu." }, 400);
    try {
      return json({ recherche_id: await demarrerRechercheGoogle(db, dep, acces.email) }, 202);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  const { data: p } = await db
    .from("admin_reseau_praticiens")
    .select("id, nom, prenom, population, google_place_id, admin_reseau_lieux(commune, code_postal, raison_sociale)")
    .eq("id", String(corps.praticien_id ?? ""))
    .maybeSingle();
  if (!p) return json({ error: "Praticien introuvable." }, 404);

  const compter = (type: "recherche" | "details" | "details_avis") => compterAppel(db, type);

  try {
    if (corps.action === "chercher") {
      if (!(await compter("recherche"))) return json({ error: QUOTA_ATTEINT }, 429);
      const candidats = await chercherFiches(p, cle);
      const requete = requeteFiche(p);
      return json({ requete, candidats });
    }

    if (corps.action === "details") {
      if (!p.google_place_id) return json({ error: "Aucune fiche Google n'est rattachée à ce praticien." }, 400);
      const avecAvis = corps.avis === true;
      if (!(await compter(avecAvis ? "details_avis" : "details"))) return json({ error: QUOTA_ATTEINT }, 429);
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
