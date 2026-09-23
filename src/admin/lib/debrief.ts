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
  /** Où la créer quand elle n'existe pas encore : « prospect », « affaire », « client ». */
  a_creer?: string;
  ville?: string;
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
  /** Créer la fiche manquante : décoché, rien n'est créé et le reste se range où il peut. */
  creer: boolean;
  resume: boolean;
  objections: boolean[];
  mouches: boolean[];
  actions: boolean[];
  etape: boolean;
}

/** Tout est coché d'entrée : Merx a lu correctement dans la plupart des cas. */
export const toutRetenir = (e: EntrepriseVue): Retenu => ({
  creer: Boolean(!e.fiche_id && e.a_creer?.trim()),
  resume: Boolean(e.resume.trim()),
  objections: e.objections.map(() => true),
  mouches: e.mouches.map(() => true),
  actions: e.actions.map(() => true),
  etape: Boolean(e.etape.trim()),
});

/**
 * Ce qui sera VRAIMENT enregistré.
 *
 * Sans fiche — ni reconnue, ni créée —, un résumé, une action ou un changement d'étape
 * n'ont nulle part où aller : ils ne comptent pas. Un compteur qui annonce plus que ce
 * qu'il enregistre est pire que pas de compteur.
 */
export function compte(r: Retenu, e?: EntrepriseVue): number {
  const auraUneFiche = e ? Boolean(e.fiche_id) || r.creer : true;
  return (
    (r.creer ? 1 : 0) +
    (r.resume && auraUneFiche ? 1 : 0) +
    r.objections.filter(Boolean).length +
    r.mouches.filter(Boolean).length +
    (auraUneFiche ? r.actions.filter(Boolean).length : 0) +
    (r.etape && auraUneFiche ? 1 : 0)
  );
}

/**
 * Transcrit une note dictée, et rend son texte.
 *
 * L'appel est long — dix minutes d'audio traversent le réseau puis se transcrivent —
 * mais il n'écrit rien d'autre que la transcription sur la note : le tri par Merx et
 * la validation restent des étapes distinctes.
 */
export async function transcrireNote(noteId: string): Promise<string> {
  const { data, error } = await supabaseAdmin.functions.invoke("merx", { body: { action: "transcrire", noteId } });
  if (error) throw new Error(error.message);
  const r = data as { transcription?: string; error?: string };
  if (r.error) throw new Error(r.error);
  if (!r.transcription) throw new Error("La transcription est revenue vide.");
  return r.transcription;
}

/** Demande à Merx de trier un débrief. Rien n'est écrit : il rend seulement sa lecture. */
export async function lireDebrief(texte: string): Promise<Extraction> {
  const { data, error } = await supabaseAdmin.functions.invoke("merx", { body: { action: "debrief", texte } });
  if (error) throw new Error(error.message);
  const r = data as Extraction & { error?: string };
  if (r.error) throw new Error(r.error);
  return { entreprises: r.entreprises ?? [], non_rattachees: r.non_rattachees ?? [] };
}

/** Sans accents ni ponctuation : la garde anti-doublon compare des noms parlés. */
const nu = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();

/**
 * Crée la fiche d'une entreprise que le débrief a fait apparaître.
 *
 * On vérifie d'abord qu'elle n'existe vraiment nulle part : Merx ne voit que les noms
 * qu'on lui a donnés, et une graphie inattendue lui échappe. Créer un doublon depuis un
 * débrief serait le plus sûr moyen d'en semer partout.
 */
