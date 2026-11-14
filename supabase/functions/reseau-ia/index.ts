// Edge Function : recherche assistée par IA pour le réseau d'aval.
//
// Rien n'est inventé (décision du 14/11) :
//   1. l'IA doit citer, pour chaque information, l'adresse de la page ET la phrase
//      exacte qui la justifie ;
//   2. le serveur charge la page et vérifie que la phrase y figure mot pour mot, et
//      que la page nomme bien le praticien ; sinon la proposition est écartée ;
//   3. ce qui passe est enregistré « proposé » : un opérateur valide ou rejette.
//      Seuls les signaux validés comptent dans le score.
// Doctolib, LinkedIn, Google et les sites d'avis sont exclus de la recherche.
//
// Actions (réponse immédiate, travail en tâche de fond, suivi dans
// admin_reseau_recherches_ia) :
//   • praticien      { praticien_id } — signaux absents de la fiche Google
//   • mg_departement { departement }  — généralistes formés à la dermoscopie,
//                                       rapprochés du RPPS puis ajoutés aux candidats
//
// Secrets : ANTHROPIC_API_KEY (déjà utilisé par Merx). Modèle réglable par
// RESEAU_MODEL_RECHERCHE. Déploiement : supabase functions deploy reseau-ia

/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Anthropic from "npm:@anthropic-ai/sdk@0.125.0";
import { clientService, cors, json, verifierAccesSante } from "../_shared/acces-sante.ts";
import { DEPARTEMENTS, estDepartement, normaliserRpps, praticienDepuisLignes, POPULATION_LIBELLE } from "../_shared/reseau-rpps.ts";
import {
  DOMAINES_EXCLUS,
  domaineExclu,
  estTypeSignal,
  extraitPresent,
  normaliser,
  SIGNAUX,
  texteDeHtml,
  TYPES_SIGNAL,
  urlValide,
  valeurAdmise,
} from "../_shared/reseau-signaux.ts";
import { dateExtraction, lignesDuNom, lignesDuRpps } from "../_shared/tabulaire-rpps.ts";
import { enregistrerPraticien } from "../_shared/enregistrer-praticien.ts";

const MODELE = Deno.env.get("RESEAU_MODEL_RECHERCHE") ?? "claude-opus-5-5";
const RECHERCHES_WEB = { praticien: 5, mg_departement: 8 };
const MAX_CANDIDATS_MG = 15;

function enTacheDeFond(travail: Promise<unknown>): void {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(travail.catch(() => {}));
  else void travail.catch(() => {});
}

// ── Appel au modèle : recherche web + réponse JSON au schéma imposé ──────────

interface Usage { input_tokens: number; output_tokens: number; web_searches: number; modele: string }

async function demander<T>(consigne: string, schema: Record<string, unknown>, maxRecherches: number): Promise<{ resultat: T; usage: Usage }> {
  const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });
  const usage: Usage = { input_tokens: 0, output_tokens: 0, web_searches: 0, modele: MODELE };
  const messages: any[] = [{ role: "user", content: consigne }];
  for (let tour = 0; tour < 4; tour++) {
    const r: any = await client.beta.messages.create({
      model: MODELE,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema } },
      tools: [{
        type: "web_search_20260209", name: "web_search", max_uses: maxRecherches,
        blocked_domains: DOMAINES_EXCLUS, user_location: { type: "approximate", country: "FR" },
      }],
      messages,
    } as any);
    usage.input_tokens += r.usage?.input_tokens ?? 0;
    usage.output_tokens += r.usage?.output_tokens ?? 0;
    usage.web_searches += r.usage?.server_tool_use?.web_search_requests ?? 0;
    if (r.model) usage.modele = r.model;
    if (r.stop_reason === "pause_turn") { // recherche longue : on laisse le modèle reprendre
      messages.push({ role: "assistant", content: r.content });
      continue;
    }
    if (r.stop_reason === "refusal") throw new Error("l'IA a refusé de traiter cette recherche");
    if (r.stop_reason !== "end_turn") throw new Error(`réponse de l'IA inexploitable (${r.stop_reason})`);
    const textes = (r.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text);
    try {
      return { resultat: JSON.parse(textes.join("")) as T, usage };
    } catch {
      return { resultat: JSON.parse(textes[textes.length - 1] ?? "") as T, usage };
    }
  }
  throw new Error("l'IA n'a pas terminé sa recherche");
}

