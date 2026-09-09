// Configuration du back-office via variables d'environnement Vite.
//
// Par défaut, l'admin tourne en mode « démo » 100 % front (données en mémoire,
// login simulé) — utile pour développer/valider l'UI sans backend.
//
// Pour brancher le vrai backend Supabase, définir dans .env :
//   VITE_ADMIN_BACKEND=supabase      # active la persistance Postgres/Storage
//   VITE_ADMIN_AUTH=supabase         # active le vrai SSO Google (@avisdoc.fr)
//
// (les variables VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY existantes
//  sont réutilisées — voir docs/admin-app.md)

export const ADMIN_BACKEND: "mock" | "supabase" =
  import.meta.env.VITE_ADMIN_BACKEND === "supabase" ? "supabase" : "mock";

export const ADMIN_AUTH: "demo" | "supabase" =
  import.meta.env.VITE_ADMIN_AUTH === "supabase" ? "supabase" : "demo";

/** Domaine Google autorisé à se connecter. */
export const ALLOWED_DOMAIN = "avisdoc.fr";

/**
 * Clé API Google Maps JavaScript (visualisation cartographique des contacts).
 * Clé publique côté front : la restreindre par référent HTTP (admin.avisdoc.fr)
 * dans la console Google Cloud. Vide → la carte affiche un message de config.
 */
export const GOOGLE_MAPS_KEY: string = import.meta.env.VITE_GOOGLE_MAPS_KEY ?? "";

/** true si l'email appartient au domaine autorisé. */
export function isAllowedEmail(email: string | undefined | null): boolean {
  return !!email && email.toLowerCase().endsWith("@" + ALLOWED_DOMAIN);
}