async function creerLaFiche(e: EntrepriseVue, par: string, etapeDeDepart?: string): Promise<EntrepriseVue> {
  const nom = e.entreprise.trim();
  if (!nom) return e;
  const q = nu(nom);

  const [prospects, affaires, comptes] = await Promise.all([
    supabaseAdmin.from("admin_prospects").select("id, name").is("deleted_at", null).limit(500),
    supabaseAdmin.from("admin_clients").select("id, company").is("deleted_at", null).limit(500),
    supabaseAdmin.from("admin_accounts").select("id, name").is("deleted_at", null).limit(500),
  ]);

  const dejaProspect = (prospects.data ?? []).find((p) => nu(String(p.name)) === q);
  if (dejaProspect) return { ...e, fiche_type: "prospect", fiche_id: dejaProspect.id as string };
  const dejaAffaire = (affaires.data ?? []).find((c) => nu(String(c.company)) === q);
  if (dejaAffaire) return { ...e, fiche_type: "affaire", fiche_id: dejaAffaire.id as string };
  const dejaCompte = (comptes.data ?? []).find((a) => nu(String(a.name)) === q);
  if (dejaCompte) return { ...e, fiche_type: "client", fiche_id: dejaCompte.id as string };

  const ou = e.a_creer?.trim();

  if (ou === "affaire") {
    const { data, error } = await supabaseAdmin
      .from("admin_clients")
      .insert({
        company: nom,
        ville: e.ville?.trim() || null,
        stage: e.etape?.trim() || etapeDeDepart || "Nouveau",
        jours: 1,
        tarif: 0,
        statut_propo: "Brouillon",
      })
      .select("id")
      .single();
    if (error) throw new Error(`${nom} n’a pas pu être créée au Pipeline : ${error.message}`);
    return { ...e, fiche_type: "affaire", fiche_id: data.id as string };
  }

  if (ou === "client") {
    const { data, error } = await supabaseAdmin
      .from("admin_accounts")
      .insert({ name: nom, signed_on: new Date().toISOString().slice(0, 10), data: {} })
      .select("id")
      .single();
    if (error) throw new Error(`${nom} n’a pas pu être créée au fichier client : ${error.message}`);
    return { ...e, fiche_type: "client", fiche_id: data.id as string };
  }

  // Par défaut la prospection : c'est le moins engageant, et une fiche s'avance ensuite.
  const { data, error } = await supabaseAdmin
    .from("admin_prospects")
    .insert({
      owner_email: par,
      name: nom,
      city: e.ville?.trim() || null,
      rationale: e.resume?.trim() || null,
      sources: [],
      score: {},
    })
    .select("id")
    .single();
  if (error) throw new Error(`${nom} n’a pas pu être créée en prospection : ${error.message}`);
  return { ...e, fiche_type: "prospect", fiche_id: data.id as string };
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
  etapeDeDepart?: string,
): Promise<{ creee: { nom: string; ou: string } | null }> {
  // Créer d'abord, s'il y a lieu : tout ce qui suit a besoin d'une fiche où se ranger.
  const vue = r.creer && !e.fiche_id ? await creerLaFiche(e, par, etapeDeDepart) : e;
  const cles = clesDe(vue);
  // Ce qui vient d'être créé, pour pouvoir le dire : une fiche qu'on ne retrouve pas
  // vaut à peine mieux qu'une fiche qu'on n'a pas créée.
  const creee = r.creer && !e.fiche_id && vue.fiche_id ? { nom: vue.entreprise, ou: vue.fiche_type } : null;
  const maintenant = new Date().toISOString();

  // Ce qui s'est passé, dans l'historique de la fiche.
  if (r.resume && cles && vue.resume.trim()) {
    await ajouterEchange(cles, { kind: "note", titre: vue.resume.trim(), detail: "", au: maintenant, par });
  }

  // Ce qu'il faut faire ensuite, dans le planning.
  for (const [i, a] of vue.actions.entries()) {
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
    ...vue.objections
      .filter((_, i) => r.objections[i])
      .map((o) => ({ nature: "objection", verbatim: o.verbatim, famille: o.famille || null, reponse: o.reponse || null })),
    ...vue.mouches
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
        entreprise: vue.entreprise,
        prospect_id: vue.fiche_type === "prospect" ? vue.fiche_id || null : null,
        client_id: vue.fiche_type === "affaire" ? vue.fiche_id || null : null,
        account_id: vue.fiche_type === "client" ? vue.fiche_id || null : null,
        note_id: noteId,
        au: maintenant,
      })),
    );
    if (error) throw new Error(error.message);
  }

  // L'avancement du Pipeline, seulement pour une affaire.
  if (r.etape && vue.etape.trim() && vue.fiche_type === "affaire" && vue.fiche_id) {
    const { error } = await supabaseAdmin.from("admin_clients").update({ stage: vue.etape.trim() }).eq("id", vue.fiche_id);
    if (error) throw new Error(error.message);
  }

  return { creee };
}

/** L'écran où une fiche est allée, et son libellé — pour le dire et pour y mener. */
export const OU_TROUVER: Record<string, { ecran: string; route: string }> = {
  prospect: { ecran: "Prospection", route: "/prospects" },
  affaire: { ecran: "Pipeline", route: "/crm" },
  client: { ecran: "Clients", route: "/fichier-client" },
};
