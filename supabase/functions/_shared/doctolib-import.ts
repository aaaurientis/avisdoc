// Export des liens Doctolib d'un département et import des résultats relevés par
// l'équipe (fichier CSV, séparateur « ; », ouvert dans Excel). Logique PURE, testée.
//
// Rien n'est deviné : chaque ligne importée doit porter le RPPS du praticien et le lien
// de SA fiche Doctolib (la source), et la date du relevé. Une valeur absente reste
// « inconnue » ; une valeur illisible est signalée et ignorée, jamais interprétée.

export const COLONNES_EXPORT = [
  "rpps", "nom", "prenom", "population", "ville", "statut_lien", "url_doctolib",
  "reservable", "nouveaux_patients", "premier_creneau", "creneaux_7j", "releve_le",
] as const;

/** Colonnes à remplir par l'équipe (laissées vides à l'export). */
export const COLONNES_RESULTATS = ["reservable", "nouveaux_patients", "premier_creneau", "creneaux_7j", "releve_le"] as const;

const echapper = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function versCsv(lignes: Record<string, string | number | null | undefined>[], colonnes: readonly string[]): string {
  // BOM : Excel ouvre le fichier en UTF-8 (accents).
  return "﻿" + [colonnes.join(";"), ...lignes.map((l) => colonnes.map((c) => echapper(String(l[c] ?? ""))).join(";"))].join("\r\n");
}

/** Lecture CSV tolérante : « ; » ou « , » (détecté sur l'en-tête), guillemets, BOM. */
export function lireCsv(texte: string): string[][] {
  const t = texte.replace(/^﻿/, "");
  const premiere = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = (premiere.match(/;/g)?.length ?? 0) >= (premiere.match(/,/g)?.length ?? 0) ? ";" : ",";
  const lignes: string[][] = [];
  let ligne: string[] = [], champ = "", guillemets = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (guillemets) {
      if (ch === '"' && t[i + 1] === '"') { champ += '"'; i++; }
      else if (ch === '"') guillemets = false;
      else champ += ch;
    } else if (ch === '"') guillemets = true;
    else if (ch === sep) { ligne.push(champ); champ = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      ligne.push(champ); champ = "";
      if (ligne.some((c) => c.trim())) lignes.push(ligne);
      ligne = [];
    } else champ += ch;
  }
  ligne.push(champ);
  if (ligne.some((c) => c.trim())) lignes.push(ligne);
  return lignes;
}

export interface ResultatDoctolib {
  ligne: number;
  rpps: string;
  url: string;
  releveLe: string;
  reservable: boolean | null;
  nouveauxPatients: "oui" | "non" | null;
  premierCreneau: string | null;
  creneaux7j: number | null;
  /** Valeur du signal « premier créneau », déduite du délai entre le relevé et le premier créneau. */
  creneau: "moins_7j" | "7_30j" | "plus_30j" | "aucun_nouveau" | null;
}

export interface LectureImport { resultats: ResultatDoctolib[]; erreurs: { ligne: number; message: string }[] }

const sansAccents = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function ouiNon(v: string): boolean | null | "illisible" {
  const x = sansAccents(v);
  if (!x) return null;
  if (["oui", "o", "yes", "y", "1", "vrai", "true", "x"].includes(x)) return true;
  if (["non", "n", "no", "0", "faux", "false"].includes(x)) return false;
  return "illisible";
}

