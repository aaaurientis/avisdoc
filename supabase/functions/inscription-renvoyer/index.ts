// Edge Function (publique) : renvoie un lien de connexion à une infirmière, à
// partir de son e-mail. Ne révèle jamais si un dossier existe (toujours { ok }).

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
const REQUERANT_APP_URL = Deno.env.get("REQUERANT_APP_URL") ?? "https://requerant.avisdoc.fr";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("REQ_EMAIL_FROM") ?? "AvisDoc <noreply@avisdoc.fr>";

const TERMINAUX = ["refusee", "resiliee", "abandonnee"];

async function lienMagique(admin: any, email: string, redirectTo: string): Promise<string | null> {
  for (const type of ["magiclink", "invite"]) {
    const { data, error } = await admin.auth.admin.generateLink({ type, email, options: { redirectTo } });
    if (!error && data?.properties?.action_link) return data.properties.action_link as string;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  const { email } = await req.json().catch(() => ({}));
  const cible = (email ?? "").trim().toLowerCase();
  if (!cible.includes("@")) return json({ ok: true }); // on ne divulgue rien

  try {
    const admin = createClient(SB_URL, SERVICE);
    const { data: ins } = await admin
      .from("req_inscriptions")
      .select("id, invite_token, etat")
      .eq("email", cible)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ins && !TERMINAUX.includes(ins.etat) && RESEND_API_KEY) {
      let token = ins.invite_token;
      const expire = new Date(Date.now() + 7 * 86_400_000).toISOString();
      if (!token) {
        token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
      }
      await admin.from("req_inscriptions").update({ invite_token: token, invite_expire_le: expire }).eq("id", ins.id);

      const lien = await lienMagique(admin, cible, `${REQUERANT_APP_URL}/?token=${token}`);
      if (lien) {
        const html =
          `<p>Bonjour,</p><p>Voici votre lien de connexion à votre inscription AvisDoc ` +
          `(valable 7 jours) :</p><p><a href="${lien}">Accéder à mon inscription</a></p>`;
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: EMAIL_FROM, to: cible, subject: "Votre lien de connexion AvisDoc", html }),
        }).catch((e) => console.error(e));
      }
    }
  } catch (e) {
    console.error(e);
  }

  return json({ ok: true });
});
