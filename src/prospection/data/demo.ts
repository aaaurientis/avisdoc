// Mode démo : données fictives en mémoire (persistées dans localStorage),
// mêmes règles que les fonctions serveur (transitions, plafond, relances,
// import, purge). Aucun appel réseau, aucun Supabase. Sert à tester les écrans
// avant toute mise en place du projet vitrine :
//   VITE_PROSPECTION_MODE=demo npm run dev   →  http://localhost:8080/prospection.html
import type {
  Canal, Compte, Contact, ContactAvecCompte, Exclusion, Import, Insertion, Interaction, Json, LigneParCercle,
  ModificationCompte, ModificationContact, Relance, RelanceAFaire, ReponseNonTraitee, StatutContact, SyntheseHebdo, TypeInteraction,
} from "./types";
import { ErreurRepo } from "./erreurs";
import type { LigneImport } from "../domaine/importCsv";
import { pr64NormaliserLinkedin } from "../domaine/importCsv";
import { pr40TransitionAutorisee } from "../domaine/machineEtats";
import { ECHEANCES, PLAFOND_INVITATIONS_JOUR, pr50EcheancesRelance } from "../domaine/relances";
import { calculerScore } from "../domaine/signaux";
import { pr85LundiDe } from "../domaine/synthese";
import { aujourdhuiIso } from "../lib/format";

export const UTILISATEUR_DEMO = { nom: "Démo AvisDoc", email: "demo@avisdoc.fr" };
const CLE = "avisdoc-prospection-demo";

type Journal = { evenement: string; detail: Record<string, Json | undefined>; survenu_le: string };
type Etat = {
  comptes: Compte[]; contacts: Contact[]; interactions: Interaction[]; relances: Relance[];
  imports: Import[]; exclusions: Exclusion[]; syntheses: SyntheseHebdo[]; journal: Journal[];
};

