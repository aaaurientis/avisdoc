// Les demandes qu'on peut adresser à Merx depuis une fiche, où qu'elle soit.
//
// Prospection et Pipeline s'en servent tous les deux : une affaire ne perd pas
// l'accès à Merx en changeant d'écran.

import { supabaseAdmin } from "../data/supabaseAdmin";

export interface BrouillonRendu {
  objet: string;
  corps: string;
  destinataire: string | null;
}

async function appeler<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseAdmin.functions.invoke("merx", { body });
  if (error) throw new Error(error.message);
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

/** Va chercher le registre officiel et les coordonnées publiées. */
export async function approfondirProspect(prospectId: string): Promise<void> {
  await appeler({ action: "approfondir", prospectId });
}

/** Demande un brouillon de premier contact. RIEN N'EST ENVOYÉ. */
export async function redigerEmailProspect(prospectId: string, signature: string): Promise<BrouillonRendu> {
  const r = await appeler<{ objet?: string; corps?: string; destinataire?: string | null }>({
    action: "email",
    prospectId,
    signature,
  });
  return { objet: r.objet ?? "", corps: r.corps ?? "", destinataire: r.destinataire ?? null };
}
