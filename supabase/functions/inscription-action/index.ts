// Edge Function : transition d'une inscription (suspendre / refuser / résilier,
// motif obligatoire ; réactiver, sans motif). Réservée aux comptes @avisdoc.fr.

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
  reactiver: "active",
  reinitialiser: "invitee",
};
// Actions sans motif obligatoire.
const SANS_MOTIF = new Set(["reactiver", "reinitialiser"]);

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
  if (!id || !etatCible) {
    return json({ error: "id et action (suspendre|refuser|resilier|reactiver|reinitialiser) requis." }, 400);
  }
  const sansMotif = SANS_MOTIF.has(action);
  if (!sansMotif && !motif?.trim()) return json({ error: "Motif obligatoire." }, 400);

  const admin = createClient(SB_URL, SERVICE);
  const { error } = await admin
    .from("req_inscriptions")
    .update({
      etat: etatCible,
      motif: sansMotif ? null : motif.trim(),
      derniere_action_le: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return json({ error: error.message }, 500);

  // Réinitialisation : on repart de zéro — les pièces déposées sont remplacées
  // pour que l'infirmière les redépose (l'identité et les infos sont conservées).
  if (action === "reinitialiser") {
    await admin.from("req_pieces").update({ etat: "remplacee" })
      .eq("inscription_id", id).in("etat", ["deposee", "validee", "refusee", "expiree"]);
  }

  await admin.from("req_historique").insert({
    inscription_id: id,
    acteur: adminEmail,
    action: `etat_${etatCible}`,
    detail: sansMotif ? {} : { motif: motif.trim() },
  });

  return json({ etat: etatCible });
});