const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `demo-${Math.random().toString(36).slice(2)}`);
const maintenant = () => new Date().toISOString();
const ilYA = (jours: number, heures = 10) => { const d = new Date(); d.setDate(d.getDate() - jours); d.setHours(heures, 0, 0, 0); return d.toISOString(); };
const isoJour = (decalage: number) => { const d = new Date(); d.setDate(d.getDate() + decalage); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function compte(p: Partial<Compte> & Pick<Compte, "nom" | "type">): Compte {
  return {
    id: uuid(), cercle: null, effectif_min: null, effectif_max: null, expose: false, region: null, secteur: null,
    site_web: null, linkedin_url: null, score: 0, statut: "cible", import_id: null, cree_le: ilYA(30), maj_le: ilYA(30), ...p,
  };
}
function contact(p: Partial<Contact> & Pick<Contact, "nom">): Contact {
  return {
    id: uuid(), compte_id: null, prenom: "", fonction: null, niveau: null, linkedin_url: null, email: null,
    anciennete_poste_mois: null, signaux: [], score: 0, statut: "a_qualifier", import_id: null,
    jeton_opposition: uuid(), cree_le: ilYA(20), maj_le: ilYA(20), ...p,
  };
}

function graine(): Etat {
  const importId = uuid();
  const courtage = compte({ nom: "Cabinet Démo Courtage", type: "courtier", cercle: 1, region: "Grand Est", effectif_min: 11, effectif_max: 50, secteur: "Courtage d'assurances", import_id: importId });
  const qvct = compte({ nom: "Démo QVCT Services", type: "qvct", cercle: 2, region: "Île-de-France", effectif_min: 11, effectif_max: 50, secteur: "Bien-être au travail" });
  const industrie = compte({ nom: "Démo Industrie", type: "entreprise", cercle: 3, region: "Grand Est", effectif_min: 1001, effectif_max: 5000, secteur: "BTP", expose: true });
  const mutuelle = compte({ nom: "Démo Mutuelle", type: "mutuelle", cercle: 2, region: "France", effectif_min: 501, effectif_max: 1000 });

  const alice = contact({ prenom: "Alice", nom: "Démo", fonction: "Associée gérante", niveau: "associe", compte_id: courtage.id, statut: "a_contacter", linkedin_url: "https://www.linkedin.com/in/alice-demo", import_id: importId,
    signaux: [{ code: "PR-09", constate_le: isoJour(-3), detail: "Deux relations en commun" }] });
  const bruno = contact({ prenom: "Bruno", nom: "Démo", fonction: "Directeur", niveau: "directeur", compte_id: courtage.id, statut: "invite", linkedin_url: "https://www.linkedin.com/in/bruno-demo", import_id: importId });
  const chloe = contact({ prenom: "Chloé", nom: "Démo", fonction: "Responsable QVCT", niveau: "responsable", compte_id: qvct.id, statut: "accepte", linkedin_url: "https://www.linkedin.com/in/chloe-demo", email: "chloe.demo@exemple.fr",
    signaux: [{ code: "PR-03", constate_le: isoJour(-5) }, { code: "PR-06", constate_le: isoJour(-40), detail: "Post sur la semaine de la QVCT" }] });
  const david = contact({ prenom: "David", nom: "Démo", fonction: "DRH", niveau: "directeur", compte_id: industrie.id, statut: "en_conversation", linkedin_url: "https://www.linkedin.com/in/david-demo", email: "david.demo@exemple.fr", anciennete_poste_mois: 8,
    signaux: [{ code: "PR-05", constate_le: isoJour(-12), detail: "Rapport RSE 2025 publié" }] });
  const emma = contact({ prenom: "Emma", nom: "Démo", fonction: "Chargée de prévention", niveau: "charge", compte_id: industrie.id, statut: "a_qualifier", linkedin_url: "https://www.linkedin.com/in/emma-demo", anciennete_poste_mois: 4 });
  const farid = contact({ prenom: "Farid", nom: "Démo", fonction: "VP Partenariats", niveau: "vp", compte_id: mutuelle.id, statut: "a_qualifier", linkedin_url: "https://www.linkedin.com/in/farid-demo",
    signaux: [{ code: "PR-08", constate_le: isoJour(-100) }] });
  const gaelle = contact({ prenom: "Gaëlle", nom: "Démo", fonction: "Directrice", niveau: "directeur", compte_id: mutuelle.id, statut: "arrete", linkedin_url: "https://www.linkedin.com/in/gaelle-demo" });

  const comptes = [courtage, qvct, industrie, mutuelle];
  const contacts = [alice, bruno, chloe, david, emma, farid, gaelle];
  for (const c of contacts) c.score = calculerScore(c, comptes.find((k) => k.id === c.compte_id) ?? null).total;

  const inter = (p: Partial<Interaction> & Pick<Interaction, "contact_id" | "type" | "sens" | "survenu_le">): Interaction => ({
    id: uuid(), canal: "linkedin", contenu: "", objet: null, email_thread_id: null, email_message_id: null, traitee_le: null,
    cree_par: UTILISATEUR_DEMO.email, cree_le: p.survenu_le, ...p,
  });
  const interactions: Interaction[] = [
    inter({ contact_id: bruno.id, type: "invitation", sens: "sortant", survenu_le: ilYA(7), contenu: "Bonjour, je developpe AvisDoc, un service de reperage de lesions suspectes sur le lieu de travail. Vos clients PME pourraient y trouver un avantage differenciant. Ouvert a un echange ?" }),
    inter({ contact_id: chloe.id, type: "invitation", sens: "sortant", survenu_le: ilYA(9), contenu: "Bonjour, AvisDoc organise des journees de reperage de lesions suspectes en entreprise, avec avis d'un dermatologue sous 96 heures. Un complement naturel a vos programmes QVCT ?" }),
    inter({ contact_id: chloe.id, type: "message_valeur", sens: "sortant", survenu_le: ilYA(4), contenu: "Merci pour l'acceptation. Un chiffre : 30 % des salaries exposes n'ont jamais vu un dermatologue. Le format tient en une demi-journee sur site." }),
    inter({ contact_id: david.id, type: "invitation", sens: "sortant", survenu_le: ilYA(15), contenu: "Bonjour, AvisDoc propose une journee de reperage de lesions suspectes sur site, avec avis sous 96 heures. Confidentialite totale pour vos salaries. Ouvert a un echange ?" }),
    inter({ contact_id: david.id, type: "reponse", sens: "entrant", survenu_le: ilYA(1, 9), contenu: "Intéressé pour le site de Nancy, disponible la semaine prochaine pour un échange de vingt minutes." }),
    inter({ contact_id: gaelle.id, type: "invitation", sens: "sortant", survenu_le: ilYA(40), contenu: "Invitation." }),
    inter({ contact_id: gaelle.id, type: "message_valeur", sens: "sortant", survenu_le: ilYA(35), contenu: "Message de valeur." }),
    inter({ contact_id: gaelle.id, type: "partage_contenu", sens: "sortant", survenu_le: ilYA(28), contenu: "Partage de contenu." }),
    inter({ contact_id: gaelle.id, type: "proposition", sens: "sortant", survenu_le: ilYA(19), contenu: "Proposition." }),
  ];
  const rel = (contact_id: string, echeance: Relance["echeance"], du_le: string, etat: Relance["etat"]): Relance => ({ id: uuid(), contact_id, echeance, du_le, etat, interaction_id: null, cree_le: ilYA(7) });
  const relances: Relance[] = [
    rel(bruno.id, "j5", isoJour(-2), "en_attente"), rel(bruno.id, "j12", isoJour(5), "en_attente"), rel(bruno.id, "j21", isoJour(14), "en_attente"),
    rel(chloe.id, "j5", isoJour(-4), "fait"), rel(chloe.id, "j12", isoJour(3), "en_attente"), rel(chloe.id, "j21", isoJour(12), "en_attente"),
    rel(david.id, "j5", isoJour(-10), "fait"), rel(david.id, "j12", isoJour(-3), "annule"), rel(david.id, "j21", isoJour(6), "annule"),
    rel(gaelle.id, "j5", isoJour(-35), "fait"), rel(gaelle.id, "j12", isoJour(-28), "fait"), rel(gaelle.id, "j21", isoJour(-19), "fait"),
  ];
  const imports: Import[] = [{ id: importId, libelle_liste: "Courtiers Grand Est (démo)", fichier_nom: "courtiers-grand-est.csv", lignes_lues: 2, lignes_creees: 2, lignes_maj: 0, lignes_ignorees: 0, detail_ignorees: { exclusion: 0, invalide: 0 }, importe_le: ilYA(20), importe_par: UTILISATEUR_DEMO.email }];
  const exclusions: Exclusion[] = [{ id: uuid(), linkedin_url: "https://www.linkedin.com/in/recette-exclu", email: null, motif: "opposition", cree_le: ilYA(60) }];
  const lundiPrecedent = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return pr85LundiDe(d); })();
  const syntheses: SyntheseHebdo[] = [{ id: uuid(), semaine: lundiPrecedent, invitations: 12, acceptations: 4, taux_acceptation: 33.33, conversations_ouvertes: 2, partenariats: 0, relances_oubliees: 1, par_cercle: [], genere_le: ilYA(3) }];
  const journal: Journal[] = [
    { evenement: "transition", detail: { contact_id: david.id, de: "accepte", vers: "en_conversation" }, survenu_le: ilYA(1, 9) },
    { evenement: "transition", detail: { contact_id: chloe.id, de: "invite", vers: "accepte" }, survenu_le: ilYA(6) },
  ];
  return { comptes, contacts, interactions, relances, imports, exclusions, syntheses, journal };
}

