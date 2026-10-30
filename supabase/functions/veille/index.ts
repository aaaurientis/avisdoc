// Veille — fonction planifiée (chaque minute), qui fait avancer le rapport en cours.
//
// Le rapport passe par cinq états, chacun fait de petites étapes reprenables :
//   collecte      — une étape par source (et par expression ou compte pour Linkup),
//                   plus la recherche Perplexity, lancée puis relue jusqu'à sa fin ;
//   verification  — les liens du web sont ouverts pour de vrai, par lots ;
//   synthese      — l'agent trie et résume par lots, puis tire les points clés ;
//   pret          — attend 9 h ; envoi — le mail part, une seule fois ;
//   envoye.
// Une étape qui échoue est rejouée plus tard ; après plusieurs échecs elle est
// abandonnée, et le rapport le dit (« sources qui n'ont pas répondu »).
//
// Protégée par un secret tiré au hasard dans la base (migration 0071), comme
// les rappels du Planning : la tâche planifiée l'envoie, la fonction le compare.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";
import { creneauLeger, creneauQuotidien, debutDuMois, echeanceCourante, echeancePrecedente, paris } from "./calendrier.ts";
import * as src from "./sources.ts";
import type { Article, Periode } from "./sources.ts";
import * as pplx from "./perplexity.ts";
import { aVerifier, type Verification, verifier } from "./verifier.ts";
import { modeleSynthese, modeleTri, pointsCles, PROMPT_VERSION, trier } from "./agent.ts";
import { type ArticleMail, composer, composerAlerte, composerBudget, composerRecap, composerUrgent, envoyer, envoyerA, type Suite } from "./mail.ts";
import { Erreur, repondre } from "./vigile.ts";
import { confier } from "./confier.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PLAFOND_USD = Number(Deno.env.get("VEILLE_PLAFOND_USD") ?? "3");
const BUDGET_MS = 140_000;
// Le temps qu'il faut encore devant soi pour oser commencer une étape de ce genre.
const BESOIN_MS: Record<string, number> = { collecte: 30_000, perplexity: 35_000, verification: 45_000, tri: 125_000, points_cles: 125_000 };
const LOT_VERIFICATION = 12;
// 8 par lot, 110 s permises au modèle (125 s réservées, pour garder de quoi enregistrer) : un lot de 9 a déjà pris 89 s sur 100 (30/10) ; 6 coûtait un quart de plus par article.
const LOT_TRI = 8;
const PERPLEXITY_DUREE_MAX_MIN = 45;
// La collecte remonte un peu avant le début de la période : ce qui paraît entre 8 h (collecte) et 9 h (fin)
// est rattrapé par le rapport suivant. Les doublons, eux, sont écartés par la clé de chaque article.
const RECOUVREMENT_MS = 2 * 3_600_000;
const ENVOI_BLOQUE_MIN = 5;
/** Les réseaux sociaux où chaque expression est aussi cherchée (ce qui y est public et indexé par le web). */
const SUPPORTS: Record<string, string[]> = {
  linkedin: ["linkedin.com"], facebook: ["facebook.com"], instagram: ["instagram.com"], x: ["x.com", "twitter.com"], youtube: ["youtube.com"],
};
const ABANDON_APRES_H = 24;
/** Le plafond mensuel des recherches Linkup (gratuit jusqu'à environ 4 000) : au-delà, la tournée quotidienne s'en passe. */
const LINKUP_PAR_MOIS = Number(Deno.env.get("VEILLE_LINKUP_PAR_MOIS") ?? "3500");
/** Les sources gratuites et sans limite : les seules de la tournée légère, toutes les 3 heures. */
const GENRES_LEGERS = new Set(["pubmed", "europepmc", "medrxiv", "clinicaltrials", "boamp", "rss"]);
const ALERTE_APRES_MIN = 15;
/**
 * Qui suit quelle case (30/10) : les entreprises à démarcher vont à Stéphane, les collectivités à Laurent.
 * Chacun reçoit tout de suite les « À ne pas rater » de sa case, et un récapitulatif du reste à la fin de chaque tournée.
 * Les adresses sont posées côté serveur (VEILLE_RESPONSABLE_…), jamais dans le code.
 */
const RESPONSABLES: { axe: string; env: string; quoi: string; suite: Suite }[] = [
  { axe: "demarcher", env: "VEILLE_RESPONSABLE_ENTREPRISES", quoi: "entreprises à démarcher", suite: {
    lien: "/commercial-veille", libelle: "Ouvrir Commercial › Veille",
    pourquoi: "Vous recevez ce mail parce que vous suivez les entreprises à démarcher repérées par Vigile.",
  } },
  { axe: "collectivites", env: "VEILLE_RESPONSABLE_COLLECTIVITES", quoi: "collectivités à démarcher", suite: {
    lien: "/veille/direct?onglet=collectivites", libelle: "Ouvrir les collectivités dans « En direct »",
    pourquoi: "Vous recevez ce mail parce que vous suivez les collectivités repérées par Vigile.",
  } },
];
/** Essais en local seulement : tous les mails de Vigile vont à cette seule adresse, à la place des vraies. */
const adresseReelle = (e: string) => Deno.env.get("VEILLE_ALERTES_ESSAI_A")?.trim().toLowerCase() || e;
const responsableDe = (axe: string) => {
  const r = RESPONSABLES.find((x) => x.axe === axe);
  const e = r && Deno.env.get(r.env)?.trim().toLowerCase();
  return r && e?.endsWith("@avisdoc.fr") ? { ...r, email: e } : null;
};
/**
 * La presse régionale (sources « site-pqr-… ») publie tout, des faits divers au sport : on ne fait trier que les articles
 * qui parlent de santé, de soins, de travail ou d'achat public. Éprouvé le 30/10 sur tout l'historique : les 9 articles
 * gardés passent tous, et 528 des 767 écartés ne sont plus envoyés au tri (mots du métier ajoutés après relecture).
 */
const SUJET_PQR = /(sant[ée]|m[ée]decin|m[ée]dical|dermato|peau|cancer|m[ée]lanome|carcinome|d[ée]pist|pr[ée]vention|soleil|\bUV\b|canicule|h[ôo]pital|clinique|\bsoins?\b|soign|t[ée]l[ée]consult|t[ée]l[ée]expert|mutuelle|compl[ée]mentaire|salari[ée]|\bQVT\b|bien-[êe]tre|maladie|octobre rose|movember|\bARS\b|\bCPAM\b|assurance maladie|infirmi|pharmac|maison de sant|centre de sant|patient|docteur|sp[ée]cialiste|g[ée]n[ée]raliste|dentiste|ophtalmo|consultation|urgences|appel d.offres|march[ée] public|r[ée]sident|senior|EHPAD|handicap|accident du travail|arr[êe]ts? maladie|ressources humaines|photoprotect|solaire|ouvrier|travailleur|grain de beaut|psoriasis|ecz[ée]ma|naevus)/i;

