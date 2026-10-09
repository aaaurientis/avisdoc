// Importer un fichier de prospection : une ligne = une entreprise.
//
// Le fichier client a des colonnes libres ; la Prospection, non. Chaque colonne du
// modèle a donc une place fixe dans la fiche, et le reste — date du contact, relance,
// rendez-vous, commentaires — part dans l'historique, où le commercial le retrouve.
//
// « Avancement » range l'entreprise dans un pipeline : Contacté, ou RDV. « A répondu »
// n'est pas une colonne : l'affaire reste dans Contacté avec une pastille.

import type { GenreEchange } from "./echanges";
import { nu } from "./import-colonnes";
import { SECTEURS, type Secteur } from "./merx";

/** Les colonnes du modèle, dans l'ordre. L'import les reconnaît par leur nom. */
export const COLONNES_MODELE = [
  "Date enreg",
  "Raison sociale",
  "Nom",
  "Prénom",
  "Fonction",
  "E-mail",
  "Téléphone",
  "Département",
  "Structure",
  "Avancement",
  "Type de contact",
  "Date du contact",
  "Date de relance",
  "Date du RDV",
  "Commentaires",
] as const;

type Colonne = (typeof COLONNES_MODELE)[number];

/** Les intitulés du fichier d'origine de Stéphan, et quelques variantes courantes. */
const AUTRES_NOMS: Partial<Record<Colonne, string[]>> = {
  "Date enreg": ["date enregistrement", "date d enregistrement", "date"],
  "Raison sociale": ["entreprise", "societe", "nom de l entreprise", "etablissement"],
  Fonction: ["profil contacte", "poste", "role"],
  "E-mail": ["email", "mail", "courriel", "adresse mail"],
  Téléphone: ["tel", "telephone", "portable", "mobile"],
  Département: ["dept", "dep"],
  Avancement: ["avancement du contact", "statut"],
  "Date du contact": ["date contact", "premier contact"],
  "Date de relance": ["relance contact", "relance", "date relance"],
  "Date du RDV": ["date presentation", "date rdv", "rdv", "date du rdv de presentation"],
  Commentaires: ["commentaire", "notes", "note", "remarques"],
};

/** Les valeurs proposées dans le modèle pour « Avancement ». */
export const AVANCEMENTS = ["Contacté", "A répondu", "RDV"] as const;

export type Avancement = "contacte" | "repondu" | "rdv";

export interface LigneProspection {
  /** Numéro de la ligne dans le fichier, pour parler de la même chose que le commercial. */
  ligne: number;
  creeLe: string | null;
  nom: string;
  interlocuteur: { prenom: string; nom: string } | null;
  fonction: string | null;
  email: string | null;
  telephone: string | null;
  departement: string | null;
  secteur: Secteur;
  avancement: Avancement | null;
  /** Ce que le fichier disait, quand on ne l'a pas reconnu : on le signale, on ne l'invente pas. */
  avancementInconnu: string | null;
  genreContact: GenreEchange;
  typeContact: string | null;
  contactLe: string | null;
  relanceLe: string | null;
  rdvLe: string | null;
  commentaires: string | null;
}

const texte = (v: unknown): string => (v == null ? "" : v instanceof Date ? v.toISOString() : String(v)).trim();
const ouNull = (t: string) => (t ? t : null);

/**
 * Une date de tableur, rendue en ISO à midi : une date sans heure posée à minuit
 * glisse au jour d'avant dès qu'on la relit dans un autre fuseau.
 */
export function dateIso(v: unknown): string | null {
  let j: number, m: number, a: number;
  if (v instanceof Date && !isNaN(v.getTime())) {
    // Une cellule de date lue par xlsx arrive à minuit (heure locale), parfois à une
    // poignée de secondes près : on arrondit à l'heure avant de prendre le jour.
    const arrondie = new Date(Math.round(v.getTime() / 3_600_000) * 3_600_000);
    [j, m, a] = [arrondie.getDate(), arrondie.getMonth() + 1, arrondie.getFullYear()];
  } else if (typeof v === "number" && v > 20000 && v < 80000) {
    // Numéro de série Excel : jours depuis le 30/12/1899.
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    [j, m, a] = [d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCFullYear()];
  } else {
    const t = texte(v);
    const fr = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (fr) [j, m, a] = [Number(fr[1]), Number(fr[2]), Number(fr[3].length === 2 ? `20${fr[3]}` : fr[3])];
    else if (iso) [a, m, j] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    else return null;
  }
  const d = new Date(a, m - 1, j, 12);
  return isNaN(d.getTime()) || d.getDate() !== j ? null : d.toISOString();
}

