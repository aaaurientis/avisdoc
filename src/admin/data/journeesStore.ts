// Journées de dépistage — l'extraction en cours, partagée par les pages Statistiques,
// Calendrier et le tableau de bord. Chargée une fois par session, pas à chaque écran.
//
// Ordre : le fichier le plus récent du bucket S3 ; à défaut (S3 pas branché), le dernier CSV
// importé à la main dans cet onglet. L'import est gardé en sessionStorage : il survit au
// changement d'écran et au rechargement, et disparaît à la fermeture de l'onglet — l'extraction
// contient des coordonnées de contacts, elle n'a pas à rester sur le poste.

import { useMemo, useSyncExternalStore } from "react";
import { lireExtraction, type Extraction, type FichierS3, type JourneeDepistage } from "../lib/journees";
import { reglesDe, typologieDuClient, type Affectation, type Regles, type Typologie } from "../lib/typologies";
import { ErreurJournees, listerExtractions, lireExtractionS3, type Source } from "./journeesRepo";
import { listerAffectations, listerTypologies } from "./typologiesRepo";

export interface EtatJournees {
  statut: "initial" | "chargement" | "pret";
  source: Source | null;
  extraction: Extraction | null;
  s3: { bucket: string; prefixe: string; fichiers: FichierS3[] } | null;
  /** Pourquoi S3 n'a rien donné (pas branché, vide, erreur). */
  s3Info: { message: string; nonConfigure: boolean } | null;
  erreur: string | null;
  /** Typologies de clients et affectations (Admin › Typologies clients) : elles fixent les règles de confirmation. */
  typologies: Typologie[];
  affectations: Affectation[];
}

// L'ancien import manuel gardait l'extraction dans l'onglet : on efface ce qui pourrait en rester
// (coordonnées de contacts). Les extractions viennent désormais uniquement du bucket S3.
try {
  sessionStorage.removeItem("avisdoc.journees.import");
} catch {
  /* stockage indisponible : rien à effacer */
}

let etat: EtatJournees = { statut: "initial", source: null, extraction: null, s3: null, s3Info: null, erreur: null, typologies: [], affectations: [] };
const abonnes = new Set<() => void>();

function changer(p: Partial<EtatJournees>) {
  etat = { ...etat, ...p };
  if (p.source !== undefined) etat.extraction = p.source ? lireExtraction(p.source.texte) : null;
  abonnes.forEach((f) => f());
}

/**
 * Relit les typologies et affectations (après une modification dans Admin).
 * Table absente (migration pas jouée) ou erreur : on garde la règle par défaut, requérant + expert.
 */
export async function rechargerTypologies(): Promise<void> {
  try {
    const [typologies, affectations] = await Promise.all([listerTypologies(), listerAffectations()]);
    changer({ typologies, affectations });
  } catch {
    changer({ typologies: [], affectations: [] });
  }
}

/** Relit le bucket (bouton Actualiser, ou premier écran ouvert). */
export async function chargerJournees(): Promise<void> {
  changer({ statut: "chargement", erreur: null });
  void rechargerTypologies();
  try {
    const s3 = await listerExtractions();
    if (s3.fichiers.length) {
      changer({ s3, s3Info: null, source: await lireExtractionS3(s3.fichiers[0], s3.bucket, s3.prefixe) });
    } else {
      changer({ s3, s3Info: { message: `Aucun fichier CSV dans ${s3.bucket}/${s3.prefixe}.`, nonConfigure: false }, source: null });
    }
  } catch (e) {
    changer({
      s3: null,
      s3Info: { message: e instanceof Error ? e.message : String(e), nonConfigure: e instanceof ErreurJournees && e.nonConfigure },
      source: null,
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

function abonner(f: () => void) {
  abonnes.add(f);
  // Le premier écran qui en a besoin lance la lecture ; les suivants profitent du résultat.
  if (etat.statut === "initial") void chargerJournees();
  return () => abonnes.delete(f);
}

export function useJournees(): EtatJournees {
  return useSyncExternalStore(abonner, () => etat);
}

/**
 * La règle de confirmation de chaque journée, selon la typologie de son client.
 * Calculée une fois par nom de client (l'extraction répète les mêmes clients).
 */
export function useRegles() {
  const { typologies, affectations } = useJournees();
  return useMemo(() => {
    const cache = new Map<string, Typologie | null>();
    const typologieDe = (client: string) => {
      if (!cache.has(client)) cache.set(client, typologieDuClient(client, affectations, typologies));
      return cache.get(client) ?? null;
    };
    return {
      typologieDe,
      reglesDe: (j: JourneeDepistage): Regles => reglesDe(typologieDe(j.client)),
    };
  }, [typologies, affectations]);
}
