// Client Supabase de l'espace client (client.avisdoc.fr).
// Même projet que l'admin (wtovhzxymlqnfxyjxrdq) mais session isolée
// (storageKey distinct) : aucun conflit GoTrue avec l'admin.
import { createClient } from "@supabase/supabase-js";

const url =
  (import.meta.env.VITE_ADMIN_SUPABASE_URL as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_URL as string);
const key =
  (import.meta.env.VITE_ADMIN_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);

if (!url || !key) {
  throw new Error("VITE_ADMIN_SUPABASE_URL / VITE_ADMIN_SUPABASE_ANON_KEY manquants.");
}

export const supabase = createClient(url, key, {
  auth: {
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    storageKey: "avisdoc-client-auth",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Flux « implicit » (jetons dans le #hash) et non PKCE : indispensable pour
    // des liens magiques ouverts sur un autre appareil/navigateur que celui qui
    // les a demandés (invitation générée par l'admin, renvoi côté serveur).
    flowType: "implicit",
  },
});