function causeLisible(e: unknown): string {
  if (e instanceof Anthropic.APIError) {
    if (/credit balance/i.test(e.message ?? "")) return "le crédit de l'IA est épuisé, contactez un administrateur";
    if (e.status === 401 || e.status === 403) return "l'IA refuse l'accès du Hub, contactez un administrateur";
    if (e.status === 404 || (e.status === 400 && /model/i.test(e.message ?? ""))) return "le modèle d'IA demandé n'est pas disponible, contactez un administrateur";
    if (e.status === 429) return "trop de demandes en même temps, réessayez dans une minute";
    if (e.status === 529) return "l'IA est surchargée, réessayez dans quelques minutes";
    return `l'IA a renvoyé une erreur${e.status ? ` (${e.status})` : ""}`;
  }
  if (e instanceof SyntaxError) return "la réponse de l'IA était illisible, réessayez";
  return e instanceof Error ? e.message : String(e);
}

// ── Contrôle d'une source : la page existe, nomme le praticien, contient la phrase ──

const pages = new Map<string, Promise<string | null>>();

function textePage(url: string): Promise<string | null> {
  if (!pages.has(url)) {
    pages.set(url, (async () => {
      try {
        const r = await fetch(url, {
          redirect: "follow",
          signal: AbortSignal.timeout(12_000),
          headers: { "User-Agent": "Mozilla/5.0 (compatible; verification-de-source)", Accept: "text/html,text/plain" },
        });
        if (!r.ok) return null;
        const type = r.headers.get("content-type") ?? "";
        if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) return null;
        const brut = (await r.text()).slice(0, 3_000_000);
        return /html/i.test(type) ? texteDeHtml(brut) : brut;
      } catch {
        return null;
      }
    })());
  }
  return pages.get(url)!;
}

type Verdict = { ok: true } | { ok: false; motif: string };

async function verifierSource(url: unknown, extrait: unknown, nom: string): Promise<Verdict> {
  if (!urlValide(url)) return { ok: false, motif: "adresse de page absente ou invalide" };
  if (domaineExclu(url)) return { ok: false, motif: "site exclu de la recherche" };
  const texte = await textePage(url);
  if (texte === null) return { ok: false, motif: "page inaccessible" };
  if (!normaliser(texte).includes(normaliser(nom))) return { ok: false, motif: "la page ne nomme pas ce praticien" };
  if (!extraitPresent(String(extrait ?? ""), texte)) return { ok: false, motif: "la phrase citée ne figure pas sur la page" };
  return { ok: true };
}

const consignesCommunes = `Règles absolues :
- Ne réponds qu'à partir de pages que tu as réellement consultées. N'invente rien, ne déduis rien.
- Pour chaque information, donne l'adresse exacte de la page (url) et recopie MOT POUR MOT, sans rien changer, une phrase de cette page qui l'établit explicitement (extrait, 20 à 300 caractères).
- Si aucune page ne l'établit explicitement, n'inclus pas l'information. L'absence d'information n'est pas un « non ».
- N'utilise jamais Doctolib, LinkedIn, Google Maps, les annuaires ni les sites d'avis.
- Une page qui ne nomme pas le praticien ne compte pas.`;

// ── Action « praticien » ─────────────────────────────────────────────────────

const SCHEMA_SIGNAUX = {
  type: "object",
  additionalProperties: false,
  required: ["signaux"],
  properties: {
    signaux: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "valeur", "url", "extrait"],
        properties: {
          type: { type: "string", enum: TYPES_SIGNAL.filter((t) => SIGNAUX[t].parIa) },
          valeur: { type: "string" },
          url: { type: "string" },
          extrait: { type: "string" },
        },
      },
    },
  },
};

