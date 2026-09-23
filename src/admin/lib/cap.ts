// Le CAP : ce que coûte l'acquisition d'un prospect, fiche par fiche.
//
// L'écran des coûts listait des DÉPENSES : une ligne par appel au modèle. On voyait
// passer l'argent sans jamais savoir ce qu'avait coûté une entreprise donnée.
//
// Ici on renverse : une ligne par entreprise, et sous elle tout ce qu'on a dépensé
// pour l'obtenir. Une recherche qui ramène vingt fiches se partage entre les vingt —
// c'est ce partage qui fait la différence entre un relevé de dépenses et un coût
// d'acquisition.

import { coutDe, type Consommation } from "./couts";

export interface DemandeBrute {
  id: string;
  kind: "recherche" | "approfondissement" | "email";
  request: string;
  status: string;
  found_count: number | null;
  usage: Consommation | null;
  model: string | null;
  prospect_id: string | null;
  account_id: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface FicheBrute {
  id: string;
  name: string;
  /** La recherche qui a fait apparaître cette fiche. */
  found_by: string | null;
}

/** Une dépense, telle qu'elle apparaît sous la ligne d'une entreprise. */
export interface Ligne {
  id: string;
  quoi: string;
  kind: DemandeBrute["kind"];
  /** Ce que cette dépense coûte à CETTE fiche : une recherche partagée n'y met qu'une part. */
  montant: number;
  /** Renseigné quand la dépense est partagée : « recherche partagée entre 12 fiches ». */
  partage: number | null;
  quand: string;
  status: string;
  model: string | null;
}

export interface Acquisition {
  prospectId: string;
  nom: string;
  total: number;
  lignes: Ligne[];
}

export interface Cap {
  /** Une entreprise par ligne, de la plus coûteuse à la moins. */
  acquisitions: Acquisition[];
  /** Ce qui ne s'impute à aucune fiche : débriefs, e-mails à des clients, recherches bredouilles. */
  horsAcquisition: Ligne[];
  totalImpute: number;
  totalHors: number;
}

const libelle = (d: DemandeBrute): string =>
  d.kind === "recherche" ? `Recherche — ${d.request}` : d.kind === "approfondissement" ? "Approfondissement" : "Rédaction d’un e-mail";

/**
 * Répartit toutes les dépenses sur les fiches.
 *
 * Une recherche est partagée entre les fiches qu'elle a réellement produites ; si elle
 * n'en a produit aucune, elle reste hors acquisition — on a dépensé sans rien obtenir,
 * et c'est une information en soi.
 */
export function calculerCap(demandes: DemandeBrute[], fiches: FicheBrute[]): Cap {
  const nomDe = new Map(fiches.map((f) => [f.id, f.name]));

  // Quelles fiches chaque recherche a-t-elle réellement produites ?
  const parRecherche = new Map<string, string[]>();
  for (const f of fiches) {
    if (!f.found_by) continue;
    parRecherche.set(f.found_by, [...(parRecherche.get(f.found_by) ?? []), f.id]);
  }

  const acquisitions = new Map<string, Acquisition>();
  const horsAcquisition: Ligne[] = [];

  const pour = (prospectId: string): Acquisition => {
    const deja = acquisitions.get(prospectId);
    if (deja) return deja;
    const neuve: Acquisition = { prospectId, nom: nomDe.get(prospectId) ?? "Fiche supprimée", total: 0, lignes: [] };
    acquisitions.set(prospectId, neuve);
    return neuve;
  };

  for (const d of demandes) {
    const cout = coutDe(d.usage, d.model ?? undefined).total;
    const base = { id: d.id, quoi: libelle(d), kind: d.kind, quand: d.created_at, status: d.status, model: d.model };

    if (d.kind === "recherche") {
      const issues = parRecherche.get(d.id) ?? [];
      if (issues.length === 0) {
        horsAcquisition.push({ ...base, montant: cout, partage: null });
        continue;
      }
      // La part de chacune : c'est ce partage qui fait le coût d'acquisition.
      const part = cout / issues.length;
      for (const id of issues) {
        const a = pour(id);
        a.lignes.push({ ...base, montant: part, partage: issues.length });
        a.total += part;
      }
      continue;
    }

    if (d.prospect_id) {
      const a = pour(d.prospect_id);
      a.lignes.push({ ...base, montant: cout, partage: null });
      a.total += cout;
      continue;
    }

    // Un e-mail à un client, un débrief : ce n'est plus de l'acquisition.
    horsAcquisition.push({ ...base, montant: cout, partage: null });
  }

  const liste = [...acquisitions.values()].sort((a, b) => b.total - a.total);
  for (const a of liste) a.lignes.sort((x, y) => new Date(x.quand).getTime() - new Date(y.quand).getTime());

  return {
    acquisitions: liste,
    horsAcquisition: horsAcquisition.sort((a, b) => new Date(b.quand).getTime() - new Date(a.quand).getTime()),
    totalImpute: liste.reduce((s, a) => s + a.total, 0),
    totalHors: horsAcquisition.reduce((s, l) => s + l.montant, 0),
  };
}
