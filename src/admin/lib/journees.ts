// Journées de dépistage — lecture de l'extraction CSV et calculs du suivi.
//
// Une extraction = un fichier CSV daté (ex. 2026-11-05.csv) qui liste TOUTES les journées :
// une ligne par journée (client, devis, expert, lieu, confirmations, dermatoscope…).
// Fonctions pures (sans réseau) : testées dans journees.test.ts.

import { CRITERES, REGLES_DEFAUT, type Regles } from "./typologies";

export interface FichierS3 {
  key: string;
  taille: number;
  /** Date de dépôt dans le bucket (ISO). */
  modifie: string;
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/** Le séparateur le plus fréquent sur la ligne d'en-tête, hors guillemets. Excel FR écrit des « ; ». */
export function separateurProbable(texte: string): string {
  const entete = texte.split(/\r?\n/, 1)[0] ?? "";
  const comptes: Record<string, number> = { ";": 0, ",": 0, "\t": 0, "|": 0 };
  let dansGuillemets = false;
  for (const c of entete) {
    if (c === '"') dansGuillemets = !dansGuillemets;
    else if (!dansGuillemets && c in comptes) comptes[c]++;
  }
  const [sep, n] = Object.entries(comptes).sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? sep : ",";
}

/** CSV → lignes de cellules. Gère les guillemets, les "" échappés et les retours à la ligne dans une cellule. */
export function decouperCsv(texte: string, sep = separateurProbable(texte)): string[][] {
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let cellule = "";
  let dansGuillemets = false;
  const src = texte.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cellule += '"';
          i++;
        } else dansGuillemets = false;
      } else cellule += c;
    } else if (c === '"') dansGuillemets = true;
    else if (c === sep) {
      ligne.push(cellule);
      cellule = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      ligne.push(cellule);
      lignes.push(ligne);
      ligne = [];
      cellule = "";
    } else cellule += c;
  }
  if (cellule !== "" || ligne.length) {
    ligne.push(cellule);
    lignes.push(ligne);
  }
  // Les lignes entièrement vides (fin de fichier, lignes blanches) ne comptent pas.
  return lignes.filter((l) => l.some((x) => x.trim() !== ""));
}

/** Une cellule propre : sans espaces autour, et sans l'enrobage Excel ="0612…" qui protège les numéros. */
export function nettoyer(v: string | undefined): string {
  const s = (v ?? "").trim();
  const m = s.match(/^="(.*)"$/);
  return (m ? m[1] : s).trim();
}

const valide = (a: number, m: number, j: number) => {
  if (a < 2000 || a > 2100 || m < 1 || m > 12 || j < 1 || j > 31) return null;
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCMonth() === m - 1 ? `${a}-${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}` : null;
};

/** La date d'un fichier lue dans son nom : 2026-11-05, 20261105, 05-11-2026 ou 05_11_2026. */
export function dateDansLeNom(key: string): string | null {
  const nom = key.split("/").pop() ?? key;
  for (const m of nom.matchAll(/(\d{4})[-_.]?(\d{2})[-_.]?(\d{2})/g)) {
    const d = valide(+m[1], +m[2], +m[3]);
    if (d) return d;
  }
  for (const m of nom.matchAll(/(\d{2})[-_.](\d{2})[-_.](\d{4})/g)) {
    const d = valide(+m[3], +m[2], +m[1]);
    if (d) return d;
  }
  return null;
}

/**
 * Le jour (AAAA-MM-JJ) d'une date de l'export : ISO (2026-09-21T00:00:00.000Z) ou française (21/09/2026).
 * Les dates ISO de l'export sont posées à minuit (ou 2–3 h UTC = minuit à Paris) : on garde la date écrite,
 * sans conversion de fuseau, pour ne pas glisser d'un jour.
 */
export function jourDe(v: string): string {
  const s = nettoyer(v);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return valide(+iso[1], +iso[2], +iso[3]) ?? "";
  const fr = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (fr) return valide(+fr[3], +fr[2], +fr[1]) ?? "";
  return "";
}

// ── Journées ─────────────────────────────────────────────────────────────────

