// Vérification de l'appelant : membre @avisdoc.fr (JWT utilisateur) ou
// planificateur (secret partagé). Aucune donnée du projet plateforme ici.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

/** Client service sur le schéma prospection (les RPC vérifient le rôle service_role). */
export function clientService() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { db: { schema: "prospection" }, auth: { persistSession: false } });
}

/** Email du membre @avisdoc.fr appelant, ou null. */
export async function membreAppelant(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return null;
  const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data } = await asUser.auth.getUser();
  const email = (data?.user?.email ?? "").toLowerCase();
  return email.endsWith("@avisdoc.fr") ? email : null;
}

/** Appel du planificateur (cron) avec le secret partagé PROSPECTION_CRON_SECRET. */
export function appelPlanificateur(req: Request): boolean {
  const attendu = Deno.env.get("PROSPECTION_CRON_SECRET") ?? "";
  return attendu.length > 0 && req.headers.get("x-secret") === attendu;
}
