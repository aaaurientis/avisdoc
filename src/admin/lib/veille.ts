// Veille : ce qu'on surveille (comptes, expressions, rubriques) et ce que l'agent
// en rapporte. Les rapports sont écrits par la fonction `veille` ; l'écran les lit.

import { supabaseAdmin } from "../data/supabaseAdmin";

export type Axe = "demarcher" | "collectivites" | "intermediaires" | "mutuelles" | "evenements" | "concurrents" | "publications" | "nouveautes" | "nous";
/**
 * Deux veilles depuis le 02/11 (décision d'Olivier) : la commerciale (ceux à démarcher) et celle de marché
 * (ce qui s'informe). Chaque axe appartient à l'une des deux ; « Nouveautés » est débranché.
 */
export type NomVeille = "commerciale" | "marche";
export const VEILLES: Record<NomVeille, { titre: string; axes: Axe[] }> = {
  commerciale: { titre: "Veille Commerciale", axes: ["demarcher", "collectivites", "intermediaires", "mutuelles"] },
  marche: { titre: "Veille Marché", axes: ["publications", "concurrents", "evenements", "nous"] },
};
export const estVeille = (v: string | undefined): v is NomVeille => v === "commerciale" || v === "marche";
export const veilleDe = (axe: Axe | undefined): NomVeille | null =>
  axe && VEILLES.commerciale.axes.includes(axe) ? "commerciale" : axe && VEILLES.marche.axes.includes(axe) ? "marche" : null;
/** Le début des adresses d'une veille dans le Hub. */
export const baseVeille = (v: NomVeille) => `/veille/${v}`;
/** Les deux cases « à démarcher » : on peut y confier une entreprise ou une collectivité à un commercial. */
export const A_DEMARCHER = new Set<string>(["demarcher", "collectivites"]);
export interface Rubrique { id: string; nom: string; description: string; ordre: number; actif: boolean; axe: Axe }
export interface Compte {
  id: string; nom: string; genre: Genre; site: string | null; linkedin: string | null; facebook: string | null;
  rubrique_id: string | null; notes: string; actif: boolean; created_by: string | null; created_at: string;
  /** Son blog ou sa page d'actualités, lu à chaque rapport. */
  blog: string | null;
}
export interface Source {
  cle: string; nom: string; genre: string; categorie: "presse" | "scientifique" | "moteur"; params: { url?: string; note?: string }; actif: boolean;
  dernier_succes: string | null; derniere_erreur: string | null;
}
export interface Reseau { id: string; nom: string; plateforme: Plateforme; url: string | null; notes: string; actif: boolean }
export type Plateforme = "linkedin" | "facebook" | "instagram" | "x" | "youtube" | "autre";
export const PLATEFORMES: { cle: Plateforme; label: string }[] = [
  { cle: "linkedin", label: "LinkedIn" }, { cle: "facebook", label: "Facebook" }, { cle: "instagram", label: "Instagram" },
  { cle: "x", label: "X (Twitter)" }, { cle: "youtube", label: "YouTube" }, { cle: "autre", label: "Autre" },
];
/** Ce qu'est une source, en clair : on ne supprime que les sites et flux ajoutés, les bases intégrées se suspendent. */
export const SOURCE_AJOUTABLE = (s: Pick<Source, "genre">) => s.genre === "site" || s.genre === "rss";
export const genreDeSource = (s: Pick<Source, "genre">) =>
  s.genre === "rss" ? "Flux" : s.genre === "site" ? "Site" : s.genre === "linkup" || s.genre === "perplexity" || s.genre === "gemini" ? "Moteur de recherche" : "Base de données";
/** Un moteur listé mais pas encore branché : il reste éteint, et on dit pourquoi. */
export const NON_BRANCHE = (s: Pick<Source, "genre">) => s.genre === "gemini";
export interface Expression { id: string; expression: string; rubrique_id: string | null; notes: string; actif: boolean; created_by: string | null; created_at: string; /** Aussi sur les réseaux sociaux (5 recherches de plus). */ reseaux: boolean }

export type Genre = "concurrent" | "client" | "institution" | "media" | "revue" | "personne" | "autre";
export const GENRES: { cle: Genre; label: string }[] = [
  { cle: "concurrent", label: "Concurrent" },
  { cle: "client", label: "Client ou prospect" },
  { cle: "institution", label: "Institution" },
  { cle: "media", label: "Média" },
  { cle: "revue", label: "Revue médicale" },
  { cle: "personne", label: "Personne" },
  { cle: "autre", label: "Autre" },
];
export const genreEnClair = (g: Genre) => GENRES.find((x) => x.cle === g)?.label ?? g;

