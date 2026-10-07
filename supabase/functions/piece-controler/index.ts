// Edge Function : contrôle d'une pièce (validation ou refus) + recalcul de l'état
// de l'inscription. Réservée aux comptes @avisdoc.fr (RI-04 à RI-06).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

// États où le recalcul peut faire avancer/reculer l'inscription (avant contrat).
const RECALCULABLES = [
  "identite_a_controler", "identite_verifiee", "pieces_a_valider",
  "a_completer", "pret_a_signer",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(SB_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: u } = await asUser.auth.getUser();
  const adminEmail = u.user?.email ?? "";
  if (!adminEmail.toLowerCase().endsWith("@avisdoc.fr")) {
    return json({ error: "Réservé aux comptes @avisdoc.fr." }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const { pieceId, decision } = body;
  if (!pieceId || (decision !== "valider" && decision !== "refuser")) {
    return json({ error: "pieceId et decision (valider|refuser) requis." }, 400);
  }

  const admin = createClient(SB_URL, SERVICE);
  const { data: piece, error: pErr } = await admin
    .from("req_pieces").select("*").eq("id", pieceId).maybeSingle();
  if (pErr) return json({ error: pErr.message }, 500);
  if (!piece) return json({ error: "Pièce introuvable." }, 404);

  // 1. Mise à jour de la pièce.
  const maj: Record<string, unknown> = {
    controlee_le: new Date().toISOString(),
    controlee_par: adminEmail,
  };
  if (decision === "refuser") {
    if (!body.motif) return json({ error: "Motif de refus requis." }, 400);
    maj.etat = "refusee";
    maj.motif = body.motif;
  } else {
    maj.etat = "validee";
    maj.motif = null;
    if (piece.type === "rcp") {
      if (!body.assureur || !body.police || !body.dateFin) {
        return json({ error: "Assureur, police et date de fin requis (RCP)." }, 400);
      }
      maj.assureur = body.assureur;
      maj.police = body.police;
      maj.date_fin = body.dateFin;
    } else if (piece.type === "urssaf") {
      if (!body.dateEmission || !body.codeUrssafVerifie) {
        return json({ error: "Date d'émission et code vérifié requis (URSSAF)." }, 400);
      }
      const fin = new Date(body.dateEmission);
      fin.setMonth(fin.getMonth() + 6); // RI-05 : validité = émission + 6 mois
      maj.date_emission = body.dateEmission;
      maj.code_urssaf_verifie = true;
      maj.date_fin = fin.toISOString().slice(0, 10);
    }
  }
  const upd = await admin.from("req_pieces").update(maj).eq("id", pieceId);
  if (upd.error) return json({ error: upd.error.message }, 500);

  await admin.from("req_historique").insert({
    inscription_id: piece.inscription_id,
    acteur: adminEmail,
    action: decision === "valider" ? "piece_validee" : "piece_refusee",
    piece_id: pieceId,
    detail: { type: piece.type, motif: body.motif ?? null },
  });

  // 2. Recalcul de l'état de l'inscription (seulement avant contrat).
  const { data: ins } = await admin
    .from("req_inscriptions").select("id, etat, identite_source").eq("id", piece.inscription_id).maybeSingle();
  let nouvelEtat = ins?.etat ?? null;
  if (ins && RECALCULABLES.includes(ins.etat)) {
    const { data: toutes } = await admin
      .from("req_pieces").select("type, version, etat").eq("inscription_id", piece.inscription_id);
    const dernier: Record<string, { version: number; etat: string }> = {};
    for (const p of toutes ?? []) {
      if (!dernier[p.type] || p.version > dernier[p.type].version) {
        dernier[p.type] = { version: p.version, etat: p.etat };
      }
    }
    const estValide = (t: string) => dernier[t]?.etat === "validee";
    const estRefuse = (t: string) => dernier[t]?.etat === "refusee";
    const estDepose = (t: string) => !!dernier[t] && dernier[t].etat !== "remplacee";

    const idOk = ins.identite_source === "psc" || estValide("identite");
    const anyRefuse = estRefuse("rcp") || estRefuse("urssaf") || estRefuse("identite");

    if (anyRefuse) nouvelEtat = "a_completer";
    else if (idOk && estValide("rcp") && estValide("urssaf")) nouvelEtat = "pret_a_signer";
    else if (idOk && (estDepose("rcp") || estDepose("urssaf"))) nouvelEtat = "pieces_a_valider";
    else if (idOk) nouvelEtat = "identite_verifiee";
    else nouvelEtat = "identite_a_controler";

    if (nouvelEtat !== ins.etat) {
      await admin
        .from("req_inscriptions")
        .update({ etat: nouvelEtat, derniere_action_le: new Date().toISOString() })
        .eq("id", ins.id);
      await admin.from("req_historique").insert({
        inscription_id: ins.id, acteur: "systeme", action: `etat_${nouvelEtat}`,
      });
    }
  }

  return json({ etat: nouvelEtat });
});
