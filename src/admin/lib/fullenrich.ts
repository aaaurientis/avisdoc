// FullEnrich vu de la fiche : ce qui a été demandé, ce qui est en cours, et les deux
// gestes possibles — « Chercher 2 autres contacts » (une fois par fiche) et « Mobile »
// (vrais clients seulement). Le travail se fait côté serveur (fonction « fullenrich »,
// chaque minute), dans le plafond mensuel (Olivier, 19/10).

import { supabaseAdmin } from "../data/supabaseAdmin";

export interface DemandeFE {
  id: string;
  kind: "contacts" | "contacts_plus" | "mobile";
  statut: "en_attente" | "enrichissement" | "termine" | "echec" | "bloque";
  personne: string | null;
  message: string | null;
}

/** Le coût annoncé avant le clic (tarif public FullEnrich, palier de base). */
export const COUT_FE = {
  plus: "environ 2,5 crédits (≈ 0,14 $), rien si rien n’est trouvé",
  mobile: "10 crédits (≈ 0,55 $), rien si aucun mobile n’est trouvé",
};

export const enCoursFE = (d: DemandeFE) => d.statut === "en_attente" || d.statut === "enrichissement";

export async function demandesFE(prospectId: string): Promise<DemandeFE[]> {
  const { data, error } = await supabaseAdmin
    .from("admin_fullenrich")
    .select("id, kind, statut, personne, message")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: false });
  // Table absente (migration 0072 pas encore collée) : la fiche s'affiche sans FullEnrich.
  if (error) return [];
  return (data ?? []) as DemandeFE[];
}

export async function demanderFE(prospectId: string, kind: "contacts" | "contacts_plus" | "mobile", par: string, personne?: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("admin_fullenrich")
    .insert({ prospect_id: prospectId, kind, demande_par: par, ...(personne ? { personne } : {}) });
  if (error) {
    throw new Error(/duplicate|unique/i.test(error.message) ? "Déjà demandé pour cette fiche." : error.message);
  }
}
