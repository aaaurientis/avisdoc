// Couche d'accès aux données du module de prospection.
// SEUL fichier de src/prospection autorisé à importer supabase-js (lint).
//
// Projet Supabase VITRINE (VITE_SUPABASE_*), schéma « prospection ». Les
// variables VITE_ADMIN_SUPABASE_* (projet plateforme, données de santé) ne
// sont jamais lues ici : aucune requête du module ne touche la plateforme.
//
// Toute réponse hors 2xx lève une ErreurRepo (code nommé + détail) que les
// écrans affichent. Le front n'écrit jamais `statut` : les transitions passent
// par les fonctions serveur (rpc).
import { createClient, type Session } from "@supabase/supabase-js";
import type { Database } from "./types.gen";
import type {
  Compte, Contact, ContactAvecCompte, Exclusion, Import, Insertion, Interaction, Json,
  LigneParCercle, ModificationCompte, ModificationContact, Relance, RelanceAFaire,
  ReponseNonTraitee, StatutContact, SyntheseHebdo, TypeInteraction, Canal,
} from "./types";
import { calculerScore } from "../domaine/signaux";
import type { LigneImport } from "../domaine/importCsv";
import type { GenreMessage, CleObjection } from "../domaine/gardeFousMessage";
import { DOMAINE_AUTORISE, MODE_DEMO } from "../lib/config";
import { ErreurRepo } from "./erreurs";
import * as demo from "./demo";

const URL_VITRINE = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const CLE_VITRINE = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!MODE_DEMO && (!URL_VITRINE || !CLE_VITRINE)) {
  throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY manquants (projet vitrine).");
}

// En mode démo le client n'est jamais sollicité (chaque fonction délègue à ./demo).
const sb = createClient<Database>(URL_VITRINE ?? "https://demo.invalid", CLE_VITRINE ?? "demo", {
  db: { schema: "prospection" },
  auth: {
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    storageKey: "avisdoc-prospection-auth",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});

// ----------------------------------------------------------------------------
// Erreurs
// ----------------------------------------------------------------------------

export { ErreurRepo };

type ErreurPostgrest = { message: string; details?: string | null; code?: string | null; hint?: string | null };
type Reponse = { data: unknown; error: ErreurPostgrest | null };
/** Type de `data` en cas de succès (la branche d'échec porte error non nul). */
type Donnee<R> = R extends { data: infer D; error: null } ? D : never;

function lever(e: ErreurPostgrest): never {
  // Les fonctions serveur lèvent `raise exception 'code_nomme' using detail = …`.
  const code = /^[a-z_]+$/.test(e.message) ? e.message : (e.code ?? "inconnue");
  throw new ErreurRepo(code, e.message, e.details ?? undefined);
}

async function exiger<R extends Reponse>(requete: PromiseLike<R>): Promise<Donnee<R>> {
  const { data, error } = await requete;
  if (error) lever(error);
  if (data === null || data === undefined) throw new ErreurRepo("inconnue", "Réponse vide.");
  return data as Donnee<R>;
}

async function exigerSansDonnee(requete: PromiseLike<{ error: ErreurPostgrest | null }>): Promise<void> {
  const { error } = await requete;
  if (error) lever(error);
}

async function invoquer<T>(nom: string, corps: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.functions.invoke<T>(nom, { body: corps });
  if (error) {
    let detail = error.message;
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      try {
        const j = (await ctx.json()) as { error?: string; detail?: string };
        detail = j.error ?? detail;
        if (j.detail) detail += ` (${j.detail})`;
      } catch { /* corps non JSON */ }
    }
    throw new ErreurRepo(nom === "prospection-gmail" ? "gmail_indisponible" : "generation_indisponible", detail, detail);
  }
  if (data === null || data === undefined) throw new ErreurRepo("inconnue", "Réponse vide.");
  return data;
}

// ----------------------------------------------------------------------------
// Authentification (SSO Google, projet vitrine, restreint @avisdoc.fr)
// ----------------------------------------------------------------------------

