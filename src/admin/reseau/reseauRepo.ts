// Réseau d'aval : accès aux données. Les LECTURES passent par la RLS (droit
// « sante ») ; les ÉCRITURES passent toutes par les Edge Functions `reseau-import`
// et `reseau-action`, jamais en direct.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin as sb } from "../data/supabaseAdmin";
import { messageErreurFonction } from "../lib/erreurFonction";
import type { EtatDepartement, EtatPraticien, MotifExclusion, Population, Role, StatutDoctolib, StatutGoogle } from "./libelles";
import type { TypeSignal } from "../../../supabase/functions/_shared/reseau-signaux";

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
  lat: number | null;
  lng: number | null;
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
  googlePlaceId: string | null;
  googleAucuneFiche: boolean;
  googleStatut: StatutGoogle;
  /** Toutes les fiches Google rattachées (cabinet, hôpital…). */
  googlePlaceIds: string[];
  doctolibUrl: string | null;
  doctolibStatut: StatutDoctolib;
  lieux: LieuReseau[];
}

export interface SignalReseau {
  id: string;
  praticienId: string;
  type: TypeSignal;
  valeur: string;
  url: string;
  origine: "operateur" | "ia";
  statut: "propose" | "valide" | "rejete" | "remplace";
  extrait: string | null;
  proposePar: string;
  proposeLe: string;
  decidePar: string | null;
  decideLe: string | null;
}

export interface RechercheIa {
  id: string;
  type: "praticien" | "mg_derm_departement" | "google_departement" | "ia_departement";
  statut: "en_cours" | "termine" | "echec" | "annule";
  debut: string;
  fin: string | null;
  resultat: { total?: number; faits?: number; propositions?: number; retenues?: number; crees?: number; deja_la?: number; a_confirmer?: number; introuvables?: number; restants?: number; quota?: boolean; ecartees?: { motif: string; url?: string; nom?: string; type?: string }[] } | null;
  erreur: string | null;
  /** Avancement en direct : étape en cours, pourcentage, journal. */
  etape: string | null;
  progression: number;
  journal: { le: string; texte: string; niveau: "info" | "ok" | "ecarte" }[];
}

export interface CandidatGoogle {
  place_id: string; nom: string; adresse: string; categorie: string | null; ferme: boolean;
  force: "certaine" | "forte" | "moyenne" | "faible";
}

export interface FicheGoogle {
  place_id: string;
  nom: string;
  adresse: string | null;
  telephone: string | null;
  site: string | null;
  lien: string | null;
  categorie: string | null;
  horaires: string[];
  note: number | null;
  nombreAvis: number | null;
  statut: string | null;
  avis: { auteur: string; lienAuteur: string | null; note: number | null; quand: string; texte: string }[] | null;
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

export interface StatistiquesReseau {
  candidats: number;
  exclus: number;
  parPopulation: Partial<Record<Population, number>>;
  parEtat: Partial<Record<EtatPraticien, number>>;
  google: Partial<Record<StatutGoogle, number>>;
  doctolib: Partial<Record<StatutDoctolib, number>>;
  departements: { code: string; etat: EtatDepartement }[];
  propositionsAValider: number;
  recherchesEnCours: number;
}

/** Un résumé par département, pour l'écran Départements. */
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
  lat: typeof l.lat === "number" ? l.lat : null,
  lng: typeof l.lng === "number" ? l.lng : null,
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
  googlePlaceId: r.google_place_id ?? null,
  googleAucuneFiche: r.google_aucune_fiche === true,
  googleStatut: r.google_statut ?? (r.google_place_id ? "confirmee" : r.google_aucune_fiche ? "aucune" : "a_chercher"),
  googlePlaceIds: Array.isArray(r.google_place_ids) && r.google_place_ids.length ? r.google_place_ids : r.google_place_id ? [r.google_place_id] : [],
  doctolibUrl: r.doctolib_url ?? null,
  doctolibStatut: r.doctolib_statut ?? "a_chercher",
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

const toSignal = (r: any): SignalReseau => ({
  id: r.id, praticienId: r.praticien_id, type: r.type, valeur: r.valeur, url: r.url, origine: r.origine,
  statut: r.statut, extrait: r.extrait ?? null, proposePar: r.propose_par, proposeLe: r.propose_le,
  decidePar: r.decide_par ?? null, decideLe: r.decide_le ?? null,
});

const toRecherche = (r: any): RechercheIa => ({
  id: r.id, type: r.type, statut: r.statut, debut: r.debut, fin: r.fin ?? null, resultat: r.resultat ?? null, erreur: r.erreur ?? null,
  etape: r.etape ?? null, progression: typeof r.progression === "number" ? r.progression : 0, journal: Array.isArray(r.journal) ? r.journal : [],
});

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

