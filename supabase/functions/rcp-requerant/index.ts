// Edge Function : le requérant saisit les détails de son assurance RCP
// (assureur, n° de police, date de fin). JWT requérant requis (son dossier).

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
const S = (v: unknown) => (typeof v === "string" ? v.trim() : "");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(SB_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: u } = await asUser.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return json({ error: "non authentifié" }, 401);

  const b = await req.json().catch(() => ({}));
  const assureur = S(b.assureur);
  const police = S(b.police);
  const dateFin = S(b.dateFin); // YYYY-MM-DD

  const admin = createClient(SB_URL, SERVICE);
  const { data: ins } = await admin
    .from("req_inscriptions").select("id").eq("auth_user_id", uid).maybeSingle();
  if (!ins) return json({ error: "Dossier introuvable." }, 404);

  const { error } = await admin.from("req_inscriptions").update({
    rcp_assureur: assureur || null,
    rcp_police: police || null,
    rcp_date_fin: dateFin || null,
    derniere_action_le: new Date().toISOString(),
  }).eq("id", ins.id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
});
