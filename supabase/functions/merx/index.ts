// Edge Function : Merx, l'agent commercial de prospection du Hub AvisDoc.
//
// Réservée aux comptes @avisdoc.fr (verify_jwt + contrôle du domaine, comme pappers-search) ET au module
// « merx » : tant qu'il n'est pas ouvert dans Admin › Droits d'accès, la fonction refuse.
//
// Actions (POST) :
//   { action: "chat", conversationId?, message }  → Merx répond ; s'il lance une recherche, la demande est
//                                                    créée et son identifiant est rendu.
//   { action: "traiter", demandeId? }             → exécute la demande (recherche ou approfondissement).
//   { action: "approfondir", prospectId }         → crée la demande d'approfondissement et l'exécute.
//   { action: "email", prospectId }               → rédige le brouillon de premier contact (rien n'est envoyé).
//
// Déploiement :
//   supabase functions deploy merx
//   supabase secrets set ANTHROPIC_API_KEY=...

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runAgentTick } from "./agent.ts";
import { admin } from "./db.ts";
import { complete, converse, model, type LlmUsage } from "./llm.ts";
import { CHAT_SYSTEM, EMAIL_SCHEMA, EMAIL_SYSTEM, emailPrompt, type EmailOut } from "./prompts.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MODULE = "merx";
const CHAT_TIMEOUT_MS = 30_000;

