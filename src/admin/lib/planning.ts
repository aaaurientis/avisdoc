// Le planning : tout ce qui est programmé, d'où que ça vienne.
//
// Une action notée sur une fiche se perd dès qu'on referme la fiche. Ici on les voit
// toutes, rangées par jour, qu'elles viennent d'un prospect, d'une affaire ou d'un
// client. C'est la liste qu'on ouvre le matin.

import { supabaseAdmin } from "../data/supabaseAdmin";
import type { GenreEchange } from "./echanges";
import type { Origine } from "./corbeille";

export interface Rendezvous {
  id: string;
  kind: GenreEchange;
  titre: string;
  detail: string | null;
  au: string;
  par: string;
  /** Sur quoi porte l'action, et d'où elle vient. */
  fiche: string;
  origine: Origine;
  ficheId: string;
}

/** Le lundi de la semaine d'une date, à minuit. */
export function lundiDe(d: Date): Date {
  const l = new Date(d);
  l.setHours(0, 0, 0, 0);
  l.setDate(l.getDate() - ((l.getDay() + 6) % 7));
  return l;
}

export const memeJour = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * Ce qui est PROGRAMMÉ entre deux dates, avec le nom de la fiche concernée.
 *
 * Les notes en sont exclues. Une note est un compte rendu de ce qui s'est passé, pas
 * une action à venir : elle encombrait le planning d'un pavé qu'on ne pouvait ni faire
 * ni cocher. Sa place est dans l'historique de la fiche, où elle reste.
 */
export async function chargerPlanning(du: Date, au: Date): Promise<Rendezvous[]> {
  const { data, error } = await supabaseAdmin
    .from("admin_echanges")
    .select("id, kind, titre, detail, au, par, prospect_id, client_id, account_id")
    .in("kind", ["appel", "rdv", "email"])
    .gte("au", du.toISOString())
    .lt("au", au.toISOString())
    .order("au", { ascending: true });
  if (error) throw new Error(error.message);

  const lignes = (data ?? []) as {
    id: string; kind: GenreEchange; titre: string; detail: string | null; au: string; par: string;
    prospect_id: string | null; client_id: string | null; account_id: string | null;
  }[];
  if (lignes.length === 0) return [];

  // Les noms des fiches concernées, en trois requêtes plutôt qu'une par ligne.
  const ids = (cle: "prospect_id" | "client_id" | "account_id") =>
    [...new Set(lignes.map((l) => l[cle]).filter((v): v is string => Boolean(v)))];

  const [prospects, affaires, clients] = await Promise.all([
    ids("prospect_id").length ? supabaseAdmin.from("admin_prospects").select("id, name").in("id", ids("prospect_id")) : { data: [] },
    ids("client_id").length ? supabaseAdmin.from("admin_clients").select("id, company").in("id", ids("client_id")) : { data: [] },
    ids("account_id").length ? supabaseAdmin.from("admin_accounts").select("id, name").in("id", ids("account_id")) : { data: [] },
  ]);

  const nom = new Map<string, string>();
  for (const p of (prospects.data ?? []) as { id: string; name: string }[]) nom.set(p.id, p.name);
  for (const c of (affaires.data ?? []) as { id: string; company: string }[]) nom.set(c.id, c.company);
  for (const a of (clients.data ?? []) as { id: string; name: string }[]) nom.set(a.id, a.name);

  return lignes.map((l) => {
    const ficheId = l.client_id ?? l.prospect_id ?? l.account_id ?? "";
    const origine: Origine = l.client_id ? "affaire" : l.prospect_id ? "prospect" : "client";
    return {
      id: l.id,
      kind: l.kind,
      titre: l.titre,
      detail: l.detail,
      au: l.au,
      par: l.par,
      fiche: nom.get(ficheId) ?? "Fiche supprimée",
      origine,
      ficheId,
    };
  });
}
