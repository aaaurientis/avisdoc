import { affichageStats } from "./masquage";
// Expertises — lecture de l'extraction CSV (une ligne = un avis) et calculs.
//
// Une expertise faite lors d'une journée de dépistage porte Date événement + Lieu + Numéro journée :
// ce triplet retrouve sa journée sans ambiguïté (vérifié sur l'extraction du 14/11/2026).
// Les autres (colonnes vides) sont des téléexpertises hors journée.
// Fonctions pures : testées dans expertises.test.ts.

import { decouperCsv, jourDe, nettoyer, type JourneeDepistage } from "./journees";

export interface Expertise {
  id: string;
  /** Date et heure d'envoi (« AAAA-MM-JJ HH:MM »). */
  envoi: string;
  affectation: string;
  reponse: string;
  /** Délai de traitement en heures ; mesuré depuis fin août 2026 seulement. */
  delaiH: number | null;
  requerant: string;
  profession: string;
  requis: string;
  recommandation: string;
  delaiRecoJours: number | null;
  urgent: boolean;
  statut: string;
  /** Journée de dépistage : date (AAAA-MM-JJ), lieu, numéro — vides hors journée. */
  date: string;
  lieu: string;
  numero: number | null;
}

const normaliser = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const COLONNES: Record<string, keyof Expertise> = {
  "identifiant dossier": "id",
  "date d envoi": "envoi",
  "date d affectation": "affectation",
  "date de reponse": "reponse",
  "delai de traitement h": "delaiH",
  requerant: "requerant",
  "profession requerant": "profession",
  requis: "requis",
  recommandation: "recommandation",
  "delai recommande jours": "delaiRecoJours",
  urgence: "urgent",
  statut: "statut",
  "date evenement": "date",
  lieu: "lieu",
  "numero journee": "numero",
};

const nombreOuRien = (v: string): number | null => {
  const s = v.replace(",", ".");
  return s && Number.isFinite(Number(s)) ? Number(s) : null;
};

export interface ExtractionExpertises {
  expertises: Expertise[];
  colonnesManquantes: string[];
}

export function lireExpertises(texte: string): ExtractionExpertises {
  const [entete, ...corps] = decouperCsv(texte);
  if (!entete) return { expertises: [], colonnesManquantes: Object.keys(COLONNES) };
  const index = new Map<keyof Expertise, number>();
  entete.forEach((c, i) => {
    const champ = COLONNES[normaliser(c)];
    if (champ && !index.has(champ)) index.set(champ, i);
  });
  const expertises = corps.map((cellules) => {
    const v = (champ: keyof Expertise) => {
      const i = index.get(champ);
      return i === undefined ? "" : nettoyer(cellules[i]);
    };
    return {
      id: v("id"),
      envoi: v("envoi"),
      affectation: v("affectation"),
      reponse: v("reponse"),
      delaiH: nombreOuRien(v("delaiH")),
      requerant: v("requerant"),
      profession: v("profession"),
      requis: v("requis"),
      recommandation: v("recommandation"),
      delaiRecoJours: nombreOuRien(v("delaiRecoJours")),
      urgent: /^(oui|yes|true|1)$/i.test(v("urgent")),
      statut: v("statut"),
      date: jourDe(v("date")),
      lieu: v("lieu"),
      numero: nombreOuRien(v("numero")),
    } satisfies Expertise;
  });
  const colonnesManquantes = Object.entries(COLONNES)
    .filter(([, champ]) => !index.has(champ))
    .map(([nom]) => nom);
  return { expertises, colonnesManquantes };
}

// ── Rattachement aux journées ────────────────────────────────────────────────

export const enJournee = (e: Expertise) => !!e.date && e.numero !== null;

const cle = (date: string, lieu: string, numero: number | null) => `${date}|${normaliser(lieu)}|${numero ?? ""}`;
export const cleJournee = (j: JourneeDepistage) => cle(j.date, j.lieu, j.numero);

/** Les expertises de chaque journée, par clé Date + Lieu + Numéro journée. */
export function parJournee(expertises: Expertise[]): Map<string, Expertise[]> {
  const m = new Map<string, Expertise[]>();
  for (const e of expertises) {
    if (!enJournee(e)) continue;
    const k = cle(e.date, e.lieu, e.numero);
    const l = m.get(k);
    if (l) l.push(e);
    else m.set(k, [e]);
  }
  return m;
}