async function rechercherPraticien(db: any, rechercheId: string, p: any, email: string) {
  const lieux = (p.admin_reseau_lieux ?? []).map((l: any) => [l.raison_sociale, l.commune].filter(Boolean).join(", ")).filter(Boolean);
  const grille = TYPES_SIGNAL.filter((t) => SIGNAUX[t].parIa)
    .map((t) => `- ${t} : ${SIGNAUX[t].libelle}. Valeurs : ${SIGNAUX[t].valeurs.filter((v) => !v.startsWith("inconnu")).join(", ")}.`)
    .join("\n");
  const consigne = `Tu aides AvisDoc à constituer un réseau de médecins correspondants.
Praticien : Dr ${p.prenom} ${p.nom}, ${POPULATION_LIBELLE[p.population as keyof typeof POPULATION_LIBELLE]}, RPPS ${p.rpps}.
Lieux d'exercice : ${lieux.join(" ; ") || "non renseignés"}.

Cherche sur le web public (site du cabinet, page du service hospitalier ou de la clinique, presse locale) ce qui établit les points suivants pour CE praticien :
${grille}

${consignesCommunes}

Réponds avec la liste des signaux établis, éventuellement vide.`;

  const { resultat, usage } = await demander<{ signaux: any[] }>(consigne, SCHEMA_SIGNAUX, RECHERCHES_WEB.praticien);
  const propositions = Array.isArray(resultat?.signaux) ? resultat.signaux : [];
  const ecartees: { motif: string; url?: string; type?: string }[] = [];
  const retenues: any[] = [];
  for (const s of propositions) {
    const type: unknown = s?.type;
    if (!estTypeSignal(type) || !SIGNAUX[type].parIa) { ecartees.push({ motif: "signal hors grille", type: String(type) }); continue; }
    if (!valeurAdmise(type, s.valeur) || /^inconnu/.test(s.valeur)) { ecartees.push({ motif: "valeur hors grille", type }); continue; }
    if (retenues.some((r) => r.type === type)) { ecartees.push({ motif: "doublon", type }); continue; }
    const v = await verifierSource(s.url, s.extrait, p.nom);
    if (!v.ok) { ecartees.push({ motif: v.motif, url: typeof s.url === "string" ? s.url : undefined, type }); continue; }
    retenues.push({ type, valeur: s.valeur, url: s.url, extrait: String(s.extrait).trim().slice(0, 500) });
  }

  // Les anciennes propositions de l'IA en attente sont remplacées par les nouvelles.
  await db.from("admin_reseau_signaux").delete().eq("praticien_id", p.id).eq("origine", "ia").eq("statut", "propose");
  if (retenues.length) {
    const { error } = await db.from("admin_reseau_signaux").insert(retenues.map((r) => ({
      praticien_id: p.id, ...r, origine: "ia", statut: "propose", propose_par: email,
    })));
    if (error) throw new Error(error.message);
  }
  await db.from("admin_reseau_recherches_ia").update({
    statut: "termine", fin: new Date().toISOString(), usage,
    resultat: { propositions: propositions.length, retenues: retenues.length, ecartees },
  }).eq("id", rechercheId);
}

// ── Action « mg_departement » ────────────────────────────────────────────────

const SCHEMA_MG = {
  type: "object",
  additionalProperties: false,
  required: ["medecins"],
  properties: {
    medecins: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nom", "prenom", "commune", "url", "extrait", "teleexpertise_url", "teleexpertise_extrait"],
        properties: {
          nom: { type: "string" },
          prenom: { type: "string" },
          commune: { type: "string" },
          url: { type: "string" },
          extrait: { type: "string" },
          teleexpertise_url: { type: "string", description: "Vide si rien ne l'établit." },
          teleexpertise_extrait: { type: "string", description: "Vide si rien ne l'établit." },
        },
      },
    },
  },
};

const nomRpps = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const premierPrenom = (t: string) => normaliser(t).split(/[\s-]+/)[0] ?? "";