let etat: Etat = (() => {
  try {
    const brut = localStorage.getItem(CLE);
    if (brut) return JSON.parse(brut) as Etat;
  } catch { /* stockage indisponible */ }
  return graine();
})();

function sauver(): void {
  try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch { /* stockage indisponible */ }
}

export function reinitialiserDemo(): void {
  etat = graine();
  sauver();
}

const erreur = (code: string, detail?: string): never => { throw new ErreurRepo(code, code, detail); };
const trouverContact = (id: string): Contact => etat.contacts.find((c) => c.id === id) ?? erreur("contact_introuvable");
const compteDe = (c: Contact): Compte | null => etat.comptes.find((k) => k.id === c.compte_id) ?? null;
const avecCompte = (c: Contact): ContactAvecCompte => clone({ ...c, compte: compteDe(c) });
const journaliser = (evenement: string, detail: Record<string, Json | undefined>) => etat.journal.push({ evenement, detail, survenu_le: maintenant() });

function changerStatut(c: Contact, vers: StatutContact): StatutContact {
  if (c.statut === vers) return vers;
  if (!pr40TransitionAutorisee(c.statut, vers)) erreur("transition_refusee", `${c.statut} vers ${vers}`);
  journaliser("transition", { contact_id: c.id, de: c.statut, vers });
  c.statut = vers;
  c.maj_le = maintenant();
  if (vers === "refus" || vers === "arrete" || vers === "partenaire") {
    for (const r of etat.relances) if (r.contact_id === c.id && r.etat === "en_attente") r.etat = "annule";
  }
  return vers;
}

