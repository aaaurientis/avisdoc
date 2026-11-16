// Edge Function : gestion des clés du connecteur MCP (Admin). Réservé au droit « admin ».
//   • creer    { nom }  → { id, cle } — la clé n'est renvoyée qu'ici, une seule fois
//   • revoquer { id }
// La liste se lit directement (table admin_mcp_cles, lecture « admin »).
// Déploiement : supabase functions deploy mcp-cles

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { clientService, cors, json } from "../_shared/acces-sante.ts";
import { empreinteCle, nouvelleCle } from "../_shared/mcp-cle.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: u } = await asUser.auth.getUser();
  const email = (u.user?.email ?? "").toLowerCase();
  if (!email) return json({ error: "Votre session a expiré : reconnectez-vous." }, 401);
  if (!email.endsWith("@avisdoc.fr")) return json({ error: "Réservé aux comptes @avisdoc.fr." }, 403);
  const { data: ok } = await asUser.rpc("a_le_module", { m: "admin" });
  if (ok !== true) return json({ error: "Réservé au droit « Admin »." }, 403);

  const corps = await req.json().catch(() => ({}));
  const db = clientService();
  if (corps.action === "creer") {
    const nom = String(corps.nom ?? "").trim().slice(0, 80);
    if (!nom) return json({ error: "Donnez un nom à la clé (par exemple « Cowork Arthur »)." }, 400);
    const cle = nouvelleCle();
    const { data, error } = await db.from("admin_mcp_cles")
      .insert({ nom, empreinte: await empreinteCle(cle), debut: cle.slice(0, 10), cree_par: email }).select("id").single();
    if (error) return json({ error: error.message }, 500);
    return json({ id: data.id, cle });
  }
  if (corps.action === "revoquer") {
    const { error } = await db.from("admin_mcp_cles")
      .update({ revoquee_le: new Date().toISOString(), revoquee_par: email }).eq("id", String(corps.id ?? "")).is("revoquee_le", null);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }
  return json({ error: "Action inconnue." }, 400);
});