export interface JourneeDepistage {
  /** Rang dans le fichier (clé d'affichage). */
  id: number;
  creeLe: string;
  client: string;
  /** Nombre de journées commandées sur le devis. */
  commandees: number | null;
  devis: string;
  /** Professionnel de santé présent sur place (colonne « Requérant », ex-« Dermatologue »). */
  requerant: string;
  /** Expert qui rend les avis (colonne « Requis », ex-« Expert »). */
  requis: string;
  /** Date de la journée (AAAA-MM-JJ). */
  date: string;
  /**
   * Journée regroupée (règle du 17/11) : même client, même ville, dates consécutives (3 jours
   * d'écart au plus, week-end compris) = UNE journée. Identifiant commun, rang et nombre de jours.
   */
  groupe?: string;
  groupeRang?: number;
  groupeTaille?: number;
  dateFacture: string;
  lieu: string;
  /** N° de la journée dans le devis (1, 2, 3…). */
  numero: number | null;
  contactNom: string;
  contactTel: string;
  contactEmail: string;
  salle: string;
  acces: string;
  autres: string;
  confClient: boolean;
  confConsentements: boolean;
  confRequerant: boolean;
  envoiDermatoscope: string;
  dateEnvoiDermatoscope: string;
  retourDermatoscope: string;
  dateRetourDermatoscope: string;
}

/** En-tête normalisé : minuscules, sans accents ni ponctuation. « Numéro journée » → « numero journee ». */
const normaliser = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const COLONNES: Record<string, keyof JourneeDepistage> = {
  "date creation": "creeLe",
  client: "client",
  "nombre de journees": "commandees",
  "numero devis": "devis",
  // Noms actuels de l'export (depuis novembre 2026)…
  requerant: "requerant",
  requis: "requis",
  // …et anciens noms, pour relire les extractions antérieures.
  dermatologue: "requerant",
  expert: "requis",
  "date evenement": "date",
  "date facture": "dateFacture",
  lieu: "lieu",
  "numero journee": "numero",
  "nom du contact": "contactNom",
  "telephone du contact": "contactTel",
  "email du contact": "contactEmail",
  salle: "salle",
  acces: "acces",
  "autres informations": "autres",
  "confirmation client": "confClient",
  "confirmation consentements": "confConsentements",
  "confirmation requerant": "confRequerant",
  "numero envoi dermatoscope": "envoiDermatoscope",
  "date envoi dermatoscope": "dateEnvoiDermatoscope",
  "numero retour dermatoscope": "retourDermatoscope",
  "date retour dermatoscope": "dateRetourDermatoscope",
};

const CHAMPS_DATE = new Set<keyof JourneeDepistage>(["creeLe", "date", "dateFacture", "dateEnvoiDermatoscope", "dateRetourDermatoscope"]);
const CHAMPS_OUI = new Set<keyof JourneeDepistage>(["confClient", "confConsentements", "confRequerant"]);
const CHAMPS_NOMBRE = new Set<keyof JourneeDepistage>(["commandees", "numero"]);

export const estOui = (v: string) => /^(oui|yes|true|vrai|1|x|ok)$/i.test(nettoyer(v));

export interface Extraction {
  journees: JourneeDepistage[];
  /** Colonnes attendues absentes du fichier (export modifié ?). */
  colonnesManquantes: string[];
}

/** L'extraction CSV → les journées. Les colonnes sont reconnues par leur nom, dans n'importe quel ordre. */
export function lireExtraction(texte: string): Extraction {
  const [entete, ...corps] = decouperCsv(texte);
  if (!entete) return { journees: [], colonnesManquantes: Object.keys(COLONNES) };
  const index = new Map<keyof JourneeDepistage, number>();
  entete.forEach((c, i) => {
    const champ = COLONNES[normaliser(c)];
    if (champ && !index.has(champ)) index.set(champ, i);
  });
  const journees = corps.map((cellules, rang) => {
    const j = { id: rang + 1 } as Record<string, unknown>;
    for (const champ of new Set(Object.values(COLONNES))) {
      const i = index.get(champ);
      const brut = i === undefined ? "" : nettoyer(cellules[i]);
      if (CHAMPS_DATE.has(champ)) j[champ] = jourDe(brut);
      else if (CHAMPS_OUI.has(champ)) j[champ] = estOui(brut);
      else if (CHAMPS_NOMBRE.has(champ)) j[champ] = brut && Number.isFinite(Number(brut)) ? Number(brut) : null;
      else j[champ] = brut;
    }
    return j as unknown as JourneeDepistage;
  });
  const vus = new Set<string>();
  const colonnesManquantes = Object.entries(COLONNES)
    .filter(([, champ]) => !index.has(champ) && !vus.has(champ) && (vus.add(champ), true))
    .map(([nom]) => nom);
  return { journees: regrouperJournees(journees), colonnesManquantes };
}