/** Ce qu'AvisDoc publie elle-même n'entre pas : on ne garde que ce que les autres disent d'elle. */
const DE_NOUS = (adresse: string) => {
  try {
    const u = new URL(adresse);
    const hote = u.hostname.toLowerCase();
    return hote === "avisdoc.fr" || hote.endsWith(".avisdoc.fr")
      || ((hote === "linkedin.com" || hote.endsWith(".linkedin.com")) && /^\/company\/avisdoc(\/|$)/i.test(u.pathname));
  } catch {
    return false;
  }
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

type Db = SupabaseClient<any, "public", any>;
type Nature = "rapport" | "quotidienne" | "legere";
interface Rapport { id: string; nature: Nature; periode_debut: string; periode_fin: string; statut: string; cout_usd: number; alerte_le: string | null; updated_at: string }
interface Etape { id: string; rapport_id: string; genre: string; cle: string; params: any; statut: string; externe_id: string | null; tentatives: number; max_tentatives: number; created_at: string }

const periodeDe = (r: Rapport): Periode => ({ debut: new Date(r.periode_debut), fin: new Date(r.periode_fin) });

async function verifie<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

// ---------------------------------------------------------------------------
// Le rapport de l'échéance : créé dès 8 h, avec ses étapes de collecte.
// ---------------------------------------------------------------------------
async function assurerRapport(db: Db, maintenant: Date): Promise<void> {
  const fin = echeanceCourante(maintenant);
  const existe = await verifie(db.from("admin_veille_rapports").select("id, statut").eq("nature", "rapport").eq("periode_fin", fin.toISOString()).maybeSingle()) as any;
  if (existe) {
    // Un passage coupé entre la création du rapport et celle de ses étapes : on les crée maintenant.
    if (existe.statut === "collecte" && !(await compterEtapes(db, existe.id, ["collecte", "perplexity"]))) await creerEtapesDeCollecte(db, existe.id, "rapport");
    return;
  }
  // La période part de la fin du rapport précédent : si un rendez-vous a été manqué (machine éteinte), rien n'est perdu.
  const dernier = await verifie(db.from("admin_veille_rapports").select("periode_fin").eq("nature", "rapport").lt("periode_fin", fin.toISOString()).order("periode_fin", { ascending: false }).limit(1).maybeSingle());
  // Tout premier rapport : seulement autour de son échéance, jamais un rapport de rattrapage envoyé au hasard d'une mise en route.
  if (!dernier && maintenant.getTime() > fin.getTime() + 3 * 3_600_000) return;
  const debut = dernier ? new Date((dernier as any).periode_fin) : echeancePrecedente(fin);
  const { data: cree, error } = await db.from("admin_veille_rapports")
    .insert({ nature: "rapport", periode_debut: debut.toISOString(), periode_fin: fin.toISOString(), modele: `${modeleTri()} / ${modeleSynthese()}`, prompt_version: PROMPT_VERSION })
    .select("id").maybeSingle();
  if (error) {
    if (error.code === "23505") return; // un autre passage vient de le créer
    throw new Error(error.message);
  }
  await creerEtapesDeCollecte(db, (cree as any).id as string, "rapport");
}

// ---------------------------------------------------------------------------
// Les tournées « En direct » : la quotidienne (7 h, tout sauf Perplexity) et la légère (toutes les 3 h,
// sources gratuites seulement). Chacune part de la fin de la précédente de même nature.
// ---------------------------------------------------------------------------
async function assurerTournees(db: Db, maintenant: Date): Promise<void> {
  for (const [nature, fin, duree] of [["quotidienne", creneauQuotidien(maintenant), 24], ["legere", creneauLeger(maintenant), 3]] as const) {
    const existe = await verifie(db.from("admin_veille_rapports").select("id, statut").eq("nature", nature).eq("periode_fin", fin.toISOString()).maybeSingle()) as any;
    if (existe) {
      if (existe.statut === "collecte" && !(await compterEtapes(db, existe.id, ["collecte"]))) await creerEtapesDeCollecte(db, existe.id, nature);
      continue;
    }
    const dernier = await verifie(db.from("admin_veille_rapports").select("periode_fin").eq("nature", nature).lt("periode_fin", fin.toISOString()).order("periode_fin", { ascending: false }).limit(1).maybeSingle()) as any;
    const debut = dernier ? new Date(dernier.periode_fin) : new Date(fin.getTime() - duree * 3_600_000);
    const { data: cree, error } = await db.from("admin_veille_rapports")
      .insert({ nature, periode_debut: debut.toISOString(), periode_fin: fin.toISOString(), modele: modeleTri(), prompt_version: PROMPT_VERSION })
      .select("id").maybeSingle();
    if (error) {
      if (error.code === "23505") continue;
      throw new Error(error.message);
    }
    await creerEtapesDeCollecte(db, (cree as any).id as string, nature);
  }
}

/** Combien de recherches Linkup ce mois-ci (les étapes créées, une recherche chacune) : pour ne pas dépasser le plafond. */
async function linkupCeMois(db: Db) {
  // Les recherches Linkup directes, plus les sites sans flux et les blogs, qui passent par lui faute de flux.
  const { count, error } = await db.from("admin_veille_etapes").select("id", { count: "exact", head: true })
    .eq("genre", "collecte").or("params->>source.eq.linkup,params->>source.eq.web,cle.like.site-%").gte("created_at", debutDuMois(new Date()).toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function creerEtapesDeCollecte(db: Db, id: string, nature: Nature) {
  const [sources, expressions, comptes, reseaux] = await Promise.all([
    verifie(db.from("admin_veille_sources").select("cle, genre, params").eq("actif", true)),
    verifie(db.from("admin_veille_expressions").select("id, expression, reseaux").eq("actif", true)),
    verifie(db.from("admin_veille_comptes").select("id, nom, notes, genre, blog, linkedin").eq("actif", true)),
    verifie(db.from("admin_veille_reseaux").select("id, nom, plateforme, url, notes").eq("actif", true)),
  ]);
  const sourcesParCle = new Map<string, string>((sources as any[]).map((s) => [s.cle, s.genre]));
  const etapes: any[] = [];
  for (const s of sources as any[]) {
    // Cinq essais (2, 4, 8, 16 min d'écart) : au réveil du Mac, le réseau peut manquer quelques minutes (26/10).
    // Une recherche lancée puis ratée n'est jamais relancée (voir rechercher) : seuls les échecs d'envoi se rejouent.
    if (s.genre === "perplexity") etapes.push({ rapport_id: id, genre: "perplexity", cle: s.cle, params: { source: s.cle }, max_tentatives: 5 });
    else if (s.genre === "linkup") {
      // Chaque expression est cherchée partout : presse et web, puis chaque réseau social (ce qu'il a de public et d'indexé),
      // quel que soit le compte qui publie (26/10).
      for (const e of expressions as any[]) {
        etapes.push({ rapport_id: id, genre: "collecte", cle: `linkup:expression:${e.id}`, params: { source: "linkup", q: e.expression } });
        // Une expression « presse et web seulement » ne coûte qu'une recherche au lieu de six (option A, 26/10).
        if (e.reseaux === false) continue;
        for (const [support, domaines] of Object.entries(SUPPORTS)) {
          etapes.push({ rapport_id: id, genre: "collecte", cle: `linkup:expression:${e.id}:${support}`, params: { source: "linkup", q: `Publications récentes sur « ${e.expression} »`, domaines } });
        }
      }
      for (const c of comptes as any[]) {
        const qui = c.genre === "personne" ? `Publications, interventions et déclarations récentes de ${c.nom}` : `Actualités et annonces récentes de ${c.nom}`;
        etapes.push({ rapport_id: id, genre: "collecte", cle: `linkup:compte:${c.id}`, params: { source: "linkup", q: `${qui}${c.notes ? ` (${c.notes})` : ""}` } });
      }
      // Réseaux : Vigile ne lit pas LinkedIn ou Facebook ; il cherche ce que le web en a indexé.
      const DOMAINES: Record<string, string> = { linkedin: "linkedin.com", facebook: "facebook.com", instagram: "instagram.com", x: "x.com", youtube: "youtube.com" };
      for (const r of reseaux as any[]) {
        etapes.push({ rapport_id: id, genre: "collecte", cle: `linkup:reseau:${r.id}`, params: { source: "linkup", q: `Publications récentes de ${r.nom}${r.url ? ` (page ${r.url})` : ""}${r.notes ? ` — ${r.notes}` : ""}`, domaines: DOMAINES[r.plateforme] ? [DOMAINES[r.plateforme]] : undefined } });
      }
    } else etapes.push({ rapport_id: id, genre: "collecte", cle: s.cle, params: { source: s.cle } });
  }
  // Le blog ou la page d'actualités de chaque compte suivi.
  for (const c of comptes as any[]) {
    if (c.blog && /^https?:\/\//i.test(c.blog)) etapes.push({ rapport_id: id, genre: "collecte", cle: `blog:${c.id}`, params: { source: "web", blog: c.blog, nom: c.nom } });
    // Sa page LinkedIn, s'il en a une : ses propres publications (ce que le web en a indexé).
    if (c.linkedin && /^https?:\/\/([a-z]+\.)?linkedin\.com\//i.test(c.linkedin)) {
      etapes.push({ rapport_id: id, genre: "collecte", cle: `linkedin:${c.id}`, params: { source: "linkup", q: `Publications récentes de ${c.nom} (page ${c.linkedin})`, domaines: ["linkedin.com"] } });
    }
    // Un influenceur qui publie en science : ses nouvelles études, par son nom d'auteur dans PubMed (26/10).
    const auteur = c.genre === "personne" ? auteurPubmed(c.nom) : null;
    if (auteur) etapes.push({ rapport_id: id, genre: "collecte", cle: `pubmed:auteur:${c.id}`, params: { source: "pubmed-auteur", requete: auteur } });
  }
  // Le rapport ne cherche plus que par Perplexity : le reste, les tournées l'ont trouvé (26/10).
  // La tournée légère ne prend que les sources gratuites et illimitées ; la quotidienne, tout sauf Perplexity.
  const legere = (e: any) => e.params?.source === "pubmed-auteur" || GENRES_LEGERS.has(sourcesParCle.get(e.params?.source) ?? "");
  let gardees = nature === "rapport" ? etapes.filter((e) => e.genre === "perplexity")
    : nature === "legere" ? etapes.filter((e) => e.genre === "collecte" && legere(e))
    : etapes.filter((e) => e.genre === "collecte");
  if (nature === "quotidienne") {
    const parLinkup = (e: any) => e.params?.source === "linkup" || e.params?.source === "web" || sourcesParCle.get(e.params?.source) === "site";
    const linkup = gardees.filter(parLinkup).length;
    if ((await linkupCeMois(db)) + linkup > LINKUP_PAR_MOIS) {
      gardees = gardees.filter((e) => !parLinkup(e));
      await db.from("admin_veille_rapports").update({ sources_en_panne: [`Linkup : plafond mensuel de ${LINKUP_PAR_MOIS} recherches atteint`] }).eq("id", id);
    }
  }
  await creerEtapes(db, gardees);
}

async function compterEtapes(db: Db, rapportId: string, genres: string[]) {
  const { count, error } = await db.from("admin_veille_etapes").select("id", { count: "exact", head: true }).eq("rapport_id", rapportId).in("genre", genres);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Le nom d'auteur PubMed d'une personne : « Professeur Jean-David Bouaziz » → nom + initiales (« Bouaziz JD »)
 * ou nom complet. Les titres (Pr, Dr…) sont retirés. Un seul mot : pas de recherche (trop d'homonymes).
 */
function auteurPubmed(nom: string): string | null {
  const mots = nom.replace(/^\s*(professeure?|pr\.?|docteure?|dr\.?)\s+/i, "").trim().split(/\s+/).filter(Boolean);
  if (mots.length < 2) return null;
  const famille = mots[mots.length - 1].replace(/"/g, "");
  const prenoms = mots.slice(0, -1).join(" ").replace(/"/g, "");
  const initiales = prenoms.split(/[\s-]+/).map((p) => p[0]?.toUpperCase() ?? "").join("");
  return `("${famille} ${initiales}"[Author] OR "${famille}, ${prenoms}"[Full Author Name])`;
}

/** Crée des étapes d'un coup. Chaque ligne porte tous ses champs : un champ absent d'une seule deviendrait vide pour toutes. */
async function creerEtapes(db: Db, etapes: any[]) {
  if (!etapes.length) return;
  const maintenant = new Date().toISOString();
  const completes = etapes.map((e) => ({ params: {}, max_tentatives: 4, prochain_passage: maintenant, ...e }));
  await verifie(db.from("admin_veille_etapes").upsert(completes, { onConflict: "rapport_id,genre,cle", ignoreDuplicates: true }));
}

// ---------------------------------------------------------------------------
// Exécution d'une étape
// ---------------------------------------------------------------------------
type Issue = { fait: true; resultat?: unknown; cout?: number } | { attente: number; externe_id?: string } | { abandon: string };

async function ajouterCout(db: Db, rapportId: string, cout: number) {
  if (!cout) return;
  await verifie(db.rpc("veille_ajouter_cout", { p_rapport: rapportId, p_montant: cout }));
}

async function plafondAtteint(db: Db, rapportId: string) {
  const r = await verifie(db.from("admin_veille_rapports").select("cout_usd").eq("id", rapportId).single());
  return Number((r as any).cout_usd) >= PLAFOND_USD;
}

async function noterSource(db: Db, cle: string, erreur: string | null) {
  const maj = erreur ? { derniere_erreur: erreur.slice(0, 500), derniere_erreur_le: new Date().toISOString() } : { dernier_succes: new Date().toISOString() };
  await db.from("admin_veille_sources").update(maj).eq("cle", cle);
}

async function enregistrerArticles(db: Db, rapportId: string, articles: Article[]) {
  articles = articles.filter((a) => !DE_NOUS(a.url));
  if (!articles.length) return 0;
  // Un article déjà vu (dans ce rapport ou un précédent) n'est pas repris : jamais republié.
  const lignes = articles.map((a) => ({ ...a, rapport_id: rapportId }));
  const nouveaux = await verifie(db.from("admin_veille_articles").upsert(lignes, { onConflict: "cle", ignoreDuplicates: true }).select("id"));
  return (nouveaux as any[]).length;
}

async function collecter(db: Db, r: Rapport, e: Etape): Promise<Issue> {
  const p = { debut: new Date(new Date(r.periode_debut).getTime() - RECOUVREMENT_MS), fin: new Date(r.periode_fin) };
  const cle = e.params.source as string;
  if (e.params.source === "pubmed-auteur") {
    const articles = await src.pubmed({ requete: e.params.requete }, p);
    return { fait: true, resultat: { trouves: articles.length, nouveaux: await enregistrerArticles(db, r.id, articles) } };
  }
  if (e.params.blog) {
    const articles = await src.site("web", { url: e.params.blog }, p, e.params.nom);
    return { fait: true, resultat: { trouves: articles.length, nouveaux: await enregistrerArticles(db, r.id, articles) } };
  }
  const s = await verifie(db.from("admin_veille_sources").select("nom, genre, params").eq("cle", cle).single()) as any;
  let articles: Article[];
  switch (s.genre) {
    case "pubmed": articles = await src.pubmed(s.params, p); break;
    case "europepmc": articles = await src.europepmc(s.params, p); break;
    case "medrxiv": articles = await src.medrxiv(s.params, p); break;
    case "clinicaltrials": articles = await src.clinicaltrials(s.params, p); break;
    case "boamp": articles = await src.boamp(s.params, p); break;
    case "rss": articles = await src.rss(cle, s.params, p); break;
    case "site": articles = await src.site(cle, s.params, p, s.nom); break;
    case "linkup": articles = await src.linkup(e.params.q, p, e.params.domaines); break;
    default: return { abandon: `source inconnue : ${s.genre}` };
  }
  const trouves = articles.length;
  if (cle.startsWith("site-pqr-")) articles = articles.filter((a) => SUJET_PQR.test(`${a.titre} ${a.extrait ?? ""}`));
  const nouveaux = await enregistrerArticles(db, r.id, articles);
  return { fait: true, resultat: { trouves, hors_sujet: trouves - articles.length, nouveaux } };
}

async function rechercher(db: Db, r: Rapport, e: Etape): Promise<Issue> {
  if (!e.externe_id) {
    if (await plafondAtteint(db, r.id)) return { abandon: `plafond de ${PLAFOND_USD} $ atteint pour ce rapport` };
    const [rubriques, comptes, expressions, reseaux, source] = await Promise.all([
      verifie(db.from("admin_veille_rubriques").select("nom, description").eq("actif", true).order("ordre")),
      verifie(db.from("admin_veille_comptes").select("nom, site, notes, genre").eq("actif", true)),
      verifie(db.from("admin_veille_expressions").select("expression").eq("actif", true)),
      verifie(db.from("admin_veille_reseaux").select("nom, plateforme, url").eq("actif", true)),
      verifie(db.from("admin_veille_sources").select("params").eq("cle", e.params?.source ?? e.cle).maybeSingle()),
    ]);
    const mode = (source as any)?.params?.mode === "signaux" ? "signaux" : "veille";
    const id = await pplx.lancer({ rubriques: rubriques as any, comptes: comptes as any, reseaux: reseaux as any, expressions: (expressions as any[]).map((x) => x.expression) }, periodeDe(r), mode);
    return { attente: 3 * 60_000, externe_id: id };
  }
  const suivi = await pplx.suivre(e.externe_id);
  if (suivi.etat === "en_cours") {
    if (Date.now() - new Date(e.created_at).getTime() > PERPLEXITY_DUREE_MAX_MIN * 60_000) return { abandon: `Perplexity n'a pas fini en ${PERPLEXITY_DUREE_MAX_MIN} min` };
    return { attente: 90_000 };
  }
  // Une recherche ratée n'est pas relancée : elle se paie à chaque fois.
  if (suivi.etat === "echec") return { abandon: suivi.raison };
  // Chaque recherche garde son nom (veille générale ou signaux d'entreprises) : on sait laquelle a trouvé quoi.
  const nouveaux = await enregistrerArticles(db, r.id, suivi.articles.map((a) => ({ ...a, source: e.params?.source ?? e.cle })));
  return { fait: true, cout: suivi.coutUsd, resultat: { ...(suivi.brut as object), nouveaux } };
}

async function verifierLot(db: Db, _r: Rapport, e: Etape): Promise<Issue> {
  const lot = await verifie(db.from("admin_veille_articles").select("id, url, titre, source").in("id", e.params.ids)) as any[];
  const issues = await Promise.all(lot.map(async (a) => {
    const sure = !aVerifier(a.source);
    // Une base officielle fait foi sur le contenu : on ne regarde que l'accès.
    const v = await verifier(a.url, sure ? "" : a.titre);
    return { a, v: sure && !v.ok ? { ok: true } as Verification : v };
  }));
  for (const { a, v } of issues) {
    const protege = Boolean(v.protege);
    // Le résumé de Perplexity n'est pas une preuve : l'agent ne lit que ce que dit la page elle-même.
    const maj = !v.ok ? { verifie: false, verdict: "ecarte", raison: `Lien écarté : ${v.raison}` }
      : a.source.startsWith("perplexity") && v.extrait ? { verifie: true, lien_protege: protege, extrait: v.extrait }
      : { verifie: true, lien_protege: protege };
    await verifie(db.from("admin_veille_articles").update(maj).eq("id", a.id));
  }
  return { fait: true, resultat: { verifies: issues.filter((x) => x.v.ok).length, ecartes: issues.filter((x) => !x.v.ok).length } };
}

async function trierLot(db: Db, r: Rapport, e: Etape): Promise<Issue> {
  if (await plafondAtteint(db, r.id)) return { abandon: `plafond de ${PLAFOND_USD} $ atteint pour ce rapport` };
  const lot = await verifie(db.from("admin_veille_articles").select("id, titre, source, nature, publie_le, extrait").in("id", e.params.ids)) as any[];
  const [rubriques, comptes, expressions] = await Promise.all([
    verifie(db.from("admin_veille_rubriques").select("nom, description, axe").eq("actif", true).order("ordre")),
    verifie(db.from("admin_veille_comptes").select("nom").eq("actif", true)),
    verifie(db.from("admin_veille_expressions").select("expression").eq("actif", true)),
  ]);
  const surveilles = [...(comptes as any[]).map((c) => c.nom), ...(expressions as any[]).map((x) => `« ${x.expression} »`)];
  const { tris, coutUsd } = await trier(lot.map((a, i) => ({ n: i + 1, ...a })), rubriques as any, surveilles);
  const vus = new Set(tris.map((t) => t.n));
  const oublies = lot.filter((_, i) => !vus.has(i + 1));
  if (oublies.length && e.tentatives < e.max_tentatives) throw new Error(`l'agent n'a pas classé ${oublies.length} article(s) du lot`);
  for (const a of oublies) await verifie(db.from("admin_veille_articles").update({ verdict: "ecarte", raison: "Non classé par l'agent malgré plusieurs essais." }).eq("id", a.id));
  for (const t of [...new Map(tris.map((t) => [t.n, t])).values()]) {
    const a = lot[t.n - 1];
    if (!a) continue;
    await verifie(db.from("admin_veille_articles").update(
      t.verdict === "retenu"
        ? { verdict: "retenu", raison: t.raison, rubrique: t.rubrique, importance: t.importance, titre_fr: t.titre_fr || null, resume: t.resume, pour_avisdoc: t.pour_avisdoc, entreprise: t.entreprise || null, ville: t.ville || null, urgent: Boolean(t.urgent), urgence: t.urgent ? (t.urgence || null) : null, trie_le: new Date().toISOString() }
        : { verdict: "ecarte", raison: t.raison, trie_le: new Date().toISOString() },
    ).eq("id", a.id));
  }
  return { fait: true, cout: coutUsd, resultat: { retenus: tris.filter((t) => t.verdict === "retenu").length, ecartes: tris.filter((t) => t.verdict === "ecarte").length } };
}

async function tirerPointsCles(db: Db, r: Rapport, _e: Etape): Promise<Issue> {
  // Le rapport reprend d'un seul geste tout ce qui a été retenu depuis le précédent (tournées comprises),
  // juste avant de le lire : ce qu'il reprend et ce qu'il écrit sont la même chose.
  await verifie(db.rpc("veille_rattacher", { p_rapport: r.id }));
  const retenus = await verifie(db.from("admin_veille_articles").select("id, titre, titre_fr, rubrique, importance, resume, pour_avisdoc, publie_le, extrait").eq("rapport_envoye_id", r.id).eq("verdict", "retenu").is("retire_le", null)) as any[];
  const rubriques = await verifie(db.from("admin_veille_rubriques").select("nom, axe").eq("actif", true).order("ordre")) as any[];
  const ordre = (a: any, b: any) => (b.importance ?? 0) - (a.importance ?? 0) || String(b.publie_le ?? "").localeCompare(String(a.publie_le ?? ""));
  const noms = new Set(rubriques.map((x) => x.nom));
  // Une rubrique renommée ou retirée pendant la préparation ne fait pas disparaître ses articles.
  // Chaque rubrique garde son axe dans le rapport : un rapport envoyé ne change pas si l'on modifie les rubriques ensuite.
  const parRubrique = [...rubriques.map((x) => ({ nom: x.nom, axe: x.axe })), { nom: "Autres", axe: "nouveautes" }].map(({ nom, axe }) => ({
    nom, axe, articles: retenus.filter((a) => (noms.has(a.rubrique) ? a.rubrique : "Autres") === nom).sort(ordre).map((a) => a.id),
  })).filter((x) => x.articles.length);
  // Les rubriques d'abord : si la rédaction des points clés échoue, le rapport part quand même avec ses articles.
  await verifie(db.from("admin_veille_rapports").update({ rubriques: parRubrique }).eq("id", r.id));
  let points: { texte: string; articles: string[] }[] = [];
  let posts: { titre: string; accroche: string; brouillon: string; articles: string[] }[] = [];
  let cout = 0;
  if (retenus.length && !(await plafondAtteint(db, r.id))) {
    const numerotes = retenus.slice().sort(ordre).slice(0, 80).map((a, i) => ({ n: i + 1, ...a, titre: a.titre_fr || a.titre, extrait: String(a.extrait ?? "").slice(0, 600) }));
    const res = await pointsCles(numerotes);
    cout = res.coutUsd;
    points = res.points.map((p) => ({ texte: p.texte, articles: p.articles.map((n) => numerotes[n - 1].id) }));
    posts = res.posts.map((p) => ({ titre: p.titre, accroche: p.accroche, brouillon: p.brouillon, articles: p.articles.map((n) => numerotes[n - 1].id) }));
  }
  await verifie(db.from("admin_veille_rapports").update({ points_cles: points, posts }).eq("id", r.id));
  return { fait: true, cout, resultat: { points: points.length, posts: posts.length, retenus: retenus.length } };
}

const TRAVAUX: Record<string, (db: Db, r: Rapport, e: Etape) => Promise<Issue>> = {
  collecte: collecter, perplexity: rechercher, verification: verifierLot, tri: trierLot, points_cles: tirerPointsCles,
};

async function executer(db: Db, r: Rapport, e: Etape) {
  let issue: Issue;
  try {
    issue = await TRAVAUX[e.genre](db, r, e);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const dernier = e.tentatives >= e.max_tentatives;
    // Rejouée plus tard, de plus en plus tard : 2, 4, 8 minutes.
    await verifie(db.from("admin_veille_etapes").update({
      statut: dernier ? "abandon" : "a_faire", erreur: message.slice(0, 1000), verrou_jusqua: null,
      prochain_passage: new Date(Date.now() + 2 ** e.tentatives * 60_000).toISOString(),
    }).eq("id", e.id));
    if (dernier && (e.genre === "collecte" || e.genre === "perplexity")) await noterSource(db, e.params?.source ?? e.cle, message);
    return;
  }
  if ("attente" in issue) {
    await verifie(db.from("admin_veille_etapes").update({
      statut: "attente", verrou_jusqua: null, tentatives: e.tentatives - 1, // attendre n'est pas échouer
      prochain_passage: new Date(Date.now() + issue.attente).toISOString(), ...(issue.externe_id && { externe_id: issue.externe_id }),
    }).eq("id", e.id));
    return;
  }
  if ("abandon" in issue) {
    await verifie(db.from("admin_veille_etapes").update({ statut: "abandon", erreur: issue.abandon, verrou_jusqua: null }).eq("id", e.id));
    if (e.genre === "collecte" || e.genre === "perplexity") await noterSource(db, e.params?.source ?? e.cle, issue.abandon);
    return;
  }
  await verifie(db.from("admin_veille_etapes").update({ statut: "fait", resultat: issue.resultat ?? null, cout_usd: issue.cout ?? 0, verrou_jusqua: null, erreur: null }).eq("id", e.id));
  await ajouterCout(db, r.id, issue.cout ?? 0);
  if (e.genre === "collecte" || e.genre === "perplexity") await noterSource(db, e.params?.source ?? e.cle, null);
}

/** Fait les étapes dues de ces genres tant qu'il reste du temps. */
async function traiter(db: Db, r: Rapport, genres: string[], t0: number) {
  for (;;) {
    const reste = BUDGET_MS - (Date.now() - t0);
    const possibles = genres.filter((g) => reste >= BESOIN_MS[g]);
    if (!possibles.length) return;
    const pris = await verifie(db.rpc("veille_prendre_etape", { p_rapport: r.id, p_genres: possibles })) as Etape[];
    if (!pris?.length) return;
    await executer(db, r, pris[0]);
  }
}

async function toutesFinies(db: Db, rapportId: string, genres: string[]) {
  const { count, error } = await db.from("admin_veille_etapes").select("id", { count: "exact", head: true })
    .eq("rapport_id", rapportId).in("genre", genres).not("statut", "in", "(fait,abandon)");
  // Une erreur de lecture ne vaut jamais « tout est fini ».
  if (error) throw new Error(error.message);
  return (count ?? 0) === 0;
}

async function passerA(db: Db, r: Rapport, de: string, a: string) {
  const ok = await verifie(db.from("admin_veille_rapports").update({ statut: a }).eq("id", r.id).eq("statut", de).select("id"));
  if ((ok as any[]).length) r.statut = a;
  return (ok as any[]).length > 0;
}

const lots = <T>(t: T[], n: number) => Array.from({ length: Math.ceil(t.length / n) }, (_, i) => t.slice(i * n, i * n + n));

const ETAPES_AGENT: Record<string, string> = {
  verification: "vérification de liens (une partie)", tri: "tri par l'agent (une partie des articles)", points_cles: "points clés de l'agent",
};

async function sourcesEnPanne(db: Db, rapportId: string) {
  const deja = await verifie(db.from("admin_veille_rapports").select("sources_en_panne").eq("id", rapportId).single()) as any;
  const avertissements = ((deja?.sources_en_panne ?? []) as string[]).filter((x) => x.startsWith("Linkup : plafond"));
  const abandons = await verifie(db.from("admin_veille_etapes").select("genre, cle, params").eq("rapport_id", rapportId).eq("statut", "abandon")) as any[];
  const cles = [...new Set(abandons.filter((e) => e.genre === "collecte" || e.genre === "perplexity").map((e) => e.params?.source ?? e.cle))];
  const noms = cles.length ? await verifie(db.from("admin_veille_sources").select("cle, nom").in("cle", cles)) as any[] : [];
  const agent = [...new Set(abandons.filter((e) => ETAPES_AGENT[e.genre]).map((e) => ETAPES_AGENT[e.genre]))];
  return [...new Set([...avertissements, ...cles.map((c) => noms.find((n) => n.cle === c)?.nom ?? c), ...agent])];
}

// ---------------------------------------------------------------------------
// Faire avancer un rapport d'autant d'états que le temps le permet.
// ---------------------------------------------------------------------------
async function avancer(db: Db, r: Rapport, maintenant: Date, t0: number) {
  // Coupé pendant l'envoi : on remet le rapport à « prêt ». Chez Resend, la clé d'envoi empêche un doublon.
  if (r.statut === "envoi" && Date.now() - new Date(r.updated_at).getTime() > ENVOI_BLOQUE_MIN * 60_000) await passerA(db, r, "envoi", "pret");
  if (r.statut === "collecte") {
    await traiter(db, r, ["collecte", "perplexity"], t0);
    if (!(await toutesFinies(db, r.id, ["collecte", "perplexity"]))) return;
    // Tous les liens sont ouverts : ceux du web pour vérifier leur contenu, ceux des bases officielles
    // seulement pour savoir s'ils s'ouvrent sans détour (sinon on proposera de copier le lien).
    const tous = await verifie(db.from("admin_veille_articles").select("id").eq("rapport_id", r.id).is("verifie", null)) as any[];
    const etapes = lots(tous.map((a) => a.id), LOT_VERIFICATION).map((ids, i) => ({ rapport_id: r.id, genre: "verification", cle: `lot-${i + 1}`, params: { ids } }));
    await creerEtapes(db, etapes);
    await verifie(db.from("admin_veille_rapports").update({ sources_en_panne: await sourcesEnPanne(db, r.id) }).eq("id", r.id));
    if (!(await passerA(db, r, "collecte", "verification"))) return;
  }
  if (r.statut === "verification") {
    await traiter(db, r, ["verification"], t0);
    if (!(await toutesFinies(db, r.id, ["verification"]))) return;
    const bons = await verifie(db.from("admin_veille_articles").select("id").eq("rapport_id", r.id).eq("verifie", true).is("verdict", null).order("publie_le", { ascending: false })) as any[];
    const etapes: any[] = lots(bons.map((a) => a.id), LOT_TRI).map((ids, i) => ({ rapport_id: r.id, genre: "tri", cle: `lot-${i + 1}`, params: { ids }, max_tentatives: 3 }));
    if (r.nature === "rapport") etapes.push({ rapport_id: r.id, genre: "points_cles", cle: "points", max_tentatives: 3, prochain_passage: new Date(Date.now() + 365 * 86_400_000).toISOString() });
    await creerEtapes(db, etapes);
    if (!(await passerA(db, r, "verification", "synthese"))) return;
  }
  if (r.statut === "synthese") {
    await traiter(db, r, ["tri"], t0);
    if (!(await toutesFinies(db, r.id, ["tri"]))) return;
    // Une tournée s'arrête là : ses articles sont déjà « En direct ».
    if (r.nature !== "rapport") {
      // Le récapitulatif part avant de clore : s'il échoue, la tournée reste ouverte et il est repris au passage suivant.
      try {
        await envoyerRecaps(db, r);
      } catch (err) {
        console.error(`récapitulatif de la tournée ${r.id} non envoyé :`, err instanceof Error ? err.message : String(err));
        return;
      }
      await verifie(db.from("admin_veille_rapports").update({ sources_en_panne: await sourcesEnPanne(db, r.id) }).eq("id", r.id));
      await passerA(db, r, "synthese", "termine");
      return;
    }
    // Les points clés attendaient la fin du tri : on les libère.
    await db.from("admin_veille_etapes").update({ prochain_passage: new Date().toISOString() }).eq("rapport_id", r.id).eq("genre", "points_cles").eq("statut", "a_faire");
    await traiter(db, r, ["points_cles"], t0);
    if (!(await toutesFinies(db, r.id, ["points_cles"]))) return;
    await verifie(db.from("admin_veille_rapports").update({ sources_en_panne: await sourcesEnPanne(db, r.id) }).eq("id", r.id));
    if (!(await passerA(db, r, "synthese", "pret"))) return;
  }
  if (r.nature === "rapport" && r.statut === "pret" && maintenant >= new Date(r.periode_fin)) {
    // Un seul passage gagne le droit d'envoyer.
    if (!(await passerA(db, r, "pret", "envoi"))) return;
    try {
      const { sujet, html } = await composerRapport(db, r);
      const mailId = await envoyer(sujet, html, `veille-${r.id}`);
      await verifie(db.from("admin_veille_rapports").update({ statut: "envoye", mail_id: mailId, envoye_le: new Date().toISOString(), erreur: null }).eq("id", r.id));
    } catch (err) {
      await verifie(db.from("admin_veille_rapports").update({ statut: "pret", erreur: `Envoi : ${err instanceof Error ? err.message : String(err)}`.slice(0, 1000) }).eq("id", r.id));
    }
  }
}

async function composerRapport(db: Db, r: Rapport) {
  const plein = await verifie(db.from("admin_veille_rapports").select("points_cles, posts, rubriques, sources_en_panne").eq("id", r.id).single()) as any;
  // Les rapports d'avant les axes : l'axe se retrouve par le nom de la rubrique.
  const axes = new Map((await verifie(db.from("admin_veille_rubriques").select("nom, axe")) as any[]).map((x) => [x.nom, x.axe]));
  const articles = await verifie(db.from("admin_veille_articles").select("id, titre, titre_fr, url, source, publie_le, importance, resume, pour_avisdoc, lien_protege, entreprise, ville, urgent, urgence").eq("rapport_envoye_id", r.id).eq("verdict", "retenu").is("retire_le", null)) as any[];
  const sources = await verifie(db.from("admin_veille_sources").select("cle, nom")) as any[];
  // Pour le web, le nom du site dit plus que le moteur qui l'a trouvé.
  const nomSource = (c: string, url: string) =>
    (c === "linkup" || c.startsWith("perplexity") ? null : sources.find((s) => s.cle === c)?.nom) ?? new URL(url).hostname.replace(/^www\./, "");
  const n = new Map<string, number>(articles.map((a, i) => [a.id, i + 1]));
  const enMail = (a: any): ArticleMail => ({ n: n.get(a.id)!, titre: a.titre_fr || a.titre, url: a.url, source: nomSource(a.source, a.url), publie_le: a.publie_le, importance: a.importance ?? 1, resume: a.resume ?? "", pour_avisdoc: a.pour_avisdoc ?? "", protege: Boolean(a.lien_protege), entreprise: a.entreprise ?? null, ville: a.ville ?? null, urgent: Boolean(a.urgent), urgence: a.urgence ?? null });
  const parId = new Map(articles.map((a) => [a.id, a]));
  return composer({
    id: r.id,
    debut: new Date(r.periode_debut),
    fin: new Date(r.periode_fin),
    points: (plein.points_cles ?? []).map((p: any) => ({ texte: p.texte, articles: p.articles.map((id: string) => n.get(id)).filter(Boolean) })),
    rubriques: (plein.rubriques ?? []).map((x: any) => ({ nom: x.nom, axe: x.axe ?? axes.get(x.nom) ?? "nouveautes", articles: x.articles.map((id: string) => parId.get(id)).filter(Boolean).map(enMail) })),
    posts: (plein.posts ?? []).map((p: any) => ({ titre: p.titre, accroche: p.accroche, brouillon: p.brouillon, sources: p.articles.map((id: string) => parId.get(id)).filter(Boolean).map(enMail) })),
    enPanne: plein.sources_en_panne ?? [],
    total: articles.length,
  });
}

/** L'axe de chaque rubrique (par son nom), et le nom d'une source tel qu'on l'écrit dans un mail. */
async function reperes(db: Db) {
  const [rubriques, sources] = await Promise.all([
    verifie(db.from("admin_veille_rubriques").select("nom, axe")),
    verifie(db.from("admin_veille_sources").select("cle, nom")),
  ]) as [any[], any[]];
  const axeDe = new Map<string, string>(rubriques.map((x) => [x.nom, x.axe]));
  // Pour le web, le nom du site dit plus que le moteur qui l'a trouvé.
  const nomSource = (c: string, url: string) =>
    (c === "linkup" || c.startsWith("perplexity") ? null : sources.find((s) => s.cle === c)?.nom) ?? new URL(url).hostname.replace(/^www\./, "");
  const enMail = (a: any, n = 1): ArticleMail & { urgence: string | null } => ({
    n, titre: a.titre_fr || a.titre, url: a.url, source: nomSource(a.source, a.url), publie_le: a.publie_le, importance: a.importance ?? 1,
    resume: a.resume ?? "", pour_avisdoc: a.pour_avisdoc ?? "", protege: Boolean(a.lien_protege), entreprise: a.entreprise ?? null, ville: a.ville ?? null, urgence: a.urgence ?? null,
  });
  return { axeDe, enMail };
}
const CHAMPS_MAIL = "id, titre, titre_fr, url, source, publie_le, importance, resume, pour_avisdoc, lien_protege, entreprise, ville, urgence, rubrique, alerte_essais";

/**
 * Les « À ne pas rater » tout juste triés : un mail par publication et par destinataire, tout de suite. Les destinataires :
 * celui qui suit la case (Stéphane pour une entreprise, Laurent pour une collectivité), et ceux qui ont coché l'alerte.
 * Chaque publication est réservée 10 minutes, et ne compte comme signalée qu'une fois tous les mails partis :
 * un envoi coupé en route est repris au passage suivant (5 essais au plus), et la clé d'envoi, fixe pour
 * une publication et une adresse, empêche Resend d'envoyer deux fois le même mail.
 */
async function alerterUrgents(db: Db) {
  const abonnes = ((await verifie(db.from("admin_veille_alertes").select("email"))) as any[]).map((x) => String(x.email).toLowerCase()).filter((e) => e.endsWith("@avisdoc.fr"));
  // Personne à prévenir : on ne réserve rien, ils restent visibles dans « En direct ».
  if (!abonnes.length && !RESPONSABLES.some((r) => responsableDe(r.axe))) return;
  const ids = (await verifie(db.rpc("veille_prendre_alertes")) as any[]).map((x) => (typeof x === "string" ? x : x.veille_prendre_alertes ?? x.id)).filter(Boolean);
  if (!ids.length) return;
  const articles = await verifie(db.from("admin_veille_articles").select(CHAMPS_MAIL).in("id", ids).is("retire_le", null)) as any[];
  const { axeDe, enMail } = await reperes(db);
  for (const a of articles) {
    try {
      // Celui qui suit la case d'abord : son mail mène à son écran. Une adresse ne reçoit qu'un mail.
      const resp = responsableDe(axeDe.get(a.rubrique ?? "") ?? "");
      const pour = new Map<string, Suite | undefined>();
      for (const [e, suite] of [...(resp ? [[resp.email, resp.suite] as const] : []), ...abonnes.map((e) => [e, undefined] as const)]) {
        if (!pour.has(adresseReelle(e))) pour.set(adresseReelle(e), suite);
      }
      // Personne pour celle-ci (sa case n'a pas de responsable, et nul n'a coché l'alerte) : on la rend, sans compter
      // d'essai, pour qu'un futur abonné la reçoive encore.
      if (!pour.size) {
        await verifie(db.from("admin_veille_articles").update({ alerte_reservee_le: null, alerte_essais: Math.max(0, (a.alerte_essais ?? 1) - 1) }).eq("id", a.id));
        continue;
      }
      for (const [e, suite] of pour) {
        const { sujet, html } = composerUrgent([enMail(a)], suite);
        await envoyerA([e], sujet, html, `veille-urgent-${a.id}-${e}`);
      }
      await verifie(db.from("admin_veille_articles").update({ alerte_envoyee_le: new Date().toISOString() }).eq("id", a.id));
    } catch (err) {
      // Laissée réservée : elle sera reprise dans 10 minutes, jusqu'à 5 essais.
      console.error(`alerte « À ne pas rater » ${a.id} non envoyée :`, err instanceof Error ? err.message : String(err));
    }
  }
}

/** À la fin d'une tournée : à chacun, ce qu'elle a trouvé dans sa case, hors « À ne pas rater » (déjà signalés), en un seul mail. */
async function envoyerRecaps(db: Db, r: Rapport) {
  const suivis = RESPONSABLES.map((x) => responsableDe(x.axe)).filter((x) => x !== null);
  if (!suivis.length) return;
  const { axeDe, enMail } = await reperes(db);
  const articles = await verifie(db.from("admin_veille_articles").select(CHAMPS_MAIL).eq("rapport_id", r.id).eq("verdict", "retenu").eq("urgent", false).is("retire_le", null).order("importance", { ascending: false })) as any[];
  for (const s of suivis) {
    const siens = articles.filter((a) => axeDe.get(a.rubrique ?? "") === s.axe);
    if (!siens.length) continue;
    const e = adresseReelle(s.email);
    const { sujet, html } = composerRecap(s.quoi, siens.map((a, i) => enMail(a, i + 1)), s.suite);
    await envoyerA([e], sujet, html, `veille-recap-${r.id}-${s.axe}-${e}`);
  }
}

/** 9 h 15 passé et pas de mail : on prévient, une seule fois. */
async function alerter(db: Db, maintenant: Date) {
  const limite = new Date(maintenant.getTime() - ALERTE_APRES_MIN * 60_000).toISOString();
  const enRetard = await verifie(db.from("admin_veille_rapports").select("id, periode_fin, statut, erreur").eq("nature", "rapport").neq("statut", "envoye").is("alerte_le", null).lte("periode_fin", limite)) as any[];
  for (const r of enRetard) {
    const pris = await verifie(db.from("admin_veille_rapports").update({ alerte_le: new Date().toISOString() }).eq("id", r.id).is("alerte_le", null).select("id")) as any[];
    if (!pris.length) continue;
    const bloquees = await verifie(db.from("admin_veille_etapes").select("genre, cle, statut, erreur").eq("rapport_id", r.id).not("statut", "eq", "fait").limit(10)) as any[];
    const detail = [r.erreur, ...bloquees.map((e) => `${e.genre} ${e.cle} : ${e.statut}${e.erreur ? ` — ${e.erreur}` : ""}`)].filter(Boolean).join("\n") || "Aucune étape en erreur : le rapport est encore en préparation.";
    const { sujet, html } = composerAlerte(new Date(r.periode_fin), r.statut, detail);
    try {
      await envoyer(sujet, html, `veille-alerte-${r.id}`);
    } catch {
      // Pas parti : on réessaiera au passage suivant.
      await db.from("admin_veille_rapports").update({ alerte_le: null }).eq("id", r.id);
    }
  }
  // Un rapport qui n'est toujours pas parti un jour après : on arrête d'essayer (l'alerte a prévenu).
  const perime = new Date(maintenant.getTime() - ABANDON_APRES_H * 3_600_000).toISOString();
  await db.from("admin_veille_rapports").update({ statut: "echec", erreur: "Abandonné : pas terminé dans les 24 h." })
    .not("statut", "in", "(envoye,termine,echec)").lt("periode_fin", perime);
}

/**
 * Le budget du mois (Veille › CPR) : un mail à 80 % puis à 100 %, une fois chacun par mois, à l'administrateur qui l'a
 * réglé (sinon aux destinataires du rapport). Rien n'est coupé (décision d'Olivier, 30/10). Un budget à 0 $ : pas de suivi.
 */
async function surveillerBudget(db: Db, maintenant: Date) {
  const b = await verifie(db.from("admin_veille_budget").select("montant_usd, alerte80_mois, alerte100_mois, prevenir").maybeSingle()) as any;
  const budget = Number(b?.montant_usd ?? 0);
  if (!budget) return;
  const depense = Number(await verifie(db.rpc("veille_depense_du_mois")));
  const p = paris(maintenant);
  const mois = `${p.annee}-${String(p.mois).padStart(2, "0")}`;
  const seuil = depense >= budget ? 100 : depense >= budget * 0.8 ? 80 : null;
  if (!seuil) return;
  const colonne = seuil === 100 ? "alerte100_mois" : "alerte80_mois";
  if (b[colonne] === mois) return;
  // Un seul passage gagne le droit de prévenir ; s'il échoue, il rend la main pour le passage suivant.
  const pris = await verifie(db.from("admin_veille_budget").update({ [colonne]: mois, ...(seuil === 100 && { alerte80_mois: mois }) }).eq("id", true).or(`${colonne}.is.null,${colonne}.neq.${mois}`).select("id")) as any[];
  if (!pris.length) return;
  const { sujet, html } = composerBudget(depense, budget, seuil);
  try {
    if (b.prevenir) await envoyerA([adresseReelle(b.prevenir)], sujet, html, `veille-budget-${mois}-${seuil}-${budget}`);
    else await envoyer(sujet, html, `veille-budget-${mois}-${seuil}-${budget}`);
  } catch (err) {
    await db.from("admin_veille_budget").update({ [colonne]: b[colonne] ?? null }).eq("id", true);
    console.error("alerte de budget non envoyée :", err instanceof Error ? err.message : String(err));
  }
}

/** Compare sans s'arrêter au premier caractère différent. */
function memeSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  // Une question posée à Vigile depuis le Hub : la personne connectée, pas la tâche planifiée.
  if (!req.headers.get("x-secret")) {
    const jeton = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jeton) return json({ error: "non autorisé" }, 401);
    // Une question et son historique tiennent largement en 100 Ko : au-delà, on ne lit même pas.
    if (Number(req.headers.get("content-length") ?? "0") > 100_000) return json({ error: "Demande trop longue." }, 413);
    try {
      const brut = await req.text();
      if (brut.length > 100_000) return json({ error: "Demande trop longue." }, 413);
      const corps = (() => {
        try {
          return JSON.parse(brut);
        } catch {
          return {};
        }
      })();
      if (corps?.action === "confier") return json(await confier(jeton, corps));
      if (corps?.action !== "question") return json({ error: "action inconnue" }, 400);
      return json(await repondre(jeton, Array.isArray(corps.messages) ? corps.messages : []));
    } catch (err) {
      if (err instanceof Erreur) return json({ error: err.message }, err.statut);
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }

  const t0 = Date.now();
  const db = createClient(URL_, SERVICE) as Db;
  const { data: secret } = await db.from("admin_secrets_internes").select("valeur").eq("cle", "veille").maybeSingle();
  if (!secret?.valeur || !memeSecret(req.headers.get("x-secret") ?? "", secret.valeur)) return json({ error: "non autorisé" }, 401);

  const corps = await req.json().catch(() => ({}));
  // Pour les essais seulement : avancer l'horloge à la main (jamais en production).
  const maintenant = Deno.env.get("VEILLE_HORLOGE_LIBRE") === "1" && corps?.maintenant ? new Date(corps.maintenant) : new Date();
  try {
    await assurerRapport(db, maintenant);
    await assurerTournees(db, maintenant);
    // Les rapports passent en premier : ce sont eux qui ont une heure d'envoi.
    const ouverts = (await verifie(db.from("admin_veille_rapports").select("id, nature, periode_debut, periode_fin, statut, cout_usd, alerte_le, updated_at").not("statut", "in", "(envoye,termine,echec)").order("periode_fin")) as Rapport[])
      .sort((a, b) => Number(b.nature === "rapport") - Number(a.nature === "rapport"));
    for (const r of ouverts) await avancer(db, r, maintenant, t0);
    await alerterUrgents(db).catch((err) => console.error("alertes « À ne pas rater » :", err instanceof Error ? err.message : String(err)));
    await alerter(db, maintenant);
    await surveillerBudget(db, maintenant).catch((err) => console.error("budget :", err instanceof Error ? err.message : String(err)));
    return json({ ok: true, ouverts: ouverts.map((r) => ({ fin: r.periode_fin, statut: r.statut })), ms: Date.now() - t0 });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
