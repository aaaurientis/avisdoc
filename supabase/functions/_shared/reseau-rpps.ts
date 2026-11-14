// Réseau d'aval : lecture de l'extraction RPPS (Annuaire Santé, ANS) pour un
// département. Logique PURE, sans réseau ni base : partagée entre l'Edge Function
// `reseau-import` (Deno) et les tests du front (Vitest).
//
// Réf. : docs/reseau-aval-lot0.md. Une ligne du fichier « personne-activite » =
// un praticien × une spécialité × une activité ; on regroupe par RPPS.

export type Population = "DERM" | "ORL" | "PLAST" | "CHIR" | "MG_DERM";
export type Role = "consultation" | "dermoscopie" | "exerese" | "requerant";

/** Spécialités ordinales (type S) importées, par population (note du lot 0, §3). */
export const SPECIALITES: Record<string, Population> = {
  SM15: "DERM", // Dermatologie et vénéréologie
  SM34: "ORL", // O.R.L et chirurgie cervico faciale
  SM39: "ORL", // Oto-rhino-laryngologie (ancien intitulé)
  SM86: "ORL", // ORL – chirurgie cervico-faciale, option audiophonologie
  SM10: "PLAST", // Chirurgie plastique reconstructrice et esthétique
  SM05: "CHIR", // Chirurgie générale (la chirurgie viscérale SM14 est exclue, 14/11)
};

/** Codes de médecine générale : contrôle des MG_DERM ajoutés à la main ou par l'IA. */
export const CODES_MEDECINE_GENERALE = ["SM26", "SM53", "SM54"];

export const POPULATION_LIBELLE: Record<Population, string> = {
  DERM: "Dermatologue",
  ORL: "ORL",
  PLAST: "Chirurgien plasticien",
  CHIR: "Chirurgien généraliste",
  MG_DERM: "Généraliste formé à la dermoscopie",
};

/** Rôles attendus d'après la spécialité (brief, §2). Les rôles acceptés viendront de l'accord. */
export const ROLES_ATTENDUS: Record<Population, Role[]> = {
  DERM: ["consultation", "dermoscopie", "exerese"],
  ORL: ["exerese"],
  PLAST: ["exerese"],
  CHIR: ["exerese"],
  MG_DERM: ["consultation", "dermoscopie"],
};

/** Si un praticien a plusieurs spécialités importées, la plus proche de la dermatologie l'emporte. */
const PRIORITE: Population[] = ["DERM", "PLAST", "ORL", "CHIR", "MG_DERM"];

export const DEPARTEMENTS: Record<string, string> = {
  "01": "Ain", "02": "Aisne", "03": "Allier", "04": "Alpes-de-Haute-Provence", "05": "Hautes-Alpes",
  "06": "Alpes-Maritimes", "07": "Ardèche", "08": "Ardennes", "09": "Ariège", "10": "Aube",
  "11": "Aude", "12": "Aveyron", "13": "Bouches-du-Rhône", "14": "Calvados", "15": "Cantal",
  "16": "Charente", "17": "Charente-Maritime", "18": "Cher", "19": "Corrèze", "2A": "Corse-du-Sud",
  "2B": "Haute-Corse", "21": "Côte-d'Or", "22": "Côtes-d'Armor", "23": "Creuse", "24": "Dordogne",
  "25": "Doubs", "26": "Drôme", "27": "Eure", "28": "Eure-et-Loir", "29": "Finistère",
  "30": "Gard", "31": "Haute-Garonne", "32": "Gers", "33": "Gironde", "34": "Hérault",
  "35": "Ille-et-Vilaine", "36": "Indre", "37": "Indre-et-Loire", "38": "Isère", "39": "Jura",
  "40": "Landes", "41": "Loir-et-Cher", "42": "Loire", "43": "Haute-Loire", "44": "Loire-Atlantique",
  "45": "Loiret", "46": "Lot", "47": "Lot-et-Garonne", "48": "Lozère", "49": "Maine-et-Loire",
  "50": "Manche", "51": "Marne", "52": "Haute-Marne", "53": "Mayenne", "54": "Meurthe-et-Moselle",
  "55": "Meuse", "56": "Morbihan", "57": "Moselle", "58": "Nièvre", "59": "Nord",
  "60": "Oise", "61": "Orne", "62": "Pas-de-Calais", "63": "Puy-de-Dôme", "64": "Pyrénées-Atlantiques",
  "65": "Hautes-Pyrénées", "66": "Pyrénées-Orientales", "67": "Bas-Rhin", "68": "Haut-Rhin", "69": "Rhône",
  "70": "Haute-Saône", "71": "Saône-et-Loire", "72": "Sarthe", "73": "Savoie", "74": "Haute-Savoie",
  "75": "Paris", "76": "Seine-Maritime", "77": "Seine-et-Marne", "78": "Yvelines", "79": "Deux-Sèvres",
  "80": "Somme", "81": "Tarn", "82": "Tarn-et-Garonne", "83": "Var", "84": "Vaucluse",
  "85": "Vendée", "86": "Vienne", "87": "Haute-Vienne", "88": "Vosges", "89": "Yonne",
  "90": "Territoire de Belfort", "91": "Essonne", "92": "Hauts-de-Seine", "93": "Seine-Saint-Denis",
  "94": "Val-de-Marne", "95": "Val-d'Oise", "971": "Guadeloupe", "972": "Martinique", "973": "Guyane",
  "974": "La Réunion", "976": "Mayotte",
};