// ── Statistiques ─────────────────────────────────────────────────────────────

export interface Part {
  cle: string;
  nombre: number;
}

const compter = (liste: Expertise[], champ: (e: Expertise) => string): Part[] => {
  const n = new Map<string, number>();
  for (const e of liste) {
    const k = champ(e) || "(non renseigné)";
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  return [...n.entries()].map(([cle, nombre]) => ({ cle, nombre })).sort((a, b) => b.nombre - a.nombre || a.cle.localeCompare(b.cle));
};

/** Valeur au rang p (0–1) d'une liste triée. */
const quantile = (tries: number[], p: number) => tries[Math.min(tries.length - 1, Math.floor(p * tries.length))];
const mediane = (v: number[]) => {
  if (!v.length) return null;
  const t = [...v].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
};

export interface Delais {
  /** Nombre d'avis dont le délai est mesuré. */
  mesures: number;
  mediane: number | null;
  moyenne: number | null;
  p90: number | null;
  sous24h: number;
  sous48h: number;
}

export function delais(liste: Expertise[]): Delais {
  const v = liste.map((e) => e.delaiH).filter((x): x is number => x !== null).sort((a, b) => a - b);
  return {
    mesures: v.length,
    mediane: mediane(v),
    moyenne: v.length ? v.reduce((s, x) => s + x, 0) / v.length : null,
    p90: v.length ? quantile(v, 0.9) : null,
    sous24h: v.filter((x) => x <= 24).length,
    sous48h: v.filter((x) => x <= 48).length,
  };
}

export interface Resume {
  total: number;
  urgentes: number;
  enJournee: number;
  recommandations: Part[];
  professions: Part[];
  requis: Part[];
  delais: Delais;
  /** Délai recommandé médian (jours), parmi les avis qui en donnent un. */
  delaiRecoMedian: number | null;
  /** Avis distincts par requérant (combien de professionnels ont envoyé). */
  requerants: number;
}

export function resumer(liste: Expertise[]): Resume {
  return {
    total: liste.length,
    urgentes: liste.filter((e) => e.urgent).length,
    enJournee: liste.filter(enJournee).length,
    recommandations: compter(liste, (e) => e.recommandation),
    professions: compter(liste, (e) => e.profession),
    requis: compter(liste, (e) => e.requis),
    delais: delais(liste),
    delaiRecoMedian: mediane(liste.map((e) => e.delaiRecoJours).filter((x): x is number => x !== null && x > 0)),
    requerants: new Set(liste.map((e) => e.requerant).filter(Boolean)).size,
  };
}

export interface Mois {
  mois: string;
  total: number;
  enJournee: number;
}

/** Expertises par mois d'envoi (AAAA-MM), sans trou entre le premier et le dernier mois. */
export function parMois(liste: Expertise[]): Mois[] {
  const n = new Map<string, Mois>();
  for (const e of liste) {
    const m = e.envoi.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) continue;
    const x = n.get(m) ?? { mois: m, total: 0, enJournee: 0 };
    x.total++;
    if (enJournee(e)) x.enJournee++;
    n.set(m, x);
  }
  const cles = [...n.keys()].sort();
  if (!cles.length) return [];
  const out: Mois[] = [];
  let [a, mo] = cles[0].split("-").map(Number);
  for (;;) {
    const k = `${a}-${String(mo).padStart(2, "0")}`;
    out.push(n.get(k) ?? { mois: k, total: 0, enJournee: 0 });
    if (k >= cles[cles.length - 1]) break;
    if (++mo > 12) {
      mo = 1;
      a++;
    }
  }
  return out;
}

export interface LigneRequis {
  requis: string;
  total: number;
  delaiMedian: number | null;
  /** Avis dont la recommandation est renseignée : base des taux ci-dessous. */
  renseignes: number;
  nonIndispensables: number;
  consultations: number;
  exereses: number;
  /** Avis qui orientent vers un dermatologue : consultation conseillée ou exérèse. */
  orientations: number;
  urgentes: number;
  /** Délai de suivi recommandé (jours) : somme et nombre d'avis qui en donnent un (> 0). */
  delaiSuiviSomme: number;
  delaiSuiviMesures: number;
}

