// Edge Function : voie de secours — l'infirmière saisit son RPPS et dépose sa
// pièce d'identité. Renvoie une URL d'upload signée (bucket privé req-identite).

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

function safeName(n: string): string {
  return (n || "fichier").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(SB_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: u } = await asUser.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return json({ error: "non authentifié" }, 401);

  const { rpps, filename } = await req.json().catch(() => ({}));
  if (!rpps?.trim()) return json({ error: "RPPS requis." }, 400);

  const admin = createClient(SB_URL, SERVICE);
  const { data: ins } = await admin
    .from("req_inscriptions").select("id, etat").eq("auth_user_id", uid).maybeSingle();
  if (!ins) return json({ error: "Dossier introuvable." }, 404);

  // Version suivante de la pièce d'identité ; anciennes versions « déposées » remplacées.
  const { data: existing } = await admin
    .from("req_pieces").select("version").eq("inscription_id", ins.id).eq("type", "identite");
  const version = (existing ?? []).reduce((m: number, p: any) => Math.max(m, p.version ?? 0), 0) + 1;
  await admin.from("req_pieces").update({ etat: "remplacee" })
    .eq("inscription_id", ins.id).eq("type", "identite").eq("etat", "deposee");

  const path = `${ins.id}/identite/v${version}-${safeName(filename)}`;
  const { data: pieceRow, error: insErr } = await admin.from("req_pieces").insert({
    inscription_id: ins.id, type: "identite", version, etat: "deposee", storage_path: path,
  }).select("id").single();
  if (insErr) return json({ error: insErr.message }, 500);

  // Les 3 documents se déposent ensemble : l'inscription passe en « pièces à
  // valider » (état unifié), le contrôle de l'identité se fait côté admin.
  const PRE_CONTRAT = ["invitee", "identite_a_controler", "identite_verifiee", "pieces_a_valider", "a_completer", "suspendue"];
  const nouvelEtat = PRE_CONTRAT.includes(ins.etat) ? "pieces_a_valider" : ins.etat;
  await admin.from("req_inscriptions").update({
    rpps: rpps.trim(), identite_source: "secours", etat: nouvelEtat,
    derniere_action_le: new Date().toISOString(),
  }).eq("id", ins.id);
  await admin.from("req_historique").insert({
    inscription_id: ins.id, acteur: "requerant", action: "identite_deposee", piece_id: pieceRow.id,
  });

  const { data: signed, error: sErr } = await admin.storage.from("req-identite").createSignedUploadUrl(path);
  if (sErr) return json({ error: sErr.message }, 500);
  return json({ bucket: "req-identite", path, token: signed.token, pieceId: pieceRow.id });
});
