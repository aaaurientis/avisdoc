// Edge Function : transition d'une inscription avec motif obligatoire
// (suspendre / refuser / résilier). Réservée aux comptes @avisdoc.fr.

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

const CIBLE: Record<string, string> = {
  suspendre: "suspendue",
  refuser: "refusee",
  resilier: "resiliee",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(SB_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: u } = await asUser.auth.getUser();
  const adminEmail = u.user?.email ?? "";
  if (!adminEmail.toLowerCase().endsWith("@avisdoc.fr")) {
    return json({ error: "Réservé aux comptes @avisdoc.fr." }, 403);
  }

  const { id, action, motif } = await req.json().catch(() => ({}));
  const etatCible = CIBLE[action];
  if (!id || !etatCible) return json({ error: "id et action (suspendre|refuser|resilier) requis." }, 400);
  if (!motif?.trim()) return json({ error: "Motif obligatoire." }, 400);

  const admin = createClient(SB_URL, SERVICE);
  const { error } = await admin
    .from("req_inscriptions")
    .update({ etat: etatCible, motif: motif.trim(), derniere_action_le: new Date().toISOString() })
    .eq("id", id);
  if (error) return json({ error: error.message }, 500);

  await admin.from("req_historique").insert({
    inscription_id: id,
    acteur: adminEmail,
    action: `etat_${etatCible}`,
    detail: { motif: motif.trim() },
  });

  return json({ etat: etatCible });
});