/** Le RPPS d'un généraliste nommé sur une page, s'il est UNIQUE dans le département. */
async function rapprocher(nom: string, prenom: string, commune: string, dep: string): Promise<{ rpps: string } | { motif: string }> {
  const lignes = await lignesDuNom(nomRpps(nom), dep);
  const mg = lignes.filter((l) =>
    String(l["Code profession"]) === "10" &&
    ["SM26", "SM53", "SM54"].includes(String(l["Code savoir-faire"])) &&
    premierPrenom(String(l["Prénom d'exercice"] ?? "")) === premierPrenom(prenom));
  let rpps = [...new Set(mg.map((l) => normaliserRpps(l["Identifiant PP"])).filter(Boolean))] as string[];
  if (rpps.length > 1) { // homonymes : la commune départage, sinon on s'abstient
    const c = normaliser(commune);
    rpps = [...new Set(mg.filter((l) => normaliser(String(l["Libellé commune (coord. structure)"] ?? "")) === c)
      .map((l) => normaliserRpps(l["Identifiant PP"])).filter(Boolean))] as string[];
  }
  if (rpps.length === 0) return { motif: "généraliste introuvable dans le RPPS du département" };
  if (rpps.length > 1) return { motif: "plusieurs homonymes dans le RPPS : non retenu" };
  return { rpps: rpps[0] };
}

async function rechercherMg(db: any, rechercheId: string, dep: string, email: string) {
  const consigne = `Tu aides AvisDoc à constituer un réseau de médecins correspondants.
Cherche des médecins GÉNÉRALISTES exerçant dans le département ${dep} (${DEPARTEMENTS[dep]}) qui indiquent publiquement être formés à la dermoscopie : DU ou DIU de dermoscopie, formation au dépistage des cancers de la peau, orientation dermatologique.
Pour chacun, indique aussi s'il pratique la télé-expertise, avec sa propre source (sinon laisse ces deux champs vides).
Au plus ${MAX_CANDIDATS_MG} médecins.

${consignesCommunes}`;

  const { resultat, usage } = await demander<{ medecins: any[] }>(consigne, SCHEMA_MG, RECHERCHES_WEB.mg_departement);
  const candidats = (Array.isArray(resultat?.medecins) ? resultat.medecins : []).slice(0, MAX_CANDIDATS_MG);
  const ecartees: { motif: string; url?: string; nom?: string }[] = [];
  const crees: string[] = [];
  let dejaLa = 0;
  const extraitLe = await dateExtraction();

  for (const c of candidats) {
    const nom = String(c.nom ?? "").trim();
    const qui = `${c.prenom ?? ""} ${nom}`.trim();
    if (!nom) { ecartees.push({ motif: "nom absent" }); continue; }
    const v = await verifierSource(c.url, c.extrait, nom);
    if (!v.ok) { ecartees.push({ motif: v.motif, url: c.url, nom: qui }); continue; }
    const r = await rapprocher(nom, String(c.prenom ?? ""), String(c.commune ?? ""), dep);
    if ("motif" in r) { ecartees.push({ motif: r.motif, url: c.url, nom: qui }); continue; }
    const fiche = praticienDepuisLignes(await lignesDuRpps(r.rpps), r.rpps);
    if ("refus" in fiche) { ecartees.push({ motif: fiche.refus, nom: qui }); continue; }
    if (fiche.praticien.population !== "MG_DERM") { ecartees.push({ motif: "pas généraliste (déjà couvert par l'import)", nom: qui }); continue; }

    const e = await enregistrerPraticien(db, fiche.praticien, { origine: "ia", acteur: email, extraitLe, detail: { recherche_id: rechercheId } });
    if (e.statut === "exclu") { ecartees.push({ motif: "exclu du réseau", nom: qui }); continue; }
    if (e.statut === "deja_la") dejaLa++;
    else crees.push(e.id);

    // Les signaux trouvés restent des propositions : un opérateur les valide.
    const signaux: any[] = [{ type: "du_dermoscopie", valeur: "oui", url: c.url, extrait: String(c.extrait).trim().slice(0, 500) }];
    if (c.teleexpertise_url) {
      const vt = await verifierSource(c.teleexpertise_url, c.teleexpertise_extrait, nom);
      if (vt.ok) signaux.push({ type: "teleexpertise", valeur: "oui", url: c.teleexpertise_url, extrait: String(c.teleexpertise_extrait).trim().slice(0, 500) });
      else ecartees.push({ motif: `télé-expertise : ${vt.motif}`, url: c.teleexpertise_url, nom: qui });
    }
    const { data: enAttente } = await db.from("admin_reseau_signaux").select("type").eq("praticien_id", e.id).in("statut", ["propose", "valide"]);
    const deja = new Set((enAttente ?? []).map((x: any) => x.type));
    const nouveaux = signaux.filter((s) => !deja.has(s.type));
    if (nouveaux.length) {
      await db.from("admin_reseau_signaux").insert(nouveaux.map((s) => ({ praticien_id: e.id, ...s, origine: "ia", statut: "propose", propose_par: email })));
    }
  }

  await db.from("admin_reseau_recherches_ia").update({
    statut: "termine", fin: new Date().toISOString(), usage,
    resultat: { propositions: candidats.length, crees: crees.length, deja_la: dejaLa, ecartees },
  }).eq("id", rechercheId);
}

