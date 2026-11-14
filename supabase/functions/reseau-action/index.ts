// Edge Function : les transitions du réseau d'aval. Le front ne fait que lire ;
// tout changement d'état passe ici et laisse une trace dans l'historique.
//
// Actions (corps JSON, champ `action`) :
//   • departement_ajouter  { code, ordre? }
//   • departement_modifier { code, etat?, ordre? }   — l'utilisateur décide (14/11)
//   • exclure              { praticien_id, motif, precision? } — définitif
//   • signal_saisir        { praticien_id, type, valeur, url } — saisi par un opérateur, donc validé
//   • signal_valider       { signal_id } — proposition de l'IA acceptée
//   • signal_rejeter       { signal_id }
//   • google_rattacher     { praticien_id, place_id } | { praticien_id, aucune: true } | { praticien_id, retirer: true }
//   • ajouter_rpps         { rpps } — contrôlé dans l'extraction RPPS (MG_DERM compris)
//
// Réservé au droit « sante ». Déploiement : supabase functions deploy reseau-action

/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { clientService, cors, json, verifierAccesSante } from "../_shared/acces-sante.ts";
import { estDepartement, normaliserRpps, praticienDepuisLignes } from "../_shared/reseau-rpps.ts";
import { estTypeSignal, urlValide, valeurAdmise } from "../_shared/reseau-signaux.ts";
import { dateExtraction, lignesDuRpps } from "../_shared/tabulaire-rpps.ts";
import { enregistrerPraticien } from "../_shared/enregistrer-praticien.ts";

const ETATS_DEPARTEMENT = ["a_ouvrir", "importe", "en_qualification", "en_contact", "couvert", "en_veille"];
const MOTIFS_EXCLUSION = ["opposition", "esthetique_dominante", "n_exerce_plus", "autre"];

const ordreValide = (v: unknown) => v == null || v === "" || (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) < 1000);

/** Le rôle « futur requérant » suit le signal de télé-expertise validé. */
async function majRoleRequerant(db: any, praticienId: string) {
  const [{ data: p }, { data: s }] = await Promise.all([
    db.from("admin_reseau_praticiens").select("roles").eq("id", praticienId).single(),
    db.from("admin_reseau_signaux").select("valeur").eq("praticien_id", praticienId).eq("type", "teleexpertise").eq("statut", "valide").maybeSingle(),
  ]);
  const roles: string[] = (p?.roles ?? []).filter((r: string) => r !== "requerant");
  if (s?.valeur === "oui") roles.push("requerant");
  await db.from("admin_reseau_praticiens").update({ roles }).eq("id", praticienId);
}