function nbInvitationsDuJour(): number {
  const jour = aujourdhuiIso();
  return etat.interactions.filter((i) => i.type === "invitation" && i.sens === "sortant" && i.survenu_le.slice(0, 10) === jour).length;
}

// ----------------------------------------------------------------------------
// Lectures
// ----------------------------------------------------------------------------

export async function chargerJour() {
  const jour = aujourdhuiIso();
  const relances: RelanceAFaire[] = etat.relances
    .filter((r) => r.etat === "en_attente" && r.du_le <= jour)
    .sort((a, b) => (a.du_le < b.du_le ? -1 : 1))
    .map((r) => {
      const c = trouverContact(r.contact_id); const k = compteDe(c);
      const retard = Math.round((new Date(`${jour}T00:00:00`).getTime() - new Date(`${r.du_le}T00:00:00`).getTime()) / 86_400_000);
      return { id: r.id, contact_id: c.id, echeance: r.echeance, du_le: r.du_le, etat: r.etat, retard_jours: retard, prenom: c.prenom, nom: c.nom, fonction: c.fonction, statut: c.statut, linkedin_url: c.linkedin_url, score: c.score, compte_nom: k?.nom ?? null, cercle: k?.cercle ?? null };
    });
  const reponses: ReponseNonTraitee[] = etat.interactions
    .filter((i) => i.sens === "entrant" && !i.traitee_le)
    .sort((a, b) => (a.survenu_le < b.survenu_le ? 1 : -1))
    .map((i) => {
      const c = trouverContact(i.contact_id); const k = compteDe(c);
      return { id: i.id, contact_id: c.id, canal: i.canal, type: i.type, objet: i.objet, contenu: i.contenu, survenu_le: i.survenu_le, prenom: c.prenom, nom: c.nom, fonction: c.fonction, statut: c.statut, compte_nom: k?.nom ?? null, cercle: k?.cercle ?? null };
    });
  const aQualifier = etat.contacts.filter((c) => c.statut === "a_qualifier").sort((a, b) => b.score - a.score).map(avecCompte);
  return clone({ relances, reponses, aQualifier, invitationsDuJour: nbInvitationsDuJour() });
}

export async function invitationsDuJour(): Promise<number> { return nbInvitationsDuJour(); }
export async function listerContacts(): Promise<ContactAvecCompte[]> { return etat.contacts.map(avecCompte); }
export async function lireContact(id: string) {
  const c = etat.contacts.find((x) => x.id === id);
  if (!c) return null;
  return clone({
    contact: avecCompte(c),
    interactions: etat.interactions.filter((i) => i.contact_id === id).sort((a, b) => (a.survenu_le < b.survenu_le ? 1 : -1)),
    relances: etat.relances.filter((r) => r.contact_id === id),
  });
}
export async function listerComptes(): Promise<Compte[]> { return clone(etat.comptes); }
export async function listerImports(): Promise<Import[]> { return clone([...etat.imports].reverse()); }
export async function listerExclusions(): Promise<Exclusion[]> { return clone([...etat.exclusions].reverse()); }
export async function listerSyntheses(): Promise<SyntheseHebdo[]> { return clone([...etat.syntheses].sort((a, b) => (a.semaine < b.semaine ? 1 : -1))); }
export async function vueParCercle(): Promise<LigneParCercle[]> {
  const m = new Map<string, LigneParCercle>();
  for (const c of etat.contacts) {
    const cercle = compteDe(c)?.cercle ?? 0;
    const k = `${cercle}|${c.statut}`;
    const l = m.get(k) ?? { cercle, statut: c.statut, nombre: 0 };
    l.nombre = (l.nombre ?? 0) + 1;
    m.set(k, l);
  }
  return [...m.values()];
}

// ----------------------------------------------------------------------------
// Écritures directes
// ----------------------------------------------------------------------------

