// Ce qui est prévu sur une fiche, pour le montrer sur sa carte.
//
// Une action enregistrée qu'on ne retrouve plus ne sert à rien : un appel noté sur une
// fiche doit se voir depuis le tableau, sans ouvrir chaque fiche l'une après l'autre.

import { supabaseAdmin } from "../data/supabaseAdmin";
import type { GenreEchange } from "./echanges";

export interface Prevu {
  /** Combien de chaque sorte, à venir. */
  parGenre: Partial<Record<GenreEchange, number>>;
  /** La plus proche échéance : c'est elle qui presse. */
  prochain: string | null;
}

/**
 * Les actions À VENIR de chaque affaire. Le passé est dans l'historique ; sur une
 * carte, seul compte ce qui reste à faire.
 */
export async function actionsPrevues(): Promise<Map<string, Prevu>> {
  const { data } = await supabaseAdmin
    .from("admin_echanges")
    .select("client_id, prospect_id, account_id, kind, au")
    .gte("au", new Date().toISOString())
    .order("au", { ascending: true });

  const par = new Map<string, Prevu>();
  for (const e of (data ?? []) as { client_id: string | null; prospect_id: string | null; account_id: string | null; kind: GenreEchange; au: string }[]) {
    const cle = e.client_id ?? e.prospect_id ?? e.account_id;
    if (!cle) continue;
    const vu = par.get(cle) ?? { parGenre: {}, prochain: null };
    vu.parGenre[e.kind] = (vu.parGenre[e.kind] ?? 0) + 1;
    // Les lignes arrivent triées : la première vue est la plus proche.
    if (!vu.prochain) vu.prochain = e.au;
    par.set(cle, vu);
  }
  return par;
}