export interface Rapport {
  id: string; periode_debut: string; periode_fin: string; statut: string;
  /** `veille` : la veille dont viennent ces points (depuis le 02/11, un rapport par veille). */
  points_cles: { texte: string; articles: string[]; veille?: NomVeille }[];
  rubriques: { nom: string; axe?: Axe; articles: string[] }[];
  posts: { titre: string; accroche: string; brouillon: string; articles: string[]; veille?: NomVeille }[];
  sources_en_panne: string[]; cout_usd: number; envoye_le: string | null; erreur: string | null;
}
export interface Article {
  id: string; url: string; titre: string; titre_fr: string | null; source: string; nature: string; publie_le: string | null;
  rubrique: string | null; importance: number | null; resume: string | null; pour_avisdoc: string | null;
  entreprise: string | null; ville: string | null;
  /** « À ne pas manquer » : à traiter sans attendre le rapport, et pourquoi. */
  urgent?: boolean; urgence?: string | null;
  /** Quand Scope l'a trouvée et ajoutée : c'est son arrivée chez AvisDoc. */
  trie_le?: string | null;
  /** Le site refuse les robots : le lien s'ouvre dans un navigateur, on propose aussi de le copier. */
  lien_protege: boolean;
  /** Qui publie, dit par Scope au tri (presse, revue, officiel, site…) ; vide pour les publications d'avant le 02/11. */
  genre_source?: string | null;
}

export const STATUTS: Record<string, string> = {
  collecte: "Collecte en cours",
  verification: "Vérification des liens",
  synthese: "Scope rédige",
  pret: "Prêt, part à 9 h",
  envoi: "Envoi en cours",
  envoye: "Envoyé",
  echec: "En échec",
};

export const NATURES: Record<string, string> = {
  etude: "Étude", preprint: "Prépublication", essai: "Essai clinique", officiel: "Officiel",
  appel_offres: "Appel d'offres", presse: "Presse", web: "Web",
};

async function lire<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

export const listerRubriques = () => lire<Rubrique[]>(supabaseAdmin.from("admin_veille_rubriques").select("*").order("ordre").order("nom"));
export const listerComptes = () => lire<Compte[]>(supabaseAdmin.from("admin_veille_comptes").select("*").order("nom"));
export const listerExpressions = () => lire<Expression[]>(supabaseAdmin.from("admin_veille_expressions").select("*").order("expression"));
export const listerSources = () => lire<Source[]>(supabaseAdmin.from("admin_veille_sources").select("cle, nom, genre, categorie, params, actif, dernier_succes, derniere_erreur").order("nom"));
export const listerReseaux = () => lire<Reseau[]>(supabaseAdmin.from("admin_veille_reseaux").select("*").order("nom"));

/** `url` absente : une base intégrée, dont on ne touche que le nom et le suivi (ses réglages restent ceux de Scope). */
export async function enregistrerSource(cle: string | null, valeurs: { nom: string; url?: string; categorie: string; actif: boolean }, auteur: string) {
  const ligne = { nom: valeurs.nom, categorie: valeurs.categorie, actif: valeurs.actif, ...(valeurs.url !== undefined && { params: { url: valeurs.url } }) };
  if (cle) await lire(supabaseAdmin.from("admin_veille_sources").update(ligne).eq("cle", cle));
  else await lire(supabaseAdmin.from("admin_veille_sources").insert({ ...ligne, cle: `site-${crypto.randomUUID()}`, genre: "site", created_by: auteur }));
}
export async function suspendreSource(cle: string, actif: boolean) {
  await lire(supabaseAdmin.from("admin_veille_sources").update({ actif }).eq("cle", cle));
}
export async function supprimerSource(cle: string) {
  await lire(supabaseAdmin.from("admin_veille_sources").delete().eq("cle", cle));
}

type Table = "admin_veille_rubriques" | "admin_veille_comptes" | "admin_veille_expressions" | "admin_veille_reseaux";
export async function enregistrer(table: Table, id: string | null, valeurs: Record<string, unknown>, auteur: string) {
  if (id) await lire(supabaseAdmin.from(table).update(valeurs).eq("id", id));
  else await lire(supabaseAdmin.from(table).insert({ ...valeurs, created_by: auteur }));
}
export async function suspendre(table: Table, id: string, actif: boolean) {
  await lire(supabaseAdmin.from(table).update({ actif }).eq("id", id));
}
export async function supprimer(table: Table, id: string) {
  await lire(supabaseAdmin.from(table).delete().eq("id", id));
}

