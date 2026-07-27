// Edge Function : recherche de professionnels de santé dans l'Annuaire Santé
// (base officielle ANS/RPPS, API FHIR). La clé API reste côté serveur
// (secret ANNUAIRE_SANTE_API_KEY) — réservé aux comptes @avisdoc.fr.
//
// Clé gratuite : portail API e-santé (gateway.api.esante.gouv.fr) →
// souscrire à « Annuaire Santé en libre accès ».
//
// Déploiement :
//   supabase functions deploy annuaire-sante
//   supabase secrets set ANNUAIRE_SANTE_API_KEY=xxxxxxxx
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// v2 = version courante de l'API FHIR Annuaire Santé (libre accès).
const BASE = (Deno.env.get("ANNUAIRE_SANTE_BASE") ?? "https://gateway.api.esante.gouv.fr/fhir/v2").replace(/\/$/, "");
const KEY = (Deno.env.get("ANNUAIRE_SANTE_API_KEY") ?? "").trim();

// Fiche compacte extraite d'une ressource FHIR Practitioner.
function mapPractitioner(p: Record<string, any>) {
  const nom0 = Array.isArray(p.name) ? p.name[0] ?? {} : {};
  const prenom = Array.isArray(nom0.given) ? nom0.given.filter(Boolean).join(" ") : "";
  const prefixe = Array.isArray(nom0.prefix) ? nom0.prefix[0] ?? "" : "";
  const rpps = (Array.isArray(p.identifier) ? p.identifier : [])
    .map((i: any) => String(i?.value ?? ""))
    .find((v: string) => /^\d{9,11}$/.test(v)) ?? null;
  // Profession / qualification : premier libellé disponible.
  const profession = (Array.isArray(p.qualification) ? p.qualification : [])
    .flatMap((q: any) => q?.code?.coding ?? [])
    .map((c: any) => c?.display)
    .find(Boolean) ?? "";
  const adr = Array.isArray(p.address) ? p.address[0] ?? {} : {};
  return {
    id: p.id ?? rpps ?? crypto.randomUUID(),
    nom: [prefixe, prenom, nom0.family].filter(Boolean).join(" ").trim() || "—",
    prenom,
    famille: nom0.family ?? "",
    rpps,
    profession,
    adresse: Array.isArray(adr.line) ? adr.line.filter(Boolean).join(", ") : "",
    code_postal: adr.postalCode ?? "",
    ville: adr.city ?? "",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    // Réservé aux admins @avisdoc.fr (comme pappers-search).
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email ?? "";
    if (!email.toLowerCase().endsWith("@avisdoc.fr"))
      return json({ error: "Accès réservé aux comptes @avisdoc.fr." }, 403);

    if (!KEY) return json({ error: "ANNUAIRE_SANTE_API_KEY non configurée." }, 500);

    const { query } = await req.json().catch(() => ({}));
    const q = String(query ?? "").trim();
    if (!q) return json({ error: "Requête vide." }, 400);

    // N° RPPS (9-11 chiffres) → recherche par identifiant ; sinon par nom
    // (« nom » ou « prénom nom » : le dernier mot = nom de famille).
    const digits = q.replace(/\D/g, "");
    const url = new URL(`${BASE}/Practitioner`);
    if (digits.length >= 9 && digits.length <= 11 && /^[\d\s]+$/.test(q)) {
      url.searchParams.set("identifier", digits);
    } else {
      const mots = q.split(/\s+/).filter(Boolean);
      const famille = mots[mots.length - 1];
      url.searchParams.set("family", famille);
      if (mots.length > 1) url.searchParams.set("given", mots.slice(0, -1).join(" "));
    }
    url.searchParams.set("_count", "15");

    const res = await fetch(url.toString(), {
      headers: { "ESANTE-API-KEY": KEY, Accept: "application/fhir+json" },
    });
    if (!res.ok) {
      const corps = await res.text();
      return json({ error: `Annuaire Santé a répondu ${res.status}.`, details: corps.slice(0, 300) }, 502);
    }
    const bundle = await res.json();
    const resultats = (Array.isArray(bundle?.entry) ? bundle.entry : [])
      .map((e: any) => e?.resource)
      .filter((r: any) => r?.resourceType === "Practitioner")
      .map(mapPractitioner);

    return json({ resultats, total: bundle?.total ?? resultats.length });
  } catch (e) {
    console.error(e);
    return json({ error: "Erreur interne." }, 500);
  }
});