const CLE_SESSION_DEMO = "avisdoc-prospection-demo-session";
const sessionDemo = (): Session | null =>
  localStorage.getItem(CLE_SESSION_DEMO)
    ? ({ user: { email: demo.UTILISATEUR_DEMO.email, user_metadata: { full_name: demo.UTILISATEUR_DEMO.nom } } } as unknown as Session)
    : null;
let surChangementDemo: ((s: Session | null) => void) | null = null;

export const authentification = {
  async session(): Promise<Session | null> {
    if (MODE_DEMO) return sessionDemo();
    const { data, error } = await sb.auth.getSession();
    if (error) throw new ErreurRepo("acces_refuse", error.message);
    return data.session;
  },
  surChangement(cb: (s: Session | null) => void): () => void {
    if (MODE_DEMO) { surChangementDemo = cb; return () => { surChangementDemo = null; }; }
    const { data } = sb.auth.onAuthStateChange((_e, s) => cb(s));
    return () => data.subscription.unsubscribe();
  },
  async connecter(redirection: string): Promise<void> {
    if (MODE_DEMO) {
      await new Promise((r) => setTimeout(r, 500));
      localStorage.setItem(CLE_SESSION_DEMO, "1");
      surChangementDemo?.(sessionDemo());
      return;
    }
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirection, queryParams: { hd: DOMAINE_AUTORISE, prompt: "select_account" } },
    });
    if (error) throw new ErreurRepo("acces_refuse", error.message);
  },
  async deconnecter(): Promise<void> {
    if (MODE_DEMO) { localStorage.removeItem(CLE_SESSION_DEMO); return; }
    await sb.auth.signOut();
  },
};

// ----------------------------------------------------------------------------
// Lectures
// ----------------------------------------------------------------------------

const SELECTION_CONTACT = "*, compte(*)";

export type EcranDuJour = {
  relances: RelanceAFaire[];
  reponses: ReponseNonTraitee[];
  aQualifier: ContactAvecCompte[];
  invitationsDuJour: number;
};

export async function chargerJour(): Promise<EcranDuJour> {
  if (MODE_DEMO) return demo.chargerJour();
  const [relances, reponses, aQualifier, nbInvitations] = await Promise.all([
    exiger(sb.from("v_relances_a_faire").select("*").order("du_le", { ascending: true })),
    exiger(sb.from("v_reponses_non_traitees").select("*").order("survenu_le", { ascending: false })),
    exiger(sb.from("contact").select(SELECTION_CONTACT).eq("statut", "a_qualifier").order("score", { ascending: false }).limit(50)
      .overrideTypes<ContactAvecCompte[], { merge: false }>()),
    invitationsDuJour(),
  ]);
  return { relances, reponses, aQualifier, invitationsDuJour: nbInvitations };
}

export async function invitationsDuJour(): Promise<number> {
  if (MODE_DEMO) return demo.invitationsDuJour();
  return exiger(sb.rpc("invitations_du_jour"));
}

export async function listerContacts(): Promise<ContactAvecCompte[]> {
  if (MODE_DEMO) return demo.listerContacts();
  return exiger(
    sb.from("contact").select(SELECTION_CONTACT).order("score", { ascending: false }).order("maj_le", { ascending: false })
      .overrideTypes<ContactAvecCompte[], { merge: false }>(),
  );
}

export type FicheContact = { contact: ContactAvecCompte; interactions: Interaction[]; relances: Relance[] };

export async function lireContact(id: string): Promise<FicheContact | null> {
  if (MODE_DEMO) return demo.lireContact(id);
  const { data, error } = await sb.from("contact").select(SELECTION_CONTACT).eq("id", id).maybeSingle()
    .overrideTypes<ContactAvecCompte, { merge: false }>();
  if (error) lever(error);
  if (!data) return null;
  const [interactions, relances] = await Promise.all([
    exiger(sb.from("interaction").select("*").eq("contact_id", id).order("survenu_le", { ascending: false })),
    exiger(sb.from("relance").select("*").eq("contact_id", id)),
  ]);
  return { contact: data, interactions, relances };
}

export async function listerComptes(): Promise<Compte[]> {
  if (MODE_DEMO) return demo.listerComptes();
  return exiger(sb.from("compte").select("*").order("nom", { ascending: true }));
}