export function estDepartement(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(DEPARTEMENTS, code);
}

/**
 * Bornes de code postal à demander à l'API, pour un département. La colonne
 * « Code Département » du fichier est vide (note du lot 0, §1.3) : on passe par le
 * lieu d'exercice. La Corse partage les codes postaux 20xxx : on départage ensuite
 * par le code commune (2A…, 2B…).
 */
export function bornesCodePostal(code: string): { min: string; max: string } {
  if (code === "2A" || code === "2B") return { min: "20000", max: "20999" };
  if (code.length === 3) return { min: `${code}00`, max: `${code}99` };
  return { min: `${code}000`, max: `${code}999` };
}

/** Le département d'un lieu d'exercice, d'après son code commune puis son code postal. */
export function departementDuLieu(codeCommune: string, codePostal: string): string | null {
  const cc = (codeCommune ?? "").trim().toUpperCase();
  if (/^2[AB]/.test(cc)) return cc.slice(0, 2);
  if (/^97[1-6]/.test(cc)) return cc.slice(0, 3);
  if (/^\d{5}$/.test(cc) && !cc.startsWith("20")) return cc.slice(0, 2);
  const cp = (codePostal ?? "").trim();
  if (/^97[1-6]\d{2}$/.test(cp)) return cp.slice(0, 3);
  if (/^\d{5}$/.test(cp) && !cp.startsWith("20")) return cp.slice(0, 2);
  return null; // Corse sans code commune : on ne devine pas
}

/** Une ligne telle que renvoyée par l'API tabulaire (colonnes du fichier). */
export type LigneRpps = Record<string, unknown>;

export interface LieuRpps {
  departement: string;
  cle: string;
  raisonSociale: string | null;
  adresse: string | null;
  codePostal: string | null;
  commune: string | null;
  codeCommune: string | null;
  telephone: string | null;
  modeExercice: string | null;
  secteur: string | null;
  finess: string | null;
  siret: string | null;
}

export interface PraticienRpps {
  rpps: string;
  civilite: string | null;
  nom: string;
  prenom: string;
  population: Population;
  roles: Role[];
  specialites: string[];
  lieux: LieuRpps[];
}

const txt = (v: unknown): string => (v == null ? "" : String(v).trim());
const ouNull = (v: unknown): string | null => txt(v) || null;

/** RPPS sur 11 chiffres. L'API renvoie parfois un nombre : on le remet en texte. */
export function normaliserRpps(v: unknown): string | null {
  const s = txt(v).replace(/\D/g, "");
  return /^\d{11}$/.test(s) ? s : null;
}

/** « Lib,indép,artis,com » (libellé RPPS) se lit « Libéral ». */
export function libelleModeExercice(v: unknown): string | null {
  const s = txt(v);
  if (!s) return null;
  if (/^lib/i.test(s)) return "Libéral";
  return s;
}

function adresseDe(l: LigneRpps): string | null {
  const voie = [
    txt(l["Numéro Voie (coord. structure)"]),
    txt(l["Indice répétition voie (coord. structure)"]),
    txt(l["Libellé type de voie (coord. structure)"]),
    txt(l["Libellé Voie (coord. structure)"]),
  ].filter(Boolean).join(" ");
  const parties = [
    txt(l["Complément destinataire (coord. structure)"]),
    txt(l["Complément point géographique (coord. structure)"]),
    voie,
    txt(l["Mention distribution (coord. structure)"]),
  ].filter(Boolean);
  return parties.length ? parties.join(", ") : null;
}

