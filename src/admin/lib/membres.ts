// Qui travaille chez AvisDoc, pour désigner un référent.
//
// La table des droits ne se lit que par soi-même ou par le super-admin : on passe
// donc par la vue `admin_membres`, qui n'expose que les adresses (migration 0039).
//
// La liste ne change pas en cours de journée : on la lit une fois et on la garde.

import { supabaseAdmin } from "../data/supabaseAdmin";

/** « irene.lefondre@avisdoc.fr » → « Irène Lefondre » n'est pas devinable ; on se
 *  contente de rendre lisible ce qu'on a, sans inventer d'orthographe. */
export function nomLisible(email: string | null | undefined): string {
  if (!email) return "—";
  const avant = email.split("@")[0];
  return avant
    .split(/[._-]+/)
    .filter(Boolean)
    .map((m) => m.charAt(0).toUpperCase() + m.slice(1))
    .join(" ");
}

let cache: string[] | null = null;
let enCours: Promise<string[]> | null = null;

/** Les adresses de l'équipe, triées. Lues une seule fois par session. */
export function chargerMembres(): Promise<string[]> {
  if (cache) return Promise.resolve(cache);
  if (enCours) return enCours;
  enCours = (async () => {
    const { data, error } = await supabaseAdmin.from("admin_membres").select("email").order("email");
    // Tant que la migration 0039 n'est pas collée, la vue n'existe pas : on rend une
    // liste vide plutôt que de casser l'écran, et le champ se contente de l'existant.
    if (error) {
      enCours = null;
      return [];
    }
    cache = (data ?? []).map((m) => m.email as string);
    return cache;
  })();
  return enCours;
}
