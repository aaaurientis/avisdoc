// Edge Function : rattache le compte connecté (infirmière) à son inscription,
// via le token du lien d'invitation. Vérifie token + e-mail + expiration.

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
  const email = (u.user?.email ?? "").toLowerCase();
  if (!uid) return json({ error: "non authentifié" }, 401);

  const { token } = await req.json().catch(() => ({}));
  if (!token) return json({ error: "token requis" }, 400);

  const admin = createClient(SB_URL, SERVICE);
  const { data: ins } = await admin
    .from("req_inscriptions")
    .select("id, email, auth_user_id, invite_expire_le")
    .eq("invite_token", token)
    .maybeSingle();
  if (!ins) return json({ error: "Lien invalide." }, 404);
  if (ins.invite_expire_le && new Date(ins.invite_expire_le).getTime() < Date.now()) {
    return json({ error: "Lien expiré." }, 410);
  }
  if ((ins.email ?? "").toLowerCase() !== email) {
    return json({ error: "Ce lien ne correspond pas à votre adresse e-mail." }, 403);
  }
  if (ins.auth_user_id && ins.auth_user_id !== uid) {
    return json({ error: "Dossier déjà rattaché à un autre compte." }, 409);
  }

  if (ins.auth_user_id !== uid) {
    const { error } = await admin
      .from("req_inscriptions")
      .update({ auth_user_id: uid, derniere_action_le: new Date().toISOString() })
      .eq("id", ins.id);
    if (error) return json({ error: error.message }, 500);
    await admin.from("req_historique").insert({
      inscription_id: ins.id, acteur: "infirmiere", action: "compte_rattache",
    });
  }

  return json({ ok: true });
});
