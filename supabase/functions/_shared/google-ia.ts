// Vérification par IA du rapprochement fiche Google / lieux RPPS.
//
// La comparaison automatique (nom + code postal + mots de la voie) rate les écritures
// différentes d'une même adresse : « Pl. » / « PLACE », « Bd » / « BOULEVARD »,
// complément (« LE TRIANGLE », « Bât. B »), numéro « 21 bis », voie rebaptisée…
// L'IA compare UNIQUEMENT les textes fournis (aucune recherche web) et rend un verdict
// motivé. Elle ne peut que confirmer une fiche qui porte déjà le nom du praticien :
// jamais rétrograder, jamais retenir une fiche sans son nom (décision du 14/11).

/* eslint-disable @typescript-eslint/no-explicit-any */
import Anthropic from "npm:@anthropic-ai/sdk@0.125.0";
import { POPULATION_LIBELLE } from "./reseau-rpps.ts";

/** Modèle léger : une comparaison de textes, pas de recherche. */
export const MODELE_VERIF = Deno.env.get("RESEAU_MODEL_VERIF") ?? "claude-haiku-5-5";

export interface PraticienAVerifier {
  nom: string;
  prenom: string;
  population: string;
  lieux: { raison_sociale?: string | null; adresse?: string | null; code_postal?: string | null; commune?: string | null }[];
}
export interface FicheAVerifier { place_id: string; nom: string; adresse: string; categorie?: string | null }
export interface VerdictIa { memePraticien: boolean; memeAdresse: boolean; raison: string }

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fiches"],
  properties: {
    fiches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["place_id", "meme_praticien", "meme_adresse", "raison"],
        properties: {
          place_id: { type: "string" },
          meme_praticien: { type: "boolean" },
          meme_adresse: { type: "boolean" },
          raison: { type: "string" },
        },
      },
    },
  },
};

export function iaDisponible(): boolean {
  return !!Deno.env.get("ANTHROPIC_API_KEY");
}

/** Verdict par fiche (place_id). En cas d'erreur : carte vide, rien n'est confirmé. */
export async function verifierFichesIa(p: PraticienAVerifier, fiches: FicheAVerifier[]): Promise<Map<string, VerdictIa>> {
  const out = new Map<string, VerdictIa>();
  if (!fiches.length || !iaDisponible()) return out;
  const lieux = p.lieux.map((l, i) => `  ${i + 1}. ${[l.raison_sociale, l.adresse, [l.code_postal, l.commune].filter(Boolean).join(" ")].filter(Boolean).join(", ")}`).join("\n");
  const liste = fiches.map((f) => `  - place_id ${f.place_id} : « ${f.nom} »${f.categorie ? ` (${f.categorie})` : ""}, ${f.adresse}`).join("\n");
  const consigne = `Tu compares des fiches Google Maps avec un praticien de l'annuaire RPPS. Tu ne fais aucune recherche : tu compares seulement les textes ci-dessous.

Praticien RPPS : Dr ${p.prenom} ${p.nom}, ${POPULATION_LIBELLE[p.population as keyof typeof POPULATION_LIBELLE] ?? p.population}
Lieux d'exercice RPPS :
${lieux || "  (aucun)"}

Fiches Google Maps :
${liste}

Pour chaque fiche :
- meme_praticien : true seulement si le nom de la fiche désigne ce praticien (nom de famille présent ; un prénom différent ou une autre spécialité incompatible → false). Un cabinet ou une clinique portant son nom compte.
- meme_adresse : true seulement si l'adresse Google est la MÊME adresse postale qu'un lieu RPPS (même code postal, même voie, même numéro s'il est indiqué des deux côtés). Les abréviations (Pl., Bd, Av., St), les accents, la casse, un complément (bâtiment, résidence, centre commercial) ou « bis/ter » ne changent rien. Une autre rue de la même commune → false.
- raison : une phrase courte et factuelle, qui cite le lieu RPPS correspondant s'il y en a un.
Dans le doute, réponds false. N'invente rien.`;
  try {
    const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });
    // Le repli serveur (« fallbacks ») n'existe pas pour Haiku : ne le demander qu'aux autres modèles,
    // sinon l'appel est refusé et aucune fiche n'est jamais confirmée par l'IA.
    const repli = /haiku/i.test(MODELE_VERIF) ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
    const r: any = await client.beta.messages.create({
      model: MODELE_VERIF,
      max_tokens: 2000,
      ...repli,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: consigne }],
    } as any);
    if (r.stop_reason === "refusal") { console.error("vérification IA des fiches Google : refus du modèle"); return out; }
    const texte = (r.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    const json = JSON.parse(texte);
    const connus = new Set(fiches.map((f) => f.place_id));
    for (const v of json?.fiches ?? []) {
      if (!connus.has(v?.place_id)) continue; // jamais d'identifiant inventé
      out.set(v.place_id, { memePraticien: v.meme_praticien === true, memeAdresse: v.meme_adresse === true, raison: String(v.raison ?? "").slice(0, 300) });
    }
  } catch (e) {
    console.error("vérification IA des fiches Google", e instanceof Error ? e.message : e);
  }
  return out;
}
