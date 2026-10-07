// Edge Function : l'infirmière dépose une pièce (RCP ou URSSAF). Crée une
// nouvelle version et renvoie une URL d'upload signée (bucket privé req-pieces).

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

  const { type, filename } = await req.json().catch(() => ({}));
  if (type !== "rcp" && type !== "urssaf") return json({ error: "type invalide (rcp|urssaf)." }, 400);

  const admin = createClient(SB_URL, SERVICE);
  const { data: ins } = await admin
    .from("req_inscriptions").select("id, etat").eq("auth_user_id", uid).maybeSingle();
  if (!ins) return json({ error: "Dossier introuvable." }, 404);

  const { data: existing } = await admin
    .from("req_pieces").select("version").eq("inscription_id", ins.id).eq("type", type);
  const version = (existing ?? []).reduce((m: number, p: any) => Math.max(m, p.version ?? 0), 0) + 1;
  await admin.from("req_pieces").update({ etat: "remplacee" })
    .eq("inscription_id", ins.id).eq("type", type).eq("etat", "deposee");

  const path = `${ins.id}/${type}/v${version}-${safeName(filename)}`;
  const { data: pieceRow, error: insErr } = await admin.from("req_pieces").insert({
    inscription_id: ins.id, type, version, etat: "deposee", storage_path: path,
  }).select("id").single();
  if (insErr) return json({ error: insErr.message }, 500);

  // Une pièce vient d'arriver : il y a de nouveau quelque chose à valider.
  if (["identite_verifiee", "pieces_a_valider", "a_completer"].includes(ins.etat)) {
    await admin.from("req_inscriptions").update({
      etat: "pieces_a_valider", derniere_action_le: new Date().toISOString(),
    }).eq("id", ins.id);
  }
  await admin.from("req_historique").insert({
    inscription_id: ins.id, acteur: "infirmiere", action: "piece_deposee", piece_id: pieceRow.id, detail: { type },
  });

  const { data: signed, error: sErr } = await admin.storage.from("req-pieces").createSignedUploadUrl(path);
  if (sErr) return json({ error: sErr.message }, 500);
  return json({ bucket: "req-pieces", path, token: signed.token, pieceId: pieceRow.id });
});
