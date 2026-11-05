// Journées de dépistage — accès aux extractions du bucket S3, via la fonction journees-s3.
// En mode démo (sans base), des extractions fictives permettent de voir l'écran.
import { supabaseAdmin } from "./supabaseAdmin";
import { ADMIN_BACKEND } from "../lib/config";
import { journeeDepuis, type FichierS3, type JourneeExtraite } from "../lib/journees";

/** Au-delà, l'écran se limite aux plus récentes (le reste reste dans le bucket). */
export const MAX_JOURNEES = 200;
const PAR_LOT = 25;

export class ErreurJournees extends Error {
  constructor(message: string, readonly nonConfigure = false) {
    super(message);
  }
}

/** Le message utile d'une erreur de fonction : le corps JSON renvoyé, pas « non-2xx status code ». */
async function appeler<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseAdmin.functions.invoke("journees-s3", { body });
  if (error) {
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

export interface Chargement {
  bucket: string;
  prefixe: string;
  /** Nombre total de fichiers CSV dans le bucket. */
  total: number;
  journees: JourneeExtraite[];
}

export async function chargerJournees(): Promise<Chargement> {
  if (ADMIN_BACKEND !== "supabase") return demo();

  const liste = await appeler<{ bucket: string; prefixe: string; fichiers: FichierS3[] }>({ action: "lister" });
  // Les plus récentes d'abord (dépôt), dans la limite affichable.
  const fichiers = [...liste.fichiers].sort((a, b) => b.modifie.localeCompare(a.modifie)).slice(0, MAX_JOURNEES);

  const lots: FichierS3[][] = [];
  for (let i = 0; i < fichiers.length; i += PAR_LOT) lots.push(fichiers.slice(i, i + PAR_LOT));
  const contenus = new Map<string, { contenu?: string; erreur?: string }>();
  await Promise.all(
    lots.map(async (lot) => {
      const r = await appeler<{ fichiers: { key: string; contenu?: string; erreur?: string }[] }>({
        action: "lire",
        keys: lot.map((f) => f.key),
      });
      for (const f of r.fichiers) contenus.set(f.key, f);
    }),
  );

  const journees = fichiers
    .map((f) => journeeDepuis(f, contenus.get(f.key)?.contenu, contenus.get(f.key)?.erreur))
    .sort((a, b) => b.date.localeCompare(a.date));
  return { bucket: liste.bucket, prefixe: liste.prefixe, total: liste.fichiers.length, journees };
}

/** Extractions fictives : 14 journées sur les quatre derniers mois. */
function demo(): Chargement {
  const lieux = ["Lyon — Siège", "Grenoble — Usine", "Annecy — Agence", "Valence — Entrepôt"];
  const resultats = ["Bénin", "Bénin", "Bénin", "À surveiller", "Avis demandé"];
  const journees: JourneeExtraite[] = [];
  let id = 1;
  for (let k = 0; k < 14; k++) {
    const d = new Date();
    d.setDate(d.getDate() - k * 9 - 2);
    const date = d.toISOString().slice(0, 10);
    const n = 18 + ((k * 7) % 23);
    const lignes = ["id;date;lieu;sexe;age;phototype;resultat"];
    for (let i = 0; i < n; i++, id++) {
      lignes.push(
        [id, date, lieux[k % 4], i % 3 ? "F" : "H", 25 + ((i * 13) % 40), ["II", "III", "IV"][i % 3], resultats[(i + k) % 5]].join(";"),
      );
    }
    journees.push(
      journeeDepuis({ key: `extractions/journee_${date}.csv`, taille: 0, modifie: `${date}T18:00:00Z` }, lignes.join("\n")),
    );
  }
  return { bucket: "démo", prefixe: "extractions/", total: journees.length, journees };
}