/** Le signal validé précédent du même type passe à « remplacé » (un seul validé à la fois). */
async function remplacerAncien(db: any, praticienId: string, type: string, saufId?: string) {
  let q = db.from("admin_reseau_signaux").update({ statut: "remplace" })
    .eq("praticien_id", praticienId).eq("type", type).eq("statut", "valide");
  if (saufId) q = q.neq("id", saufId);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const acces = await verifierAccesSante(req);
  if ("refus" in acces) return acces.refus;
  const { email } = acces;
  const corps = await req.json().catch(() => ({}));
  const db = clientService();

  switch (corps.action) {
    case "departement_ajouter": {
      const code = String(corps.code ?? "").trim().toUpperCase();
      if (!estDepartement(code)) return json({ error: "Département inconnu." }, 400);
      if (!ordreValide(corps.ordre)) return json({ error: "L'ordre doit être un nombre entier positif." }, 400);
      const { data: deja } = await db.from("admin_reseau_departements").select("code").eq("code", code).maybeSingle();
      if (deja) return json({ error: "Ce département est déjà dans la liste." }, 409);
      const ordre = corps.ordre == null || corps.ordre === "" ? null : Number(corps.ordre);
      const { error } = await db.from("admin_reseau_departements").insert({ code, ordre, ajoute_par: email });
      if (error) return json({ error: error.message }, 500);
      await db.from("admin_reseau_historique").insert({
        departement: code, acteur: email, action: "departement_ajoute", vers: "a_ouvrir",
      });
      return json({ code });
    }

    case "departement_modifier": {
      const code = String(corps.code ?? "").trim().toUpperCase();
      const { data: dep } = await db.from("admin_reseau_departements").select("code, etat, ordre").eq("code", code).maybeSingle();
      if (!dep) return json({ error: "Département introuvable." }, 404);
      const maj: Record<string, unknown> = {};
      if (corps.etat !== undefined) {
        if (!ETATS_DEPARTEMENT.includes(corps.etat)) return json({ error: "État de département inconnu." }, 400);
        if (corps.etat !== dep.etat) maj.etat = corps.etat;
      }
      if (corps.ordre !== undefined) {
        if (!ordreValide(corps.ordre)) return json({ error: "L'ordre doit être un nombre entier positif." }, 400);
        maj.ordre = corps.ordre === null || corps.ordre === "" ? null : Number(corps.ordre);
      }
      if (Object.keys(maj).length === 0) return json({ code });
      const { error } = await db.from("admin_reseau_departements").update(maj).eq("code", code);
      if (error) return json({ error: error.message }, 500);
      if (maj.etat) {
        await db.from("admin_reseau_historique").insert({
          departement: code, acteur: email, action: "departement_etat", de: dep.etat, vers: maj.etat,
        });
      }
      return json({ code });
    }

    case "exclure": {
      const motif = String(corps.motif ?? "");
      if (!MOTIFS_EXCLUSION.includes(motif)) return json({ error: "Choisissez le motif de l'exclusion." }, 400);
      const precision = String(corps.precision ?? "").trim().slice(0, 500) || null;
      if (motif === "autre" && !precision) return json({ error: "Précisez le motif « autre »." }, 400);
      const { data: p } = await db
        .from("admin_reseau_praticiens").select("id, rpps, etat").eq("id", String(corps.praticien_id ?? "")).maybeSingle();
      if (!p) return json({ error: "Praticien introuvable." }, 404);
      if (p.etat === "exclu") return json({ error: "Ce praticien est déjà exclu." }, 409);
      // L'exclusion d'abord : elle est définitive et bloque toute recréation par le RPPS.
      const { error: eEx } = await db.from("admin_reseau_exclusions").insert({ rpps: p.rpps, motif, precision, auteur: email });
      if (eEx && !/duplicate|unique/i.test(eEx.message)) return json({ error: eEx.message }, 500);
      const { error } = await db.from("admin_reseau_praticiens").update({ etat: "exclu" }).eq("id", p.id);
      if (error) return json({ error: error.message }, 500);
      await db.from("admin_reseau_historique").insert({
        praticien_id: p.id, acteur: email, action: "exclu", de: p.etat, vers: "exclu", detail: { motif, precision },
      });
      return json({ id: p.id });
    }

    case "signal_saisir": {
      const { praticien_id, type, valeur, url } = corps;
      if (!estTypeSignal(type)) return json({ error: "Type de signal inconnu." }, 400);
      if (!valeurAdmise(type, valeur)) return json({ error: "Valeur non admise pour ce signal." }, 400);
      if (!urlValide(url)) return json({ error: "Indiquez l'adresse complète de la page source (https://…)." }, 400);
      const { data: p } = await db.from("admin_reseau_praticiens").select("id, etat").eq("id", String(praticien_id ?? "")).maybeSingle();
      if (!p) return json({ error: "Praticien introuvable." }, 404);
      if (p.etat === "exclu") return json({ error: "Ce praticien est exclu." }, 409);
      try { await remplacerAncien(db, p.id, type); } catch (e) { return json({ error: (e as Error).message }, 500); }
      const maintenant = new Date().toISOString();
      const { data: sig, error } = await db.from("admin_reseau_signaux").insert({
        praticien_id: p.id, type, valeur, url, origine: "operateur", statut: "valide",
        propose_par: email, decide_par: email, decide_le: maintenant,
      }).select("id").single();
      if (error) return json({ error: error.message }, 500);
      if (type === "teleexpertise") await majRoleRequerant(db, p.id);
      await db.from("admin_reseau_historique").insert({
        praticien_id: p.id, acteur: email, action: "signal_saisi", detail: { type, valeur, url },
      });
      return json({ id: sig.id });
    }

    case "signal_valider":
    case "signal_rejeter": {
      const { data: sig } = await db.from("admin_reseau_signaux")
        .select("id, praticien_id, type, valeur, url, statut").eq("id", String(corps.signal_id ?? "")).maybeSingle();
      if (!sig) return json({ error: "Proposition introuvable." }, 404);
      if (sig.statut !== "propose") return json({ error: "Cette proposition a déjà été traitée." }, 409);
      const valider = corps.action === "signal_valider";
      if (valider) {
        try { await remplacerAncien(db, sig.praticien_id, sig.type, sig.id); } catch (e) { return json({ error: (e as Error).message }, 500); }
      }
      // L'extrait est effacé dès la décision : aucun verbatim n'est conservé.
      const { error } = await db.from("admin_reseau_signaux").update({
        statut: valider ? "valide" : "rejete", extrait: null, decide_par: email, decide_le: new Date().toISOString(),
      }).eq("id", sig.id).eq("statut", "propose");
      if (error) return json({ error: error.message }, 500);
      if (sig.type === "teleexpertise") await majRoleRequerant(db, sig.praticien_id);
      await db.from("admin_reseau_historique").insert({
        praticien_id: sig.praticien_id, acteur: email, action: valider ? "signal_valide" : "signal_rejete",
        detail: { type: sig.type, valeur: sig.valeur, url: sig.url },
      });
      return json({ id: sig.id });
    }

    case "google_rattacher": {
      const { data: p } = await db.from("admin_reseau_praticiens").select("id").eq("id", String(corps.praticien_id ?? "")).maybeSingle();
      if (!p) return json({ error: "Praticien introuvable." }, 404);
      let maj: Record<string, unknown>;
      if (corps.retirer) maj = { google_place_id: null, google_aucune_fiche: false, google_rattache_par: null, google_rattache_le: null };
      else if (corps.aucune) maj = { google_place_id: null, google_aucune_fiche: true, google_rattache_par: email, google_rattache_le: new Date().toISOString() };
      else {
        const placeId = String(corps.place_id ?? "").trim();
        if (!/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) return json({ error: "Identifiant de fiche Google invalide." }, 400);
        maj = { google_place_id: placeId, google_aucune_fiche: false, google_rattache_par: email, google_rattache_le: new Date().toISOString() };
      }
      const { error } = await db.from("admin_reseau_praticiens").update(maj).eq("id", p.id);
      if (error) return json({ error: error.message }, 500);
      await db.from("admin_reseau_historique").insert({
        praticien_id: p.id, acteur: email, action: "google_rattache",
        detail: { place_id: maj.google_place_id ?? null, aucune: maj.google_aucune_fiche ?? false },
      });
      return json({ id: p.id });
    }

    case "ajouter_rpps": {
      const rpps = normaliserRpps(corps.rpps);
      if (!rpps) return json({ error: "Un numéro RPPS compte 11 chiffres." }, 400);
      try {
        const [lignes, extraitLe] = await Promise.all([lignesDuRpps(rpps), dateExtraction()]);
        const r = praticienDepuisLignes(lignes, rpps);
        if ("refus" in r) return json({ error: r.refus }, 422);
        const e = await enregistrerPraticien(db, r.praticien, { origine: "manuel", acteur: email, extraitLe });
        if (e.statut === "exclu") return json({ error: "Ce praticien est exclu du réseau : il ne peut pas y revenir." }, 409);
        return json({
          ...e, nom: `${r.praticien.prenom} ${r.praticien.nom}`, population: r.praticien.population,
          departements: [...new Set(r.praticien.lieux.map((l) => l.departement))],
        });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 502);
      }
    }

    default:
      return json({ error: "Action inconnue." }, 400);
  }
});
