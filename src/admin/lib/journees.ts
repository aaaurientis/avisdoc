// Journées de dépistage — lecture de l'extraction CSV et calculs du suivi.
//
// Une extraction = un fichier CSV daté (ex. 2026-11-05.csv) qui liste TOUTES les journées :
// une ligne par journée (client, devis, expert, lieu, confirmations, dermatoscope…).
// Fonctions pures (sans réseau) : testées dans journees.test.ts.

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
  dermatologue: string;
  expert: string;
  /** Date de la journée (AAAA-MM-JJ). */
  date: string;
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
  dermatologue: "dermatologue",
  expert: "expert",
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
    for (const champ of Object.values(COLONNES)) {
      const i = index.get(champ);
      const brut = i === undefined ? "" : nettoyer(cellules[i]);
      if (CHAMPS_DATE.has(champ)) j[champ] = jourDe(brut);
      else if (CHAMPS_OUI.has(champ)) j[champ] = estOui(brut);
      else if (CHAMPS_NOMBRE.has(champ)) j[champ] = brut && Number.isFinite(Number(brut)) ? Number(brut) : null;
      else j[champ] = brut;
    }
    return j as unknown as JourneeDepistage;
  });
  const colonnesManquantes = Object.entries(COLONNES)
    .filter(([, champ]) => !index.has(champ))
    .map(([nom]) => nom);
  return { journees, colonnesManquantes };
}

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
  for (const j of journees) {
    const k = champ(j) || "(non renseigné)";
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  return [...n.entries()].map(([cle, nombre]) => ({ cle, nombre })).sort((a, b) => b.nombre - a.nombre || a.cle.localeCompare(b.cle));
}

/** Journées par mois (AAAA-MM), sans trou entre le premier et le dernier mois. */
export function parMois(journees: JourneeDepistage[]): Compte[] {
  const datees = journees.filter((j) => j.date);
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
  for (const j of journees) {
    const cle = `${j.client}\u0000${j.devis}`;
    const c = parCle.get(cle) ?? { client: j.client, devis: j.devis, commandees: null, planifiees: 0, passees: 0, prochaine: null };
    c.planifiees++;
    if (estPassee(j, aujourdhui)) c.passees++;
    else if (j.date && (!c.prochaine || j.date < c.prochaine)) c.prochaine = j.date;
    if (j.commandees !== null) c.commandees = Math.max(c.commandees ?? 0, j.commandees);
    parCle.set(cle, c);
  }
  return [...parCle.values()].sort((a, b) => b.planifiees - a.planifiees || a.client.localeCompare(b.client));
}

export interface Preparation {
  total: number;
  confClient: number;
  confConsentements: number;
  confRequerant: number;
  dermatoscopeEnvoye: number;
}

/** Où en est la préparation des journées données (en pratique : celles à venir). */
export function preparation(journees: JourneeDepistage[]): Preparation {
  return {
    total: journees.length,
    confClient: journees.filter((j) => j.confClient).length,
    confConsentements: journees.filter((j) => j.confConsentements).length,
    confRequerant: journees.filter((j) => j.confRequerant).length,
    dermatoscopeEnvoye: journees.filter((j) => j.envoiDermatoscope).length,
  };
}

/** Ce qui manque encore pour qu'une journée soit prête. */
export function manques(j: JourneeDepistage): string[] {
  const m: string[] = [];
  if (!j.confClient) m.push("client");
  if (!j.confConsentements) m.push("consentements");
  if (!j.confRequerant) m.push("requérant");
  if (!j.envoiDermatoscope) m.push("dermatoscope");
  return m;
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

/** État d'une journée pour l'affichage : passée, prête (tout est confirmé) ou à confirmer. */
export type EtatJournee = "passee" | "prete" | "a-confirmer";
export const etatDe = (j: JourneeDepistage, aujourdhui = aujourdhuiISO()): EtatJournee =>
  estPassee(j, aujourdhui) ? "passee" : manques(j).length ? "a-confirmer" : "prete";
