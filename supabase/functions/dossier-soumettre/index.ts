// Edge Function : soumission du dossier par le requérant. N'est possible que si
// TOUTES les informations de la fiche sont complètes, les détails RCP saisis
// (assureur, police, date de fin) et les 3 documents déposés. Fait passer le
// dossier en « pieces_a_valider » (écran « en cours de validation ») et reporte
// la date de fin RCP sur la pièce (pour les échéances). JWT requérant requis.

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(SB_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: u } = await asUser.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return json({ error: "non authentifié" }, 401);

  const admin = createClient(SB_URL, SERVICE);
  const { data: ins } = await admin
    .from("req_inscriptions").select("*").eq("auth_user_id", uid).maybeSingle();
  if (!ins) return json({ error: "Dossier introuvable." }, 404);
  if (!["invitee", "a_completer"].includes(ins.etat)) {
    return json({ error: "Dossier déjà soumis." }, 409);
  }

  // 1. Informations de la fiche complètes.
  if (!ins.infos_completes) return json({ error: "Complétez d'abord vos informations." }, 422);
  // 2. Détails RCP.
  if (!ins.rcp_assureur || !ins.rcp_police || !ins.rcp_date_fin) {
    return json({ error: "Renseignez l'assureur, le n° de police et la date de fin RCP." }, 422);
  }
  // 3. Les 3 documents déposés (dernière version non remplacée).
  const { data: pieces } = await admin
    .from("req_pieces").select("type, version, etat").eq("inscription_id", ins.id);
  const dernier: Record<string, { version: number; etat: string }> = {};
  for (const p of pieces ?? []) {
    if (!dernier[p.type] || p.version > dernier[p.type].version) dernier[p.type] = { version: p.version, etat: p.etat };
  }
  const present = (t: string) => dernier[t] && dernier[t].etat !== "remplacee";
  if (!present("identite") || !present("rcp") || !present("urssaf")) {
    return json({ error: "Déposez les 3 documents (identité, RCP, URSSAF)." }, 422);
  }

  // Reporte les détails RCP sur la dernière pièce RCP (pour contrôle + échéances).
  const { data: rcpPiece } = await admin
    .from("req_pieces").select("id").eq("inscription_id", ins.id).eq("type", "rcp")
    .order("version", { ascending: false }).limit(1).maybeSingle();
  if (rcpPiece) {
    await admin.from("req_pieces").update({
      assureur: ins.rcp_assureur, police: ins.rcp_police, date_fin: ins.rcp_date_fin,
    }).eq("id", rcpPiece.id);
  }

  await admin.from("req_inscriptions").update({
    etat: "pieces_a_valider", motif: null, derniere_action_le: new Date().toISOString(),
  }).eq("id", ins.id);
  await admin.from("req_historique").insert({
    inscription_id: ins.id, acteur: "requerant", action: "dossier_soumis",
  });

  return json({ ok: true });
});