export const listerRapports = () =>
  lire<Rapport[]>(supabaseAdmin.from("admin_veille_rapports").select("id, periode_debut, periode_fin, statut, points_cles, rubriques, posts, sources_en_panne, cout_usd, envoye_le, erreur").eq("nature", "rapport").order("periode_fin", { ascending: false }).limit(60));
export const lireRapport = (id: string) =>
  lire<Rapport | null>(supabaseAdmin.from("admin_veille_rapports").select("id, periode_debut, periode_fin, statut, points_cles, rubriques, posts, sources_en_panne, cout_usd, envoye_le, erreur").eq("id", id).maybeSingle());
export const articlesDu = (rapportId: string) =>
  lire<Article[]>(supabaseAdmin.from("admin_veille_articles").select("id, url, titre, titre_fr, source, nature, publie_le, rubrique, importance, resume, pour_avisdoc, lien_protege, entreprise, ville, urgent, urgence, trie_le, genre_source").eq("rapport_envoye_id", rapportId).eq("verdict", "retenu").is("retire_le", null));
export const sourcesNommees = () => lire<{ cle: string; nom: string }[]>(supabaseAdmin.from("admin_veille_sources").select("cle, nom"));

export async function rapportsLus(email: string, veille: NomVeille) {
  const l = await lire<{ rapport_id: string }[]>(supabaseAdmin.from("admin_veille_lectures").select("rapport_id").eq("email", email.toLowerCase()).eq("veille", veille));
  return new Set(l.map((x) => x.rapport_id));
}
export async function marquerLu(rapportId: string, email: string, veille: NomVeille) {
  await supabaseAdmin.from("admin_veille_lectures").upsert({ rapport_id: rapportId, email: email.toLowerCase(), veille }, { onConflict: "rapport_id,email,veille", ignoreDuplicates: true });
}

/** Pour le web, le nom du site dit plus que le moteur qui l'a trouvé. */
export function nomDeSource(a: { source: string; url: string }, noms: Map<string, string>) {
  const nom = a.source === "linkup" || a.source.startsWith("perplexity") ? null : noms.get(a.source);
  if (nom) return nom;
  try {
    return new URL(a.url).hostname.replace(/^www\./, "");
  } catch {
    return a.source;
  }
}

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", ...o });
export const jourDe = (iso: string) => fmt(iso, { weekday: "long", day: "numeric", month: "long" });
export const dateCourte = (iso: string | null) => (iso ? fmt(iso, { day: "numeric", month: "short" }) : "");
export const dateEtHeure = (iso: string) => `${fmt(iso, { day: "numeric", month: "short" })} à ${fmt(iso, { hour: "numeric", minute: "2-digit" }).replace(":", " h ")}`;
const heureDe = (iso: string) => parseInt(fmt(iso, { hour: "numeric", hourCycle: "h23" }), 10);
export const momentEnClair = (iso: string) => `${jourDe(iso)}, ${heureDe(iso)} h`;
export const periodeEnClair = (r: Pick<Rapport, "periode_debut" | "periode_fin">) =>
  `Du ${momentEnClair(r.periode_debut)} au ${momentEnClair(r.periode_fin)}`;

/** Les axes du rapport, dans l'ordre voulu par AvisDoc (26/10) : on agit d'abord, on s'informe ensuite. */
/** Les quatre CRM du menu (organigramme de Laurent et Irène, 09/11), chacun lié à son marché dans la Veille Commerciale. */
export const CRMS: { label: string; axe: Axe }[] = [
  { label: "CRM Entreprise", axe: "demarcher" },
  { label: "CRM Collectivités Locales", axe: "collectivites" },
  { label: "CRM Assurance Mutuelle", axe: "mutuelles" },
  { label: "CRM Intermédiaire", axe: "intermediaires" },
];

/** CRM Synthèse : où traiter une publication de ce marché (sa Veille dans son CRM). */
export const ouvrirDansCrm = (axe: string | undefined) => {
  const c = CRMS.find((x) => x.axe === axe);
  return c ? { to: `/veille/commerciale/direct?seul=${c.axe}`, label: c.label } : undefined;
};

