// Scoring déclaratif — règles PR-01 à PR-10 (signaux de timing) et PR-20 à
// PR-23 (critères structurels). Fonctions pures, nommées d'après l'identifiant.
//
// Les signaux se saisissent ou s'importent, ils ne se déduisent jamais par
// scraping. Chaque signal porte sa date de constat et se périme après 90 jours.
// Le score est CALCULÉ à l'affichage ; la colonne contact.score n'est qu'un
// cache de tri, recalculé à chaque écriture par la couche data.
import type { Compte, Contact, Json, NiveauContact } from "../data/types";

export const CODES_SIGNAUX = [
  "PR-01", "PR-02", "PR-03", "PR-04", "PR-05",
  "PR-06", "PR-07", "PR-08", "PR-09", "PR-10",
] as const;
export type CodeSignal = (typeof CODES_SIGNAUX)[number];

export const CODES_CRITERES = ["PR-20", "PR-21", "PR-22", "PR-23"] as const;
export type CodeCritere = (typeof CODES_CRITERES)[number];
export type CodeRegle = CodeSignal | CodeCritere;

/** Signal déclaré sur la fiche : code, date de constat, détail court facultatif. */
export type SignalDeclare = { code: CodeSignal; constate_le: string; detail?: string };

export const VALIDITE_SIGNAL_JOURS = 90;
export const DETAIL_SIGNAL_MAX = 120;

/** Poids par ordre décroissant : PR-01 pèse le plus, PR-10 le moins. */
export const POIDS_SIGNAUX: Record<CodeSignal, number> = {
  "PR-01": 30, // ancienneté en poste < 12 mois, fonction RH / QVCT / prévention
  "PR-02": 26, // recrutement en cours QVCT / HSE / prévention
  "PR-03": 22, // suit la page entreprise AvisDoc
  "PR-04": 18, // changement de poste dans les 90 jours
  "PR-05": 14, // publication d'un rapport RSE
  "PR-06": 12, // communication sur la semaine de la QVCT
  "PR-07": 10, // croissance d'effectif ou recrutements en cours
  "PR-08": 6,  // activité LinkedIn récente
  "PR-09": 5,  // relations en commun
  "PR-10": 4,  // mention presse
};

export const POIDS_CERCLE: Record<1 | 2 | 3, number> = { 1: 20, 2: 12, 3: 6 };
export const POIDS_SECTEUR_EXPOSE = 10;
export const POIDS_EFFECTIF_CIBLE = 10;
export const EFFECTIF_CIBLE = { min: 250, max: 5000 } as const;
export const POIDS_NIVEAU: Record<NiveauContact, number> = {
  associe: 8, directeur: 8, vp: 8, responsable: 5, charge: 2,
};

export type SourceEvaluation = "declare" | "deduit" | "structurel" | "expire" | "absent";

export type Evaluation = {
  code: CodeRegle;
  points: number;
  actif: boolean;
  source: SourceEvaluation;
  constate_le?: string;
  detail?: string;
};

export type ContactPourScore = Pick<Contact, "fonction" | "niveau" | "anciennete_poste_mois" | "signaux">;
export type ComptePourScore = Pick<Compte, "cercle" | "expose" | "effectif_min" | "effectif_max"> | null;

const REGEX_DATE = /^\d{4}-\d{2}-\d{2}$/;

function estCodeSignal(v: unknown): v is CodeSignal {
  return typeof v === "string" && (CODES_SIGNAUX as readonly string[]).includes(v);
}

/** Lecture défensive de la colonne jsonb `signaux`. Les éléments invalides sont ignorés. */
export function signauxDepuisJson(json: Json | null | undefined): SignalDeclare[] {
  if (!Array.isArray(json)) return [];
  const out: SignalDeclare[] = [];
  for (const e of json) {
    if (!e || typeof e !== "object" || Array.isArray(e)) continue;
    const code = e["code"];
    const constate = e["constate_le"];
    const detail = e["detail"];
    if (!estCodeSignal(code) || typeof constate !== "string" || !REGEX_DATE.test(constate)) continue;
    out.push({
      code,
      constate_le: constate,
      ...(typeof detail === "string" && detail.length > 0 ? { detail: detail.slice(0, DETAIL_SIGNAL_MAX) } : {}),
    });
  }
  return out;
}

