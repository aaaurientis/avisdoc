// Lecture et enregistrement des réglages d'affichage du module Statistiques (table admin_parametres).
import { supabaseAdmin as sb } from "../data/supabaseAdmin";
import { AFFICHAGE_DEFAUT, definirAffichageStats, type AffichageStats } from "./masquage";

const CLE = "statistiques_affichage";

export async function chargerAffichageStats(): Promise<AffichageStats> {
  const { data } = await sb.from("admin_parametres").select("valeur").eq("cle", CLE).maybeSingle();
  definirAffichageStats((data?.valeur as Partial<AffichageStats>) ?? AFFICHAGE_DEFAUT);
  const v = (data?.valeur as Partial<AffichageStats>) ?? {};
  return { ...AFFICHAGE_DEFAUT, ...v, requisMasques: Array.isArray(v.requisMasques) ? v.requisMasques : [] };
}

export async function enregistrerAffichageStats(a: AffichageStats, email: string): Promise<void> {
  const { error } = await sb.from("admin_parametres").upsert({ cle: CLE, valeur: a, maj_par: email, maj_le: new Date().toISOString() });
  if (error) throw new Error(error.message.includes("admin_parametres") ? `${error.message} (migration 0096 appliquée ?)` : error.message);
  definirAffichageStats(a);
}