/** Délai moyen de suivi recommandé (jours), ou null s'il n'y en a aucun. */
export const delaiSuiviMoyen = (l: { delaiSuiviSomme: number; delaiSuiviMesures: number }) =>
  l.delaiSuiviMesures ? l.delaiSuiviSomme / l.delaiSuiviMesures : null;

/** Trois issues possibles d'un avis. */
export type Issue = "non-indispensable" | "consultation" | "exerese" | null;
export function issueDe(e: Expertise): Issue {
  const r = e.recommandation.toLowerCase();
  if (!r) return null;
  if (/ex[eé]r[eè]se/.test(r)) return "exerese";
  if (/non indispensable/.test(r)) return "non-indispensable";
  if (/consultation/.test(r)) return "consultation";
  return null;
}

/**
 * Une ligne par requis : volume, délai médian, et ce que ses avis recommandent.
 * Le « taux de consultation » = orientations / avis renseignés.
 */
export function parRequis(liste: Expertise[]): LigneRequis[] {
  const m = new Map<string, Expertise[]>();
  for (const e of liste) m.set(e.requis || "(non renseigné)", [...(m.get(e.requis || "(non renseigné)") ?? []), e]);
  return [...m.entries()]
    .map(([requis, l]) => ({
      requis,
      total: l.length,
      delaiMedian: mediane(l.map((e) => e.delaiH).filter((x): x is number => x !== null)),
      renseignes: l.filter((e) => issueDe(e) !== null).length,
      nonIndispensables: l.filter((e) => issueDe(e) === "non-indispensable").length,
      consultations: l.filter((e) => issueDe(e) === "consultation").length,
      exereses: l.filter((e) => issueDe(e) === "exerese").length,
      orientations: l.filter((e) => issueDe(e) === "consultation" || issueDe(e) === "exerese").length,
      urgentes: l.filter((e) => e.urgent).length,
      ...(() => {
        const d = l.map((e) => e.delaiRecoJours).filter((x): x is number => x !== null && x > 0);
        return { delaiSuiviSomme: d.reduce((s, x) => s + x, 0), delaiSuiviMesures: d.length };
      })(),
    }))
    .sort((a, b) => b.total - a.total);
}

/** Recommandation la plus forte : l'exérèse. */
export const estExerese = (e: Expertise) => /ex[eé]r[eè]se/i.test(e.recommandation);

/** Période d'envoi, comptée en arrière depuis aujourd'hui. */
export type PeriodeExpertises = "12m" | "24m" | "annee" | "tout";
export function dansLaPeriode(liste: Expertise[], periode: PeriodeExpertises, aujourdhui = new Date()): Expertise[] {
  if (periode === "tout") return liste;
  const d = new Date(aujourdhui);
  if (periode === "annee") return liste.filter((e) => e.envoi.startsWith(String(d.getFullYear())));
  d.setMonth(d.getMonth() - (periode === "12m" ? 12 : 24));
  const borne = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return liste.filter((e) => e.envoi.slice(0, 7) >= borne);
}

/**
 * Règle de l'AIPD : aucun détail sur le résultat (recommandation, exérèse, urgence, taux de
 * consultation) quand il porte sur 20 dossiers ou moins. Vaut pour le rapport client comme pour
 * les statistiques du Hub ; les volumes (nombre d'avis) et les délais restent visibles.
 */
export const SEUIL_RAPPORT = 20;
export const SEUIL_AIPD = SEUIL_RAPPORT;
// Admin › Réglages › Statistiques : les résultats dermatologiques peuvent être masqués partout dans le module.
export const resultatsVisibles = (nbDossiers: number) => affichageStats().resultatsDermato && nbDossiers > SEUIL_AIPD;
/** Rapport client : seuil de l'AIPD seulement (le réglage d'affichage des statistiques ne le change pas). */
export const rapportPossible = (nbDossiers: number) => nbDossiers > SEUIL_RAPPORT;
/** Ce qui s'affiche à la place d'un résultat masqué, et pourquoi. */
export const MASQUE = "—";
export const MOTIF_MASQUE = `Masqué : ${SEUIL_AIPD} dossiers ou moins (règle de l'AIPD).`;
