// Configuration du module de prospection.
// Projet Supabase VITRINE uniquement (VITE_SUPABASE_*). Les variables
// VITE_ADMIN_SUPABASE_* désignent le projet plateforme : jamais lues ici.

/** Domaine Google autorisé à se connecter. */
export const DOMAINE_AUTORISE = "avisdoc.fr";

export function estEmailAutorise(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith("@" + DOMAINE_AUTORISE);
}

/** Pages publiques du site vitrine référencées dans les emails. */
export const SITE_VITRINE = "https://www.avisdoc.fr";
export const URL_INFORMATION_PROSPECTION = `${SITE_VITRINE}/prospection-information`;
export function urlOpposition(jeton: string): string {
  return `${SITE_VITRINE}/prospection-opposition?jeton=${encodeURIComponent(jeton)}`;
}