export function avancementDe(v: string): Avancement | null {
  const x = nu(v);
  if (!x) return null;
  if (x.startsWith("rdv")) return "rdv";
  if (x === "a repondu" || x === "repondu" || x.startsWith("contact avec echange")) return "repondu";
  if (x === "contacte" || x.startsWith("contact sans reponse")) return "contacte";
  return null;
}

/** La « Structure » du fichier devient le secteur de la Prospection. */
export function secteurDe(v: string): Secteur {
  const x = nu(v);
  // Un fichier exporté d'ici porte déjà le secteur : il revient tel quel.
  const connu = SECTEURS.find((s) => nu(s.id) === x || nu(s.label) === x);
  if (connu) return connu.id;
  if (/municipal|collectivit|mairie|commune/.test(x)) return "collectivites";
  if (/sante|medic|pharma/.test(x)) return "sante_beaute";
  return "autre";
}

function genreDe(v: string): GenreEchange {
  const x = nu(v);
  if (x.startsWith("email") || x.startsWith("e mail") || x === "mail") return "email";
  if (x.startsWith("telephon")) return "appel";
  if (x === "physique") return "rdv";
  return "note";
}

/** Retrouve, pour chaque colonne du modèle, l'intitulé qui lui correspond dans le fichier. */
export function reconnaitreColonnes(entetes: string[]): Map<Colonne, string> {
  const trouvees = new Map<Colonne, string>();
  for (const col of COLONNES_MODELE) {
    const noms = [nu(col), ...(AUTRES_NOMS[col] ?? [])];
    const e = entetes.find((h) => noms.includes(nu(h)) && ![...trouvees.values()].includes(h));
    if (e) trouvees.set(col, e);
  }
  return trouvees;
}

/**
 * Lit les lignes du tableur. Une ligne sans raison sociale est sautée : c'est une
 * ligne vide ou un reste de mise en page, pas une entreprise.
 */
export function lireLignes(lignes: Record<string, unknown>[]): { lignes: LigneProspection[]; manque: Colonne | null } {
  const colonnes = reconnaitreColonnes(Object.keys(lignes[0] ?? {}));
  if (!colonnes.has("Raison sociale")) return { lignes: [], manque: "Raison sociale" };
  const val = (r: Record<string, unknown>, c: Colonne) => (colonnes.has(c) ? r[colonnes.get(c)!] : undefined);

  const lues: LigneProspection[] = [];
  lignes.forEach((r, i) => {
    const nom = texte(val(r, "Raison sociale"));
    if (!nom) return;
    const prenom = texte(val(r, "Prénom"));
    const nomContact = texte(val(r, "Nom"));
    const brut = texte(val(r, "Avancement"));
    const avancement = avancementDe(brut);
    const type = texte(val(r, "Type de contact"));
    lues.push({
      ligne: i + 2, // ligne 1 = les en-têtes
      creeLe: dateIso(val(r, "Date enreg")),
      nom,
      interlocuteur: prenom || nomContact ? { prenom, nom: nomContact } : null,
      fonction: ouNull(texte(val(r, "Fonction"))),
      email: ouNull(texte(val(r, "E-mail"))),
      telephone: ouNull(texte(val(r, "Téléphone"))),
      departement: ouNull(texte(val(r, "Département"))),
      secteur: secteurDe(texte(val(r, "Structure"))),
      avancement,
      avancementInconnu: brut && !avancement ? brut : null,
      genreContact: genreDe(type),
      typeContact: ouNull(type),
      contactLe: dateIso(val(r, "Date du contact")),
      relanceLe: dateIso(val(r, "Date de relance")),
      rdvLe: dateIso(val(r, "Date du RDV")),
      commentaires: ouNull(texte(val(r, "Commentaires"))),
    });
  });
  return { lignes: lues, manque: null };
}

