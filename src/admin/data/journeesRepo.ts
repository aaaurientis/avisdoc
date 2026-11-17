// Journées de dépistage — d'où vient l'extraction.
//
// - S3 : la fonction journees-s3 liste le dossier ; on lit le fichier le plus récent
//   (date dans le nom, sinon date de dépôt). Les plus anciens restent consultables.
// - Téléchargement : l'extraction affichée, en CSV, telle qu'elle est dans le bucket.
// - Mode démo (sans base) : une extraction fictive au même format que l'export réel.
import { supabaseAdmin } from "./supabaseAdmin";
import { ADMIN_BACKEND } from "../lib/config";
import { dateDansLeNom, extractionsJournees, lireExtraction, type FichierS3 } from "../lib/journees";
import { logAudit } from "../lib/audit";

export class ErreurJournees extends Error {
  constructor(message: string, readonly nonConfigure = false) {
    super(message);
  }
}

async function appeler<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseAdmin.functions.invoke("journees-s3", { body });
  if (error) {
    // Le message utile est dans le corps JSON, pas dans « non-2xx status code ».
    let detail: { error?: string; nonConfigure?: boolean } = {};
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) detail = await ctx.json();
    } catch {
      /* corps illisible : message générique */
    }
    if (!detail.error && /not found|404/i.test(error.message)) {
      throw new ErreurJournees("La fonction journees-s3 n'est pas encore déployée.", true);
    }
    throw new ErreurJournees(detail.error ?? error.message, !!detail.nonConfigure);
  }
  return data as T;
}

/** Date d'un fichier d'extraction : celle de son nom, sinon son dépôt. */
export const dateDuFichier = (f: FichierS3) => dateDansLeNom(f.key) ?? f.modifie.slice(0, 10);

export interface Source {
  /** Libellé affiché : « S3 · avisdoc-exports/journees-depistage/ » ou « Démo ». */
  origine: string;
  nom: string;
  date: string;
  texte: string;
}

/** Les extractions du bucket, la plus récente d'abord. */
export async function listerExtractions(): Promise<{ bucket: string; prefixe: string; fichiers: FichierS3[] }> {
  if (ADMIN_BACKEND !== "supabase") {
    return { bucket: "démo", prefixe: "", fichiers: [{ key: `demo-${aujourdhui()}.csv`, taille: 0, modifie: new Date().toISOString() }] };
  }
  const r = await appeler<{ bucket: string; prefixe: string; fichiers: FichierS3[] }>({ action: "lister" });
  // Les expertises sont rangées au même endroit : on ne garde que les extractions des journées.
  r.fichiers = extractionsJournees(r.fichiers);
  r.fichiers.sort((a, b) => dateDuFichier(b).localeCompare(dateDuFichier(a)) || b.modifie.localeCompare(a.modifie));
  return r;
}

/** Les extractions des expertises (fichiers « expertise »), la plus récente d'abord. */
export async function listerExpertises(): Promise<{ bucket: string; prefixe: string; fichiers: FichierS3[] }> {
  if (ADMIN_BACKEND !== "supabase") {
    return { bucket: "démo", prefixe: "", fichiers: [{ key: `demo-${aujourdhui()}-expertise.csv`, taille: 0, modifie: new Date().toISOString() }] };
  }
  const r = await appeler<{ bucket: string; prefixe: string; fichiers: FichierS3[] }>({ action: "lister", type: "expertises" });
  // Dossier « expertises/ » (fichiers nommés par leur date) ou, à défaut, fichiers « …expertise… »
  // rangés avec les journées : le mot peut être dans le dossier comme dans le nom.
  r.fichiers = r.fichiers.filter((f) => /expertise/i.test(f.key));
  r.fichiers.sort((a, b) => dateDuFichier(b).localeCompare(dateDuFichier(a)) || b.modifie.localeCompare(a.modifie));
  return r;
}

