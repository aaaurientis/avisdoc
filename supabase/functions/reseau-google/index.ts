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
import { verifierFichesIa } from "../_shared/google-ia.ts";
import { appelGoogle, chercherFiches, cleGoogle, compterAppel, quotaAtteint, requeteFiche } from "../_shared/google-places.ts";
import { estDepartement } from "../_shared/reseau-rpps.ts";
import { distanceAuLieu, forceFiche } from "../_shared/google-correspondance.ts";
import { completerGeo, lieuxPourComparaison } from "../_shared/geo.ts";

const DETAILS = "https://places.googleapis.com/v1/places/";
const CHAMPS_DETAILS = [
  "id", "displayName", "formattedAddress", "nationalPhoneNumber", "websiteUri", "googleMapsUri",
  "regularOpeningHours.weekdayDescriptions", "rating", "userRatingCount", "businessStatus", "primaryTypeDisplayName", "location",
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
    .select("id, nom, prenom, population, google_statut, google_place_id, google_place_ids, admin_reseau_lieux(id, commune, code_postal, adresse, departement, raison_sociale, lat, lng, geo_tente, geo_type)")
    .eq("id", String(corps.praticien_id ?? ""))
    .maybeSingle();
  if (!p) return json({ error: "Praticien introuvable." }, 404);
  // Lieux RPPS géocodés (et leur précision) : nécessaires à la validation par la position.
  p.admin_reseau_lieux = await completerGeo(db, p.admin_reseau_lieux ?? []);

  try {
    if (corps.action === "chercher") {
      // Le département concerné : celui de l'écran, sinon ceux des lieux d'exercice.
      const dep = String(corps.departement ?? "").toUpperCase();
      const departements = estDepartement(dep)
        ? [dep]
        : [...new Set((p.admin_reseau_lieux ?? []).map((l: any) => l.departement).filter(Boolean))] as string[];
      if (!departements.length) return json({ error: "Aucun département connu pour ce praticien." }, 400);
      if (!(await compterAppel(db, "recherche"))) return json({ error: quotaAtteint("recherche") }, 429);
      const candidats = await chercherFiches(p, departements, cle);
      // Personne n'a encore tranché (à chercher, à confirmer, introuvable) et des fiches sont
      // au nom ET à l'adresse RPPS : validées d'office (décision du 14/11), sans attendre de clic.
      let valideesAuto: string[] = [];
      if (["a_chercher", "a_confirmer", "introuvable"].includes(p.google_statut)) {
        const certaines = [...new Set(candidats.filter((c) => c.force === "certaine").map((c) => c.place_id))];
        if (certaines.length) {
          const { error } = await db.from("admin_reseau_praticiens").update({
            google_statut: "confirmee", google_place_ids: certaines, google_place_id: certaines[0], google_aucune_fiche: false,
            google_rattache_par: "automatique (adresse RPPS)", google_rattache_le: new Date().toISOString(),
          }).eq("id", p.id).eq("google_statut", p.google_statut);
          if (!error) {
            valideesAuto = certaines;
            await db.from("admin_reseau_historique").insert({
              praticien_id: p.id, acteur: acces.email, action: "google_valide_adresse_rpps", detail: { place_ids: certaines },
            });
          }
        }
      }
      return json({ requete: requeteFiche(p, departements), candidats, valideesAuto });
    }

    if (corps.action === "details") {
      const rattachees: string[] = p.google_place_ids?.length ? p.google_place_ids : p.google_place_id ? [p.google_place_id] : [];
      const placeId = String(corps.place_id ?? rattachees[0] ?? "");
      // Seules les fiches rattachées à ce praticien s'affichent par ici.
      if (!placeId || !rattachees.includes(placeId)) return json({ error: "Cette fiche Google n'est pas rattachée à ce praticien." }, 400);
      const avecAvis = corps.avis === true;
      if (!(await compterAppel(db, avecAvis ? "details_avis" : "details"))) return json({ error: quotaAtteint(avecAvis ? "details_avis" : "details") }, 429);
      const masque = avecAvis ? `${CHAMPS_DETAILS},reviews` : CHAMPS_DETAILS;
      const x = await appelGoogle(`${DETAILS}${encodeURIComponent(placeId)}?languageCode=fr&regionCode=FR`, { method: "GET" }, cle, masque);
      // Fiche rattachée « à vérifier » : on profite de l'affichage pour la vérifier. Au nom
      // ET à l'adresse RPPS (comparaison mot à mot, sinon vérification par IA des deux
      // adresses), elle est notée vérifiée. Quand TOUTES les fiches rattachées le sont,
      // le statut passe à « confirmée » (décision du 14/11). Le contenu n'est pas enregistré.
      let valideeAuto = false;
      let verificationIa: string | null = null;
      if (p.google_statut === "trouvee_auto") {
        const { data: deja } = await db.from("admin_reseau_historique").select("detail")
          .eq("praticien_id", p.id).eq("action", "google_fiche_verifiee");
        const verifiees = new Set<string>((deja ?? []).map((h: any) => h.detail?.place_id).filter(Boolean));
        if (!verifiees.has(x.id)) {
          const fiche = {
            place_id: x.id, nom: x.displayName?.text ?? "", adresse: x.formattedAddress ?? "", ferme: x.businessStatus === "CLOSED_PERMANENTLY",
            lat: x.location?.latitude ?? null, lng: x.location?.longitude ?? null,
          };
          const lieux = lieuxPourComparaison(p.admin_reseau_lieux ?? []);
          const force = forceFiche(fiche, p.nom, lieux);
          let ok = force === "certaine";
          if (!ok && (force === "forte" || force === "moyenne") && !fiche.ferme) {
            const v = (await verifierFichesIa(
              { nom: p.nom, prenom: p.prenom, population: p.population, lieux: p.admin_reseau_lieux ?? [] },
              [{ ...fiche, categorie: x.primaryTypeDisplayName?.text ?? null }],
            )).get(x.id);
            if (v?.memePraticien && v.memeAdresse) { ok = true; verificationIa = v.raison; }
          }
          if (ok) {
            verifiees.add(x.id);
            await db.from("admin_reseau_historique").insert({
              praticien_id: p.id, acteur: acces.email, action: "google_fiche_verifiee",
              detail: { place_id: x.id, par: verificationIa ? "ia" : "adresse", raison: verificationIa },
            });
          }
        }
        if (rattachees.every((id) => verifiees.has(id))) {
          const { error } = await db.from("admin_reseau_praticiens")
            .update({ google_statut: "confirmee", google_rattache_par: "automatique (adresse RPPS)", google_rattache_le: new Date().toISOString() })
            .eq("id", p.id).eq("google_statut", "trouvee_auto");
          if (!error) {
            valideeAuto = true;
            await db.from("admin_reseau_historique").insert({
              praticien_id: p.id, acteur: acces.email, action: "google_valide_adresse_rpps", detail: { place_ids: rattachees },
            });
          }
        }
      }

      // Renvoyé pour affichage seulement : rien de ce contenu n'est enregistré.
      return json({
        valideeAuto,
        verificationIa,
        // Distance au lieu RPPS géocodé au numéro le plus proche (mètres), pour l'affichage.
        distance: (() => { const d = distanceAuLieu({ lat: x.location?.latitude ?? null, lng: x.location?.longitude ?? null }, lieuxPourComparaison(p.admin_reseau_lieux ?? [])); return d === null ? null : Math.round(d); })(),
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