export async function listerImports(): Promise<Import[]> {
  if (MODE_DEMO) return demo.listerImports();
  return exiger(sb.from("import").select("*").order("importe_le", { ascending: false }).limit(50));
}

export async function listerExclusions(): Promise<Exclusion[]> {
  if (MODE_DEMO) return demo.listerExclusions();
  return exiger(sb.from("exclusion").select("*").order("cree_le", { ascending: false }).limit(500));
}

export async function listerSyntheses(): Promise<SyntheseHebdo[]> {
  if (MODE_DEMO) return demo.listerSyntheses();
  return exiger(sb.from("synthese_hebdo").select("*").order("semaine", { ascending: false }).limit(26));
}

export async function vueParCercle(): Promise<LigneParCercle[]> {
  if (MODE_DEMO) return demo.vueParCercle();
  return exiger(sb.from("v_par_cercle").select("*"));
}

// ----------------------------------------------------------------------------
// Écritures directes : fiches (jamais le statut) et exclusions manuelles
// ----------------------------------------------------------------------------

/** Met à jour la fiche et recalcule le cache de score à chaque écriture. */
export async function mettreAJourContact(contact: ContactAvecCompte, champs: ModificationContact): Promise<Contact> {
  if (MODE_DEMO) return demo.mettreAJourContact(contact, champs);
  const fusion = { ...contact, ...champs };
  const score = calculerScore(fusion, contact.compte).total;
  return exiger(sb.from("contact").update({ ...champs, score }).eq("id", contact.id).select("*").single());
}

/** Met à jour un compte, puis le cache de score de ses contacts (cercle, exposition, effectif). */
export async function mettreAJourCompte(compteId: string, champs: ModificationCompte): Promise<Compte> {
  if (MODE_DEMO) return demo.mettreAJourCompte(compteId, champs);
  const compte = await exiger(sb.from("compte").update(champs).eq("id", compteId).select("*").single());
  const contacts = await exiger(sb.from("contact").select("*").eq("compte_id", compteId));
  await Promise.all(contacts.map((c) =>
    exigerSansDonnee(sb.from("contact").update({ score: calculerScore(c, compte).total }).eq("id", c.id))));
  return compte;
}

export async function creerCompte(champs: Insertion<"compte">): Promise<Compte> {
  if (MODE_DEMO) return demo.creerCompte(champs);
  return exiger(sb.from("compte").insert(champs).select("*").single());
}

export async function rattacherCompte(contact: ContactAvecCompte, compte: Compte): Promise<void> {
  if (MODE_DEMO) return demo.rattacherCompte(contact, compte);
  const score = calculerScore(contact, compte).total;
  await exigerSansDonnee(sb.from("contact").update({ compte_id: compte.id, score }).eq("id", contact.id));
}

export async function ajouterExclusion(champs: Insertion<"exclusion">): Promise<Exclusion> {
  if (MODE_DEMO) return demo.ajouterExclusion(champs);
  return exiger(sb.from("exclusion").insert(champs).select("*").single());
}

// ----------------------------------------------------------------------------
// Fonctions serveur : transitions, envois, réponses, import, synthèse
// ----------------------------------------------------------------------------

export async function transition(contactId: string, vers: StatutContact): Promise<StatutContact> {
  if (MODE_DEMO) return demo.transition(contactId, vers);
  return exiger(sb.rpc("transition_contact", { p_contact_id: contactId, p_vers: vers }));
}

export type ResultatEnvoi = { interaction_id: string; statut: StatutContact; invitations_restantes: number };

function lireObjet(j: Json): Record<string, Json | undefined> {
  return j && typeof j === "object" && !Array.isArray(j) ? j : {};
}

export async function marquerEnvoye(contactId: string, type: TypeInteraction, contenu: string): Promise<ResultatEnvoi> {
  if (MODE_DEMO) return demo.marquerEnvoye(contactId, type, contenu);
  const j = lireObjet(await exiger(sb.rpc("marquer_envoye", { p_contact_id: contactId, p_type: type, p_contenu: contenu })));
  return {
    interaction_id: String(j.interaction_id ?? ""),
    statut: j.statut as StatutContact,
    invitations_restantes: Number(j.invitations_restantes ?? 0),
  };
}