/** Le module est-il ouvert à cette personne ? Super-admin : tout ; sinon, sa ligne de admin_droits. */
async function peutMerx(email: string): Promise<boolean> {
  const sb = admin();
  const { data: sa } = await sb.from("admin_superadmins").select("email").ilike("email", email).maybeSingle();
  if (sa) return true;
  const { data: droits } = await sb.from("admin_droits").select("modules").ilike("email", email).maybeSingle();
  // Une personne non listée a les modules par défaut, qui ne comprennent pas Merx.
  return Array.isArray(droits?.modules) && droits.modules.includes(MODULE);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    // Identité de l'appelant, à partir de son jeton.
    const authHeader = req.headers.get("Authorization") ?? "";
    const asUser = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await asUser.auth.getUser();
    const email = userData.user?.email ?? "";
    if (!email.toLowerCase().endsWith("@avisdoc.fr")) return json({ error: "Accès réservé aux comptes @avisdoc.fr." }, 403);
    if (!(await peutMerx(email))) return json({ error: "Le module Merx n'est pas ouvert sur ce compte." }, 403);
    if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "ANTHROPIC_API_KEY non configurée." }, 500);

    const sb = admin();
    const body = await req.json().catch(() => ({}));

    // ── Traiter une demande en attente ───────────────────────────────────
    if (body.action === "traiter") {
      const { processed } = await runAgentTick(sb, body.demandeId);
      return json({ processed });
    }

    // ── Approfondir une fiche ────────────────────────────────────────────
    if (body.action === "approfondir") {
      if (!body.prospectId) return json({ error: "Fiche non précisée." }, 400);
      const { data: p } = await sb.from("admin_prospects").select("id, name").eq("id", body.prospectId).maybeSingle();
      if (!p) return json({ error: "Fiche introuvable." }, 404);
      const { data: demande, error } = await sb
        .from("admin_merx_demandes")
        .insert({ kind: "approfondissement", request: p.name, prospect_id: p.id, requested_by: email })
        .select("id")
        .single();
      if (error) return json({ error: error.message }, 500);
      await runAgentTick(sb, demande.id);
      return json({ demandeId: demande.id });
    }

    // ── Rédiger l'e-mail de premier contact ──────────────────────────────
    // Merx écrit un brouillon à partir de la seule fiche ; le commercial l'envoie lui-même.
    if (body.action === "email") {
      if (!body.prospectId) return json({ error: "Fiche non précisée." }, 400);
      const { data: p } = await sb
        .from("admin_prospects")
        .select("id, name, legal_name, city, activity, rationale, approach, contact_name, contact_role, contact_email, headcount_band, open_establishments, score")
        .eq("id", body.prospectId)
        .maybeSingle();
      if (!p) return json({ error: "Fiche introuvable." }, 404);

      const { data: demande } = await sb
        .from("admin_merx_demandes")
        .insert({ kind: "email", request: p.name, prospect_id: p.id, requested_by: email, status: "en_cours", started_at: new Date().toISOString() })
        .select("id")
        .single();

      let usage: LlmUsage = { inputTokens: 0, outputTokens: 0, webSearches: 0 };
      try {
        const signature = String(body.signature ?? "").trim() || email;
        const out = await complete<EmailOut>(
          emailPrompt(p as never, signature),
          EMAIL_SCHEMA as unknown as Record<string, unknown>,
          { system: EMAIL_SYSTEM, timeoutMs: 40_000, onUsage: (u) => (usage = u) },
        );
        if (demande) {
          await sb
            .from("admin_merx_demandes")
            .update({
              status: "terminee",
              usage,
              finished_at: new Date().toISOString(),
              // Le brouillon se garde : la fiche doit pouvoir le rouvrir.
              objet: out.objet,
              corps: out.corps,
            })
            .eq("id", demande.id);
        }
        return json({ objet: out.objet, corps: out.corps, destinataire: p.contact_email ?? null });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (demande) {
          await sb
            .from("admin_merx_demandes")
            .update({ status: "echec", message, usage, finished_at: new Date().toISOString() })
            .eq("id", demande.id);
        }
        return json({ error: "Le brouillon n'a pas pu être écrit. Vous pouvez réessayer." }, 500);
      }
    }

    // ── Chat ─────────────────────────────────────────────────────────────
    if (body.action === "chat") {
      const message = String(body.message ?? "").trim();
      if (!message) return json({ error: "Message vide." }, 400);

      // Conversation : celle indiquée (et à cette personne), sinon une nouvelle.
      let conversationId: string | null = body.conversationId ?? null;
      let history: { role: "user" | "assistant"; content: string }[] = [];
      if (conversationId) {
        const { data } = await sb
          .from("admin_merx_conversations")
          .select("id, messages, owner_email")
          .eq("id", conversationId)
          .maybeSingle();
        if (!data || data.owner_email.toLowerCase() !== email.toLowerCase()) return json({ error: "Conversation introuvable." }, 404);
        history = ((data.messages ?? []) as { role: "user" | "assistant"; content: string }[]).map((m) => ({ role: m.role, content: m.content }));
      } else {
        const { data, error } = await sb
          .from("admin_merx_conversations")
          .insert({ owner_email: email, title: message.slice(0, 80), messages: [] })
          .select("id")
          .single();
        if (error) return json({ error: error.message }, 500);
        conversationId = data.id;
      }

      // Merx répond ; s'il appelle l'outil, la demande est créée et traitée par un second appel de l'écran.
      let demandeId: string | null = null;
      const reply = await converse([...history, { role: "user", content: message }], {
        system: CHAT_SYSTEM,
        model: model(),
        timeoutMs: CHAT_TIMEOUT_MS,
        tools: [
          {
            name: "lancer_recherche",
            description: "Lance une recherche d'entreprises à prospecter. À appeler dès que le commercial demande de chercher des entreprises, avec sa demande reformulée en une phrase claire (secteur, zone, taille si elle est dite).",
            inputSchema: {
              type: "object",
              additionalProperties: false,
              required: ["demande"],
              properties: { demande: { type: "string", description: "La demande, en une phrase : secteur, zone, taille." } },
            },
          },
        ],
        runTool: async (name, input) => {
          if (name !== "lancer_recherche") return "Outil inconnu.";
          const demande = String((input as { demande?: string })?.demande ?? "").trim() || message;
          const { data, error } = await sb
            .from("admin_merx_demandes")
            .insert({ kind: "recherche", request: demande, conversation_id: conversationId, requested_by: email })
            .select("id")
            .single();
          if (error) return `La recherche n'a pas pu être enregistrée : ${error.message}`;
          demandeId = data.id;
          return `Recherche enregistrée : « ${demande} ». Elle est en cours ; ses résultats arriveront dans Prospects.`;
        },
      });

      const messages = [
        ...history,
        { role: "user", content: message, at: new Date().toISOString() },
        { role: "assistant", content: reply, at: new Date().toISOString() },
      ];
      await sb.from("admin_merx_conversations").update({ messages }).eq("id", conversationId);

      return json({ conversationId, reply, demandeId });
    }

    return json({ error: "Action inconnue." }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Erreur interne." }, 500);
  }
});
