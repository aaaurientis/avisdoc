// Appel au modèle de langage — SDK officiel Anthropic.
// Le modèle vient de MERX_MODEL (Haiku 4.5, choix d'Olivier du 12/09/2026 pour le coût) : passer à une
// version plus récente se fait en changeant la variable, sans toucher au code.
// Recherche web : variante de base `web_search_20250305`. La variante à filtrage dynamique exige Sonnet
// ou Opus — avec Haiku, l'API répond « does not support programmatic tool calling ».

import Anthropic, { APIConnectionTimeoutError } from "npm:@anthropic-ai/sdk@0.125.0";

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
}

export interface LlmOptions {
  system?: string;
  model?: string;
  /** Recherche web faite par le modèle lui-même, bornée à `maxUses` recherches. */
  webSearch?: { maxUses: number };
  /** Reçoit les adresses des pages réellement consultées (garde-fou des sources). */
  onSources?: (urls: string[]) => void;
  /** Reçoit la consommation de l'appel (mesure des coûts réels). */
  onUsage?: (usage: LlmUsage) => void;
  /** Durée maximale de l'appel, sans nouvelle tentative : la fonction est bornée par l'hébergeur. */
  timeoutMs?: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const MAX_TOOL_ROUNDS = 3; // conversation : allers-retours d'outil au plus, par message

export const model = () => Deno.env.get("MERX_MODEL") ?? "claude-haiku-4-5";

let client: Anthropic | undefined;
const api = () => (client ??= new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" }));

const webSearchTool = (maxUses: number) => ({ type: "web_search_20250305" as const, name: "web_search" as const, max_uses: maxUses });

const requestOptions = (options?: LlmOptions) => (options?.timeoutMs ? { timeout: options.timeoutMs, maxRetries: 0 } : undefined);

const timeoutMessage = (e: unknown, options?: LlmOptions) =>
  e instanceof APIConnectionTimeoutError && options?.timeoutMs ? new Error(`Modèle de langage : pas de réponse en ${options.timeoutMs / 1000} s.`) : e;

/* eslint-disable @typescript-eslint/no-explicit-any */

function usageOf(r: any): LlmUsage {
  return { inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens, webSearches: r.usage.server_tool_use?.web_search_requests ?? 0 };
}

function sourcesOf(r: any): string[] {
  const urls = new Set<string>();
  for (const block of r.content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const result of block.content) if (result.url) urls.add(result.url);
    }
  }
  return [...urls];
}

const textOf = (r: any): string[] => r.content.filter((b: any) => b.type === "text").map((b: any) => b.text);

/** Une réponse conforme au schéma JSON demandé. */
export async function complete<T>(prompt: string, schema: Record<string, unknown>, options?: LlmOptions): Promise<T> {
  const response = await api()
    .messages.create(
      {
        model: options?.model ?? model(),
        max_tokens: 16000,
        ...(options?.system && { system: options.system }),
        messages: [{ role: "user", content: prompt }],
        ...(options?.webSearch && { tools: [webSearchTool(options.webSearch.maxUses)] }),
        output_config: { format: { type: "json_schema" as const, schema } },
      } as any,
      requestOptions(options),
    )
    .catch((e: unknown) => {
      throw timeoutMessage(e, options);
    });
  options?.onUsage?.(usageOf(response));
  options?.onSources?.(sourcesOf(response));

  if (response.stop_reason !== "end_turn") throw new Error(`Réponse du modèle inexploitable (${response.stop_reason}).`);
  const texts = textOf(response);
  // Avec la recherche web, un court texte peut précéder le JSON : on retient alors le dernier bloc.
  try {
    return JSON.parse(texts.join(""));
  } catch {
    return JSON.parse(texts[texts.length - 1] ?? "");
  }
}

/** Répond dans une conversation ; `runTool` exécute chaque outil appelé et rend son résultat au modèle. */
export async function converse(
  messages: ChatMessage[],
  options: LlmOptions & { tools: ChatTool[]; runTool: (name: string, input: unknown) => Promise<string> },
): Promise<string> {
  const tools = options.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
  const history: any[] = messages.map((m) => ({ role: m.role, content: m.content }));
  const usage: LlmUsage = { inputTokens: 0, outputTokens: 0, webSearches: 0 };
  try {
    for (let round = 0; ; round++) {
      const response = await api()
        .messages.create(
          { model: options.model ?? model(), max_tokens: 1500, ...(options.system && { system: options.system }), tools, messages: history } as any,
          requestOptions(options),
        )
        .catch((e: unknown) => {
          throw timeoutMessage(e, options);
        });
      const u = usageOf(response);
      usage.inputTokens += u.inputTokens;
      usage.outputTokens += u.outputTokens;
      const calls = response.content.filter((b: any) => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || !calls.length || round >= MAX_TOOL_ROUNDS) return textOf(response).join("").trim();
      const results = [];
      for (const call of calls) results.push({ type: "tool_result" as const, tool_use_id: (call as any).id, content: await options.runTool((call as any).name, (call as any).input) });
      history.push({ role: "assistant", content: response.content }, { role: "user", content: results });
    }
  } finally {
    options.onUsage?.(usage);
  }
}