export async function enregistrerReponse(contactId: string, canal: Canal, contenu: string): Promise<StatutContact> {
  if (MODE_DEMO) return demo.enregistrerReponse(contactId, canal, contenu);
  const j = lireObjet(await exiger(sb.rpc("enregistrer_reponse", { p_contact_id: contactId, p_canal: canal, p_contenu: contenu })));
  return j.statut as StatutContact;
}

export async function ajouterNote(contactId: string, canal: Canal, contenu: string): Promise<string> {
  if (MODE_DEMO) return demo.ajouterNote(contactId, canal, contenu);
  return exiger(sb.rpc("ajouter_note", { p_contact_id: contactId, p_canal: canal, p_contenu: contenu }));
}

export async function marquerTraitee(interactionId: string): Promise<void> {
  if (MODE_DEMO) return demo.marquerTraitee(interactionId);
  await exigerSansDonnee(sb.rpc("marquer_traitee", { p_interaction_id: interactionId }));
}

export type ResultatImport = {
  import_id: string | null;
  ecrit: boolean;
  lues: number;
  creees: number;
  mises_a_jour: number;
  ignorees: { exclusion: number; invalide: number };
};

export async function importer(libelle: string, fichier: string, lignes: LigneImport[], ecrire: boolean): Promise<ResultatImport> {
  if (MODE_DEMO) return demo.importer(libelle, fichier, lignes, ecrire);
  const j = lireObjet(await exiger(sb.rpc("importer", { p_libelle: libelle, p_fichier: fichier, p_lignes: lignes, p_ecrire: ecrire })));
  const ign = lireObjet(j.ignorees ?? null);
  return {
    import_id: typeof j.import_id === "string" ? j.import_id : null,
    ecrit: Boolean(j.ecrit),
    lues: Number(j.lues ?? 0),
    creees: Number(j.creees ?? 0),
    mises_a_jour: Number(j.mises_a_jour ?? 0),
    ignorees: { exclusion: Number(ign.exclusion ?? 0), invalide: Number(ign.invalide ?? 0) },
  };
}

export async function genererSynthese(lundi?: string): Promise<SyntheseHebdo> {
  if (MODE_DEMO) return demo.genererSynthese(lundi);
  return exiger(sb.rpc("generer_synthese_hebdo", lundi ? { p_lundi: lundi } : {}));
}

// ----------------------------------------------------------------------------
// Fonctions Edge (projet vitrine) : génération de message, rattachement Gmail
// ----------------------------------------------------------------------------

export type DemandeMessage = {
  genre: GenreMessage;
  typeCompte: string | null;
  cercle: number | null;
  fonction: string | null;
  niveau: string | null;
  destinataireRh: boolean;
  objection: CleObjection;
  objectionTexte: string;
  signaux: Array<{ code: string; libelle: string; constate_le?: string; detail?: string }>;
  historique: Array<{ type: string; sens: string; survenu_le: string; contenu: string }>;
  typeEnvoi: TypeInteraction;
};

export type ReponseMessage = { texte: string; modele: string };

export async function genererMessage(demande: DemandeMessage): Promise<ReponseMessage> {
  if (MODE_DEMO) return demo.genererMessage(demande);
  const r = await invoquer<{ texte?: string; modele?: string }>("prospection-message", demande);
  return { texte: String(r.texte ?? ""), modele: String(r.modele ?? "") };
}

export type ResultatGmail = { contacts: number; emails: number; erreurs: string[] };

export async function synchroniserGmail(): Promise<ResultatGmail> {
  if (MODE_DEMO) return demo.synchroniserGmail();
  const r = await invoquer<{ contacts?: number; emails?: number; erreurs?: string[] }>("prospection-gmail", { action: "synchroniser" });
  return { contacts: Number(r.contacts ?? 0), emails: Number(r.emails ?? 0), erreurs: r.erreurs ?? [] };
}
