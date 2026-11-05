// Typologies de clients — ce qu'elles exigent pour qu'une journée soit confirmée,
// et le rapprochement entre le nom d'un client dans l'extraction et son client Qonto.
// Fonctions pures : testées dans typologies.test.ts.

/**
 * Ce qui doit être acquis pour qu'une journée soit confirmée : requérant et/ou expert.
 * (Client, consentements et dermatoscope restent visibles dans le détail d'une journée,
 * mais ne comptent pas pour la confirmation.)
 */
export interface Regles {
  requerant: boolean;
  expert: boolean;
}

/** Client non affecté et pas de typologie par défaut en base : requérant + expert. */
export const REGLES_DEFAUT: Regles = { requerant: true, expert: true };

export const CRITERES: { cle: keyof Regles; label: string; court: string }[] = [
  { cle: "requerant", label: "Requérant confirmé", court: "requérant" },
  { cle: "expert", label: "Expert désigné", court: "expert" },
];

export interface Typologie {
  id: string;
  nom: string;
  description: string;
  exige_requerant: boolean;
  exige_expert: boolean;
  /** Colonnes conservées en base (migration 0081) mais plus utilisées. */
  exige_client?: boolean;
  exige_consentements?: boolean;
  exige_dermatoscope?: boolean;
  par_defaut: boolean;
  position: number;
}

export interface Affectation {
  qonto_client_id: string;
  nom_qonto: string;
  typologie_id: string;
  alias: string[];
}

export const reglesDe = (t: Typologie | null | undefined): Regles =>
  t
    ? { requerant: t.exige_requerant, expert: t.exige_expert }
    : REGLES_DEFAUT;

/** Ce qu'exige une typologie, en clair : « requérant, expert ». */
export const exigences = (r: Regles) => CRITERES.filter((c) => r[c.cle]).map((c) => c.court);

const FORMES = new Set(["sas", "sa", "sarl", "sasu", "eurl", "sci", "scop"]);

/** Un nom comparable : sans accents, casse, ponctuation ni forme juridique (« Viabeez SAS » = « VIABEEZ »). */
export function normaliserNom(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((m) => m && !FORMES.has(m))
    .join(" ");
}

export type Rapprochement = { affectation: Affectation; par: "nom" | "alias" | "approche" } | null;

/**
 * Le client Qonto affecté qui correspond à un nom de l'extraction.
 * D'abord un nom ou un alias identique (après normalisation) ; sinon un nom qui contient
 * l'autre (5 lettres au moins), à condition qu'un seul client corresponde — dans le doute,
 * on ne devine pas : le client reste « non affecté » et se règle à la main par un alias.
 */
export function rapprocher(nomExtraction: string, affectations: Affectation[]): Rapprochement {
  const n = normaliserNom(nomExtraction);
  if (!n) return null;
  for (const a of affectations) if (normaliserNom(a.nom_qonto) === n) return { affectation: a, par: "nom" };
  for (const a of affectations) if (a.alias.some((x) => normaliserNom(x) === n)) return { affectation: a, par: "alias" };
  if (n.length < 5) return null;
  const proches = affectations.filter((a) => {
    const q = normaliserNom(a.nom_qonto);
    return q.length >= 5 && (q.includes(n) || n.includes(q));
  });
  return proches.length === 1 ? { affectation: proches[0], par: "approche" } : null;
}

/** La typologie d'un nom de l'extraction : celle de son client Qonto, sinon la typologie par défaut. */
export function typologieDuClient(nomExtraction: string, affectations: Affectation[], typologies: Typologie[]): Typologie | null {
  const r = rapprocher(nomExtraction, affectations);
  const t = r && typologies.find((x) => x.id === r.affectation.typologie_id);
  return t ?? typologies.find((x) => x.par_defaut) ?? null;
}
