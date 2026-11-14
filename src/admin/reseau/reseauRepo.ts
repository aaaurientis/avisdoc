// Réseau d'aval : accès aux données. Les LECTURES passent par la RLS (droit
// « sante ») ; les ÉCRITURES passent toutes par les Edge Functions `reseau-import`
// et `reseau-action`, jamais en direct.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin as sb } from "../data/supabaseAdmin";
import { messageErreurFonction } from "../lib/erreurFonction";
import type { EtatDepartement, EtatPraticien, MotifExclusion, Population, Role } from "./libelles";

export interface DepartementReseau {
  code: string;
  etat: EtatDepartement;
  ordre: number | null;
  dernierImportLe: string | null;
}

export interface LieuReseau {
  departement: string;
  raisonSociale: string | null;
  adresse: string | null;
  codePostal: string | null;
  commune: string | null;
  telephone: string | null;
  modeExercice: string | null;
  secteur: string | null;
  finess: string | null;
}

export interface PraticienReseau {
  id: string;
  rpps: string;
  civilite: string | null;
  nom: string;
  prenom: string;
  population: Population;
  roles: Role[];
  specialites: string[];
  etat: EtatPraticien;
  origine: string;
  contactId: string | null;
  rppsExtraitLe: string | null;
  vuAuDernierImport: boolean;
  lieux: LieuReseau[];
}

export interface ImportReseau {
  id: string;
  departement: string;
  debut: string;
  fin: string | null;
  statut: "en_cours" | "termine" | "echec";
  rppsExtraitLe: string | null;
  compteurs: Record<string, number> | null;
  erreur: string | null;
}

/** Une résumé par département, pour l'écran Départements. */
export interface ResumeDepartement {
  total: number;
  parEtat: Partial<Record<EtatPraticien, number>>;
  accordsParRole: Partial<Record<Role, number>>;
}

const toLieu = (l: any): LieuReseau => ({
  departement: l.departement,
  raisonSociale: l.raison_sociale ?? null,
  adresse: l.adresse ?? null,
  codePostal: l.code_postal ?? null,
  commune: l.commune ?? null,
  telephone: l.telephone ?? null,
  modeExercice: l.mode_exercice ?? null,
  secteur: l.secteur ?? null,
  finess: l.finess ?? null,
});

const toPraticien = (r: any): PraticienReseau => ({
  id: r.id,
  rpps: r.rpps,
  civilite: r.civilite ?? null,
  nom: r.nom,
  prenom: r.prenom ?? "",
  population: r.population,
  roles: r.roles ?? [],
  specialites: r.specialites ?? [],
  etat: r.etat,
  origine: r.origine,
  contactId: r.contact_id ?? null,
  rppsExtraitLe: r.rpps_extrait_le ?? null,
  vuAuDernierImport: r.vu_au_dernier_import !== false,
  lieux: (r.admin_reseau_lieux ?? []).map(toLieu),
});

/** Lit toutes les lignes d'une requête, par pages de 1 000 (limite de Supabase). */
async function toutLire(requete: (de: number, a: number) => PromiseLike<{ data: any[] | null; error: any }>): Promise<any[]> {
  const out: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await requete(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function appeler(fonction: string, body: Record<string, unknown>): Promise<any> {
  const { data, error } = await sb.functions.invoke(fonction, { body });
  if (error) throw new Error(await messageErreurFonction(error));
  return data;
}

export const reseauRepo = {
  async departements(): Promise<DepartementReseau[]> {
    const { data, error } = await sb.from("admin_reseau_departements").select("code, etat, ordre, dernier_import_le");
    if (error) throw new Error(error.message);
    return (data ?? []).map((d: any) => ({
      code: d.code, etat: d.etat, ordre: d.ordre ?? null, dernierImportLe: d.dernier_import_le ?? null,
    }));
  },

  /** Compteurs par département : praticiens par état, accords par rôle. */
  async resumes(): Promise<Map<string, ResumeDepartement>> {
    const lignes = await toutLire((de, a) =>
      sb.from("admin_reseau_lieux")
        .select("departement, praticien_id, admin_reseau_praticiens!inner(etat, roles)")
        .order("praticien_id")
        .range(de, a));
    const vus = new Set<string>();
    const out = new Map<string, ResumeDepartement>();
    for (const l of lignes) {
      const cle = `${l.departement}|${l.praticien_id}`;
      if (vus.has(cle)) continue; // plusieurs lieux dans le même département : compté une fois
      vus.add(cle);
      const r = out.get(l.departement) ?? { total: 0, parEtat: {}, accordsParRole: {} };
      const p = l.admin_reseau_praticiens;
      r.total++;
      r.parEtat[p.etat as EtatPraticien] = (r.parEtat[p.etat as EtatPraticien] ?? 0) + 1;
      if (p.etat === "accord") for (const role of (p.roles ?? []) as Role[]) r.accordsParRole[role] = (r.accordsParRole[role] ?? 0) + 1;
      out.set(l.departement, r);
    }
    return out;
  },

  /** Les praticiens qui exercent dans le département, avec TOUS leurs lieux. */
  async praticiens(code: string): Promise<PraticienReseau[]> {
    const ids = await toutLire((de, a) =>
      sb.from("admin_reseau_lieux").select("praticien_id").eq("departement", code).order("praticien_id").range(de, a));
    const uniques = [...new Set(ids.map((x) => x.praticien_id as string))];
    const out: PraticienReseau[] = [];
    for (let i = 0; i < uniques.length; i += 200) {
      const { data, error } = await sb
        .from("admin_reseau_praticiens")
        .select("*, admin_reseau_lieux(*)")
        .in("id", uniques.slice(i, i + 200));
      if (error) throw new Error(error.message);
      out.push(...(data ?? []).map(toPraticien));
    }
    return out.sort((a, b) => a.nom.localeCompare(b.nom, "fr") || a.prenom.localeCompare(b.prenom, "fr"));
  },

  async dernierImport(code: string): Promise<ImportReseau | null> {
    const { data, error } = await sb
      .from("admin_reseau_imports")
      .select("*")
      .eq("departement", code)
      .order("debut", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const r = data?.[0];
    if (!r) return null;
    return {
      id: r.id, departement: r.departement, debut: r.debut, fin: r.fin ?? null, statut: r.statut,
      rppsExtraitLe: r.rpps_extrait_le ?? null, compteurs: r.compteurs ?? null, erreur: r.erreur ?? null,
    };
  },

  ajouterDepartement: (code: string, ordre: number | null) =>
    appeler("reseau-action", { action: "departement_ajouter", code, ordre }),

  modifierDepartement: (code: string, maj: { etat?: EtatDepartement; ordre?: number | null }) =>
    appeler("reseau-action", { action: "departement_modifier", code, ...maj }),

  exclure: (praticienId: string, motif: MotifExclusion, precision: string) =>
    appeler("reseau-action", { action: "exclure", praticien_id: praticienId, motif, precision }),

  importer: (code: string): Promise<{ compteurs: Record<string, number>; rpps_extrait_le: string | null }> =>
    appeler("reseau-import", { departement: code }),
};