// ── Journées regroupées ──────────────────────────────────────────────────────

const sansAccents = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Ville d'un lieu : après le code postal (« …, 63000 Clermont-Ferrand »), sinon la dernière partie. */
export function villeDe(lieu: string): string {
  const l = (lieu ?? "").trim();
  const cp = l.match(/\b\d{5}\s+([^,;()]+)/);
  const v = cp ? cp[1] : l.split(/[,;–-]\s+/).pop() ?? l;
  return sansAccents(v).replace(/\b(cedex|cedex \d+)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Écart maximal entre deux dates d'une même journée regroupée (vendredi → lundi compris). */
export const ECART_REGROUPEMENT = 3;

const joursEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86_400_000);

/** Attribue à chaque journée son regroupement (même client, même ville, dates consécutives). */
export function regrouperJournees<T extends JourneeDepistage>(journees: T[]): T[] {
  const parCle = new Map<string, T[]>();
  for (const j of journees) {
    const ville = villeDe(j.lieu);
    if (!j.date || !j.client || !ville) { j.groupe = `j${j.id}`; j.groupeRang = 1; j.groupeTaille = 1; continue; }
    const cle = `${sansAccents(j.client).trim()}|${ville}`;
    parCle.set(cle, [...(parCle.get(cle) ?? []), j]);
  }
  for (const [cle, liste] of parCle) {
    liste.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    let courant: T[] = [];
    const clore = () => {
      const id = `${cle}|${courant[0].date}`;
      courant.forEach((j, i) => { j.groupe = id; j.groupeRang = i + 1; j.groupeTaille = courant.length; });
      courant = [];
    };
    for (const j of liste) {
      if (courant.length && joursEntre(courant[courant.length - 1].date, j.date) > ECART_REGROUPEMENT) clore();
      courant.push(j);
    }
    if (courant.length) clore();
  }
  return journees;
}

/** Nombre de journées au sens de la règle de regroupement. */
export const nbJournees = (journees: JourneeDepistage[]) => new Set(journees.map((j) => j.groupe ?? `j${j.id}`)).size;

/** Une journée par regroupement (le premier jour présent dans la liste). */
export function unParGroupe<T extends JourneeDepistage>(journees: T[]): T[] {
  const vus = new Set<string>();
  return [...journees].sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.id - b.id)
    .filter((j) => { const g = j.groupe ?? `j${j.id}`; if (vus.has(g)) return false; vus.add(g); return true; });
}

/** Les journées d'une liste réunies par regroupement, dans l'ordre de la liste (chaque bloc à la place de son premier élément). */
export interface BlocJournees<T extends JourneeDepistage = JourneeDepistage> {
  groupe: string;
  /** Par date, puis par ordre de l'extraction. */
  journees: T[];
}

export function blocsJournees<T extends JourneeDepistage>(liste: T[]): BlocJournees<T>[] {
  const parGroupe = new Map<string, BlocJournees<T>>();
  const blocs: BlocJournees<T>[] = [];
  for (const j of liste) {
    const g = j.groupe ?? `j${j.id}`;
    let b = parGroupe.get(g);
    if (!b) { b = { groupe: g, journees: [] }; parGroupe.set(g, b); blocs.push(b); }
    b.journees.push(j);
  }
  for (const b of blocs) b.journees.sort((a, c) => (a.date || "").localeCompare(c.date || "") || a.id - c.id);
  return blocs;
}

const dateFr = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", opts);

/** Dates d'un regroupement : « 4 nov. 2026 », « 4 au 5 nov. 2026 », « 30 oct. au 2 nov. 2026 ». */
export function datesRegroupement(dates: string[]): string {
  const d = [...new Set(dates.filter(Boolean))].sort();
  if (!d.length) return "—";
  const complet: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  if (d.length === 1) return dateFr(d[0], complet);
  const [a, b] = [d[0], d[d.length - 1]];
  const debut =
    a.slice(0, 7) === b.slice(0, 7) ? dateFr(a, { day: "numeric" }) : a.slice(0, 4) === b.slice(0, 4) ? dateFr(a, { day: "numeric", month: "short" }) : dateFr(a, complet);
  return `${debut} au ${dateFr(b, complet)}`;
}

