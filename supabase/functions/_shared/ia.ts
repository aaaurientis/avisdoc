// Recherche assistée par IA, commune aux fonctions du réseau d'aval : appel au
// modèle (recherche web en flux, réponse JSON au schéma imposé), contrôle des sources
// et recherche des signaux d'un praticien. Voir supabase/functions/reseau-ia.

/* eslint-disable @typescript-eslint/no-explicit-any */
import Anthropic from "npm:@anthropic-ai/sdk@0.125.0";
import { POPULATION_LIBELLE } from "./reseau-rpps.ts";
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
} from "./reseau-signaux.ts";
import type { Suivi } from "./suivi.ts";

export const MODELE = Deno.env.get("RESEAU_MODEL_RECHERCHE") ?? "claude-opus-5-5";
export const RECHERCHES_WEB = { praticien: 5, mg_departement: 8 };
export const MAX_CANDIDATS_MG = 15;


export const hoteDe = (u: unknown) => { try { return new URL(String(u)).hostname.replace(/^www\./, ""); } catch { return String(u ?? ""); } };

// ── Appel au modèle : recherche web + réponse JSON au schéma imposé ──────────

export interface Usage { input_tokens: number; output_tokens: number; web_searches: number; modele: string }

export async function demander<T>(
  consigne: string,
  schema: Record<string, unknown>,
  maxRecherches: number,
  suivi: Suivi,
  plage: [number, number],
): Promise<{ resultat: T; usage: Usage }> {
  const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });
  const usage: Usage = { input_tokens: 0, output_tokens: 0, web_searches: 0, modele: MODELE };
  const messages: any[] = [{ role: "user", content: consigne }];
  const [debut, fin] = plage;
  let lancees = 0;
  for (let tour = 0; tour < 4; tour++) {
    // En flux : chaque recherche web lancée par l'IA s'affiche aussitôt à l'écran.
    const flux: any = client.beta.messages.stream({
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
    flux.on("contentBlock", (bloc: any) => {
      if (bloc?.type === "server_tool_use" && bloc.name === "web_search") {
        lancees++;
        const requete = typeof bloc.input?.query === "string" ? bloc.input.query : "";
        void suivi.maj({
          etape: `Recherche sur le web (${lancees}/${maxRecherches})`,
          progression: debut + ((fin - debut) * lancees) / (maxRecherches + 1),
          ligne: requete ? `Recherche web : « ${requete} »` : "Recherche web lancée",
        });
      } else if (bloc?.type === "web_search_tool_result") {
        const n = Array.isArray(bloc.content) ? bloc.content.length : 0;
        void suivi.maj({ ligne: Array.isArray(bloc.content) ? `${n} page${n > 1 ? "s" : ""} trouvée${n > 1 ? "s" : ""}` : "Recherche web sans résultat" });
      }
    });
    const r: any = await flux.finalMessage();
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
    await suivi.maj({ etape: "Lecture de la réponse de l'IA", progression: fin });
    const textes = (r.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text);
    try {
      return { resultat: JSON.parse(textes.join("")) as T, usage };
    } catch {
      return { resultat: JSON.parse(textes[textes.length - 1] ?? "") as T, usage };
    }
  }
  throw new Error("l'IA n'a pas terminé sa recherche");
}

export function causeLisible(e: unknown): string {
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

export async function verifierSource(url: unknown, extrait: unknown, nom: string): Promise<Verdict> {
  if (!urlValide(url)) return { ok: false, motif: "adresse de page absente ou invalide" };
  if (domaineExclu(url)) return { ok: false, motif: "site exclu de la recherche" };
  const texte = await textePage(url);
  if (texte === null) return { ok: false, motif: "page inaccessible" };
  if (!normaliser(texte).includes(normaliser(nom))) return { ok: false, motif: "la page ne nomme pas ce praticien" };
  if (!extraitPresent(String(extrait ?? ""), texte)) return { ok: false, motif: "la phrase citée ne figure pas sur la page" };
  return { ok: true };
}

export const consignesCommunes = `Règles absolues :
- Ne réponds qu'à partir de pages que tu as réellement consultées. N'invente rien, ne déduis rien.
- Pour chaque information, donne l'adresse exacte de la page (url) et recopie MOT POUR MOT, sans rien changer, une phrase de cette page qui l'établit explicitement (extrait, 20 à 300 caractères).
- Si aucune page ne l'établit explicitement, n'inclus pas l'information. L'absence d'information n'est pas un « non ».
- N'utilise jamais Doctolib, LinkedIn, Google Maps, les annuaires ni les sites d'avis.
- Une page qui ne nomme pas le praticien ne compte pas.`;

// ── Action « praticien » ─────────────────────────────────────────────────────

export const SCHEMA_SIGNAUX = {
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

export async function rechercherPraticien(db: any, rechercheId: string, p: any, email: string, suivi: Suivi) {
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

  await suivi.maj({ etape: "L'IA cherche sur le web", progression: 3, ligne: `Recherche lancée pour Dr ${p.prenom} ${p.nom}` });
  const { resultat, usage } = await demander<{ signaux: any[] }>(consigne, SCHEMA_SIGNAUX, RECHERCHES_WEB.praticien, suivi, [5, 60]);
  const propositions = Array.isArray(resultat?.signaux) ? resultat.signaux : [];
  await suivi.maj({
    etape: "Vérification des sources", progression: 62,
    ligne: propositions.length ? `${propositions.length} information${propositions.length > 1 ? "s" : ""} proposée${propositions.length > 1 ? "s" : ""} par l'IA : vérification de chaque source` : "L'IA n'a rien trouvé d'explicite",
  });
  let k = 0;
  const ecartees: { motif: string; url?: string; type?: string }[] = [];
  const retenues: any[] = [];
  for (const s of propositions) {
    k++;
    await suivi.maj({ etape: `Vérification des sources (${k}/${propositions.length})`, progression: 62 + (33 * k) / Math.max(1, propositions.length) });
    const type: unknown = s?.type;
    if (!estTypeSignal(type) || !SIGNAUX[type].parIa) { ecartees.push({ motif: "signal hors grille", type: String(type) }); continue; }
    if (!valeurAdmise(type, s.valeur) || /^inconnu/.test(s.valeur)) { ecartees.push({ motif: "valeur hors grille", type }); continue; }
    if (retenues.some((r) => r.type === type)) { ecartees.push({ motif: "doublon", type }); continue; }
    const v = await verifierSource(s.url, s.extrait, p.nom);
    if (!v.ok) {
      ecartees.push({ motif: v.motif, url: typeof s.url === "string" ? s.url : undefined, type });
      await suivi.maj({ ligne: `Écarté : ${SIGNAUX[type].libelle} (${hoteDe(s.url)}) : ${v.motif}`, niveau: "ecarte" });
      continue;
    }
    await suivi.maj({ ligne: `Source vérifiée : ${SIGNAUX[type].libelle} (${hoteDe(s.url)})`, niveau: "ok" });
    retenues.push({ type, valeur: s.valeur, url: s.url, extrait: String(s.extrait).trim().slice(0, 500) });
  }

  await suivi.maj({ etape: "Enregistrement des propositions", progression: 97 });
  // Les anciennes propositions de l'IA en attente sont remplacées par les nouvelles.
  await db.from("admin_reseau_signaux").delete().eq("praticien_id", p.id).eq("origine", "ia").eq("statut", "propose");
  if (retenues.length) {
    const { error } = await db.from("admin_reseau_signaux").insert(retenues.map((r) => ({
      praticien_id: p.id, ...r, origine: "ia", statut: "propose", propose_par: email,
    })));
    if (error) throw new Error(error.message);
  }
  await suivi.maj({ ligne: `Terminé : ${retenues.length} à valider, ${ecartees.length} écartée${ecartees.length > 1 ? "s" : ""}`, niveau: "ok" });
  await suivi.attendre();
  await db.from("admin_reseau_recherches_ia").update({
    statut: "termine", fin: new Date().toISOString(), usage, etape: "Terminé", progression: 100,
    resultat: { propositions: propositions.length, retenues: retenues.length, ecartees },
  }).eq("id", rechercheId);
}

export async function echouer(db: any, id: string, suivi: Suivi, e: unknown) {
  console.error(e);
  const erreur = causeLisible(e);
  await suivi.maj({ ligne: `Échec : ${erreur}`, niveau: "ecarte" });
  await suivi.attendre();
  await db.from("admin_reseau_recherches_ia").update({ statut: "echec", fin: new Date().toISOString(), erreur, etape: "Échec" }).eq("id", id);
}

