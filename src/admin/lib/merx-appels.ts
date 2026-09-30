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

/**
 * Va chercher le registre officiel, le site de l'entreprise et les coordonnées publiées.
 *
 * L'appel rend la main dès que la demande est enregistrée ; on attend ensuite qu'elle
 * aboutisse, en la suivant dans la table. Le serveur, lui, travaille quoi qu'il arrive :
 * fermer l'onglet n'interrompt plus rien.
 */
export async function approfondirProspect(prospectId: string): Promise<void> {
  const r = await appeler<{ demandeId?: string }>({ action: "approfondir", prospectId });
  if (r?.demandeId && (await attendreDemande(r.demandeId)) === "echec") {
    throw new Error("L’approfondissement a échoué — relancez-le depuis la fiche.");
  }
}

/**
 * Demande un brouillon pour quelqu'un qui est DÉJÀ client : Merx s'appuie sur la campagne
 * menée et sur tout ce qui a été noté avec eux. RIEN N'EST ENVOYÉ.
 */
export async function redigerEmailClient(accountId: string, intention: string, signature: string): Promise<BrouillonRendu> {
  const r = await appeler<{ objet?: string; corps?: string; destinataire?: string | null }>({
    action: "email_client",
    accountId,
    intention,
    signature,
  });
  return { objet: r.objet ?? "", corps: r.corps ?? "", destinataire: r.destinataire ?? null };
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

/**
 * Attendre la fin d'une demande confiée à Merx.
 *
 * La fonction répond désormais dès qu'elle a enregistré la demande, et poursuit le
 * travail de son côté : un approfondissement dure une à deux minutes, et le commercial
 * change d'écran entre-temps. Tant que la réponse HTTP attendait la fin, quitter la
 * page coupait la connexion — et le travail avec.
 *
 * On suit donc l'avancement dans la table plutôt que dans la connexion. Fermer l'onglet
 * n'interrompt plus rien : on retrouve la fiche complétée en revenant.
 */
export async function attendreDemande(demandeId: string, plafondMs = 180_000): Promise<"terminee" | "echec" | "trop_long"> {
  const debut = Date.now();
  while (Date.now() - debut < plafondMs) {
    await new Promise((r) => setTimeout(r, 2_500));
    const { data } = await supabaseAdmin
      .from("admin_merx_demandes")
      .select("status")
      .eq("id", demandeId)
      .maybeSingle();
    const statut = (data as { status?: string } | null)?.status;
    if (statut === "terminee") return "terminee";
    if (statut === "echec") return "echec";
  }
  // Le travail continue côté serveur : on cesse seulement de le regarder.
  return "trop_long";
}