export async function lireExtractionS3(f: FichierS3, bucket: string, prefixe: string): Promise<Source> {
  const nom = f.key.split("/").pop() ?? f.key;
  if (ADMIN_BACKEND !== "supabase") return { origine: "Démo", nom, date: dateDuFichier(f), texte: /expertise/.test(nom) ? demoExpertises() : demo() };
  const r = await appeler<{ fichiers: { key: string; contenu?: string; erreur?: string }[] }>({ action: "lire", keys: [f.key] });
  const lu = r.fichiers[0];
  if (!lu || lu.contenu === undefined) throw new ErreurJournees(lu?.erreur ?? "Fichier illisible.");
  return { origine: `S3 · ${bucket}/${prefixe}`, nom, date: dateDuFichier(f), texte: lu.contenu };
}

/**
 * Télécharge l'extraction affichée, telle qu'elle est dans le bucket, en CSV.
 * Écrite en UTF-8 avec la marque d'ordre des octets : Excel lit ainsi les accents correctement.
 * Le téléchargement est noté au journal d'audit (le fichier contient des coordonnées de contacts).
 */
export function telechargerExtraction(source: Source, par: string): void {
  const bom = String.fromCharCode(0xfeff);
  const url = URL.createObjectURL(new Blob([bom + source.texte], { type: "text/csv;charset=utf-8" }));
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = /\.csv$/i.test(source.nom) ? source.nom : `${source.nom}.csv`;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  void logAudit({
    actorEmail: par,
    category: "data",
    action: "telechargement_extraction",
    entity: "journees_s3",
    entityId: source.nom,
    success: true,
    detail: { origine: source.origine, date: source.date },
  });
}

const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Extraction fictive au format de l'export réel : 3 clients, 26 journées autour d'aujourd'hui. */
function demo(): string {
  const entete =
    '"Date création","Client","Nombre de journées","Numéro devis","Requérant","Requis","Date événement","Date facture","Lieu","Numéro journée","Nom du contact","Téléphone du contact","Email du contact","Salle","Accès","Autres informations","Confirmation client","Date confirmation client","Confirmation consentements","Date confirmation consentements","Confirmation requérant","Date confirmation requérant","Numéro envoi dermatoscope","Date envoi dermatoscope","Numéro retour dermatoscope","Date retour dermatoscope"';
  const clients = [
    { nom: "Société Exemple", devis: "DEV 2026 001", nb: 12, lieux: ["Lyon", "Villeurbanne"] },
    { nom: "Mutuelle Démo", devis: "DEV 2026 002", nb: 10, lieux: ["Nantes", "Rennes", "Brest"] },
    { nom: "Mairie Fictive", devis: "D-2026-003", nb: 4, lieux: ["Mairie Fictive"] },
  ];
  const experts = ["Dr Alice Martin", "Dr Bruno Petit", "Dr Chloé Durand", "Dr David Leroy"];
  const infirmieres = ["Infirmière A", "Infirmière B", "Infirmière C"];
  const lignes = [entete];
  let k = 0;
  for (const c of clients) {
    for (let n = 1; n <= c.nb - (c.nb > 4 ? 2 : 0); n++, k++) {
      const d = new Date();
      // La 2e journée tombe aujourd'hui : l'encart du tableau de bord a de quoi s'afficher.
      if (k !== 1) d.setDate(d.getDate() + (k % 2 ? 1 : -1) * ((k * 5) % 70) + 3);
      const date = d.toISOString().slice(0, 10);
      const avenir = date >= aujourdhui();
      const oui = (v: boolean) => (v ? "Oui" : "Non");
      lignes.push(
        [
          `"2026-09-01T08:00:00.000Z"`, `"${c.nom}"`, c.nb, `"${c.devis}"`, `"${infirmieres[k % 3]}"`, `"${experts[k % 4]}"`,
          `"${date}T00:00:00.000Z"`, `"${date}T02:00:00.000Z"`, `"${c.lieux[n % c.lieux.length]}"`, n,
          `"Contact ${k}"`, `"=""0600000000"""`, `"contact${k}@exemple.fr"`, `""`, `""`, `""`,
          `"${oui(!avenir || k % 2 === 0)}"`, `""`, `"${oui(!avenir || k % 3 === 0)}"`, `""`, `"${oui(!avenir || k % 4 !== 1)}"`, `""`,
          `"${!avenir || k % 3 !== 2 ? 100 + k : ""}"`, `""`, `"${!avenir ? 200 + k : ""}"`, `""`,
        ].join(","),
      );
    }
  }
  // Une journée regroupée : même client, même ville, deux dermatologues le même jour (le lendemain : une autre journée).
  [[-12, 11, 0], [-12, 12, 1], [-11, 11, 2]].forEach(([decalage, n, e], i) => {
    const d = new Date();
    d.setDate(d.getDate() + decalage);
    const date = d.toISOString().slice(0, 10);
    lignes.push(
      [
        `"2026-09-01T08:00:00.000Z"`, `"Société Exemple"`, 12, `"DEV 2026 001"`, `"${infirmieres[i]}"`, `"${experts[e]}"`,
        `"${date}T00:00:00.000Z"`, `"${date}T02:00:00.000Z"`, `"Salle des fêtes, 58700 Prémery"`, n,
        `"Contact R"`, `"=""0600000000"""`, `"contactr@exemple.fr"`, `""`, `""`, `""`,
        `"Oui"`, `""`, `"Oui"`, `""`, `"Oui"`, `""`, `"300"`, `""`, `"301"`, `""`,
      ].join(","),
    );
  });
  return lignes.join("\n");
}

