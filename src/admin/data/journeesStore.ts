// Journées de dépistage — l'extraction en cours, partagée par les pages Statistiques,
// Calendrier et le tableau de bord. Chargée une fois par session, pas à chaque écran.
//
// Ordre : le fichier le plus récent du bucket S3 ; à défaut (S3 pas branché), le dernier CSV
// importé à la main dans cet onglet. L'import est gardé en sessionStorage : il survit au
// changement d'écran et au rechargement, et disparaît à la fermeture de l'onglet — l'extraction
// contient des coordonnées de contacts, elle n'a pas à rester sur le poste.

import { useSyncExternalStore } from "react";
import { lireExtraction, type Extraction, type FichierS3 } from "../lib/journees";
import { ErreurJournees, listerExtractions, lireExtractionS3, lireFichierLocal, type Source } from "./journeesRepo";

export interface EtatJournees {
  statut: "initial" | "chargement" | "pret";
  source: Source | null;
  extraction: Extraction | null;
  s3: { bucket: string; prefixe: string; fichiers: FichierS3[] } | null;
  /** Pourquoi S3 n'a rien donné (pas branché, vide, erreur). */
  s3Info: { message: string; nonConfigure: boolean } | null;
  erreur: string | null;
}

const CLE_IMPORT = "avisdoc.journees.import";

let etat: EtatJournees = { statut: "initial", source: null, extraction: null, s3: null, s3Info: null, erreur: null };
const abonnes = new Set<() => void>();

function changer(p: Partial<EtatJournees>) {
  etat = { ...etat, ...p };
  if (p.source !== undefined) etat.extraction = p.source ? lireExtraction(p.source.texte) : null;
  abonnes.forEach((f) => f());
}

function importGarde(): Source | null {
  try {
    const brut = sessionStorage.getItem(CLE_IMPORT);
    return brut ? (JSON.parse(brut) as Source) : null;
  } catch {
    return null;
  }
}

/** Relit le bucket (bouton Actualiser, ou premier écran ouvert). */
export async function chargerJournees(): Promise<void> {
  changer({ statut: "chargement", erreur: null });
  try {
    const s3 = await listerExtractions();
    if (s3.fichiers.length) {
      const lue = await lireExtractionS3(s3.fichiers[0], s3.bucket, s3.prefixe);
      // La démo n'est qu'un exemple : un vrai fichier importé passe devant.
      changer({ s3, s3Info: null, source: lue.origine === "Démo" ? (importGarde() ?? lue) : lue });
    } else {
      changer({ s3, s3Info: { message: `Aucun fichier CSV dans ${s3.bucket}/${s3.prefixe}.`, nonConfigure: false }, source: importGarde() });
    }
  } catch (e) {
    changer({
      s3: null,
      s3Info: { message: e instanceof Error ? e.message : String(e), nonConfigure: e instanceof ErreurJournees && e.nonConfigure },
      source: importGarde(),
    });
  } finally {
    changer({ statut: "pret" });
  }
}

/** Une autre extraction du bucket (menu « Extraction du … »). */
export async function choisirExtraction(f: FichierS3): Promise<void> {
  if (!etat.s3) return;
  changer({ statut: "chargement", erreur: null });
  try {
    changer({ source: await lireExtractionS3(f, etat.s3.bucket, etat.s3.prefixe) });
  } catch (e) {
    changer({ erreur: e instanceof Error ? e.message : String(e) });
  } finally {
    changer({ statut: "pret" });
  }
}

/** Un CSV choisi sur l'ordinateur : lu dans le navigateur, gardé le temps de l'onglet. */
export async function importerJournees(fichier: File): Promise<void> {
  try {
    const source = await lireFichierLocal(fichier);
    try {
      sessionStorage.setItem(CLE_IMPORT, JSON.stringify(source));
    } catch {
      /* trop gros ou stockage bloqué : l'import vaut pour cet écran seulement */
    }
    changer({ source, erreur: null });
  } catch (e) {
    changer({ erreur: e instanceof Error ? e.message : String(e) });
  }
}

function abonner(f: () => void) {
  abonnes.add(f);
  // Le premier écran qui en a besoin lance la lecture ; les suivants profitent du résultat.
  if (etat.statut === "initial") void chargerJournees();
  return () => abonnes.delete(f);
}

export function useJournees(): EtatJournees {
  return useSyncExternalStore(abonner, () => etat);
}
