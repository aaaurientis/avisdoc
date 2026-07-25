// Suppression complète d'un client (fusion).
// Appelée depuis le back-office admin. Garde-fous :
//   - l'appelant doit être un compte @avisdoc.fr ;
//   - clé service_role (jamais exposée au frontend).
//
// La base se nettoie seule : toutes les tables enfant (CRM contacts/docs/suivis
// + espace domaines/users/generated_docs/jobs) sont en ON DELETE CASCADE vers
// admin_clients. Reste le Storage, non couvert par la cascade : on vide le
// dossier <client_id>/ des trois buckets d'espace avant de supprimer la ligne.
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
const BUCKETS = ["espace-logos", "espace-docs-public", "espace-docs-client"];

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

  // 1. Vider le Storage (dossier <client_id>/ dans chaque bucket).
  const fichiers: Record<string, number> = {};
  for (const bucket of BUCKETS) {
    const { data: liste } = await admin.storage.from(bucket).list(client_id, { limit: 1000 });
    const paths = (liste ?? []).map((f) => `${client_id}/${f.name}`);
    if (paths.length) {
      await admin.storage.from(bucket).remove(paths);
      fichiers[bucket] = paths.length;
    }
  }

  // 2. Supprimer la ligne client → cascade sur toute la base.
  const { error } = await admin.from("admin_clients").delete().eq("id", client_id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, fichiers });
});