export async function mettreAJourContact(contact: ContactAvecCompte, champs: ModificationContact): Promise<Contact> {
  const c = trouverContact(contact.id);
  Object.assign(c, champs, { linkedin_url: pr64NormaliserLinkedin(champs.linkedin_url ?? c.linkedin_url), email: (champs.email ?? c.email)?.toLowerCase() || null });
  c.score = calculerScore(c, compteDe(c)).total;
  c.maj_le = maintenant();
  sauver();
  return clone(c);
}
export async function mettreAJourCompte(compteId: string, champs: ModificationCompte): Promise<Compte> {
  const k = etat.comptes.find((x) => x.id === compteId) ?? erreur("contact_introuvable");
  Object.assign(k, champs, { maj_le: maintenant() });
  for (const c of etat.contacts) if (c.compte_id === k.id) c.score = calculerScore(c, k).total;
  sauver();
  return clone(k);
}
export async function creerCompte(champs: Insertion<"compte">): Promise<Compte> {
  const k = compte({ ...champs, type: champs.type ?? "entreprise", cree_le: maintenant(), maj_le: maintenant() });
  etat.comptes.push(k); sauver();
  return clone(k);
}
export async function rattacherCompte(contact: ContactAvecCompte, k: Compte): Promise<void> {
  const c = trouverContact(contact.id);
  c.compte_id = k.id; c.score = calculerScore(c, k).total; c.maj_le = maintenant(); sauver();
}
export async function ajouterExclusion(champs: Insertion<"exclusion">): Promise<Exclusion> {
  const e: Exclusion = { id: uuid(), linkedin_url: pr64NormaliserLinkedin(champs.linkedin_url), email: champs.email?.toLowerCase() || null, motif: champs.motif, cree_le: maintenant() };
  if (!e.linkedin_url && !e.email) erreur("exclusion_vide");
  etat.exclusions.push(e); sauver();
  return clone(e);
}

// ----------------------------------------------------------------------------
// Règles serveur
// ----------------------------------------------------------------------------

export async function transition(contactId: string, vers: StatutContact): Promise<StatutContact> {
  const v = changerStatut(trouverContact(contactId), vers); sauver(); return v;
}

export async function marquerEnvoye(contactId: string, type: TypeInteraction, contenu: string) {
  const c = trouverContact(contactId);
  if (contenu.length > 600) erreur("contenu_trop_long");
  const inter: Interaction = { id: uuid(), contact_id: c.id, canal: "linkedin", sens: "sortant", type, contenu, objet: null, email_thread_id: null, email_message_id: null, traitee_le: null, survenu_le: maintenant(), cree_par: UTILISATEUR_DEMO.email, cree_le: maintenant() };
  if (type === "invitation") {
    if (c.statut !== "a_contacter") erreur("transition_refusee", `${c.statut} vers invite`);
    if (nbInvitationsDuJour() >= PLAFOND_INVITATIONS_JOUR) erreur("plafond_invitations_atteint", `${PLAFOND_INVITATIONS_JOUR} invitations par jour et par identité.`);
    etat.interactions.push(inter);
    changerStatut(c, "invite");
    for (const e of pr50EcheancesRelance(new Date())) {
      if (!etat.relances.some((r) => r.contact_id === c.id && r.echeance === e.code)) {
        etat.relances.push({ id: uuid(), contact_id: c.id, echeance: e.code, du_le: e.du_le, etat: "en_attente", interaction_id: null, cree_le: maintenant() });
      }
    }
  } else {
    if (c.statut !== "invite" && c.statut !== "accepte") erreur("relance_hors_sequence", `Le contact est « ${c.statut} ».`);
    const echeance = ECHEANCES.find((e) => e.type === type)?.code ?? erreur("type_envoi_invalide");
    const r = etat.relances.find((x) => x.contact_id === c.id && x.echeance === echeance && x.etat === "en_attente") ?? erreur("relance_introuvable", `Aucune relance ${echeance} en attente.`);
    etat.interactions.push(inter);
    r.etat = "fait"; r.interaction_id = inter.id;
    if (type === "proposition") changerStatut(c, "arrete");
  }
  sauver();
  return { interaction_id: inter.id, statut: c.statut, invitations_restantes: PLAFOND_INVITATIONS_JOUR - nbInvitationsDuJour() };
}

export async function enregistrerReponse(contactId: string, canal: Canal, contenu: string): Promise<StatutContact> {
  const c = trouverContact(contactId);
  if (c.statut === "a_qualifier" || c.statut === "a_contacter") erreur("reponse_hors_sequence", `Le contact est « ${c.statut} ».`);
  etat.interactions.push({ id: uuid(), contact_id: c.id, canal, sens: "entrant", type: canal === "email" ? "email" : "reponse", contenu, objet: null, email_thread_id: null, email_message_id: null, traitee_le: null, survenu_le: maintenant(), cree_par: UTILISATEUR_DEMO.email, cree_le: maintenant() });
  for (const r of etat.relances) if (r.contact_id === c.id && r.etat === "en_attente") r.etat = "annule";
  if (c.statut === "invite") { changerStatut(c, "accepte"); changerStatut(c, "en_conversation"); }
  else if (c.statut === "accepte") changerStatut(c, "en_conversation");
  sauver();
  return c.statut;
}

