// Client Supabase dédié au back-office.
//
// Le back-office a son PROPRE projet Supabase (séparé de celui du site vitrine).
// On lit en priorité les variables dédiées ADMIN ; à défaut (les deux doivent
// être présentes ensemble), on retombe sur les variables partagées du site.
//
// - Client distinct (page admin.html séparée) → pas de conflit GoTrue ; storageKey propre.
// - flowType "pkce" : le retour OAuth arrive en `?code=` (query) et non dans le
//   hash → aucun conflit avec le HashRouter.
// - Non typé sur `Database` : les requêtes .from('admin_*') sont autorisées.

import { createClient } from "@supabase/supabase-js";

const ADMIN_URL = import.meta.env.VITE_ADMIN_SUPABASE_URL as string | undefined;
const ADMIN_KEY = import.meta.env.VITE_ADMIN_SUPABASE_ANON_KEY as string | undefined;

// Les deux variables ADMIN doivent être définies ensemble, sinon on utilise
// celles du site (évite un mélange URL projet A / clé projet B).
const useAdmin = Boolean(ADMIN_URL && ADMIN_KEY);

const SUPABASE_URL = (useAdmin ? ADMIN_URL : import.meta.env.VITE_SUPABASE_URL) as string;
const SUPABASE_KEY = (useAdmin
  ? ADMIN_KEY
  : import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string;

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    storageKey: "avisdoc-admin-auth",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});
