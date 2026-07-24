// Invitations des utilisateurs de l'espace client (fusion).
// Appelée depuis le back-office admin. Garde-fous :
//   - l'appelant doit être un compte @avisdoc.fr (comme la RLS admin) ;
//   - seules les adresses relevant d'un domaine déclaré sont invitées ;
//   - clé service_role (jamais exposée au frontend).
// Tables : admin_client_domaines, admin_client_espace_users.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const CLIENT_APP_URL = Deno.env.get("CLIENT_APP_URL") ?? "https://client.avisdoc.fr";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const asUser = createClient(URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: u } = await asUser.auth.getUser();
  if (!u?.user) return json({ error: "non authentifié" }, 401);
  if (!(u.user.email ?? "").toLowerCase().endsWith("@avisdoc.fr"))
    return json({ error: "réservé aux comptes @avisdoc.fr" }, 403);

  const { client_id } = await req.json().catch(() => ({}));
  if (!client_id) return json({ error: "client_id requis" }, 400);

  const admin = createClient(URL, SERVICE);
  const [{ data: domaines }, { data: users }] = await Promise.all([
    admin.from("admin_client_domaines").select("domaine").eq("client_id", client_id),
    admin.from("admin_client_espace_users").select("*").eq("client_id", client_id).is("auth_user_id", null),
  ]);

  const domSet = new Set((domaines ?? []).map((d) => d.domaine.toLowerCase()));
  let invites = 0;
  const erreurs: string[] = [];

  for (const user of users ?? []) {
    const dom = (user.email.split("@")[1] ?? "").toLowerCase();
    if (!domSet.has(dom)) { erreurs.push(`${user.email} : domaine non déclaré`); continue; }
    const { data: created, error } = await admin.auth.admin.inviteUserByEmail(user.email, {
      redirectTo: CLIENT_APP_URL,
    });
    if (error) { erreurs.push(`${user.email} : ${error.message}`); continue; }
    await admin.from("admin_client_espace_users")
      .update({ auth_user_id: created.user?.id ?? null, invite_le: new Date().toISOString() })
      .eq("id", user.id);
    invites++;
  }
  return json({ invites, erreurs });
});