export async function ajouterNote(contactId: string, canal: Canal, contenu: string): Promise<string> {
  const c = trouverContact(contactId);
  if (contenu.length < 1 || contenu.length > 280) erreur("note_hors_bornes");
  const i: Interaction = { id: uuid(), contact_id: c.id, canal, sens: "sortant", type: "note", contenu, objet: null, email_thread_id: null, email_message_id: null, traitee_le: null, survenu_le: maintenant(), cree_par: UTILISATEUR_DEMO.email, cree_le: maintenant() };
  etat.interactions.push(i); sauver();
  return i.id;
}

export async function marquerTraitee(interactionId: string): Promise<void> {
  const i = etat.interactions.find((x) => x.id === interactionId && x.sens === "entrant" && !x.traitee_le) ?? erreur("interaction_introuvable");
  i.traitee_le = maintenant(); sauver();
}

export async function importer(libelle: string, fichier: string, lignes: LigneImport[], ecrire: boolean) {
  let creees = 0, maj = 0, excl = 0, inval = 0;
  const vus = new Set<string>();
  const importId = ecrire ? uuid() : null;
  const nouveaux: Contact[] = [];
  const trouverCompte = (nom: string | null, li: string | null): Compte | undefined =>
    etat.comptes.find((k) => (li && k.linkedin_url === li) || (nom && k.nom.toLowerCase() === nom.toLowerCase()));

  for (const l of lignes) {
    const li = pr64NormaliserLinkedin(l.contact.linkedin_url);
    const em = l.contact.email?.toLowerCase() || null;
    const nom = l.contact.nom?.trim() || null;
    const prenom = l.contact.prenom?.trim() ?? "";
    const cnom = l.compte.nom?.trim() || null;
    if (!nom || (!li && !cnom)) { inval++; continue; }
    if (etat.exclusions.some((e) => (li && e.linkedin_url === li) || (em && e.email === em))) { excl++; continue; }
    const cle = li ?? `${prenom}|${nom}|${cnom}`.toLowerCase();
    const existant = etat.contacts.find((c) =>
      (li && c.linkedin_url === li) || (em && c.email === em) ||
      (!li && c.nom.toLowerCase() === nom.toLowerCase() && c.prenom.toLowerCase() === prenom.toLowerCase() && cnom && compteDe(c)?.nom.toLowerCase() === cnom.toLowerCase()));
    if (existant || vus.has(cle)) {
      maj++;
      if (ecrire && existant) {
        const k = cnom || l.compte.linkedin_url ? (trouverCompte(cnom, pr64NormaliserLinkedin(l.compte.linkedin_url)) ?? null) : null;
        if (!existant.prenom) existant.prenom = prenom;
        existant.fonction ??= l.contact.fonction; existant.niveau ??= l.contact.niveau;
        existant.linkedin_url ??= li; existant.email ??= em; existant.anciennete_poste_mois ??= l.contact.anciennete_poste_mois;
        existant.compte_id ??= k?.id ?? null; existant.maj_le = maintenant();
      }
    } else {
      creees++; vus.add(cle);
      if (ecrire) {
        let k = trouverCompte(cnom, pr64NormaliserLinkedin(l.compte.linkedin_url));
        if (!k && (cnom || l.compte.linkedin_url)) {
          k = compte({ nom: cnom ?? pr64NormaliserLinkedin(l.compte.linkedin_url) ?? "", type: l.compte.type, cercle: l.compte.cercle, linkedin_url: pr64NormaliserLinkedin(l.compte.linkedin_url), site_web: l.compte.site_web, region: l.compte.region, secteur: l.compte.secteur, effectif_min: l.compte.effectif_min, effectif_max: l.compte.effectif_max, expose: l.compte.expose, import_id: importId, cree_le: maintenant(), maj_le: maintenant() });
          etat.comptes.push(k);
        }
        const c = contact({ prenom, nom, fonction: l.contact.fonction, niveau: l.contact.niveau, linkedin_url: li, email: em, anciennete_poste_mois: l.contact.anciennete_poste_mois, compte_id: k?.id ?? null, import_id: importId, cree_le: maintenant(), maj_le: maintenant() });
        c.score = calculerScore(c, k ?? null).total;
        nouveaux.push(c);
      }
    }
  }
  if (ecrire && importId) {
    etat.contacts.push(...nouveaux);
    etat.imports.push({ id: importId, libelle_liste: libelle, fichier_nom: fichier, lignes_lues: lignes.length, lignes_creees: creees, lignes_maj: maj, lignes_ignorees: excl + inval, detail_ignorees: { exclusion: excl, invalide: inval }, importe_le: maintenant(), importe_par: UTILISATEUR_DEMO.email });
    journaliser("import", { import_id: importId, lues: lignes.length, creees, mises_a_jour: maj });
    sauver();
  }
  return { import_id: importId, ecrit: ecrire, lues: lignes.length, creees, mises_a_jour: maj, ignorees: { exclusion: excl, invalide: inval } };
}

