// Edge Function : l'infirmière enregistre/corrige ses informations personnelles
// (reprises de l'annuaire à l'invitation, complétées à l'étape 1). Servent à
// préremplir le contrat. JWT infirmière requis (met à jour SON dossier).

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
  const civilite = S(b.civilite);
  const prenom = S(b.prenom);
  const nom = S(b.nom);
  const profession = S(b.profession);
  const adresse = S(b.adresse);
  const codePostal = S(b.codePostal);
  const ville = S(b.ville);
  const rpps = S(b.rpps);
  const dateNaissance = S(b.dateNaissance); // YYYY-MM-DD
  const lieuNaissance = S(b.lieuNaissance);

  const admin = createClient(SB_URL, SERVICE);
  const { data: ins } = await admin
    .from("req_inscriptions").select("id").eq("auth_user_id", uid).maybeSingle();
  if (!ins) return json({ error: "Dossier introuvable." }, 404);

  // Complet = tous les champs nécessaires au contrat sont renseignés.
  const completes = !!(civilite && prenom && nom && profession && adresse && rpps && dateNaissance && lieuNaissance);

  const maj: Record<string, unknown> = {
    civilite: civilite || null,
    prenom: prenom || undefined,
    nom: nom || undefined,
    profession: profession || null,
    adresse: adresse || null,
    code_postal: codePostal || null,
    ville: ville || null,
    lieu_naissance: lieuNaissance || null,
    date_naissance: dateNaissance || null,
    infos_completes: completes,
    derniere_action_le: new Date().toISOString(),
  };
  if (rpps) maj.rpps = rpps;
  // Ne pas écraser prénom/nom avec du vide.
  if (!prenom) delete maj.prenom;
  if (!nom) delete maj.nom;

  const { error } = await admin.from("req_inscriptions").update(maj).eq("id", ins.id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, infosCompletes: completes });
});