function cleDuLieu(l: LigneRpps, adresse: string | null, cp: string | null): string {
  const id = txt(l["Identifiant technique de la structure"]);
  if (id) return id;
  return `${(adresse ?? "").toUpperCase().replace(/\s+/g, " ")}|${cp ?? ""}`;
}

/**
 * Regroupe les lignes d'un département par praticien. Ne garde que les médecins
 * (profession 10) ayant une spécialité ordinale importée et un lieu d'exercice
 * dans le département demandé. Les autres lignes sont ignorées sans erreur.
 */
export function regrouperParPraticien(lignes: LigneRpps[], departement: string): PraticienRpps[] {
  const parRpps = new Map<string, PraticienRpps>();
  for (const l of lignes) {
    if (txt(l["Code profession"]) !== "10") continue;
    if (txt(l["Code type savoir-faire"]) !== "S") continue;
    const population = SPECIALITES[txt(l["Code savoir-faire"])];
    if (!population) continue;
    const rpps = normaliserRpps(l["Identifiant PP"]);
    if (!rpps) continue;
    const cp = ouNull(l["Code postal (coord. structure)"]);
    const cc = ouNull(l["Code commune (coord. structure)"]);
    if (departementDuLieu(cc ?? "", cp ?? "") !== departement) continue;

    let p = parRpps.get(rpps);
    if (!p) {
      p = {
        rpps,
        civilite: ouNull(l["Libellé civilité d'exercice"]) ?? ouNull(l["Libellé civilité"]),
        nom: txt(l["Nom d'exercice"]),
        prenom: txt(l["Prénom d'exercice"]),
        population,
        roles: [],
        specialites: [],
        lieux: [],
      };
      parRpps.set(rpps, p);
    }
    if (PRIORITE.indexOf(population) < PRIORITE.indexOf(p.population)) p.population = population;
    const lib = txt(l["Libellé savoir-faire"]);
    if (lib && !p.specialites.includes(lib)) p.specialites.push(lib);

    const adresse = adresseDe(l);
    const cle = cleDuLieu(l, adresse, cp);
    if (!p.lieux.some((x) => x.cle === cle)) {
      p.lieux.push({
        departement,
        cle,
        raisonSociale: ouNull(l["Raison sociale site"]) ?? ouNull(l["Enseigne commerciale site"]),
        adresse,
        codePostal: cp,
        commune: ouNull(l["Libellé commune (coord. structure)"]),
        codeCommune: cc,
        telephone: ouNull(l["Téléphone (coord. structure)"]),
        modeExercice: libelleModeExercice(l["Libellé mode exercice"]),
        secteur: ouNull(l["Libellé secteur d'activité"]),
        finess: ouNull(l["Numéro FINESS site"]),
        siret: ouNull(l["Numéro SIRET site"]),
      });
    }
  }
  for (const p of parRpps.values()) p.roles = [...ROLES_ATTENDUS[p.population]];
  return [...parRpps.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr") || a.prenom.localeCompare(b.prenom, "fr"));
}

export interface PraticienExistant {
  id: string;
  rpps: string;
  etat: string;
}

export interface PlanImport {
  aCreer: PraticienRpps[];
  aMettreAJour: { id: string; praticien: PraticienRpps }[];
  exclusIgnores: string[];
}

/**
 * Décide, sans rien écrire, ce que l'import fera. Rejouable : un RPPS déjà connu
 * est mis à jour, jamais recréé ; un RPPS exclu est ignoré, toujours.
 */
export function planifierImport(
  praticiens: PraticienRpps[],
  existants: PraticienExistant[],
  exclus: Iterable<string>,
): PlanImport {
  const setExclus = new Set(exclus);
  const parRpps = new Map(existants.map((e) => [e.rpps, e]));
  const plan: PlanImport = { aCreer: [], aMettreAJour: [], exclusIgnores: [] };
  for (const p of praticiens) {
    const e = parRpps.get(p.rpps);
    if (setExclus.has(p.rpps) || e?.etat === "exclu") {
      plan.exclusIgnores.push(p.rpps);
      continue;
    }
    if (e) plan.aMettreAJour.push({ id: e.id, praticien: p });
    else plan.aCreer.push(p);
  }
  return plan;
}

/** Au-delà de 90 jours, une donnée open data est marquée périmée (règle 9 du brief). */
export const JOURS_PEREMPTION = 90;

export function estPerime(extraitLe: string | null | undefined, maintenant: Date = new Date()): boolean {
  if (!extraitLe) return true;
  const t = new Date(extraitLe).getTime();
  if (Number.isNaN(t)) return true;
  return maintenant.getTime() - t > JOURS_PEREMPTION * 86_400_000;
}