export async function genererSynthese(lundi?: string): Promise<SyntheseHebdo> {
  const d = new Date(); d.setDate(d.getDate() - 7);
  const debut = lundi ?? pr85LundiDe(d);
  const fin = (() => { const f = new Date(`${debut}T00:00:00`); f.setDate(f.getDate() + 7); return f.toISOString().slice(0, 10); })();
  const dans = (iso: string) => iso.slice(0, 10) >= debut && iso.slice(0, 10) < fin;
  const invitations = etat.interactions.filter((i) => i.type === "invitation" && i.sens === "sortant" && dans(i.survenu_le)).length;
  const vers = (v: string) => etat.journal.filter((j) => j.evenement === "transition" && j.detail.vers === v && dans(j.survenu_le)).length;
  const acceptations = vers("accepte");
  const s: SyntheseHebdo = {
    id: uuid(), semaine: debut, invitations, acceptations,
    taux_acceptation: invitations > 0 ? Math.round((10000 * acceptations) / invitations) / 100 : null,
    conversations_ouvertes: vers("en_conversation"), partenariats: vers("partenaire"),
    relances_oubliees: etat.relances.filter((r) => r.etat === "en_attente" && r.du_le >= debut && r.du_le < fin).length,
    par_cercle: (await vueParCercle()) as unknown as Json, genere_le: maintenant(),
  };
  etat.syntheses = [...etat.syntheses.filter((x) => x.semaine !== debut), s]; sauver();
  return clone(s);
}

// ----------------------------------------------------------------------------
// Fonctions Edge simulées
// ----------------------------------------------------------------------------

export async function genererMessage(demande: { genre: "invitation" | "message"; destinataireRh: boolean; typeEnvoi: TypeInteraction }) {
  await new Promise((r) => setTimeout(r, 600));
  const confidentialite = demande.destinataireRh ? " L'employeur ne voit aucune information individuelle : confidentialite totale pour vos salaries." : "";
  const textes: Record<TypeInteraction, string> = {
    invitation: `Bonjour, je developpe AvisDoc, un service de reperage de lesions suspectes sur le lieu de travail, avec avis d'un dermatologue sous 96 heures.${confidentialite} Ouvert a un echange de vingt minutes ?`,
    message_valeur: `Merci pour votre acceptation. Un chiffre qui nous a decides : une large part des salaries exposes au soleil n'a jamais vu un dermatologue. AvisDoc tient en une demi-journee sur site, avec avis sous 96 heures.${confidentialite} Je peux vous envoyer le deroule type si utile.`,
    partage_contenu: `Je partage un retour d'experience d'une journee organisee chez un industriel de 800 salaries : 62 personnes vues, 4 orientations vers un dermatologue.${confidentialite} Dites-moi si ce format vous parle.`,
    proposition: `Derniere sollicitation de ma part : je vous propose vingt minutes pour cadrer une journee pilote sur un de vos sites, sans engagement.${confidentialite} Si ce n'est pas le moment, je n'insisterai pas.`,
    reponse: "", note: "", email: "",
  };
  return { texte: textes[demande.typeEnvoi] ?? textes.invitation, modele: "demo (aucun appel Bedrock)" };
}

export async function synchroniserGmail() {
  await new Promise((r) => setTimeout(r, 400));
  const contacts = etat.contacts.filter((c) => c.email && ["invite", "accepte", "en_conversation", "partenaire"].includes(c.statut)).length;
  return { contacts, emails: 0, erreurs: [] as string[] };
}
