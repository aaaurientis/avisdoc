// Edge Function : les transitions du réseau d'aval. Le front ne fait que lire ;
// tout changement d'état passe ici et laisse une trace dans l'historique.
//
// Actions (corps JSON, champ `action`) :
//   • departement_ajouter  { code, ordre? }
//   • departement_modifier { code, etat?, ordre? }   — l'utilisateur décide (14/11)
//   • exclure              { praticien_id, motif, precision? } — définitif
//
// Réservé au droit « sante ». Déploiement : supabase functions deploy reseau-action

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { clientService, cors, json, verifierAccesSante } from "../_shared/acces-sante.ts";
import { estDepartement } from "../_shared/reseau-rpps.ts";

const ETATS_DEPARTEMENT = ["a_ouvrir", "importe", "en_qualification", "en_contact", "couvert", "en_veille"];
const MOTIFS_EXCLUSION = ["opposition", "esthetique_dominante", "n_exerce_plus", "autre"];

const ordreValide = (v: unknown) => v == null || v === "" || (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) < 1000);

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

    default:
      return json({ error: "Action inconnue." }, 400);
  }
});