/** « 2026-11-20 », « 20/11/2026 » ou « 20/11/26 » → AAAA-MM-JJ ; null si vide ; "illisible" sinon. */
export function dateImport(v: string): string | null | "illisible" {
  const x = v.trim();
  if (!x) return null;
  let m = x.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = x.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const a = m[3].length === 2 ? `20${m[3]}` : m[3];
    const d = `${a}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return Number.isNaN(Date.parse(d)) ? "illisible" : d;
  }
  return "illisible";
}

const lienValide = (u: string) => /^https:\/\/(www\.)?doctolib\.(fr|de|it)\/[^\s]+\/[^\s]+\/[^\s]+/.test(u);

/** Analyse le fichier importé ; `aujourdhui` borne les dates de relevé (pas de relevé futur). */
export function analyserImport(texte: string, aujourdhui: Date = new Date()): LectureImport {
  const lignes = lireCsv(texte);
  const erreurs: LectureImport["erreurs"] = [];
  const resultats: ResultatDoctolib[] = [];
  if (!lignes.length) return { resultats, erreurs: [{ ligne: 1, message: "Fichier vide." }] };
  const entete = lignes[0].map((c) => sansAccents(c).replace(/\s+/g, "_"));
  const col = (nom: string) => entete.indexOf(nom);
  for (const requis of ["rpps", "url_doctolib", "releve_le"]) {
    if (col(requis) < 0) erreurs.push({ ligne: 1, message: `Colonne « ${requis} » absente : repartez du fichier exporté.` });
  }
  if (erreurs.length) return { resultats, erreurs };
  const auj = aujourdhui.toISOString().slice(0, 10);
  const vus = new Set<string>();

  lignes.slice(1).forEach((l, i) => {
    const n = i + 2;
    const v = (nom: string) => (col(nom) >= 0 ? (l[col(nom)] ?? "").trim() : "");
    const rpps = v("rpps").replace(/\s/g, "");
    const resultatsVides = COLONNES_RESULTATS.every((c) => !v(c));
    if (!rpps && resultatsVides) return;
    if (resultatsVides) return; // ligne exportée, pas encore relevée : ignorée sans erreur
    const err = (message: string) => erreurs.push({ ligne: n, message: `${rpps || "RPPS ?"} : ${message}` });
    if (!/^\d{11}$/.test(rpps)) return err("RPPS absent ou invalide (11 chiffres).");
    if (vus.has(rpps)) return err("RPPS en double dans le fichier : seule la première ligne est prise.");
    const url = v("url_doctolib");
    if (!lienValide(url)) return err("lien Doctolib absent ou invalide : il est la source, il est obligatoire.");
    const releve = dateImport(v("releve_le"));
    if (!releve || releve === "illisible") return err("date du relevé (releve_le) absente ou illisible.");
    if (releve > auj) return err("date du relevé dans le futur.");
    const reservable = ouiNon(v("reservable"));
    const nouveaux = ouiNon(v("nouveaux_patients"));
    const premier = dateImport(v("premier_creneau"));
    const sept = v("creneaux_7j");
    if (reservable === "illisible") return err(`« reservable » illisible (${v("reservable")}) : oui ou non.`);
    if (nouveaux === "illisible") return err(`« nouveaux_patients » illisible (${v("nouveaux_patients")}) : oui ou non.`);
    if (premier === "illisible") return err(`« premier_creneau » illisible (${v("premier_creneau")}) : date ou vide.`);
    if (sept && !/^\d{1,4}$/.test(sept)) return err(`« creneaux_7j » illisible (${sept}) : un nombre.`);
    let creneau: ResultatDoctolib["creneau"] = null;
    if (premier) {
      const jours = Math.round((Date.parse(premier) - Date.parse(releve)) / 86_400_000);
      if (jours < 0) return err("premier créneau antérieur à la date du relevé.");
      creneau = jours < 7 ? "moins_7j" : jours <= 30 ? "7_30j" : "plus_30j";
    } else if (nouveaux === false) creneau = "aucun_nouveau";
    vus.add(rpps);
    resultats.push({
      ligne: n, rpps, url, releveLe: releve, reservable, nouveauxPatients: nouveaux === null ? null : nouveaux ? "oui" : "non",
      premierCreneau: premier, creneaux7j: sept ? Number(sept) : null, creneau,
    });
  });
  return { resultats, erreurs };
}