/** Toutes les journées du même regroupement que `j` (elle comprise). */
export const memeRegroupement = <T extends JourneeDepistage>(toutes: T[], j: JourneeDepistage): T[] => {
  const g = j.groupe ?? `j${j.id}`;
  return toutes.filter((x) => (x.groupe ?? `j${x.id}`) === g);
};

// ── Statistiques ─────────────────────────────────────────────────────────────

export const aujourdhuiISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Passée = avant aujourd'hui. La journée du jour est encore « à venir » : elle se prépare. */
export const estPassee = (j: JourneeDepistage, aujourdhui = aujourdhuiISO()) => !!j.date && j.date < aujourdhui;

export type Periode = "avenir" | "30j" | "90j" | "12m" | "tout";

const decaler = (iso: string, jours: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + jours);
  return aujourdhuiISO(d);
};

/** Les journées de la période. « 30j / 90j / 12m » : les jours écoulés ET ce qui vient. */
export function dansLaPeriode(journees: JourneeDepistage[], periode: Periode, aujourdhui = aujourdhuiISO()): JourneeDepistage[] {
  if (periode === "tout") return journees;
  if (periode === "avenir") return journees.filter((j) => j.date >= aujourdhui);
  const borne = decaler(aujourdhui, periode === "30j" ? -30 : periode === "90j" ? -90 : -365);
  return journees.filter((j) => j.date >= borne);
}

export interface Compte {
  cle: string;
  nombre: number;
}

