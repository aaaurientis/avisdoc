// Export des liens Doctolib d'un département et import des résultats relevés par
// l'équipe (fichier CSV, séparateur « ; », ouvert dans Excel). Logique PURE, testée.
//
// Rien n'est deviné : chaque ligne importée doit porter le RPPS du praticien et le lien
// de SA fiche Doctolib (la source), et la date du relevé. Une valeur absente reste
// « inconnue » ; une valeur illisible est signalée et ignorée, jamais interprétée.

export const COLONNES_EXPORT = [
  // « dernier_releve » : date du dernier chargement de la page (favori ou import), pour information ;
  // l'import ne la lit pas (la date à remplir est « releve_le »).
  "rpps", "nom", "prenom", "population", "ville", "statut_lien", "url_doctolib", "dernier_releve",
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
  /** Contenu complet relevé (facultatif) : analysé par le Hub, conservé sur la fiche. */
  texteFiche?: string | null;
  texteCreneaux?: string | null;
  siteWeb?: string | null;
  telephones?: string[];
  motifs?: string[];
  lieux?: string[];
  /** Horaires affichés, « AAAA-MM-JJ HH:MM » (liste structurée, si le relevé la fournit). */
  creneaux?: string[];
  /** Lieu et motif sur lesquels les créneaux ont été relevés. */
  releveSur?: string | null;
  /** Toute autre colonne remplie, gardée telle quelle (rien ne se perd). */
  autres?: Record<string, string>;
}

/** Colonnes connues (lues et interprétées) : tout le reste part dans « autres ». */
const CONNUES = new Set(["rpps", "nom", "prenom", "population", "ville", "statut_lien", "url_doctolib", "dernier_releve", "statut_fiche",
  "reservable", "nouveaux_patients", "premier_creneau", "creneaux_7j", "releve_le", "texte_fiche", "fiche_texte_integral",
  "autres_lieux_texte_integral", "texte_creneaux", "page_creneaux_texte_integral", "site_web", "site_web_et_liens", "telephones",
  "motifs", "motifs_reservables", "lieux", "creneaux", "prochains_30_creneaux", "lieu_releve", "motif_releve", "lieu_motif_releve"]);

/** Séparateur entre les rubriques de texte (fiche, « Voir plus ») — reconnu par l'analyse de la fiche. */
const SEPARATEUR = "\n§§avisdoc§§\n";
const MAX_TEXTE = 60000;
const liste = (v: string) => [...new Set(v.split(/\s*(?:\||;|\n)\s*/).map((x) => x.trim()).filter(Boolean))].slice(0, 30);

export interface LectureImport { resultats: ResultatDoctolib[]; erreurs: { ligne: number; message: string }[] }

const sansAccents = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Un commentaire entre parenthèses suit parfois la valeur : « non (bloqué dans le parcours) » → « non ». */
const sansCommentaire = (v: string) => v.replace(/\s*\(.*\)\s*$/, "").trim();

function ouiNon(v: string): boolean | null | "illisible" {
  const x = sansAccents(sansCommentaire(v));
  // « inconnu » = case vide : on ne sait pas, on n'en déduit rien.
  if (!x || x === "inconnu" || x === "?" || x === "nc") return null;
  if (["oui", "o", "yes", "y", "1", "vrai", "true", "x"].includes(x)) return true;
  if (["non", "n", "no", "0", "faux", "false"].includes(x)) return false;
  return "illisible";
}

/** « 2026-11-20 », « 20/11/2026 » ou « 20/11/26 » → AAAA-MM-JJ ; null si vide ; "illisible" sinon. */
export function dateImport(v: string): string | null | "illisible" {
  const x = sansCommentaire(v);
  if (!x || sansAccents(x) === "inconnu") return null;
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
    // Contenu complet (facultatif) : texte de la fiche et de ses « Voir plus », page des créneaux, site, téléphones, motifs, lieux.
    const commence = (prefixe: string) => entete.map((c, k) => (c.startsWith(prefixe) ? (l[k] ?? "").trim() : "")).filter(Boolean);
    const texteFiche = [v("texte_fiche"), v("fiche_texte_integral"), ...commence("voirplus_"), v("autres_lieux_texte_integral")].filter(Boolean).join(SEPARATEUR).slice(0, MAX_TEXTE);
    const texteCreneaux = (v("texte_creneaux") || v("page_creneaux_texte_integral")).slice(0, MAX_TEXTE);
    const siteWeb = v("site_web") || v("site_web_et_liens");
    const telephones = liste(v("telephones"));
    const motifs = liste(v("motifs") || v("motifs_reservables"));
    const lieux = liste(v("lieux"));
    const creneauxListe = liste(v("creneaux") || v("prochains_30_creneaux")).filter((c) => /^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}/.test(c)).slice(0, 200);
    const autres: Record<string, string> = {};
    entete.forEach((c, k) => {
      if (!c || CONNUES.has(c) || c.startsWith("voirplus_")) return;
      const val = (l[k] ?? "").trim();
      if (val) autres[c] = val.slice(0, 20000);
    });
    const releveSur = (v("lieu_motif_releve") || [v("lieu_releve"), v("motif_releve")].filter(Boolean).join(" · ")).slice(0, 300);
    const contenu = !!(texteFiche || texteCreneaux || siteWeb || telephones.length || motifs.length || lieux.length || creneauxListe.length || releveSur);
    const resultatsVides = COLONNES_RESULTATS.every((c) => !v(c)) && !contenu;
    if (!rpps && resultatsVides) return;
    if (resultatsVides) return; // ligne exportée, pas encore relevée : ignorée sans erreur
    const err = (message: string) => erreurs.push({ ligne: n, message: `${rpps || "RPPS ?"} : ${message}` });
    // Colonne facultative « statut_fiche » : une page disparue ou non relevée n'apporte aucun résultat.
    const statutFiche = sansAccents(v("statut_fiche"));
    if (statutFiche.startsWith("non releve")) return;
    if (statutFiche.startsWith("page inexistante")) return err("la page Doctolib n'existe plus : lien à corriger sur la fiche, ligne ignorée.");
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
      ...(contenu ? { texteFiche: texteFiche || null, texteCreneaux: texteCreneaux || null, siteWeb: siteWeb || null, telephones, motifs, lieux, creneaux: creneauxListe, releveSur: releveSur || null } : {}),
      ...(Object.keys(autres).length ? { autres } : {}),
    });
  });
  return { resultats, erreurs };
}
