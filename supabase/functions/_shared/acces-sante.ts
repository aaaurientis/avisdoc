// Contrôle d'accès commun aux fonctions du réseau d'aval : compte @avisdoc.fr ET
// module « Professionnels de Santé » (droit `sante`), vérifié par la base elle-même.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

/** Renvoie l'e-mail de l'utilisateur autorisé, ou une réponse d'erreur à renvoyer telle quelle. */
export async function verifierAccesSante(req: Request): Promise<{ email: string } | { refus: Response }> {
  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: u } = await asUser.auth.getUser();
  const email = (u.user?.email ?? "").toLowerCase();
  if (!email) return { refus: json({ error: "Votre session a expiré : reconnectez-vous." }, 401) };
  if (!email.endsWith("@avisdoc.fr")) return { refus: json({ error: "Réservé aux comptes @avisdoc.fr." }, 403) };
  const { data: ok, error } = await asUser.rpc("a_le_module", { m: "sante" });
  if (error || ok !== true) {
    return { refus: json({ error: "Votre compte n'a pas le droit « Professionnels de Santé »." }, 403) };
  }
  return { email };
}

export function clientService() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

/** Découpe une liste pour les filtres `in` (évite des URL trop longues). */
export function paquets<T>(liste: T[], taille = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < liste.length; i += taille) out.push(liste.slice(i, i + taille));
  return out;
}