  /** Chiffres clés du réseau d'aval, pour le tableau de bord du Hub. */
  async statistiques(): Promise<StatistiquesReseau> {
    const [praticiens, departements, propositions, enCours] = await Promise.all([
      toutLire((de, a) => sb.from("admin_reseau_praticiens")
        .select("id, population, etat, google_statut, doctolib_statut").order("id").range(de, a)),
      sb.from("admin_reseau_departements").select("code, etat"),
      sb.from("admin_reseau_signaux").select("id", { count: "exact", head: true }).eq("statut", "propose"),
      sb.from("admin_reseau_recherches_ia").select("id", { count: "exact", head: true }).eq("statut", "en_cours"),
    ]);
    if (departements.error) throw new Error(departements.error.message);
    const actifs = praticiens.filter((p) => p.etat !== "exclu");
    const compter = <K extends string>(liste: any[], cle: string) => {
      const m: Partial<Record<K, number>> = {};
      for (const x of liste) m[x[cle] as K] = (m[x[cle] as K] ?? 0) + 1;
      return m;
    };
    return {
      candidats: actifs.length,
      exclus: praticiens.length - actifs.length,
      parPopulation: compter<Population>(actifs, "population"),
      parEtat: compter<EtatPraticien>(praticiens, "etat"),
      google: compter<StatutGoogle>(actifs, "google_statut"),
      doctolib: compter<StatutDoctolib>(actifs, "doctolib_statut"),
      departements: (departements.data ?? []).map((d: any) => ({ code: d.code, etat: d.etat })),
      propositionsAValider: propositions.count ?? 0,
      recherchesEnCours: enCours.count ?? 0,
    };
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

  /** Signaux d'un praticien : validés et propositions en attente. */
  async signaux(praticienId: string): Promise<SignalReseau[]> {
    const { data, error } = await sb.from("admin_reseau_signaux").select("*")
      .eq("praticien_id", praticienId).in("statut", ["valide", "propose"]).order("propose_le", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toSignal);
  },

  /** Signaux validés et nombre de propositions en attente, pour une liste de praticiens (score de la liste). */
  async signauxDe(ids: string[]): Promise<SignalReseau[]> {
    const out: SignalReseau[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await sb.from("admin_reseau_signaux").select("id, praticien_id, type, valeur, url, origine, statut, propose_par, propose_le")
        .in("praticien_id", ids.slice(i, i + 200)).in("statut", ["valide", "propose"]);
      if (error) throw new Error(error.message);
      out.push(...(data ?? []).map(toSignal));
    }
    return out;
  },

  async derniereRecherche(
    cible: { praticienId: string } | { departement: string; type: "mg_derm_departement" | "google_departement" | "ia_departement" },
  ): Promise<RechercheIa | null> {
    let q = sb.from("admin_reseau_recherches_ia").select("*").order("debut", { ascending: false }).limit(1);
    q = "praticienId" in cible ? q.eq("praticien_id", cible.praticienId) : q.eq("departement", cible.departement).eq("type", cible.type);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data?.[0] ? toRecherche(data[0]) : null;
  },

  saisirSignal: (praticienId: string, type: TypeSignal, valeur: string, url: string) =>
    appeler("reseau-action", { action: "signal_saisir", praticien_id: praticienId, type, valeur, url }),
  validerSignal: (signalId: string) => appeler("reseau-action", { action: "signal_valider", signal_id: signalId }),
  rejeterSignal: (signalId: string) => appeler("reseau-action", { action: "signal_rejeter", signal_id: signalId }),

  rattacherGoogle: (praticienId: string, choix: { placeIds: string[] } | { aucune: true } | { retirer: true }) =>
    appeler("reseau-action", {
      action: "google_rattacher", praticien_id: praticienId,
      ...("placeIds" in choix ? { place_ids: choix.placeIds } : "aucune" in choix ? { aucune: true } : { retirer: true }),
    }),
  chercherGoogle: (praticienId: string, departement?: string): Promise<{ requete: string; candidats: CandidatGoogle[] }> =>
    appeler("reseau-google", { action: "chercher", praticien_id: praticienId, departement }),
  doctolib: (praticienId: string, choix: { url: string } | { aucun: true } | { retirer: true } | { confirmer: true }) =>
    appeler("reseau-action", { action: "doctolib", praticien_id: praticienId, ...choix }),

  /** Travaux groupés d'un département : « liens » (carte, Google, Doctolib) ou « ia ». */
  estimerFile: (departement: string, type: "liens" | "ia", inclureRecents = false): Promise<{ total: number }> =>
    appeler("reseau-file", { action: "estimer", departement, type, inclure_recents: inclureRecents }),
  lancerFile: (departement: string, type: "liens" | "ia", inclureRecents = false): Promise<{ job_id: string; total: number; deja: boolean }> =>
    appeler("reseau-file", { action: "lancer", departement, type, inclure_recents: inclureRecents }),
  arreterFile: (jobId: string) => appeler("reseau-file", { action: "arreter", job_id: jobId }),
  confirmerGoogle: (praticienId: string) => appeler("reseau-action", { action: "google_confirmer", praticien_id: praticienId }),
  ficheGoogle: (praticienId: string, placeId: string, avis = false): Promise<FicheGoogle> =>
    appeler("reseau-google", { action: "details", praticien_id: praticienId, place_id: placeId, avis }),

  ajouterRpps: (rpps: string): Promise<{ statut: "cree" | "deja_la"; id: string; nom: string; population: Population; departements: string[] }> =>
    appeler("reseau-action", { action: "ajouter_rpps", rpps }),

  lancerIaPraticien: (praticienId: string): Promise<{ recherche_id: string }> =>
    appeler("reseau-ia", { action: "praticien", praticien_id: praticienId }),
  lancerIaMg: (departement: string): Promise<{ recherche_id: string }> =>
    appeler("reseau-ia", { action: "mg_departement", departement }),

  importer: (code: string): Promise<{ compteurs: Record<string, number>; rpps_extrait_le: string | null }> =>
    appeler("reseau-import", { departement: code }),
};
