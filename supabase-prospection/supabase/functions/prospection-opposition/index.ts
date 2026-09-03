// Droit d'opposition : lien présent dans chaque email de prospection
// (https://www.avisdoc.fr/prospection-opposition?jeton=…). Public, sans compte.
// Le jeton est un UUID opaque propre au contact ; il alimente la table
// exclusion (définitive, bloquante à l'import) et supprime la fiche.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { clientService, cors, json } from "../_shared/auth.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  let jeton = "";
  if (req.method === "GET") {
    jeton = new URL(req.url).searchParams.get("jeton") ?? "";
  } else if (req.method === "POST") {
    jeton = ((await req.json().catch(() => ({}))) as { jeton?: string }).jeton ?? "";
  } else {
    return json({ error: "méthode non autorisée" }, 405);
  }
  if (!UUID.test(jeton)) return json({ error: "jeton invalide" }, 400);

  const { data, error } = await clientService().rpc("opposition", { p_jeton: jeton });
  if (error) return json({ error: error.message }, 500);
  // data = false : jeton inconnu (fiche déjà supprimée ou purgée). Réponse
  // neutre : l'opposition est de toute façon effective.
  return json({ ok: true, connu: data === true });
});
