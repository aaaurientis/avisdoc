// Edge Function : les fiches Google Maps d'un praticien, par l'API Places (New).
//
// Conditions de Google Maps Platform : seuls les identifiants des fiches (place_id)
// sont conservés, par `reseau-action` ; le contenu (téléphone, horaires, note, avis)
// est renvoyé pour affichage et n'est JAMAIS écrit en base.
//
// Actions :
//   • chercher { praticien_id, departement? } — fiches candidates EN FRANCE et DANS LE
//              DÉPARTEMENT, qualifiées (certaine, forte, moyenne, faible) et triées ;
//              l'opérateur en coche une ou plusieurs
//   • details  { praticien_id, place_id, avis? } — une fiche rattachée, en direct
//
// La recherche automatique d'un département passe par `reseau-file` (type « liens »).
// Coût maîtrisé : masque de champs minimal, avis à la demande, quota quotidien.
// Clé : GOOGLE_PLACES_KEY si elle existe, sinon GOOGLE_MAPS_KEY (celle de Merx).
//
// Déploiement : supabase functions deploy reseau-google

/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { clientService, cors, json, verifierAccesSante } from "../_shared/acces-sante.ts";
import { appelGoogle, chercherFiches, cleGoogle, compterAppel, QUOTA_ATTEINT, requeteFiche } from "../_shared/google-places.ts";
import { estDepartement } from "../_shared/reseau-rpps.ts";
import { forceFiche } from "../_shared/google-correspondance.ts";

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
  const { data: p } = await db
    .from("admin_reseau_praticiens")
    .select("id, nom, prenom, population, google_statut, google_place_id, google_place_ids, admin_reseau_lieux(commune, code_postal, adresse, departement)")
    .eq("id", String(corps.praticien_id ?? ""))
    .maybeSingle();
  if (!p) return json({ error: "Praticien introuvable." }, 404);

  try {
    if (corps.action === "chercher") {
      // Le département concerné : celui de l'écran, sinon ceux des lieux d'exercice.
      const dep = String(corps.departement ?? "").toUpperCase();
      const departements = estDepartement(dep)
        ? [dep]
        : [...new Set((p.admin_reseau_lieux ?? []).map((l: any) => l.departement).filter(Boolean))] as string[];
      if (!departements.length) return json({ error: "Aucun département connu pour ce praticien." }, 400);
      if (!(await compterAppel(db, "recherche"))) return json({ error: QUOTA_ATTEINT }, 429);
      const candidats = await chercherFiches(p, departements, cle);
      return json({ requete: requeteFiche(p, departements), candidats });
    }

    if (corps.action === "details") {
      const rattachees: string[] = p.google_place_ids?.length ? p.google_place_ids : p.google_place_id ? [p.google_place_id] : [];
      const placeId = String(corps.place_id ?? rattachees[0] ?? "");
      // Seules les fiches rattachées à ce praticien s'affichent par ici.
      if (!placeId || !rattachees.includes(placeId)) return json({ error: "Cette fiche Google n'est pas rattachée à ce praticien." }, 400);
      const avecAvis = corps.avis === true;
      if (!(await compterAppel(db, avecAvis ? "details_avis" : "details"))) return json({ error: QUOTA_ATTEINT }, 429);
      const masque = avecAvis ? `${CHAMPS_DETAILS},reviews` : CHAMPS_DETAILS;
      const x = await appelGoogle(`${DETAILS}${encodeURIComponent(placeId)}?languageCode=fr&regionCode=FR`, { method: "GET" }, cle, masque);
      // Une fiche rattachée automatiquement « à vérifier » (première version de la recherche,
      // qui ne comparait pas la rue) est validée d'office si elle est au nom ET à l'adresse
      // RPPS du praticien (code postal + voie) — décision du 14/11. Aucun appel en plus :
      // on se sert de l'affichage. Le contenu, lui, n'est toujours pas enregistré.
      let valideeAuto = false;
      if (p.google_statut === "trouvee_auto" && rattachees.length === 1) {
        const lieux = (p.admin_reseau_lieux ?? []).map((l: any) => ({ codePostal: l.code_postal, adresse: l.adresse }));
        const force = forceFiche(
          { place_id: x.id, nom: x.displayName?.text ?? "", adresse: x.formattedAddress ?? "", ferme: x.businessStatus === "CLOSED_PERMANENTLY" },
          p.nom, lieux,
        );
        if (force === "certaine") {
          const { error } = await db.from("admin_reseau_praticiens")
            .update({ google_statut: "confirmee", google_rattache_par: "automatique (adresse RPPS)", google_rattache_le: new Date().toISOString() })
            .eq("id", p.id).eq("google_statut", "trouvee_auto");
          if (!error) {
            valideeAuto = true;
            await db.from("admin_reseau_historique").insert({
              praticien_id: p.id, acteur: acces.email, action: "google_valide_adresse_rpps", detail: { place_id: x.id },
            });
          }
        }
      }

      // Renvoyé pour affichage seulement : rien de ce contenu n'est enregistré.
      return json({
        valideeAuto,
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