/**
 * Expertises fictives au format de l'export réel : 22 à 34 avis par journée passée de la démo
 * (même date, lieu et numéro), et des téléexpertises hors journée sur deux ans.
 */
function demoExpertises(): string {
  const entete =
    '"Identifiant dossier","Date d\'envoi","Date d\'affectation","Date de réponse","Délai de traitement (h)","Requérant","Profession requérant","Requis","Recommandation","Délai recommandé (jours)","Urgence","Statut","Date événement","Lieu","Numéro journée"';
  const requis = ["Dr Alice Martin", "Dr Bruno Petit", "Dr Chloé Durand", "Dr David Leroy"];
  const recos = ["Consultation dermatologique non indispensable", "Consultation dermatologique non indispensable", "Consultation dermatologique non indispensable", "Consultation dermatologique", "Exérèse indispensable"];
  const lignes = [entete];
  let id = 50000;
  let graine = 7;
  const hasard = () => ((graine = (graine * 16807) % 2147483647) / 2147483647);
  const ligne = (envoi: string, journee: { date: string; lieu: string; numero: number | null } | null) => {
    const reco = recos[Math.floor(hasard() * recos.length)];
    const delai = Math.round(2 + hasard() * 40);
    lignes.push(
      [
        `"${id++}"`, `"${envoi}"`, `"${envoi}"`, `"${envoi}"`, `"${delai}"`, `"Infirmière ${1 + Math.floor(hasard() * 6)}"`, `"Infirmier(e)"`,
        `"${requis[Math.floor(hasard() * 4)]}"`, `"${reco}"`, `"${reco.startsWith("Consultation dermatologique non") ? "" : [30, 60, 90][Math.floor(hasard() * 3)]}"`,
        `"${hasard() < 0.01 ? "Oui" : "Non"}"`, `"Avis rendu"`,
        `"${journee ? `${journee.date}T00:00:00.000Z` : ""}"`, `"${journee?.lieu ?? ""}"`, `"${journee?.numero ?? ""}"`,
      ].join(","),
    );
  };
  const auj = aujourdhui();
  for (const j of lireExtraction(demo()).journees) {
    if (!j.date || j.date >= auj) continue;
    const n = 22 + Math.floor(hasard() * 13);
    for (let i = 0; i < n; i++) ligne(`${j.date} ${String(9 + (i % 8)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`, j);
  }
  for (let k = 0; k < 900; k++) {
    const d = new Date();
    d.setDate(d.getDate() - Math.floor(hasard() * 730));
    ligne(`${d.toISOString().slice(0, 10)} 14:00`, null);
  }
  return lignes.join("\n");
}
