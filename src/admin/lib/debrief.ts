// Le débrief : ce que le commercial raconte en sortant, et ce qu'on en garde.
//
// Merx propose, personne d'autre. Rien n'est écrit tant que le commercial n'a pas
// décoché ce qui ne va pas et appuyé sur Enregistrer — une transcription se trompe,
// et on ne laisse pas une erreur d'oreille modifier un dossier tout seul.

import { supabaseAdmin } from "../data/supabaseAdmin";
import { ajouterEchange, type GenreEchange } from "./echanges";

export interface Objection {
  verbatim: string;
  famille: string;
  reponse: string;
}

export interface Mouche {
  verbatim: string;
  famille: string;
}

export interface ActionProposee {
  genre: string;
  quoi: string;
  quand: string;
}

export interface EntrepriseVue {
  entreprise: string;
  fiche_type: string;
  fiche_id: string;
  resume: string;
  objections: Objection[];
  mouches: Mouche[];
  actions: ActionProposee[];
  etape: string;
}

export interface Extraction {
  entreprises: EntrepriseVue[];
  non_rattachees: string[];
}

/** Ce que le commercial garde, après avoir décoché ce qui ne va pas. */
export interface Retenu {
  resume: boolean;
  objections: boolean[];
  mouches: boolean[];
  actions: boolean[];
  etape: boolean;
}

/** Tout est coché d'entrée : Merx a lu correctement dans la plupart des cas. */
export const toutRetenir = (e: EntrepriseVue): Retenu => ({
  resume: Boolean(e.resume.trim()),
  objections: e.objections.map(() => true),
  mouches: e.mouches.map(() => true),
  actions: e.actions.map(() => true),
  etape: Boolean(e.etape.trim()),
});

/** Ce qui est encore coché, en une ligne — pour dire ce qu'on s'apprête à enregistrer. */
export function compte(r: Retenu): number {
  return (
    (r.resume ? 1 : 0) +
    r.objections.filter(Boolean).length +
    r.mouches.filter(Boolean).length +
    r.actions.filter(Boolean).length +
    (r.etape ? 1 : 0)
  );
}

/** Demande à Merx de trier un débrief. Rien n'est écrit : il rend seulement sa lecture. */
export async function lireDebrief(texte: string): Promise<Extraction> {
  const { data, error } = await supabaseAdmin.functions.invoke("merx", { body: { action: "debrief", texte } });
  if (error) throw new Error(error.message);
  const r = data as Extraction & { error?: string };
  if (r.error) throw new Error(r.error);
  return { entreprises: r.entreprises ?? [], non_rattachees: r.non_rattachees ?? [] };
}

/** Les clés d'échange correspondant à la fiche reconnue, s'il y en a une. */
function clesDe(e: EntrepriseVue) {
  if (!e.fiche_id) return null;
  if (e.fiche_type === "prospect") return { prospectId: e.fiche_id };
  if (e.fiche_type === "affaire") return { clientId: e.fiche_id };
  if (e.fiche_type === "client") return { accountId: e.fiche_id };
  return null;
}

const GENRES: GenreEchange[] = ["appel", "email", "rdv", "note"];
const genreDe = (g: string): GenreEchange => (GENRES.includes(g as GenreEchange) ? (g as GenreEchange) : "note");

/**
 * Écrit ce qui a été retenu. Une entreprise non reconnue garde quand même ses
 * objections et ses arguments : ils valent pour la bibliothèque, même sans fiche.
 */
export async function enregistrer(
  e: EntrepriseVue,
  r: Retenu,
  par: string,
  noteId: string | null,
): Promise<void> {
  const cles = clesDe(e);
  const maintenant = new Date().toISOString();

  // Ce qui s'est passé, dans l'historique de la fiche.
  if (r.resume && cles && e.resume.trim()) {
    await ajouterEchange(cles, { kind: "note", titre: e.resume.trim(), detail: "", au: maintenant, par });
  }

  // Ce qu'il faut faire ensuite, dans le planning.
  for (const [i, a] of e.actions.entries()) {
    if (!r.actions[i] || !a.quoi.trim()) continue;
    if (!cles) continue;
    // Sans date dite, on pose l'action aujourd'hui : elle se voit, et se décale d'un clic.
    const quand = a.quand?.trim() ? new Date(`${a.quand}T09:00:00`) : new Date();
    await ajouterEchange(cles, {
      kind: genreDe(a.genre),
      titre: a.quoi.trim(),
      detail: "",
      au: (Number.isNaN(quand.getTime()) ? new Date() : quand).toISOString(),
      par,
    });
  }

  // La matière du terrain, qui servira sur les fiches suivantes.
  const lignes = [
    ...e.objections
      .filter((_, i) => r.objections[i])
      .map((o) => ({ nature: "objection", verbatim: o.verbatim, famille: o.famille || null, reponse: o.reponse || null })),
    ...e.mouches
      .filter((_, i) => r.mouches[i])
      .map((m) => ({ nature: "mouche", verbatim: m.verbatim, famille: m.famille || null, reponse: null })),
  ].filter((l) => l.verbatim.trim());

  if (lignes.length > 0) {
    const { error } = await supabaseAdmin.from("admin_terrain").insert(
      lignes.map((l) => ({
        owner_email: par,
        nature: l.nature,
        verbatim: l.verbatim.trim(),
        famille: l.famille,
        reponse: l.reponse,
        entreprise: e.entreprise,
        prospect_id: e.fiche_type === "prospect" ? e.fiche_id || null : null,
        client_id: e.fiche_type === "affaire" ? e.fiche_id || null : null,
        account_id: e.fiche_type === "client" ? e.fiche_id || null : null,
        note_id: noteId,
        au: maintenant,
      })),
    );
    if (error) throw new Error(error.message);
  }

  // L'avancement du Pipeline, seulement pour une affaire.
  if (r.etape && e.etape.trim() && e.fiche_type === "affaire" && e.fiche_id) {
    const { error } = await supabaseAdmin.from("admin_clients").update({ stage: e.etape.trim() }).eq("id", e.fiche_id);
    if (error) throw new Error(error.message);
  }
}
