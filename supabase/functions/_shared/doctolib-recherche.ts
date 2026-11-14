// Recherche automatique du LIEN de la fiche Doctolib d'un praticien.
//
// Le Hub n'ouvre jamais une page Doctolib : une recherche web limitée à doctolib.fr
// renvoie des adresses, et seules ces adresses (jamais leur contenu) sont examinées
// par choisirDoctolib (nom, prénom, commune d'exercice). Rien n'est inventé : une
// adresse qui ne figure pas dans les résultats de la recherche n'est jamais retenue.

/* eslint-disable @typescript-eslint/no-explicit-any */
import Anthropic from "npm:@anthropic-ai/sdk@0.125.0";
import { POPULATION_LIBELLE } from "./reseau-rpps.ts";

const MODELE = Deno.env.get("RESEAU_MODEL_DOCTOLIB") ?? Deno.env.get("RESEAU_MODEL_RECHERCHE") ?? "claude-opus-5-5";

/** Les adresses doctolib.fr renvoyées par la recherche web pour ce praticien. */
export async function urlsDoctolib(p: { nom: string; prenom: string; population: string; communes: string[] }): Promise<string[]> {
  const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });
  const messages: any[] = [{
    role: "user",
    content: `Trouve la fiche Doctolib du Dr ${p.prenom} ${p.nom}, ${POPULATION_LIBELLE[p.population as keyof typeof POPULATION_LIBELLE] ?? "médecin"}, qui exerce à ${p.communes.join(", ") || "en France"}. Fais une ou deux recherches, puis réponds simplement « fait ».`,
  }];
  const urls = new Set<string>();
  for (let tour = 0; tour < 3; tour++) {
    const r: any = await client.beta.messages.create({
      model: MODELE,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      tools: [{
        type: "web_search_20260209", name: "web_search", max_uses: 2,
        allowed_domains: ["doctolib.fr"], user_location: { type: "approximate", country: "FR" },
      }],
      messages,
    } as any);
    for (const bloc of r.content ?? []) {
      if (bloc?.type === "web_search_tool_result" && Array.isArray(bloc.content)) {
        for (const res of bloc.content) if (typeof res?.url === "string") urls.add(res.url);
      }
    }
    if (r.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: r.content }); continue; }
    break;
  }
  return [...urls];
}
