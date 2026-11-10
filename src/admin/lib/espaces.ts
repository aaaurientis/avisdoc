// Qui reçoit les mails et le Weekly de chaque CRM et de la Veille Marché (Admin › Réglages, migration 0083).
// Sans ligne, une personne n'en reçoit ni les mails ni le Weekly. Qui voit quoi : Admin › Droits d'accès (Olivier, 09/11) ;
// la colonne « voit » reste en base, inutilisée.

import { supabaseAdmin } from "../data/supabaseAdmin";
import { CRMS } from "./veille";

export type Espace = `crm:${(typeof CRMS)[number]["axe"]}` | "crm:synthese" | "veille:marche";
export interface Membre { espace: Espace; email: string; voit: boolean; recoit_mails: boolean; recoit_weekly: boolean }

export const ESPACES_CRM: { espace: Espace; label: string }[] = CRMS.map((c) => ({ espace: `crm:${c.axe}` as Espace, label: c.label }));
export const ESPACES_VEILLE = [{ espace: "veille:marche" as Espace, label: "Veille Marché" }];

async function lire<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

/** Les collaborateurs : les comptes du Hub (table des droits), triés. */
export const listerCollaborateurs = async () =>
  ((await lire<{ email: string }[]>(supabaseAdmin.from("admin_membres").select("email"))) ?? []).map((x) => x.email.toLowerCase()).sort();

export const listerMembres = () => lire<Membre[]>(supabaseAdmin.from("admin_espaces_membres").select("espace, email, voit, recoit_mails, recoit_weekly"));

export const reglerMembre = (m: Membre) =>
  lire(supabaseAdmin.from("admin_espaces_membres").upsert({ ...m, email: m.email.toLowerCase() }, { onConflict: "espace,email" }));

