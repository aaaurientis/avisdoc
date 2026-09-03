// Rattachement des échanges email (Gmail API) aux contacts en conversation.
// Une fois la conversation passée sur email, la personne a répondu :
// l'automatisation de la trace est légitime.
//
// Ce que l'on stocke : identifiant de fil, identifiant de message, date, sens,
// objet, résumé court généré. JAMAIS le corps : un prospect peut y écrire une
// information de santé. Le corps ne transite qu'en mémoire, pour le résumé.
//
// Secrets : GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN (boîte de
// prospection), PROSPECTION_CRON_SECRET (appel planifié, facultatif).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { appelPlanificateur, clientService, cors, json, membreAppelant } from "../_shared/auth.ts";
import { bedrockConfigure, converser } from "../_shared/bedrock.ts";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const STATUTS_SUIVIS = ["invite", "accepte", "en_conversation", "partenaire"];
const FENETRE = "newer_than:120d";

interface Contact { id: string; email: string; statut: string }
interface EnTete { name: string; value: string }
interface Charge { headers?: EnTete[]; mimeType?: string; body?: { data?: string }; parts?: Charge[] }
interface Message { id: string; threadId: string; internalDate: string; payload?: Charge }

async function jetonAcces(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GMAIL_CLIENT_ID") ?? "",
      client_secret: Deno.env.get("GMAIL_CLIENT_SECRET") ?? "",
      refresh_token: Deno.env.get("GMAIL_REFRESH_TOKEN") ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Gmail OAuth ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

function enTete(m: Message, nom: string): string {
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === nom.toLowerCase())?.value ?? "";
}

function decoder(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  try { return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))); } catch { return ""; }
}

/** Texte brut du message, en mémoire seulement, tronqué à l'usage. */
function texteBrut(p: Charge | undefined): string {
  if (!p) return "";
  if (p.mimeType === "text/plain" && p.body?.data) return decoder(p.body.data);
  for (const part of p.parts ?? []) {
    const t = texteBrut(part);
    if (t) return t;
  }
  return "";
}

async function resumer(objet: string, corps: string): Promise<string> {
  if (!bedrockConfigure() || !corps.trim()) return "";
  const systeme = "Tu résumes en une phrase de 25 mots au plus, en français, l'objet d'un échange commercial B2B. " +
    "N'inclus aucun nom de personne, aucune adresse, aucune information personnelle ni de santé. Réponds par la phrase seule.";
  const r = await converser(systeme, `Objet : ${objet}\n\nMessage :\n${corps.slice(0, 3000)}`, 80).catch(() => "");
  return r.slice(0, 300);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  const membre = await membreAppelant(req);
  if (!membre && !appelPlanificateur(req)) return json({ error: "réservé aux comptes @avisdoc.fr" }, 403);
  if (!Deno.env.get("GMAIL_REFRESH_TOKEN")) return json({ error: "Gmail non configuré (GMAIL_CLIENT_ID / SECRET / REFRESH_TOKEN)" }, 503);

  const sb = clientService();
  const { data: contacts, error } = await sb.from("contact").select("id, email, statut")
    .in("statut", STATUTS_SUIVIS).not("email", "is", null);
  if (error) return json({ error: error.message }, 500);

  const { data: connus } = await sb.from("interaction").select("email_message_id").not("email_message_id", "is", null);
  const dejaVus = new Set((connus ?? []).map((r: { email_message_id: string }) => r.email_message_id));

  let jeton: string;
  try { jeton = await jetonAcces(); } catch (e) { return json({ error: String(e) }, 502); }
  const entetes = { Authorization: `Bearer ${jeton}` };

  let emails = 0;
  const erreurs: string[] = [];

  for (const c of (contacts ?? []) as Contact[]) {
    const q = encodeURIComponent(`(from:${c.email} OR to:${c.email}) ${FENETRE}`);
    const liste = await fetch(`${GMAIL}/messages?q=${q}&maxResults=50`, { headers: entetes });
    if (!liste.ok) { erreurs.push(`${c.id} : Gmail ${liste.status}`); continue; }
    const ids = (((await liste.json()) as { messages?: Array<{ id: string }> }).messages ?? []).map((m) => m.id);

    for (const id of ids) {
      if (dejaVus.has(id)) continue;
      const r = await fetch(`${GMAIL}/messages/${id}?format=full`, { headers: entetes });
      if (!r.ok) { erreurs.push(`${id} : Gmail ${r.status}`); continue; }
      const m = (await r.json()) as Message;
      const de = enTete(m, "From").toLowerCase();
      const entrant = de.includes(c.email.toLowerCase());
      const objet = enTete(m, "Subject").slice(0, 200);
      const survenu = new Date(Number(m.internalDate)).toISOString();
      const resume = await resumer(objet, texteBrut(m.payload)); // le corps ne quitte pas la mémoire

      if (entrant) {
        const { error: e } = await sb.rpc("enregistrer_reponse", {
          p_contact_id: c.id, p_canal: "email", p_contenu: resume, p_survenu_le: survenu,
          p_objet: objet, p_email_thread_id: m.threadId, p_email_message_id: id,
        });
        if (e) { erreurs.push(`${id} : ${e.message}`); continue; }
      } else {
        const { error: e } = await sb.from("interaction").insert({
          contact_id: c.id, canal: "email", sens: "sortant", type: "email", contenu: resume, objet,
          email_thread_id: m.threadId, email_message_id: id, survenu_le: survenu, cree_par: membre ?? "gmail",
        });
        if (e) { erreurs.push(`${id} : ${e.message}`); continue; }
      }
      dejaVus.add(id);
      emails++;
    }
  }

  await sb.from("journal").insert({
    evenement: "gmail_synchronisation",
    detail: { contacts: (contacts ?? []).length, emails, erreurs: erreurs.length },
    acteur: membre ?? "planificateur",
  });
  return json({ contacts: (contacts ?? []).length, emails, erreurs });
});
