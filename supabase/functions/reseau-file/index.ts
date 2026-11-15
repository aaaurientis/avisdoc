// Edge Function : travaux groupés d'un département, en file (voir _shared/file.ts).
//
// Actions (droit « sante ») :
//   • estimer { departement, type, inclure_recents? } — combien de praticiens, sans rien lancer
//   • lancer  { departement, type, inclure_recents? } — type : « liens » (carte, Google,
//              Doctolib) ou « ia » (recherche IA de chaque praticien)
//              volet (liens) : « tout », « google », « doctolib » ou « rapprochement »
//   • arreter { job_id }
// Action interne (la fonction se relance elle-même) :
//   • suite   { job_id } — en-tête x-reseau-interne = clé service
//
// verify_jwt = false : l'accès est vérifié ici (utilisateur ou appel interne).
// Déploiement : supabase functions deploy reseau-file

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { clientService, cors, json, verifierAccesSante } from "../_shared/acces-sante.ts";
import { estDepartement } from "../_shared/reseau-rpps.ts";
import { lancerFile, praticiensATraiter, traiterFile, type TypeFile } from "../_shared/file.ts";
import { VOLETS, type Volet } from "../_shared/liens.ts";
import { enTacheDeFond } from "../_shared/suivi.ts";

const TYPES: Record<string, TypeFile> = { liens: "google_departement", ia: "ia_departement" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { ...cors, "Access-Control-Allow-Headers": `${cors["Access-Control-Allow-Headers"]}, x-reseau-interne` } });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  const corps = await req.json().catch(() => ({}));
  const db = clientService();

  // Appel interne : poursuite de la file.
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (corps.action === "suite") {
    if (!service || req.headers.get("x-reseau-interne") !== service) return json({ error: "Refusé." }, 403);
    enTacheDeFond(traiterFile(db, String(corps.job_id ?? "")));
    return json({ ok: true }, 202);
  }

  const acces = await verifierAccesSante(req);
  if ("refus" in acces) return acces.refus;

  if (corps.action === "arreter") {
    const { data: j } = await db.from("admin_reseau_recherches_ia").select("id, statut, journal").eq("id", String(corps.job_id ?? "")).maybeSingle();
    if (!j) return json({ error: "Tâche introuvable." }, 404);
    if (j.statut !== "en_cours") return json({ error: "Cette tâche est déjà terminée." }, 409);
    const journal = [...(Array.isArray(j.journal) ? j.journal : []), { le: new Date().toISOString(), texte: `Arrêtée par ${acces.email}`, niveau: "ecarte" }].slice(-40);
    await db.from("admin_reseau_recherches_ia").update({ statut: "annule", fin: new Date().toISOString(), etape: "Arrêtée", journal }).eq("id", j.id);
    return json({ id: j.id });
  }

  const type = TYPES[String(corps.type ?? "")];
  const dep = String(corps.departement ?? "").toUpperCase();
  if (!type) return json({ error: "Type de travail inconnu." }, 400);
  if (!estDepartement(dep)) return json({ error: "Département inconnu." }, 400);
  if (type === "ia_departement" && !Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "La clé de l'IA n'est pas configurée sur le projet." }, 500);

  try {
    const volet: Volet = VOLETS.includes(corps.volet) ? corps.volet : "tout";
    const ids = await praticiensATraiter(db, type, dep, { inclureRecents: corps.inclure_recents === true, volet });
    if (corps.action === "estimer") return json({ total: ids.length });
    if (corps.action === "lancer") {
      const r = await lancerFile(db, type, dep, ids, acces.email, volet);
      if (!r) return json({ error: "Aucun praticien à traiter." }, 409);
      return json({ job_id: r.id, total: r.total, deja: r.deja }, 202);
    }
    return json({ error: "Action inconnue." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