/** « Carole BABIN », ou rien. */
export const nomInterlocuteur = (l: LigneProspection): string | null =>
  l.interlocuteur ? [l.interlocuteur.prenom, l.interlocuteur.nom].filter(Boolean).join(" ") || null : null;

/**
 * Ce que la ligne laisse dans l'historique de la fiche. Le commentaire est gardé
 * entier : c'est la mémoire du commercial, on n'en coupe rien.
 *
 * `avecQui` : quand une entreprise a plusieurs interlocuteurs, chaque échange dit
 * avec lequel il a eu lieu.
 */
export function echangesDe(
  l: LigneProspection,
  avecQui = false,
): { kind: GenreEchange; titre: string; detail: string | null; au: string }[] {
  const precision = l.genreContact === "note" && l.typeContact ? ` (${l.typeContact})` : "";
  const qui = avecQui && nomInterlocuteur(l) ? ` — ${nomInterlocuteur(l)}` : "";
  const sortie: { kind: GenreEchange; titre: string; detail: string | null; au: string }[] = [];
  if (l.contactLe) sortie.push({ kind: l.genreContact, titre: `Premier contact${precision}${qui}`, detail: null, au: l.contactLe });
  if (l.relanceLe) sortie.push({ kind: l.genreContact, titre: `Relance${precision}${qui}`, detail: null, au: l.relanceLe });
  if (l.rdvLe) sortie.push({ kind: "rdv", titre: `RDV de présentation${qui}`, detail: null, au: l.rdvLe });
  // Sans aucune date, le commentaire prend celle de l'import plutôt que de se perdre.
  const au = l.contactLe ?? l.creeLe ?? new Date().toISOString();
  if (l.commentaires) sortie.push({ kind: "note", titre: `Commentaires${qui}`, detail: l.commentaires, au });
  return sortie;
}

/** La colonne du pipeline où va une entreprise : « A répondu » reste dans Contacté. */
export function colonnePour(a: Avancement, colonnes: { label: string }[]): string | null {
  const cherche = a === "rdv" ? (x: string) => x.startsWith("rdv") : (x: string) => x === "contacte";
  return colonnes.find((c) => cherche(nu(c.label)))?.label ?? null;
}

/** Une entreprise du fichier : une ou plusieurs lignes, une par interlocuteur. */
export interface EntrepriseImportee {
  nom: string;
  lignes: LigneProspection[];
  /** Le plus avancé de ses interlocuteurs : un RDV avec l'un vaut pour l'entreprise. */
  avancement: Avancement | null;
}

const RANG: Record<Avancement, number> = { contacte: 1, repondu: 2, rdv: 3 };

/** Une même entreprise sur plusieurs lignes ne fait qu'une fiche. */
export function regrouper(lignes: LigneProspection[]): EntrepriseImportee[] {
  const parNom = new Map<string, EntrepriseImportee>();
  for (const l of lignes) {
    const cle = l.nom.toLowerCase();
    const e = parNom.get(cle) ?? { nom: l.nom, lignes: [], avancement: null };
    e.lignes.push(l);
    if (l.avancement && (!e.avancement || RANG[l.avancement] > RANG[e.avancement])) e.avancement = l.avancement;
    parNom.set(cle, e);
  }
  return [...parNom.values()];
}

/** « 1 » et « 01 » désignent le même département. */
const dep = (d: string | null | undefined) => {
  const t = (d ?? "").trim().toUpperCase();
  return /^\d$/.test(t) ? `0${t}` : t;
};

/**
 * La fiche déjà en Prospection qui est la même entreprise AU MÊME ENDROIT.
 *
 * Même nom ne suffit pas : SMAC à Bordeaux et SMAC dans le Haut-Rhin sont deux
 * établissements, deux interlocuteurs, deux démarches. Sans département dans le
 * fichier, on ne peut pas savoir : on ne rattache pas, la fiche sera créée à part.
 */
export function ficheExistante<T extends { name: string; department: string | null }>(
  e: EntrepriseImportee,
  fiches: T[],
): T | undefined {
  const d = dep(e.lignes.find((l) => l.departement)?.departement);
  if (!d) return undefined;
  return fiches.find((f) => f.name.trim().toLowerCase() === e.nom.toLowerCase() && dep(f.department) === d);
}
