// Edge Function : invite une infirmière requérante.
//
// Crée l'inscription (état « invitee »), génère un lien à usage unique (7 jours)
// et l'envoie par e-mail (Resend, best-effort). Réservée aux comptes @avisdoc.fr.
//
// Secrets : RESEND_API_KEY (optionnel), REQ_EMAIL_FROM (optionnel),
//           REQUERANT_APP_URL (optionnel). SUPABASE_* injectés automatiquement.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const REQUERANT_APP_URL = Deno.env.get("REQUERANT_APP_URL") ?? "https://requerant.avisdoc.fr";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("REQ_EMAIL_FROM") ?? "AvisDoc <noreply@avisdoc.fr>";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

// Lien magique de connexion (crée le compte si besoin) renvoyant au portail avec
// le token d'invitation. magiclink si le compte existe, invite sinon.
async function lienMagique(admin: any, email: string, redirectTo: string): Promise<string | null> {
  for (const type of ["invite", "magiclink"]) {
    const { data, error } = await admin.auth.admin.generateLink({ type, email, options: { redirectTo } });
    if (!error && data?.properties?.action_link) return data.properties.action_link as string;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  // Contrôle admin @avisdoc.fr.
  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(SB_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: u } = await asUser.auth.getUser();
  const adminEmail = u.user?.email ?? "";
  if (!adminEmail.toLowerCase().endsWith("@avisdoc.fr")) {
    return json({ error: "Réservé aux comptes @avisdoc.fr." }, 403);
  }

  const { nom, prenom, email, rpps, telephone } = await req.json().catch(() => ({}));
  if (!nom?.trim() || !prenom?.trim() || !email?.includes("@")) {
    return json({ error: "nom, prénom et e-mail requis." }, 400);
  }

  const admin = createClient(SB_URL, SERVICE);
  const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
  const expire = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const cible = email.trim().toLowerCase();

  const { data: ins, error } = await admin
    .from("req_inscriptions")
    .insert({
      nom: nom.trim(),
      prenom: prenom.trim(),
      email: cible,
      rpps: rpps?.trim() || null,
      telephone: telephone?.trim() || null,
      identite_source: "secours",
      etat: "invitee",
      invite_token: token,
      invite_expire_le: expire,
      derniere_action_le: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) return json({ error: error.message }, 500);

  await admin.from("req_historique").insert({
    inscription_id: ins.id,
    acteur: adminEmail,
    action: "invitee",
    detail: { email: cible },
  });

  // E-mail d'invitation = lien magique (connexion directe), best-effort.
  let email_envoye = false;
  if (RESEND_API_KEY) {
    const lien = await lienMagique(admin, cible, `${REQUERANT_APP_URL}/?token=${token}`);
    if (lien) {
      const html =
        `<p>Bonjour ${escapeHtml(prenom)},</p>` +
        `<p>Vous êtes invitée à finaliser votre inscription comme infirmière requérante AvisDoc. ` +
        `Ce lien de connexion est personnel et valable 7 jours.</p>` +
        `<p><a href="${lien}">Commencer mon inscription</a></p>`;
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: EMAIL_FROM, to: cible, subject: "Votre inscription AvisDoc", html }),
        });
        email_envoye = res.ok;
        if (!res.ok) console.error("Resend:", res.status, await res.text().catch(() => ""));
      } catch (e) {
        console.error(e);
      }
    }
  }

  return json({ id: ins.id, email_envoye });
});
