// Edge Function : recherche entreprise via l'API Pappers.
//
// La clé API Pappers reste côté serveur (secret PAPPERS_API_KEY) — jamais
// exposée au navigateur. La fonction exige un utilisateur authentifié du
// domaine @avisdoc.fr (verify_jwt=true + contrôle du domaine ci-dessous).
//
// Déploiement :
//   supabase functions deploy pappers-search
//   supabase secrets set PAPPERS_API_KEY=xxxxxxxx

/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface PappersResult {
  company: string;
  siren: string;
  siret: string;
  naf: string;
  adresse: string;
  effectif: string;
  dirigeant: string;
}

function mapResult(r: Record<string, any>): PappersResult {
  const siege = r.siege ?? {};
  const adresse = [
    siege.adresse_ligne_1,
    [siege.code_postal, siege.ville].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  const rep = Array.isArray(r.representants) ? r.representants[0] : undefined;
  const dirigeant = rep
    ? `${rep.nom_complet ?? [rep.prenom, rep.nom].filter(Boolean).join(" ")}${
        rep.qualite ? ` (${rep.qualite})` : ""
      }`
    : "—";

  return {
    company: r.nom_entreprise ?? r.denomination ?? r.nom ?? "",
    siren: r.siren_formate ?? r.siren ?? "",
    siret: (siege.siret ?? siege.siret_formate ?? r.siret_siege ?? "").replace(/\s/g, ""),
    naf: [r.code_naf, r.libelle_code_naf].filter(Boolean).join(" — "),
    adresse,
    effectif: r.tranche_effectif ?? r.effectif ?? "—",
    dirigeant,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Contrôle du domaine à partir du JWT de l'appelant.
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email ?? "";
    if (!email.toLowerCase().endsWith("@avisdoc.fr")) {
      return json({ error: "Accès réservé aux comptes @avisdoc.fr." }, 403);
    }

    const { query } = await req.json();
    if (!query || typeof query !== "string" || !query.trim()) {
      return json({ error: "Requête vide." }, 400);
    }

    const apiKey = Deno.env.get("PAPPERS_API_KEY");
    if (!apiKey) {
      return json({ error: "PAPPERS_API_KEY non configurée." }, 500);
    }

    const url = new URL("https://api.pappers.fr/v2/recherche");
    url.searchParams.set("api_token", apiKey);
    url.searchParams.set("q", query.trim());
    url.searchParams.set("par_page", "1");
    url.searchParams.set("precision", "elevee");

    const res = await fetch(url.toString());
    if (!res.ok) {
      return json({ error: `Pappers a répondu ${res.status}.` }, 502);
    }
    const data = await res.json();
    const first = Array.isArray(data.resultats) ? data.resultats[0] : undefined;
    if (!first) {
      return json({ error: "Aucune entreprise trouvée." }, 404);
    }

    return json(mapResult(first));
  } catch (e) {
    console.error(e);
    return json({ error: "Erreur interne." }, 500);
  }
});
