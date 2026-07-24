// Invitations / renvois de lien pour l'espace client (fusion).
// Appelée depuis le back-office admin. Garde-fous :
//   - l'appelant doit être un compte @avisdoc.fr (comme la RLS admin) ;
//   - seules les adresses relevant d'un domaine déclaré sont invitées ;
//   - clé service_role (jamais exposée au frontend).
//
// Corps accepté :
//   { client_id }            → (re)envoie un lien à TOUS les utilisateurs déclarés
//   { client_id, user_id }   → (re)envoie un lien à UN seul utilisateur
//
// Un lien peut être renvoyé à tout moment :
//   - utilisateur pas encore inscrit → invitation (crée le compte + e-mail) ;
//   - utilisateur déjà inscrit        → magic link (nouveau lien de connexion).
// Tables : admin_client_domaines, admin_client_espace_users.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

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

interface EspaceUser {
  id: string;
  email: string;
  auth_user_id: string | null;
}

// Envoie (ou renvoie) un lien de connexion à un utilisateur.
// Renvoie true si un e-mail est parti, false sinon (erreur poussée dans `erreurs`).
async function envoyerLien(
  admin: SupabaseClient,
  pub: SupabaseClient,
  user: EspaceUser,
  domSet: Set<string>,
  erreurs: string[],
): Promise<boolean> {
  const dom = (user.email.split("@")[1] ?? "").toLowerCase();
  if (!domSet.has(dom)) {
    erreurs.push(`${user.email} : domaine non déclaré`);
    return false;
  }

  // Renvoie un magic link à un compte déjà rattaché.
  const magicLink = async (): Promise<boolean> => {
    const { error } = await pub.auth.signInWithOtp({
      email: user.email,
      options: { emailRedirectTo: CLIENT_APP_URL, shouldCreateUser: false },
    });
    if (error) {
      erreurs.push(`${user.email} : ${error.message}`);
      return false;
    }
    await admin.from("admin_client_espace_users")
      .update({ invite_le: new Date().toISOString() }).eq("id", user.id);
    return true;
  };

  if (user.auth_user_id) return magicLink();

  // Première fois : invitation (crée le compte et envoie l'e-mail).
  const { data: created, error } = await admin.auth.admin.inviteUserByEmail(user.email, {
    redirectTo: CLIENT_APP_URL,
  });
  if (error) {
    // Compte déjà existant (créé hors invitation) → bascule en magic link.
    return magicLink();
  }
  await admin.from("admin_client_espace_users")
    .update({ auth_user_id: created.user?.id ?? null, invite_le: new Date().toISOString() })
    .eq("id", user.id);
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const asUser = createClient(URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: u } = await asUser.auth.getUser();
  if (!u?.user) return json({ error: "non authentifié" }, 401);
  if (!(u.user.email ?? "").toLowerCase().endsWith("@avisdoc.fr"))
    return json({ error: "réservé aux comptes @avisdoc.fr" }, 403);

  const { client_id, user_id } = await req.json().catch(() => ({}));
  if (!client_id) return json({ error: "client_id requis" }, 400);

  const admin = createClient(URL, SERVICE);
  const pub = createClient(URL, ANON); // pour signInWithOtp (envoi magic link)

  let q = admin.from("admin_client_espace_users")
    .select("id, email, auth_user_id").eq("client_id", client_id);
  if (user_id) q = q.eq("id", user_id); // renvoi ciblé sur un seul utilisateur
  const [{ data: domaines }, { data: users }] = await Promise.all([
    admin.from("admin_client_domaines").select("domaine").eq("client_id", client_id),
    q,
  ]);

  const domSet = new Set((domaines ?? []).map((d) => d.domaine.toLowerCase()));
  const erreurs: string[] = [];
  let invites = 0;

  for (const user of (users ?? []) as EspaceUser[]) {
    if (await envoyerLien(admin, pub, user, domSet, erreurs)) invites++;
  }
  return json({ invites, erreurs });
});
