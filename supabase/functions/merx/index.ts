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
import { transcrire } from "./transcription.ts";
import { chercherTerrain, lireFiche } from "./consulter.ts";
import { complete, converse, model, type LlmUsage } from "./llm.ts";
import {
  CHAT_SYSTEM,
  DEBRIEF_SCHEMA,
  DEBRIEF_SYSTEM,
  debriefPrompt,
  type DebriefOut,
  EMAIL_CLIENT_SYSTEM,
  EMAIL_SCHEMA,
  EMAIL_SYSTEM,
  emailClientPrompt,
  emailPrompt,
  type EmailOut,
} from "./prompts.ts";

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

    // ── Compléter une fiche sans modèle ──────────────────────────────────
    // Le registre, Pappers et la fiche d'établissement : deux secondes et presque rien,
    // là où un approfondissement coûte douze centimes et une trentaine de secondes.
    // C'est ce qu'il faut aux fiches d'avant, créées quand la recherche ne rendait
    // qu'un nom et une ville.
    if (body.action === "completer") {
      if (!body.prospectId) return json({ error: "Fiche non précisée." }, 400);
      const { data: p } = await sb.from("admin_prospects").select("id, name").eq("id", body.prospectId).maybeSingle();
      if (!p) return json({ error: "Fiche introuvable." }, 404);
      const { data: demande, error } = await sb
        .from("admin_merx_demandes")
        .insert({ kind: "completion", request: p.name, prospect_id: p.id, requested_by: email })
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
          { system: EMAIL_SYSTEM, usage: "email", timeoutMs: 40_000, onUsage: (u) => (usage = u) },
        );
        if (demande) {
          await sb
            .from("admin_merx_demandes")
            .update({
              status: "terminee",
              usage,
              model: model("email"),
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
            .update({ status: "echec", message, usage, model: model("email"), finished_at: new Date().toISOString() })
            .eq("id", demande.id);
        }
        return json({ error: "Le brouillon n'a pas pu être écrit. Vous pouvez réessayer." }, 500);
      }
    }

    // ── Écrire à un client ───────────────────────────────────────────────
    if (body.action === "email_client") {
      if (!body.accountId) return json({ error: "Fiche non précisée." }, 400);
      const intention = String(body.intention ?? "").trim();
      if (!intention) return json({ error: "Dites d'abord ce que vous voulez leur écrire." }, 400);

      const { data: a } = await sb
        .from("admin_accounts")
        .select("id, name, sector, signed_on, client_id")
        .eq("id", body.accountId)
        .maybeSingle();
      if (!a) return json({ error: "Fiche introuvable." }, 404);

      // L'affaire du Pipeline porte le chiffre et les interlocuteurs ; le fichier client, le nom.
      const { data: affaire } = a.client_id
        ? await sb.from("admin_clients").select("ville, jours, depistes, orientes").eq("id", a.client_id).maybeSingle()
        : { data: null };
      const { data: contact } = a.client_id
        ? await sb
            .from("admin_client_contacts")
            .select("prenom, nom, role, email")
            .eq("client_id", a.client_id)
            .limit(1)
            .maybeSingle()
        : { data: null };

      // Tout ce qu'on a noté avec eux, d'un côté comme de l'autre du passage au fichier client.
      const ou = [`account_id.eq.${a.id}`, a.client_id ? `client_id.eq.${a.client_id}` : ""].filter(Boolean).join(",");
      const { data: fil } = await sb
        .from("admin_echanges")
        .select("kind, titre, detail, au")
        .or(ou)
        .order("au", { ascending: false })
        .limit(12);

      const { data: demande, error: erreurDemande } = await sb
        .from("admin_merx_demandes")
        .insert({
          kind: "email",
          request: `${a.name} — ${intention}`,
          account_id: a.id,
          requested_by: email,
          status: "en_cours",
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      // Une demande non enregistrée, c'est un coût jamais compté : on le dit plutôt
      // que de laisser l'e-mail sortir comme si de rien n'était.
      if (erreurDemande) console.error("email_client : demande non enregistrée —", erreurDemande.message);

      let usage: LlmUsage = { inputTokens: 0, outputTokens: 0, webSearches: 0 };
      try {
        const signature = String(body.signature ?? "").trim() || email;
        const out = await complete<EmailOut>(
          emailClientPrompt(
            {
              nom: a.name,
              secteur: a.sector,
              clientDepuis: a.signed_on,
              journees: affaire?.jours ?? null,
              depistes: affaire?.depistes ?? null,
              orientes: affaire?.orientes ?? null,
              ville: affaire?.ville ?? null,
              contact: contact ? { nom: [contact.prenom, contact.nom].filter(Boolean).join(" "), role: contact.role ?? null } : null,
            },
            intention,
            (fil ?? []).map((e) => ({
              quand: new Date(e.au as string).toLocaleDateString("fr-FR"),
              genre: String(e.kind),
              titre: String(e.titre ?? ""),
              detail: (e.detail as string | null) ?? null,
            })),
            signature,
          ),
          EMAIL_SCHEMA as unknown as Record<string, unknown>,
          { system: EMAIL_CLIENT_SYSTEM, usage: "email", timeoutMs: 40_000, onUsage: (u) => (usage = u) },
        );
        if (demande) {
          await sb
            .from("admin_merx_demandes")
            .update({
              status: "terminee",
              usage,
              model: model("email"),
              finished_at: new Date().toISOString(),
              objet: out.objet,
              corps: out.corps,
            })
            .eq("id", demande.id);
        }
        return json({ objet: out.objet, corps: out.corps, destinataire: contact?.email ?? null });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (demande) {
          await sb
            .from("admin_merx_demandes")
            .update({ status: "echec", message, usage, model: model("email"), finished_at: new Date().toISOString() })
            .eq("id", demande.id);
        }
        return json({ error: "Le brouillon n'a pas pu être écrit. Vous pouvez réessayer." }, 500);
      }
    }

    // ── Transcrire une note dictée ───────────────────────────────────────
    if (body.action === "transcrire") {
      if (!body.noteId) return json({ error: "Note non précisée." }, 400);
      const cle = Deno.env.get("OPENAI_API_KEY");
      if (!cle) return json({ error: "La clé de transcription n'est pas configurée sur le projet." }, 500);

      const { data: note } = await sb
        .from("admin_notes_dictees")
        .select("id, audio_path, statut, transcription")
        .eq("id", body.noteId)
        .maybeSingle();
      if (!note) return json({ error: "Note introuvable." }, 404);
      // Déjà faite : on rend ce qu'on a plutôt que de repayer une transcription.
      if (note.transcription) return json({ transcription: note.transcription, deja: true });
      if (!note.audio_path) return json({ error: "Cette note n'a pas d'enregistrement." }, 400);

      try {
        const { data: fichier, error: erreurFichier } = await sb.storage.from("admin-dictee").download(note.audio_path as string);
        if (erreurFichier || !fichier) throw new Error("L'enregistrement n'a pas pu être lu.");

        const texte = await transcrire(fichier, cle);
        await sb
          .from("admin_notes_dictees")
          .update({ transcription: texte, statut: "transcrite", message: null })
          .eq("id", note.id);
        return json({ transcription: texte });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        // Le motif est gardé sur la note : le commercial doit savoir pourquoi, et
        // décider s'il redicte ou s'il réessaie.
        await sb.from("admin_notes_dictees").update({ statut: "echec", message }).eq("id", note.id);
        return json({ error: message }, 500);
      }
    }

    // ── Transcrire une question posée de vive voix ───────────────────────
    //
    // Rien n'est stocké : une question dictée au volant n'a pas à être archivée.
    // L'audio arrive encodé dans la demande, il est transcrit, et il disparaît.
    // C'est pourquoi la durée est courte — au-delà, c'est un débrief, qui lui se garde.
    if (body.action === "transcrire_question") {
      const cle = Deno.env.get("OPENAI_API_KEY");
      if (!cle) return json({ error: "La clé de transcription n'est pas configurée sur le projet." }, 500);
      const encode = String(body.audio ?? "");
      const type = String(body.type ?? "audio/webm");
      if (!encode) return json({ error: "Aucun enregistrement reçu." }, 400);

      try {
        const octets = Uint8Array.from(atob(encode), (c) => c.charCodeAt(0));
        // Une minute de parole pèse environ 1,2 Mo : au-delà de 3 Mo, ce n'est plus
        // une question, et l'encodage alourdirait trop la demande.
        if (octets.byteLength > 3_000_000) {
          return json({ error: "Question trop longue. Posez-la en moins d'une minute, ou passez par le Débrief." }, 400);
        }
        const texte = await transcrire(new Blob([octets], { type }), cle);
        return json({ texte });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : "La transcription a échoué." }, 500);
      }
    }

    // ── Débrief : ce que le commercial raconte en sortant ────────────────
    if (body.action === "debrief") {
      const texte = String(body.texte ?? "").trim();
      if (texte.length < 20) return json({ error: "Racontez d'abord ce qui s'est passé." }, 400);

      // Ses fiches, pour que Merx rattache ce qu'il raconte à la bonne entreprise.
      const [prospects, affaires, comptes, stages, terrain] = await Promise.all([
        sb.from("admin_prospects").select("id, name, city").is("deleted_at", null).limit(300),
        sb.from("admin_clients").select("id, company, ville").is("deleted_at", null).limit(300),
        sb.from("admin_accounts").select("id, name").is("deleted_at", null).limit(300),
        sb.from("admin_pipeline_stages").select("label").order("position"),
        sb.from("admin_terrain").select("nature, famille").is("deleted_at", null).not("famille", "is", null).limit(400),
      ]);

      const fiches = [
        ...(prospects.data ?? []).map((p) => ({ type: "prospect", id: p.id as string, nom: p.name as string, ville: (p.city as string) ?? null })),
        ...(affaires.data ?? []).map((c) => ({ type: "affaire", id: c.id as string, nom: c.company as string, ville: (c.ville as string) ?? null })),
        ...(comptes.data ?? []).map((a) => ({ type: "client", id: a.id as string, nom: a.name as string, ville: null })),
      ];

      // Les familles déjà en usage : on range avec les mêmes mots plutôt que d'en inventer.
      const familles = { objection: [] as string[], mouche: [] as string[] };
      for (const t of terrain.data ?? []) {
        const bac = t.nature === "objection" ? familles.objection : familles.mouche;
        const f = String(t.famille);
        if (!bac.includes(f)) bac.push(f);
      }

      const { data: demande } = await sb
        .from("admin_merx_demandes")
        .insert({ kind: "recherche", request: `Débrief — ${texte.slice(0, 60)}…`, requested_by: email, status: "en_cours", started_at: new Date().toISOString() })
        .select("id")
        .single();

      let usage: LlmUsage = { inputTokens: 0, outputTokens: 0, webSearches: 0 };
      try {
        const out = await complete<DebriefOut>(
          debriefPrompt(
            texte,
            fiches,
            (stages.data ?? []).map((s) => String(s.label)),
            familles,
            new Date().toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
          ),
          DEBRIEF_SCHEMA as unknown as Record<string, unknown>,
          { system: DEBRIEF_SYSTEM, usage: "email", timeoutMs: 90_000, onUsage: (u) => (usage = u) },
        );
        if (demande) {
          await sb
            .from("admin_merx_demandes")
            .update({ status: "terminee", usage, model: model("email"), finished_at: new Date().toISOString() })
            .eq("id", demande.id);
        }
        // On ne croit pas le modèle sur parole quant aux identifiants : s'il rattache
        // à une fiche qui n'existe pas, l'écran afficherait « fiche reconnue » sans
        // qu'on puisse jamais la retrouver. On vérifie, et on efface ce qui est faux —
        // l'entreprise redevient alors une nouvelle, qu'on proposera de créer.
        const connus = new Set(fiches.map((f) => `${f.type}:${f.id}`));
        for (const e of out.entreprises ?? []) {
          if (e.fiche_id && !connus.has(`${e.fiche_type}:${e.fiche_id}`)) {
            e.fiche_id = "";
            e.fiche_type = "";
            if (!e.a_creer) e.a_creer = "prospect";
          }
        }

        // Rien n'est écrit ici : le commercial valide à l'écran, puis l'application enregistre.
        return json(out);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (demande) {
          await sb
            .from("admin_merx_demandes")
            .update({ status: "echec", message, usage, model: model("email"), finished_at: new Date().toISOString() })
            .eq("id", demande.id);
        }
        return json({ error: "Merx n'a pas pu lire ce débrief. Vous pouvez réessayer." }, 500);
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
        model: model("chat"),
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
          {
            name: "lire_fiche",
            description:
              "Va chercher ce qu'on sait d'une entreprise : son identité, sa note, et le dossier commercial (accroche, arguments, objections, offre) s'il a été monté. À appeler DÈS QUE le commercial nomme une entreprise — on ne conseille pas sur une entreprise sans avoir relu sa fiche.",
            inputSchema: {
              type: "object",
              additionalProperties: false,
              required: ["nom"],
              properties: { nom: { type: "string", description: "Le nom de l'entreprise, même approximatif." } },
            },
          },
          {
            name: "chercher_dans_le_terrain",
            description:
              "Cherche dans ce que l'équipe a appris sur le terrain : les objections déjà entendues avec leurs réponses, et les arguments qui ont porté. À appeler quand le commercial parle d'une objection, demande quoi répondre, ou cherche un argument.",
            inputSchema: {
              type: "object",
              additionalProperties: false,
              required: ["sujet"],
              properties: { sujet: { type: "string", description: "Le sujet, en quelques mots : « médecine du travail », « trop cher », « réseau d'aval »…" } },
            },
          },
        ],
        runTool: async (name, input) => {
          if (name === "lancer_recherche") {
            const demande = String((input as { demande?: string })?.demande ?? "").trim() || message;
            const { data, error } = await sb
              .from("admin_merx_demandes")
              .insert({ kind: "recherche", request: demande, conversation_id: conversationId, requested_by: email })
              .select("id")
              .single();
            if (error) return `La recherche n'a pas pu être enregistrée : ${error.message}`;
            demandeId = data.id;
            return `Recherche enregistrée : « ${demande} ». Elle est en cours ; ses résultats arriveront dans Prospects.`;
          }

          if (name === "lire_fiche") {
            const nom = String((input as { nom?: string })?.nom ?? "").trim();
            if (!nom) return "Aucun nom donné.";
            return await lireFiche(sb, nom);
          }

          if (name === "chercher_dans_le_terrain") {
            const sujet = String((input as { sujet?: string })?.sujet ?? "").trim();
            return await chercherTerrain(sb, sujet);
          }

          return "Outil inconnu.";
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