export const AXES: { cle: Axe | "publier"; titre: string; sousTitre: string }[] = [
  { cle: "demarcher", titre: "Entreprises", sousTitre: "Des clients potentiels : entreprises et mutuelles qui parlent publiquement de la santé de leurs salariés. À confier à un commercial." },
  { cle: "collectivites", titre: "Collectivités", sousTitre: "Des clients potentiels : mairies, départements, régions qui manquent de médecins (surtout de dermatologues) ou lancent un appel d'offres de santé. À confier à un commercial." },
  { cle: "intermediaires", titre: "Intermédiaires", sousTitre: "Ceux qui peuvent revendre AvisDoc (courtiers, plateformes médicales…). Il manque un mot ou une cible ? « Suggérer un mot ou une cible », en haut de la page." },
  { cle: "mutuelles", titre: "Mutuelle Assurance", sousTitre: "Tout ce que Scope trouve sur les mutuelles, complémentaires santé et assureurs santé : forfaits prévention, offres, contrats collectifs, partenariats." },
  { cle: "publier", titre: "À publier", sousTitre: "Idées de posts LinkedIn, à relire avant de les publier." },
  { cle: "evenements", titre: "Évènements", sousTitre: "Salons, congrès, conférences, courses et journées contre le cancer à venir : où AvisDoc peut exposer, aller rencontrer des clients, sponsoriser, ou ce qu'elle peut relayer sur LinkedIn. Date et lieu dans le résumé quand ils sont connus." },
  { cle: "concurrents", titre: "Concurrence", sousTitre: "Ce que font les concurrents d'AvisDoc (annonces, contrats, levées de fonds, posts), et ce que ça change pour AvisDoc." },
  { cle: "publications", titre: "Publi Scientifiques", sousTitre: "Études, essais cliniques et avis scientifiques sur la peau et le dépistage : des arguments chiffrés pour vendre et pour publier." },
  { cle: "nouveautes", titre: "Nouveautés", sousTitre: "Tout ce qui fait bouger le métier d'AvisDoc sans être un client, un concurrent ni une étude : nouvelles règles (décrets, Assurance maladie, HAS), santé au travail, IA et appareils de dépistage, soleil et métiers d'extérieur, articles de presse. À lire pour rester à jour, pas à démarcher." },
  { cle: "nous", titre: "Les avis sur AvisDoc", sousTitre: "Ce que d'autres disent d'AvisDoc, partout sur le web et les réseaux sociaux : presse, avis, commentaires, posts de clients, de médecins ou de concurrents. Ce qu'AvisDoc publie elle-même n'y est pas." },
];
export const AXES_RUBRIQUE: { cle: Axe; label: string }[] = [
  { cle: "demarcher", label: "Entreprises" }, { cle: "collectivites", label: "Collectivités" }, { cle: "intermediaires", label: "Intermédiaires" }, { cle: "mutuelles", label: "Mutuelle Assurance" }, { cle: "evenements", label: "Événements" }, { cle: "concurrents", label: "Concurrents" },
  { cle: "publications", label: "Publications scientifiques" }, { cle: "nouveautes", label: "Nouveautés" }, { cle: "nous", label: "Les avis sur AvisDoc" },
];

const echappeLike = (t: string) => t.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Où en est une entreprise chez AvisDoc : déjà cliente, dans le Pipeline, ou dans Prospection (et confiée à qui). */
export interface StatutEntreprise {
  type: "client" | "pipeline" | "prospection";
  /** L'écran qui ouvre sa fiche. */
  lien: string;
  /** Le commercial qui la suit (« Suivi par »), s'il y en a un. */
  referent: string | null;
  /** Confiée depuis Scope : à qui et quand. */
  confiee?: { referent: string; le: string };
}

/**
 * Le statut de chaque entreprise nommée, par son nom (hors corbeille) : client d'abord, puis affaire au Pipeline,
 * puis fiche de Prospection. Clé : le nom en minuscules.
 */
