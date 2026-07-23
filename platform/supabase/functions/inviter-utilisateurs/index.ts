// Envoi des invitations (magic link) aux utilisateurs déclarés d'un client.
//
// Appelée depuis l'admin (validation humaine avant envoi, cf. cadrage §5.1).
// Garde-fous :
//   - l'appelant doit être un administrateur (table admins) ;
//   - seules les adresses relevant d'un domaine déclaré du client sont invitées ;
//   - utilise la clé service_role (jamais exposée au frontend).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CLIENT_APP_URL = Deno.env.get("CLIENT_APP_URL") ?? "https://client.avisdoc.fr";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";

  // 1) Vérifier que l'appelant est un administrateur (avec SON jeton + la RLS).
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await asUser.auth.getUser();
  if (!userData?.user) return json({ error: "non authentifié" }, 401);
  const { data: adminRow } = await asUser
    .from("admins").select("auth_user_id").eq("auth_user_id", userData.user.id).maybeSingle();
  if (!adminRow) return json({ error: "réservé aux administrateurs" }, 403);

  // 2) Charger le client, ses domaines et ses utilisateurs non encore invités.
  const { client_id } = await req.json().catch(() => ({}));
  if (!client_id) return json({ error: "client_id requis" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const [{ data: domaines }, { data: users }] = await Promise.all([
    admin.from("domaines").select("domaine").eq("client_id", client_id),
    admin.from("utilisateurs_client").select("*").eq("client_id", client_id).is("auth_user_id", null),
  ]);

  const domSet = new Set((domaines ?? []).map((d) => d.domaine.toLowerCase()));
  let invites = 0;
  const erreurs: string[] = [];

  for (const u of users ?? []) {
    const dom = (u.email.split("@")[1] ?? "").toLowerCase();
    if (!domSet.has(dom)) { erreurs.push(`${u.email} : domaine non déclaré`); continue; }

    const { data: created, error } = await admin.auth.admin.inviteUserByEmail(u.email, {
      redirectTo: CLIENT_APP_URL,
    });
    if (error) { erreurs.push(`${u.email} : ${error.message}`); continue; }

    await admin.from("utilisateurs_client")
      .update({ auth_user_id: created.user?.id ?? null, invite_le: new Date().toISOString() })
      .eq("id", u.id);
    invites++;
  }

  return json({ invites, erreurs });
});
