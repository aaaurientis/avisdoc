// Mise à la charte des présentations (commande deck du pack documentaire, migration 0097).
// Le Hub crée un job ; le service de génération (webhook) fait le travail et range la
// présentation refaite dans Documents, à côté de la source, qui n'est jamais modifiée.
import { supabaseAdmin as sb } from "./supabaseAdmin";
import { ADMIN_BACKEND } from "../lib/config";

export type StatutDeck = "en_attente" | "en_cours" | "termine" | "echec";

export interface DeckJob {
  id: string;
  documentId: string;
  statut: StatutDeck;
  mode: string | null;
  resultatDocumentId: string | null;
  acces: string | null;
  erreurs: number | null;
  avertissements: number | null;
  rapport: string | null;
  planchePath: string | null;
  pivotPath: string | null;
  erreur: string | null;
  creeLe: string;
}

const BUCKET = "admin-documents";
const demo = ADMIN_BACKEND !== "supabase";
let jobsDemo: DeckJob[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const versJob = (r: any): DeckJob => ({
  id: r.id, documentId: r.document_id, statut: r.statut, mode: r.mode ?? null,
  resultatDocumentId: r.resultat_document_id ?? null, acces: r.acces ?? null,
  erreurs: r.erreurs ?? null, avertissements: r.avertissements ?? null, rapport: r.rapport ?? null,
  planchePath: r.planche_path ?? null, pivotPath: r.pivot_path ?? null, erreur: r.erreur ?? null, creeLe: r.cree_le,
});

export const deckRepo = {
  /** Le dernier job de chaque document (les plus récents d'abord). */
  async derniers(): Promise<Map<string, DeckJob>> {
    if (demo) return new Map(jobsDemo.map((j) => [j.documentId, j]));
    const { data, error } = await sb.from("admin_deck_jobs").select("*").order("cree_le", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    const m = new Map<string, DeckJob>();
    for (const r of data ?? []) if (!m.has(r.document_id)) m.set(r.document_id, versJob(r));
    return m;
  },

  async lancer(documentId: string, auteur: string, opts: { modele?: boolean; fond?: "creme" | "blanc" } = {}): Promise<void> {
    if (demo) {
      const job: DeckJob = {
        id: crypto.randomUUID(), documentId, statut: "termine", mode: "regles (démo)", resultatDocumentId: null, acces: "client",
        erreurs: 0, avertissements: 1, erreur: null, planchePath: null, pivotPath: null, creeLe: new Date().toISOString(),
        rapport: "# Rapport de mise à la charte (démo)\n\nEn démonstration, aucun fichier n'est produit : le service de génération n'est pas appelé.\n",
      };
      jobsDemo = [job, ...jobsDemo.filter((j) => j.documentId !== documentId)];
      return;
    }
    const { error } = await sb.from("admin_deck_jobs").insert({
      document_id: documentId, modele: opts.modele ?? true, fond: opts.fond ?? "creme", cree_par: auteur,
    });
    if (error) throw new Error(error.message);
  },

  async urlFichier(chemin: string): Promise<string | null> {
    if (demo) return null;
    const { data } = await sb.storage.from(BUCKET).createSignedUrl(chemin, 3600);
    return data?.signedUrl ?? null;
  },
};