export async function statutsEntreprises(entreprises: string[]) {
  const noms = [...new Set(entreprises.map((e) => e.trim()).filter(Boolean))];
  const statuts = new Map<string, StatutEntreprise>();
  await Promise.all(noms.map(async (nom) => {
    const motif = echappeLike(nom);
    const [comptes, affaires, prospects] = await Promise.all([
      supabaseAdmin.from("admin_accounts").select("id, referent, client_id").ilike("name", motif).is("deleted_at", null).limit(1),
      supabaseAdmin.from("admin_clients").select("id, referent").ilike("company", motif).is("deleted_at", null).limit(1),
      supabaseAdmin.from("admin_prospects").select("id, referent, converted_client_id").ilike("name", motif).is("deleted_at", null).limit(1),
    ]);
    const compte = comptes.data?.[0];
    const affaire = affaires.data?.[0];
    const prospect = prospects.data?.[0];
    const cle = nom.toLowerCase();
    if (compte) statuts.set(cle, { type: "client", lien: compte.client_id ? `/crm/${compte.client_id}` : "/fichier-client", referent: compte.referent ?? null });
    else if (affaire) statuts.set(cle, { type: "pipeline", lien: `/crm/${affaire.id}`, referent: affaire.referent ?? null });
    else if (prospect?.converted_client_id) statuts.set(cle, { type: "pipeline", lien: `/crm/${prospect.converted_client_id}`, referent: prospect.referent ?? null });
    else if (prospect) {
      const { data: confie } = await supabaseAdmin.from("admin_veille_confies").select("referent, created_at").eq("prospect_id", prospect.id).order("created_at", { ascending: false }).limit(1);
      statuts.set(cle, {
        type: "prospection", lien: `/prospects?fiche=${prospect.id}`, referent: prospect.referent ?? null,
        ...(confie?.[0] && { confiee: { referent: confie[0].referent, le: confie[0].created_at } }),
      });
    }
  }));
  return statuts;
}

/** Confier une entreprise à un commercial : fiche prospect créée ou retrouvée, « Suivi par », un mail avec le lien. */
export async function confierArticle(articleId: string, referent: string) {
  const { data, error } = await supabaseAdmin.functions.invoke("veille", { body: { action: "confier", articleId, referent } });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as { prospectId: string; existait: boolean; mail: "envoye" | "deja" };
}

/** « En direct » : tout ce que Scope a retenu, du plus récent au plus ancien. */
export const listerDirect = (limite = 600) =>
  lire<(Article & { trie_le: string | null })[]>(supabaseAdmin.from("admin_veille_articles")
    .select("id, url, titre, titre_fr, source, nature, publie_le, rubrique, importance, resume, pour_avisdoc, lien_protege, entreprise, ville, urgent, urgence, trie_le, genre_source")
    .eq("verdict", "retenu").is("retire_le", null).order("trie_le", { ascending: false, nullsFirst: false }).limit(limite));

const CHAMPS_ARTICLE = "id, url, titre, titre_fr, source, nature, publie_le, rubrique, importance, resume, pour_avisdoc, lien_protege, entreprise, ville, urgent, urgence, trie_le, genre_source";

/** Les publications archivées (« Retirer › Archiver ») : cachées partout, elles se remettent d'un clic. */
export const listerArchives = (limite = 300) =>
  lire<(Article & { trie_le: string | null; retire_le: string })[]>(supabaseAdmin.from("admin_veille_articles")
    .select(`${CHAMPS_ARTICLE}, retire_le`).eq("verdict", "retenu").not("retire_le", "is", null).order("retire_le", { ascending: false }).limit(limite));

/** Les entreprises à démarcher, pour Commercial › Veille : « À ne pas manquer » en tête, puis les plus récentes. */
export async function listerCommercial(limite = 300) {
  const rubriques = (await listerRubriques()).filter((r) => r.axe === "demarcher").map((r) => r.nom);
  if (!rubriques.length) return [];
  return lire<(Article & { trie_le: string | null })[]>(supabaseAdmin.from("admin_veille_articles").select(CHAMPS_ARTICLE)
    .eq("verdict", "retenu").is("retire_le", null).in("rubrique", rubriques)
    .order("urgent", { ascending: false }).order("trie_le", { ascending: false, nullsFirst: false }).limit(limite));
}

/** Ce qui vient d'un réseau social, d'après l'adresse de la page. */
export const estReseau = (url: string) => /^https?:\/\/([a-z0-9-]+\.)*(linkedin\.com|facebook\.com|fb\.com|instagram\.com|x\.com|twitter\.com|youtube\.com|youtu\.be|tiktok\.com|threads\.net)(\/|$)/i.test(url);

/** Sans trace d'un onglet ouvert, on compte comme nouveau ce qui est arrivé la dernière semaine. */
export const VU_PAR_DEFAUT = () => new Date(Date.now() - 7 * 86_400_000).toISOString();