// ── Point d'entrée ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  const acces = await verifierAccesSante(req);
  if ("refus" in acces) return acces.refus;
  const { email } = acces;
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "La clé de l'IA n'est pas configurée sur le projet." }, 500);

  const corps = await req.json().catch(() => ({}));
  const db = clientService();

  // Une recherche à la fois par cible (un praticien, un département).
  const cible = corps.action === "praticien" ? { col: "praticien_id", val: String(corps.praticien_id ?? "") }
    : { col: "departement", val: String(corps.departement ?? "").toUpperCase() };
  const { data: enCours } = await db.from("admin_reseau_recherches_ia").select("id")
    .eq(cible.col, cible.val).eq("statut", "en_cours").gt("debut", new Date(Date.now() - 10 * 60_000).toISOString()).limit(1);
  if (enCours?.length) return json({ error: "Une recherche est déjà en cours : patientez quelques minutes." }, 409);

  if (corps.action === "praticien") {
    const { data: p } = await db.from("admin_reseau_praticiens")
      .select("id, rpps, nom, prenom, population, etat, admin_reseau_lieux(raison_sociale, commune)")
      .eq("id", cible.val).maybeSingle();
    if (!p) return json({ error: "Praticien introuvable." }, 404);
    if (p.etat === "exclu") return json({ error: "Ce praticien est exclu." }, 409);
    const { data: r, error } = await db.from("admin_reseau_recherches_ia")
      .insert({ type: "praticien", praticien_id: p.id, lance_par: email }).select("id").single();
    if (error) return json({ error: error.message }, 500);
    enTacheDeFond(rechercherPraticien(db, r.id, p, email).catch(async (e) => {
      console.error(e);
      await db.from("admin_reseau_recherches_ia").update({ statut: "echec", fin: new Date().toISOString(), erreur: causeLisible(e) }).eq("id", r.id);
    }));
    return json({ recherche_id: r.id }, 202);
  }

  if (corps.action === "mg_departement") {
    const dep = cible.val;
    if (!estDepartement(dep)) return json({ error: "Département inconnu." }, 400);
    const { data: d } = await db.from("admin_reseau_departements").select("code").eq("code", dep).maybeSingle();
    if (!d) return json({ error: "Ajoutez d'abord ce département à la liste." }, 400);
    const { data: r, error } = await db.from("admin_reseau_recherches_ia")
      .insert({ type: "mg_derm_departement", departement: dep, lance_par: email }).select("id").single();
    if (error) return json({ error: error.message }, 500);
    enTacheDeFond(rechercherMg(db, r.id, dep, email).catch(async (e) => {
      console.error(e);
      await db.from("admin_reseau_recherches_ia").update({ statut: "echec", fin: new Date().toISOString(), erreur: causeLisible(e) }).eq("id", r.id);
    }));
    return json({ recherche_id: r.id }, 202);
  }

  return json({ error: "Action inconnue." }, 400);
});
