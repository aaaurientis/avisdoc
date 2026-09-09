// Edge Function : fournit la clé Google Maps au front (carte des contacts).
//
// La clé reste gérée comme un secret Supabase (GOOGLE_MAPS_KEY) plutôt que
// commitée dans le dépôt. Elle est renvoyée uniquement à un utilisateur
// authentifié du domaine @avisdoc.fr (verify_jwt=true + contrôle ci-dessous).
//
// NB : une clé Maps JavaScript est de toute façon visible dans le navigateur ;
// sa vraie protection est la restriction par référent HTTP (admin.avisdoc.fr)
// configurée dans la console Google Cloud.
//
// Déploiement :
//   supabase functions deploy maps-cle
//   supabase secrets set GOOGLE_MAPS_KEY=xxxxxxxx

/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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

    const key = Deno.env.get("GOOGLE_MAPS_KEY") ?? "";
    return json({ key });
  } catch (e) {
    console.error(e);
    return json({ error: (e as any)?.message ?? "Erreur interne." }, 500);
  }
});