/** Quand chacun a ouvert chaque onglet pour la dernière fois (En direct, Commercial › Veille) : la base des pastilles rouges. */
export async function ongletsVus(email: string) {
  const l = await lire<{ onglet: string; vu_le: string }[]>(supabaseAdmin.from("admin_veille_onglets_vus").select("onglet, vu_le").eq("email", email.toLowerCase()));
  return new Map(l.map((x) => [x.onglet, x.vu_le]));
}
/** Noter l'ouverture d'un onglet, à l'heure d'avant la lecture : rien d'arrivé pendant le chargement ne perd sa pastille. */
export async function noterOngletVu(email: string, onglet: string, au: string) {
  await lire(supabaseAdmin.from("admin_veille_onglets_vus").upsert({ email: email.toLowerCase(), onglet, vu_le: au }, { onConflict: "email,onglet" }));
}

/** La pastille rouge de Commercial › Veille : les entreprises arrivées depuis la dernière ouverture. */
export async function nouveautesCommercial(email: string) {
  const [rubriques, vus] = await Promise.all([listerRubriques(), ongletsVus(email)]);
  const noms = rubriques.filter((r) => r.axe === "demarcher").map((r) => r.nom);
  if (!noms.length) return 0;
  const { count, error } = await supabaseAdmin.from("admin_veille_articles").select("id", { count: "exact", head: true })
    .eq("verdict", "retenu").is("retire_le", null).in("rubrique", noms).gt("trie_le", vus.get("commercial") ?? VU_PAR_DEFAUT());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Le statut d'une entreprise qu'on vient de confier : dans Prospection, suivie et confiée à ce commercial, maintenant. */
export const confiee = (prospectId: string, referent: string): StatutEntreprise => ({
  type: "prospection", lien: `/prospects?fiche=${prospectId}`, referent, confiee: { referent, le: new Date().toISOString() },
});

/** Archiver une publication lue et sans intérêt (pour tout le monde), ou la remettre. */
export async function retirerArticle(id: string, retirer: boolean) {
  await lire(supabaseAdmin.rpc("veille_retirer", { p_id: id, p_retirer: retirer }));
}
/** La fin de la dernière tournée terminée, pour la ligne discrète d'En direct. */
export async function derniereTournee() {
  const r = await lire<{ periode_fin: string } | null>(supabaseAdmin.from("admin_veille_rapports").select("periode_fin").in("nature", ["quotidienne", "legere"]).eq("statut", "termine").order("periode_fin", { ascending: false }).limit(1).maybeSingle());
  return r?.periode_fin ?? null;
}

/** « Dernier passage aujourd'hui à 12 h · prochain à 15 h », à l'heure de Paris : une tournée toutes les 3 heures, plus celle de 7 h. */
export function lignePassages(fin: string, maintenant = new Date()) {
  const jour = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  const heure = (d: Date) => Number(d.toLocaleString("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }));
  const d = new Date(fin);
  const hier = new Date(maintenant.getTime() - 86_400_000);
  const quand = jour(d) === jour(maintenant) ? "aujourd'hui" : jour(d) === jour(hier) ? "hier" : `le ${jour(d).slice(0, 5)}`;
  const h = heure(maintenant);
  const prochain = h === 6 ? 7 : ((Math.floor(h / 3) + 1) * 3) % 24; // 7 h : la tournée quotidienne
  return `Dernier passage ${quand} à ${heure(d)} h · prochain à ${prochain} h`;
}

/** CPR, le coût de la veille : par jour et par poste, par tournée ou rapport, et les recherches Linkup du mois. */
export interface Cpr {
  jours: { jour: string; tri: number; rapport: number; perplexity: number; questions: number }[];
  tournees: { id: string; nature: "rapport" | "quotidienne" | "legere"; fin: string; statut: string; cout: number; trouves: number; gardes: number }[];
  linkup_mois: number;
}
/** Le budget du mois de la veille : un mail à 80 % puis à 100 %, rien n'est coupé. Réglé par un administrateur. */
export const lireBudget = () =>
  lire<{ montant_usd: number } | null>(supabaseAdmin.from("admin_veille_budget").select("montant_usd").maybeSingle());
export const reglerBudget = (montant: number) => lire(supabaseAdmin.rpc("veille_regler_budget", { p_montant: montant }));
export const lireCpr = (jours = 30) => lire<Cpr>(supabaseAdmin.rpc("veille_cpr", { p_jours: jours }));
/** Ce que chaque veille a coûté ce mois-ci : au mieux, la recherche et le tri étant communs (réparti au prorata des publications retenues). */
export const coutParVeille = () => lire<{ commerciale: number; marche: number; commun: number }>(supabaseAdmin.rpc("veille_cout_par_veille"));

/** Supprimer pour de bon : seule son adresse reste, pour qu'aucune tournée ne la ramène. */
export async function supprimerArticle(id: string) {
  await lire(supabaseAdmin.rpc("veille_supprimer", { p_id: id }));
}

// ---------------------------------------------------------------------------
// D'où vient vraiment une publication (02/11, Olivier : « il ne faut pas mettre presse partout »).
// L'ordre : le réseau social se lit dans l'adresse ; les bases (PubMed, BOAMP…) disent ce qu'elles donnent ;
// les sites connus ensuite ; puis ce que Scope a dit au tri ; à défaut, « Site web ».
// ---------------------------------------------------------------------------
export type Logo = "linkedin" | "facebook" | "instagram" | "x" | "youtube" | "tiktok" | "threads";
const RESEAUX_SOCIAUX: [RegExp, Logo, string][] = [
  [/(^|\.)linkedin\.com$/, "linkedin", "LinkedIn"], [/(^|\.)(facebook\.com|fb\.com)$/, "facebook", "Facebook"],
  [/(^|\.)instagram\.com$/, "instagram", "Instagram"], [/(^|\.)(x\.com|twitter\.com)$/, "x", "X (Twitter)"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube", "YouTube"], [/(^|\.)tiktok\.com$/, "tiktok", "TikTok"], [/(^|\.)threads\.net$/, "threads", "Threads"],
];
/** Journaux, magazines, radios, télés et médias professionnels relevés (les titres suivis dans le Paramétrage, et ceux déjà trouvés). */
const PRESSE = new Set([
  "actu.fr", "argusdelassurance.com", "bienpublic.com", "centrepresseaveyron.fr", "charentelibre.fr", "clicanoo.re", "corsematin.com", "courrier-picard.fr",
  "dna.fr", "egora.fr", "estrepublicain.fr", "franceinfo.fr", "franceantilles.fr", "hospimedia.fr", "ici.fr", "ladepeche.fr", "lagazettedescommunes.com",
  "lalsace.fr", "lamontagne.fr", "lanouvellerepublique.fr", "laprovence.com", "larep.fr", "larepubliquedespyrenees.fr", "lavoixdunord.fr", "leberry.fr",
  "lechorepublicain.fr", "ledauphine.com", "lejournaldemayotte.yt", "lejsl.com", "leparisien.fr", "lepopulaire.fr", "leprogres.fr", "lequotidiendumedecin.fr",
  "letelegramme.fr", "lindependant.fr", "linfo.re", "lunion.fr", "lyonne.fr", "midilibre.fr", "nicematin.com", "ouest-france.fr", "paris-normandie.fr",
  "republicain-lorrain.fr", "sante-et-travail.fr", "sudouest.fr", "ticsante.com", "vosgesmatin.fr", "whatsupdoc-lemag.fr",
  "lemonde.fr", "lefigaro.fr", "liberation.fr", "lesechos.fr", "latribune.fr", "capital.fr", "challenges.fr", "lexpress.fr", "lepoint.fr", "nouvelobs.com",
  "20minutes.fr", "bfmtv.com", "tf1info.fr", "francetvinfo.fr", "rtl.fr", "europe1.fr", "radiofrance.fr", "zonebourse.com", "boursorama.com", "usinenouvelle.com",
  "lardennais.fr", "lamanchelibre.fr", "tvvendee.fr", "lacommere43.fr", "santematin.fr", "science-et-vie.com", "marieclaire.fr", "lemoniteurdespharmacies.fr",
  "dermatologytimes.com", "managedhealthcareexecutive.com", "fr.qz.com", "qz.com", "todoalicante.es", "bicesteradvertiser.net", "actusoins.com", "infirmiers.com",
  "decision-sante.fr", "lequotidiendupharmacien.fr", "topsante.com", "lejdd.fr", "humanite.fr", "la-croix.com", "maire-info.com", "acteurspublics.fr",
]);
const COMMUNIQUES = new Set(["titrespresse.com", "presseagence.fr", "prnewswire.com", "businesswire.com", "globenewswire.com", "newswire.ca", "communiques.info"]);
const REVUES = new Set(["pubmed.ncbi.nlm.nih.gov", "europepmc.org", "doi.org", "jaad.org", "academic.oup.com", "medrxiv.org", "biorxiv.org", "nature.com", "thelancet.com",
  "nejm.org", "bmj.com", "jamanetwork.com", "sciencedirect.com", "springer.com", "link.springer.com", "wiley.com", "onlinelibrary.wiley.com", "frontiersin.org",
  "mdpi.com", "plos.org", "journals.plos.org", "larevuedupraticien.fr", "rspublisher.org", "cairn.info", "em-consulte.com", "jle.com"]);
const OFFICIELS = /(^|\.)(gouv\.fr|has-sante\.fr|ansm\.sante\.fr|sante\.fr|ameli\.fr|santepubliquefrance\.fr|e-cancer\.fr|cancer\.fr|inrs\.fr|anses\.fr|legifrance\.gouv\.fr|service-public\.fr|europa\.eu|who\.int|boamp\.fr|clinicaltrials\.gov)$/;
const GENRES_ECRITS: Record<string, string> = {
  presse: "Presse", communique: "Communiqué de presse", revue: "Revue scientifique", officiel: "Officiel", collectivite: "Collectivité",
  entreprise: "Site d'entreprise", association: "Association", site: "Site web",
};
const NATURES_PROPRES: Record<string, string> = { etude: "Étude", preprint: "Prépublication", essai: "Essai clinique", appel_offres: "Appel d'offres" };

/** L'étiquette d'une publication : d'où elle vient (et pour un réseau social, son logo). */
export function origineDe(a: Pick<Article, "url" | "nature" | "genre_source">): { label: string; logo?: Logo } {
  let site = "";
  try { site = new URL(a.url).hostname.replace(/^www\./, "").toLowerCase(); } catch { /* adresse illisible */ }
  const reseau = RESEAUX_SOCIAUX.find(([re]) => re.test(site));
  if (reseau) return { label: reseau[2], logo: reseau[1] };
  if (NATURES_PROPRES[a.nature]) return { label: NATURES_PROPRES[a.nature] };
  const connu = (l: Set<string>) => [...l].some((d) => site === d || site.endsWith(`.${d}`));
  if (connu(REVUES)) return { label: "Revue scientifique" };
  if (connu(COMMUNIQUES)) return { label: "Communiqué de presse" };
  if (connu(PRESSE)) return { label: "Presse" };
  if (OFFICIELS.test(site)) return { label: "Officiel" };
  return { label: GENRES_ECRITS[a.genre_source ?? ""] ?? "Site web" };
}

// Les suggestions des commerciaux (migration 0084) : un mot, un concurrent, un site que Scope devrait suivre.
// Elles partent de la page de veille d'un CRM et arrivent en tête du Paramétrage, dans Admin.
export type EspaceSuggestion = `crm:${(typeof CRMS)[number]["axe"]}` | "veille:marche";
export interface Suggestion {
  id: string; espace: EspaceSuggestion; texte: string; email: string;
  statut: "a_traiter" | "fait" | "refuse"; traite_par: string | null; traite_le: string | null; created_at: string;
}
export const ESPACES_SUGGESTION: { espace: EspaceSuggestion; label: string }[] = [
  ...CRMS.map((c) => ({ espace: `crm:${c.axe}` as EspaceSuggestion, label: c.label })),
  { espace: "veille:marche", label: "Veille Marché" },
];
/** L'espace d'une page de veille : le CRM de l'onglet ouvert, sinon la Veille Marché ou le CRM Entreprise. */
export const espaceDePage = (veille: NomVeille, onglet: string | null | undefined): EspaceSuggestion =>
  veille === "marche" ? "veille:marche" : CRMS.some((c) => c.axe === onglet) ? `crm:${onglet}` as EspaceSuggestion : "crm:demarcher";
export const suggerer = (espace: EspaceSuggestion, texte: string, email: string) =>
  lire(supabaseAdmin.from("admin_veille_suggestions").insert({ espace, texte: texte.trim(), email: email.toLowerCase() }));
export const listerSuggestionsATraiter = () =>
  lire<Suggestion[]>(supabaseAdmin.from("admin_veille_suggestions").select("*").eq("statut", "a_traiter").order("created_at", { ascending: false }));
export const traiterSuggestion = (id: string, statut: "fait" | "refuse", email: string) =>
  lire(supabaseAdmin.from("admin_veille_suggestions").update({ statut, traite_par: email.toLowerCase(), traite_le: new Date().toISOString() }).eq("id", id));