/** Sérialisation inverse, pour l'écriture. */
export function signauxVersJson(signaux: SignalDeclare[]): Json {
  return signaux.map((s) => ({ code: s.code, constate_le: s.constate_le, ...(s.detail ? { detail: s.detail } : {}) }));
}

function jourLocal(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

function jourIso(iso: string): number | null {
  const m = REGEX_DATE.exec(iso);
  if (!m) return null;
  const [a, mo, j] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(a, mo - 1, j) / 86_400_000);
}

/** Âge d'un constat en jours (négatif si daté dans le futur). */
export function ageSignalJours(constate_le: string, aujourdhui: Date): number | null {
  const j = jourIso(constate_le);
  return j === null ? null : jourLocal(aujourdhui) - j;
}

/** PR-00 : un signal compte s'il est daté et a moins de 90 jours. */
export function pr00SignalEnVigueur(signal: SignalDeclare, aujourdhui: Date): boolean {
  const age = ageSignalJours(signal.constate_le, aujourdhui);
  return age !== null && age >= 0 && age <= VALIDITE_SIGNAL_JOURS;
}

/** Fonction RH, QVCT ou prévention (PR-01, rappel de confidentialité des messages). */
const FONCTION_RH_QVCT_PREVENTION =
  /(\brh\b|\bdrh\b|ressources humaines|\bqvct\b|\bqvt\b|pr[ée]vention|\bhse\b|\bqhse\b|sant[ée] au travail|s[ée]curit[ée] au travail|conditions de travail|\bpeople\b|human resources)/i;

export function estFonctionRhQvctPrevention(fonction: string | null | undefined): boolean {
  return !!fonction && FONCTION_RH_QVCT_PREVENTION.test(fonction);
}

function evaluerDeclare(code: CodeSignal, contact: ContactPourScore, aujourdhui: Date): Evaluation {
  const declares = signauxDepuisJson(contact.signaux)
    .filter((s) => s.code === code)
    .sort((a, b) => (a.constate_le < b.constate_le ? 1 : -1));
  const recent = declares[0];
  if (!recent) return { code, points: 0, actif: false, source: "absent" };
  if (pr00SignalEnVigueur(recent, aujourdhui)) {
    return { code, points: POIDS_SIGNAUX[code], actif: true, source: "declare", constate_le: recent.constate_le, detail: recent.detail };
  }
  return { code, points: 0, actif: false, source: "expire", constate_le: recent.constate_le, detail: recent.detail };
}

/** PR-01 : moins de douze mois en poste sur une fonction RH, QVCT ou prévention. */
export function pr01SignalAncienneteEnPoste(contact: ContactPourScore, aujourdhui: Date): Evaluation {
  const anc = contact.anciennete_poste_mois;
  if (anc !== null && anc !== undefined && anc < 12 && estFonctionRhQvctPrevention(contact.fonction)) {
    return { code: "PR-01", points: POIDS_SIGNAUX["PR-01"], actif: true, source: "deduit" };
  }
  return evaluerDeclare("PR-01", contact, aujourdhui);
}

/** PR-02 : recrutement en cours sur un poste QVCT, HSE ou prévention. */
export function pr02SignalRecrutementQvct(contact: ContactPourScore, aujourdhui: Date): Evaluation {
  return evaluerDeclare("PR-02", contact, aujourdhui);
}

/** PR-03 : suit la page entreprise AvisDoc. */
export function pr03SignalSuitPageAvisdoc(contact: ContactPourScore, aujourdhui: Date): Evaluation {
  return evaluerDeclare("PR-03", contact, aujourdhui);
}

/** PR-04 : changement de poste dans les quatre-vingt-dix jours. */
export function pr04SignalChangementDePoste(contact: ContactPourScore, aujourdhui: Date): Evaluation {
  const anc = contact.anciennete_poste_mois;
  if (anc !== null && anc !== undefined && anc <= 3) {
    return { code: "PR-04", points: POIDS_SIGNAUX["PR-04"], actif: true, source: "deduit" };
  }
  return evaluerDeclare("PR-04", contact, aujourdhui);
}

/** PR-05 : publication d'un rapport RSE. */
export function pr05SignalRapportRse(contact: ContactPourScore, aujourdhui: Date): Evaluation {
  return evaluerDeclare("PR-05", contact, aujourdhui);
}

