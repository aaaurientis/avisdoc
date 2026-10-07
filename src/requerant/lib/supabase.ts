// Client Supabase du portail infirmières (requerant.avisdoc.fr).
// Même projet que l'admin, session isolée (storageKey distinct) ; flux implicit
// pour que les liens magiques ouverts sur un autre appareil fonctionnent.
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
    storageKey: "avisdoc-requerant-auth",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "implicit",
  },
});
