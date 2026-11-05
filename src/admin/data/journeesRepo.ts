// Journées de dépistage — d'où vient l'extraction.
//
// - S3 : la fonction journees-s3 liste le dossier ; on lit le fichier le plus récent
//   (date dans le nom, sinon date de dépôt). Les plus anciens restent consultables.
// - Import manuel : un CSV choisi sur l'ordinateur, lu dans le navigateur. Rien n'est envoyé.
// - Mode démo (sans base) : une extraction fictive au même format que l'export réel.
import { supabaseAdmin } from "./supabaseAdmin";
import { ADMIN_BACKEND } from "../lib/config";
import { dateDansLeNom, type FichierS3 } from "../lib/journees";

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
  /** Libellé affiché : « S3 · avisdoc-exports/journees-depistage/ », « Fichier importé », « Démo ». */
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
  r.fichiers.sort((a, b) => dateDuFichier(b).localeCompare(dateDuFichier(a)) || b.modifie.localeCompare(a.modifie));
  return r;
}

export async function lireExtractionS3(f: FichierS3, bucket: string, prefixe: string): Promise<Source> {
  const nom = f.key.split("/").pop() ?? f.key;
  if (ADMIN_BACKEND !== "supabase") return { origine: "Démo", nom, date: dateDuFichier(f), texte: demo() };
  const r = await appeler<{ fichiers: { key: string; contenu?: string; erreur?: string }[] }>({ action: "lire", keys: [f.key] });
  const lu = r.fichiers[0];
  if (!lu || lu.contenu === undefined) throw new ErreurJournees(lu?.erreur ?? "Fichier illisible.");
  return { origine: `S3 · ${bucket}/${prefixe}`, nom, date: dateDuFichier(f), texte: lu.contenu };
}

/** Un CSV choisi sur l'ordinateur. UTF-8 d'abord ; à défaut Windows-1252 (export Excel). */
export async function lireFichierLocal(fichier: File): Promise<Source> {
  const octets = new Uint8Array(await fichier.arrayBuffer());
  let texte: string;
  try {
    texte = new TextDecoder("utf-8", { fatal: true }).decode(octets);
  } catch {
    texte = new TextDecoder("windows-1252").decode(octets);
  }
  const date = dateDansLeNom(fichier.name) ?? new Date(fichier.lastModified).toISOString().slice(0, 10);
  return { origine: "Fichier importé", nom: fichier.name, date, texte };
}

const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Extraction fictive au format de l'export réel : 3 clients, 26 journées autour d'aujourd'hui. */
function demo(): string {
  const entete =
    '"Date création","Client","Nombre de journées","Numéro devis","Dermatologue","Expert","Date événement","Date facture","Lieu","Numéro journée","Nom du contact","Téléphone du contact","Email du contact","Salle","Accès","Autres informations","Confirmation client","Date confirmation client","Confirmation consentements","Date confirmation consentements","Confirmation requérant","Date confirmation requérant","Numéro envoi dermatoscope","Date envoi dermatoscope","Numéro retour dermatoscope","Date retour dermatoscope"';
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
  return lignes.join("\n");
}
