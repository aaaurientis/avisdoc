// Edge Function : ajoute un requérant DÉJÀ VALIDÉ, sans passer par le parcours
// (pour les infirmières validées avant la mise en place du process). L'inscription
// est créée directement « active ». Si les dates de fin RCP/URSSAF sont fournies,
// on crée les pièces correspondantes « validée » (éligibilité + échéances).
// Réservée aux comptes @avisdoc.fr.

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
  const adminEmail = u.user?.email ?? "";
  if (!adminEmail.toLowerCase().endsWith("@avisdoc.fr")) {
    return json({ error: "Réservé aux comptes @avisdoc.fr." }, 403);
  }

  const { nom, prenom, email, rpps, telephone, rcpDateFin, urssafDateFin } = await req.json().catch(() => ({}));
  if (!nom?.trim() || !prenom?.trim() || !email?.includes("@")) {
    return json({ error: "nom, prénom et e-mail requis." }, 400);
  }

  const admin = createClient(SB_URL, SERVICE);
  const now = new Date().toISOString();
  const { data: ins, error } = await admin
    .from("req_inscriptions")
    .insert({
      nom: nom.trim(),
      prenom: prenom.trim(),
      email: email.trim().toLowerCase(),
      rpps: rpps?.trim() || null,
      telephone: telephone?.trim() || null,
      etat: "active",
      derniere_action_le: now,
    })
    .select("id")
    .single();
  if (error) return json({ error: error.message }, 500);

  // Pièces « validée » pour l'éligibilité et le suivi des échéances (si fournies).
  const pieces: any[] = [];
  if (rcpDateFin) {
    pieces.push({ inscription_id: ins.id, type: "rcp", version: 1, etat: "validee", date_fin: rcpDateFin, controlee_le: now, controlee_par: adminEmail });
  }
  if (urssafDateFin) {
    pieces.push({ inscription_id: ins.id, type: "urssaf", version: 1, etat: "validee", date_fin: urssafDateFin, controlee_le: now, controlee_par: adminEmail });
  }
  if (pieces.length) await admin.from("req_pieces").insert(pieces);

  await admin.from("req_historique").insert({
    inscription_id: ins.id, acteur: adminEmail, action: "importee_validee",
    detail: { email: email.trim().toLowerCase(), rcp_date_fin: rcpDateFin ?? null, urssaf_date_fin: urssafDateFin ?? null },
  });

  return json({ id: ins.id });
});
