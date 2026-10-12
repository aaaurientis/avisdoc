// Ce qui est prévu sur une fiche, pour le montrer sur sa carte.
//
// Une action enregistrée qu'on ne retrouve plus ne sert à rien : un appel noté sur une
// fiche doit se voir depuis le tableau, sans ouvrir chaque fiche l'une après l'autre.

import { supabaseAdmin } from "../data/supabaseAdmin";
import type { GenreEchange, ModeRdv } from "./echanges";

/** Une action à venir : sa sorte et son heure. Chacune a la sienne. */
export interface ActionPrevue {
  kind: GenreEchange;
  au: string;
  titre: string;
  /** Un rendez-vous : en visio ou sur place. */
  rdvMode: ModeRdv | null;
}

export interface Prevu {
  /** Les actions à venir, de la plus proche à la plus lointaine. */
  actions: ActionPrevue[];
  /** La plus proche échéance : c'est elle qui presse. */
  prochain: string | null;
}

/**
 * Les actions À VENIR de chaque affaire : programmées, pas encore faites — en retard
 * comprises. Le passé est dans l'historique ; sur une carte, seul compte ce qui reste à faire.
 */
export async function actionsPrevues(): Promise<Map<string, Prevu>> {
  const { data } = await supabaseAdmin
    .from("admin_echanges")
    .select("client_id, prospect_id, account_id, kind, au, titre, rdv_mode")
    .eq("prevu", true)
    .is("traite_le", null)
    .order("au", { ascending: true });

  const lignes = (data ?? []) as {
    client_id: string | null; prospect_id: string | null; account_id: string | null;
    kind: GenreEchange; au: string; titre: string; rdv_mode: ModeRdv | null;
  }[];

  // Une action notée quand l'entreprise n'était encore qu'un prospect se voit sur la
  // carte de l'affaire qu'il est devenu (Mars, Bollinger : rendez-vous pris avant le Pipeline).
  const prospects = [...new Set(lignes.filter((e) => !e.client_id && e.prospect_id).map((e) => e.prospect_id as string))];
  const devenu = new Map<string, string>();
  if (prospects.length) {
    const { data: convertis } = await supabaseAdmin.from("admin_prospects").select("id, converted_client_id").in("id", prospects);
    for (const p of (convertis ?? []) as { id: string; converted_client_id: string | null }[]) {
      if (p.converted_client_id) devenu.set(p.id, p.converted_client_id);
    }
  }

  const par = new Map<string, Prevu>();
  for (const e of lignes) {
    const cle = e.client_id ?? (e.prospect_id ? (devenu.get(e.prospect_id) ?? e.prospect_id) : null) ?? e.account_id;
    if (!cle) continue;
    const vu = par.get(cle) ?? { actions: [], prochain: null };
    vu.actions.push({ kind: e.kind, au: e.au, titre: e.titre, rdvMode: e.rdv_mode });
    // Les lignes arrivent triées : la première vue est la plus proche.
    if (!vu.prochain) vu.prochain = e.au;
    par.set(cle, vu);
  }
  return par;
}
