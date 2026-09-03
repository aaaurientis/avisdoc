// Appel Bedrock (API Converse) en eu-west-3, sans profil d'inférence
// multi-régions : les données personnelles de tiers restent en Europe.
// Modèle configurable (Mistral Large ou Claude), secret BEDROCK_MODEL_ID.
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const REGION = Deno.env.get("BEDROCK_REGION") ?? "eu-west-3";
export const MODELE = Deno.env.get("BEDROCK_MODEL_ID") ?? "mistral.mistral-large-2402-v1:0";

export function bedrockConfigure(): boolean {
  return !!(Deno.env.get("AWS_ACCESS_KEY_ID") && Deno.env.get("AWS_SECRET_ACCESS_KEY"));
}

/** Une génération texte → texte. Lève en cas de réponse hors 2xx. */
export async function converser(systeme: string, utilisateur: string, maxTokens = 400): Promise<string> {
  if (REGION.startsWith("us-") || REGION.includes("global")) {
    throw new Error(`Région Bedrock refusée (${REGION}) : eu-west-3 attendu.`);
  }
  const aws = new AwsClient({
    accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY")!,
    sessionToken: Deno.env.get("AWS_SESSION_TOKEN") ?? undefined,
    service: "bedrock",
    region: REGION,
  });
  const url = `https://bedrock-runtime.${REGION}.amazonaws.com/model/${encodeURIComponent(MODELE)}/converse`;
  const res = await aws.fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system: [{ text: systeme }],
      messages: [{ role: "user", content: [{ text: utilisateur }] }],
      inferenceConfig: { maxTokens, temperature: 0.4 },
    }),
  });
  if (!res.ok) throw new Error(`Bedrock ${res.status} : ${(await res.text()).slice(0, 300)}`);
  const corps = await res.json() as { output?: { message?: { content?: Array<{ text?: string }> } } };
  return (corps.output?.message?.content ?? []).map((c) => c.text ?? "").join("").trim();
}