/** PR-06 : communication sur la semaine de la QVCT. */
export function pr06SignalSemaineQvct(contact: ContactPourScore, aujourdhui: Date): Evaluation {
  return evaluerDeclare("PR-06", contact, aujourdhui);
}

/** PR-07 : croissance d'effectif ou recrutements en cours. */
export function pr07SignalCroissanceEffectif(contact: ContactPourScore, aujourdhui: Date): Evaluation {
  return evaluerDeclare("PR-07", contact, aujourdhui);
}

/** PR-08 : activité LinkedIn récente. */
export function pr08SignalActiviteLinkedin(contact: ContactPourScore, aujourdhui: Date): Evaluation {
  return evaluerDeclare("PR-08", contact, aujourdhui);
}

/** PR-09 : relations en commun. */
export function pr09SignalRelationsCommunes(contact: ContactPourScore, aujourdhui: Date): Evaluation {
  return evaluerDeclare("PR-09", contact, aujourdhui);
}

/** PR-10 : mention presse. */
export function pr10SignalMentionPresse(contact: ContactPourScore, aujourdhui: Date): Evaluation {
  return evaluerDeclare("PR-10", contact, aujourdhui);
}

/** PR-20 : cercle de cible (courtier régional de 2 à 20 personnes en tête). */
export function pr20CritereCercle(compte: ComptePourScore): Evaluation {
  const c = compte?.cercle;
  if (c === 1 || c === 2 || c === 3) {
    return { code: "PR-20", points: POIDS_CERCLE[c], actif: true, source: "structurel" };
  }
  return { code: "PR-20", points: 0, actif: false, source: "absent" };
}

/** PR-21 : secteur exposé. */
export function pr21CritereSecteurExpose(compte: ComptePourScore): Evaluation {
  return compte?.expose
    ? { code: "PR-21", points: POIDS_SECTEUR_EXPOSE, actif: true, source: "structurel" }
    : { code: "PR-21", points: 0, actif: false, source: "absent" };
}

/** PR-22 : effectif entre 250 et 5 000 (la fourchette déclarée recoupe la cible). */
export function pr22CritereEffectif(compte: ComptePourScore): Evaluation {
  const min = compte?.effectif_min ?? null;
  const max = compte?.effectif_max ?? min;
  if (min !== null && max !== null && min <= EFFECTIF_CIBLE.max && max >= EFFECTIF_CIBLE.min) {
    return { code: "PR-22", points: POIDS_EFFECTIF_CIBLE, actif: true, source: "structurel" };
  }
  return { code: "PR-22", points: 0, actif: false, source: "absent" };
}

/** PR-23 : niveau hiérarchique. */
export function pr23CritereNiveau(contact: ContactPourScore): Evaluation {
  const n = contact.niveau;
  return n
    ? { code: "PR-23", points: POIDS_NIVEAU[n], actif: true, source: "structurel" }
    : { code: "PR-23", points: 0, actif: false, source: "absent" };
}

export type Score = { total: number; evaluations: Evaluation[] };

/** Rejoue toutes les règles. Appelée à l'affichage et avant chaque écriture (cache). */
export function calculerScore(contact: ContactPourScore, compte: ComptePourScore, aujourdhui: Date = new Date()): Score {
  const evaluations: Evaluation[] = [
    pr01SignalAncienneteEnPoste(contact, aujourdhui),
    pr02SignalRecrutementQvct(contact, aujourdhui),
    pr03SignalSuitPageAvisdoc(contact, aujourdhui),
    pr04SignalChangementDePoste(contact, aujourdhui),
    pr05SignalRapportRse(contact, aujourdhui),
    pr06SignalSemaineQvct(contact, aujourdhui),
    pr07SignalCroissanceEffectif(contact, aujourdhui),
    pr08SignalActiviteLinkedin(contact, aujourdhui),
    pr09SignalRelationsCommunes(contact, aujourdhui),
    pr10SignalMentionPresse(contact, aujourdhui),
    pr20CritereCercle(compte),
    pr21CritereSecteurExpose(compte),
    pr22CritereEffectif(compte),
    pr23CritereNiveau(contact),
  ];
  return { total: evaluations.reduce((s, e) => s + e.points, 0), evaluations };
}