/** Nombre de journées par valeur d'un champ (client, expert, lieu…), du plus fréquent au moins fréquent. */
export function compterPar(journees: JourneeDepistage[], champ: (j: JourneeDepistage) => string): Compte[] {
  const n = new Map<string, number>();
  for (const j of unParGroupe(journees)) {
    const k = champ(j) || "(non renseigné)";
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  return [...n.entries()].map(([cle, nombre]) => ({ cle, nombre })).sort((a, b) => b.nombre - a.nombre || a.cle.localeCompare(b.cle));
}

/** Journées par mois (AAAA-MM), sans trou entre le premier et le dernier mois. */
export function parMois(journees: JourneeDepistage[]): Compte[] {
  const datees = unParGroupe(journees).filter((j) => j.date);
  if (!datees.length) return [];
  const n = new Map<string, number>();
  for (const j of datees) n.set(j.date.slice(0, 7), (n.get(j.date.slice(0, 7)) ?? 0) + 1);
  const mois = [...n.keys()].sort();
  const out: Compte[] = [];
  let [a, m] = mois[0].split("-").map(Number);
  const fin = mois[mois.length - 1];
  for (;;) {
    const cle = `${a}-${String(m).padStart(2, "0")}`;
    out.push({ cle, nombre: n.get(cle) ?? 0 });
    if (cle >= fin) break;
    m++;
    if (m > 12) {
      m = 1;
      a++;
    }
  }
  return out;
}

export interface Contrat {
  client: string;
  devis: string;
  /** Journées commandées (colonne « Nombre de journées »), si renseigné. */
  commandees: number | null;
  planifiees: number;
  passees: number;
  /** Prochaine journée à venir (AAAA-MM-JJ), s'il y en a. */
  prochaine: string | null;
}

/** Un contrat = un client + un devis. Commandées / planifiées / passées. */
export function contrats(journees: JourneeDepistage[], aujourdhui = aujourdhuiISO()): Contrat[] {
  const parCle = new Map<string, Contrat>();
  // Une journée regroupée compte une fois (son dernier jour décide si elle est passée).
  const dernierJour = new Map<string, string>();
  for (const j of journees) { const g = j.groupe ?? `j${j.id}`; if (j.date > (dernierJour.get(g) ?? "")) dernierJour.set(g, j.date); }
  for (const j of unParGroupe(journees)) {
    const cle = `${j.client}\u0000${j.devis}`;
    const c = parCle.get(cle) ?? { client: j.client, devis: j.devis, commandees: null, planifiees: 0, passees: 0, prochaine: null };
    c.planifiees++;
    const fin = dernierJour.get(j.groupe ?? `j${j.id}`) ?? j.date;
    if (fin && fin < aujourdhui) c.passees++;
    else if (j.date && (!c.prochaine || j.date < c.prochaine)) c.prochaine = j.date;
    if (j.commandees !== null) c.commandees = Math.max(c.commandees ?? 0, j.commandees);
    parCle.set(cle, c);
  }
  return [...parCle.values()].sort((a, b) => b.planifiees - a.planifiees || a.client.localeCompare(b.client));
}

export interface Preparation {
  total: number;
  /** Journées dont toutes les conditions exigées (selon la typologie du client) sont remplies. */
  confirmees: number;
  /** Par critère : combien de journées l'exigent, et combien l'ont. Seuls les critères exigés au moins une fois. */
  criteres: { cle: keyof Regles; label: string; exigees: number; acquises: number }[];
}

/** Le critère est-il acquis pour cette journée ? */
export function acquis(j: JourneeDepistage, cle: keyof Regles): boolean {
  switch (cle) {
    case "requerant":
      return j.confRequerant;
    case "expert":
      return !!j.requis;
  }
}

/**
 * Ce qui manque pour qu'une journée soit confirmée, selon ce qu'exige la typologie de son client.
 * Par défaut : requérant confirmé et requis désigné (l'export n'a pas de colonne « confirmation
 * requis » : le requis compte dès que la colonne Requis est remplie).
 */
export function manques(j: JourneeDepistage, regles: Regles = REGLES_DEFAUT): string[] {
  return CRITERES.filter((c) => regles[c.cle] && !acquis(j, c.cle)).map((c) => c.court);
}

/** Où en est la confirmation des journées données (en pratique : celles à venir). */
export function preparation(journees: JourneeDepistage[], reglesDe: (j: JourneeDepistage) => Regles = () => REGLES_DEFAUT): Preparation {
  const criteres = CRITERES.map((c) => {
    const exigeants = journees.filter((j) => reglesDe(j)[c.cle]);
    return { cle: c.cle, label: c.label, exigees: exigeants.length, acquises: exigeants.filter((j) => acquis(j, c.cle)).length };
  }).filter((c) => c.exigees > 0);
  return {
    total: journees.length,
    confirmees: journees.filter((j) => manques(j, reglesDe(j)).length === 0).length,
    criteres,
  };
}

// ── Calendrier ───────────────────────────────────────────────────────────────

/** Le lundi de la semaine d'une date (AAAA-MM-JJ). */
export function lundiDe(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return aujourdhuiISO(d);
}

export const plusJours = (iso: string, n: number) => decaler(iso, n);

/** Les journées entre deux dates incluses, dans l'ordre du temps. */
export function journeesEntre(journees: JourneeDepistage[], debut: string, fin: string): JourneeDepistage[] {
  return journees
    .filter((j) => j.date >= debut && j.date <= fin)
    .sort((a, b) => a.date.localeCompare(b.date) || a.client.localeCompare(b.client));
}

/** Les 42 jours (6 semaines, du lundi au dimanche) qui couvrent le mois `AAAA-MM`. */
export function grilleDuMois(mois: string): string[] {
  const premier = `${mois}-01`;
  const debut = lundiDe(premier);
  return Array.from({ length: 42 }, (_, i) => plusJours(debut, i));
}

/** Le mois `AAAA-MM` décalé de n mois. */
export function moisDecale(mois: string, n: number): string {
  const [a, m] = mois.split("-").map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** État d'une journée pour l'affichage : passée, confirmée (« prete ») ou à confirmer. */
export type EtatJournee = "passee" | "prete" | "a-confirmer";
export const etatDe = (j: JourneeDepistage, aujourdhui = aujourdhuiISO(), regles: Regles = REGLES_DEFAUT): EtatJournee =>
  estPassee(j, aujourdhui) ? "passee" : manques(j, regles).length ? "a-confirmer" : "prete";

// ── Fichiers du bucket ───────────────────────────────────────────────────────

/** Nom de fichier comparable : sans dossier, accents ni casse (« 2026-11-14-journée.csv » → « 2026-11-14-journee.csv »). */
const nomDeFichier = (key: string) =>
  (key.split("/").pop() ?? key)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Les extractions des journées parmi les fichiers du bucket.
 * Les expertises sont déposées au même endroit, avec la même date dans le nom : on ne garde que
 * les fichiers « journée » ; à défaut d'en trouver (anciens noms, ex. 2026-11-05.csv), tout ce qui
 * n'est pas une expertise.
 */
export function extractionsJournees<T extends { key: string }>(fichiers: T[]): T[] {
  const journees = fichiers.filter((f) => /journ/.test(nomDeFichier(f.key)));
  return journees.length ? journees : fichiers.filter((f) => !/expertise/.test(nomDeFichier(f.key)));
}
