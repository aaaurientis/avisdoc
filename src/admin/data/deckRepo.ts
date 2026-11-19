// Mise à la charte AvisDoc d'un fichier PowerPoint, Word ou PDF (migrations 0097-0098).
// « Sans enregistrer » : le fichier transite par admin-documents/_charte-temp/ (invisible dans
// Documents) ; le service de génération (webhook) le traite et efface la source ; le Hub efface le
// résultat une fois téléchargé. Rien n'est rangé dans Documents.
import { supabaseAdmin as sb } from "./supabaseAdmin";
import { ADMIN_BACKEND } from "../lib/config";
import { safeFileName } from "../lib/format";

export type StatutDeck = "en_attente" | "en_cours" | "termine" | "echec";

export interface DeckJob {
  id: string;
  statut: StatutDeck;
  mode: string | null;
  resultatPath: string | null;
  sourceNom: string | null;
  erreurs: number | null;
  avertissements: number | null;
  rapport: string | null;
  erreur: string | null;
}

export const FORMATS_CHARTE = ".pptx,.docx,.pdf";
const BUCKET = "admin-documents";
const demo = ADMIN_BACKEND !== "supabase";
const jobsDemo = new Map<string, DeckJob>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const versJob = (r: any): DeckJob => ({
  id: r.id, statut: r.statut, mode: r.mode ?? null, resultatPath: r.resultat_path ?? null, sourceNom: r.source_nom ?? null,
  erreurs: r.erreurs ?? null, avertissements: r.avertissements ?? null, rapport: r.rapport ?? null, erreur: r.erreur ?? null,
});

/** Nom du fichier produit : « Bilan (charte AvisDoc).pptx ». */
export const nomResultat = (source: string) => {
  const i = source.lastIndexOf(".");
  return i > 0 ? `${source.slice(0, i)} (charte AvisDoc)${source.slice(i)}` : `${source} (charte AvisDoc)`;
};

export const deckRepo = {
  /** Dépose le fichier et demande sa mise à la charte. Renvoie l'identifiant du travail. */
  async lancer(fichier: File, auteur: string): Promise<string> {
    const id = crypto.randomUUID();
    if (demo) {
      jobsDemo.set(id, {
        id, statut: "termine", mode: "démo", resultatPath: null, sourceNom: fichier.name, erreurs: 0, avertissements: 1, erreur: null,
        rapport: `# Rapport de mise à la charte : ${fichier.name}\n\nEn démonstration, le service de génération n'est pas appelé : aucun fichier n'est produit.\n`,
      });
      return id;
    }
    const chemin = `_charte-temp/${id}/${safeFileName(fichier.name)}`;
    const depot = await sb.storage.from(BUCKET).upload(chemin, fichier, { upsert: true, contentType: fichier.type || undefined });
    if (depot.error) throw new Error(depot.error.message);
    const { error } = await sb.from("admin_deck_jobs").insert({
      id, document_id: null, source_path: chemin, source_nom: fichier.name, modele: true, fond: "creme", cree_par: auteur,
    });
    if (error) {
      await sb.storage.from(BUCKET).remove([chemin]);
      throw new Error(error.message);
    }
    return id;
  },

  async job(id: string): Promise<DeckJob | null> {
    if (demo) return jobsDemo.get(id) ?? null;
    const { data, error } = await sb.from("admin_deck_jobs").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? versJob(data) : null;
  },

  /** Adresse de téléchargement du résultat (une heure), sous son nom lisible. */
  async lienResultat(j: DeckJob): Promise<string | null> {
    if (demo || !j.resultatPath) return null;
    const { data } = await sb.storage.from(BUCKET).createSignedUrl(j.resultatPath, 3600, { download: nomResultat(j.sourceNom ?? "presentation.pptx") });
    return data?.signedUrl ?? null;
  },

  /** Efface le résultat temporaire (rien n'est conservé). */
  async effacer(j: DeckJob): Promise<void> {
    if (demo || !j.resultatPath) return;
    await sb.storage.from(BUCKET).remove([j.resultatPath]);
  },
};
