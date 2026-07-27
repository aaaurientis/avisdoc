// Rappels de rendez-vous par e-mail — fonction planifiée (cron toutes les ~15 min).
// Envoie un rappel la veille (J-1) et une heure avant (H-1), une seule fois
// chacun (colonnes rappel_j1_le / rappel_h1_le). Protégée par un secret partagé.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("RDV_FROM") ?? "AvisDoc <noreply@avisdoc.fr>";
const CLIENT_APP_URL = Deno.env.get("CLIENT_APP_URL") ?? "https://client.avisdoc.fr";
const SECRET = (Deno.env.get("RAPPELS_SECRET") ?? "").trim();

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const dateFr = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

// Instant UTC d'un créneau exprimé en heure de Paris (gère l'heure d'été).
function offsetParisMin(d: Date): number {
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  const par = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  return (par.getTime() - utc.getTime()) / 60000;
}
function slotInstant(dateIso: string, creneau: string): number {
  const [Y, M, D] = dateIso.split("-").map(Number);
  const [h, m] = creneau.slice(0, 5).split(":").map(Number);
  const naive = Date.UTC(Y, M - 1, D, h, m);
  return naive - offsetParisMin(new Date(naive)) * 60000;
}

async function envoyer(email: string, quand: string, j: any, creneau: string, annulToken: string) {
  if (!RESEND_API_KEY) return;
  const annul = `${CLIENT_APP_URL}/annuler/${j.token}?a=${annulToken}`;
  const html = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;margin:0;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:92%;background:#ffffff;border:1px solid #e6ebf0;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
          <tr><td style="height:5px;background:#29B1E0;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:26px 34px 6px;">
            <div style="font-size:20px;font-weight:bold;color:#16283C;">AvisDoc<span style="color:#29B1E0;">.</span></div>
            <div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#8a97a6;margin-top:2px;">Rappel de rendez-vous</div>
          </td></tr>
          <tr><td style="padding:14px 34px 6px;">
            <h1 style="margin:0 0 12px;font-size:22px;color:#16283C;">Votre rendez-vous ${quand}</h1>
            <table style="font-size:14px;color:#16283C;border-collapse:collapse;margin-bottom:18px;">
              <tr><td style="padding:4px 14px 4px 0;color:#8a97a6;">Date</td><td><strong>${dateFr(j.date)}</strong></td></tr>
              <tr><td style="padding:4px 14px 4px 0;color:#8a97a6;">Heure</td><td><strong>${creneau.slice(0, 5)}</strong></td></tr>
              <tr><td style="padding:4px 14px 4px 0;color:#8a97a6;">Lieu</td><td><strong>${j.lieu || "—"}</strong></td></tr>
            </table>
            <p style="margin:0 0 18px;font-size:13px;color:#4a5967;">Empêchement ? <a href="${annul}" style="color:#29B1E0;">Annuler mon rendez-vous</a>.</p>
          </td></tr>
          <tr><td style="padding:14px 34px 26px;border-top:1px solid #eef2f5;">
            <p style="margin:12px 0 0;font-size:11px;color:#9aa6b2;">Examen de moins de 15 minutes. Votre employeur n'a accès à aucune information médicale.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: email, subject: `Rappel — dépistage ${quand}`, html }),
  });
}

serve(async (req) => {
  if (SECRET && req.headers.get("x-secret") !== SECRET) return json({ error: "non autorisé" }, 401);

  const admin = createClient(URL, SERVICE);
  const now = Date.now();
  const jour = (o: number) => new Date(now + o * 864e5).toISOString().slice(0, 10);

  // Journées d'aujourd'hui et de demain (couvre J-1 et H-1) + leurs réservations.
  const { data: journees, error } = await admin
    .from("admin_journees")
    .select("id, date, lieu, duree_min, token, admin_rdv(id, creneau, email, annul_token, rappel_j1_le, rappel_h1_le)")
    .in("date", [jour(0), jour(1)]);
  if (error) return json({ error: error.message }, 500);

  let j1 = 0, h1 = 0;
  for (const j of journees ?? []) {
    for (const r of (j as any).admin_rdv ?? []) {
      const t = slotInstant(j.date, r.creneau);
      // J-1 : dès l'entrée dans la fenêtre 24 h (mais pas pour un RDV imminent).
      if (!r.rappel_j1_le && now >= t - 24 * 36e5 && now < t - 2 * 36e5) {
        await envoyer(r.email, "demain", j, r.creneau, r.annul_token).catch(() => {});
        await admin.from("admin_rdv").update({ rappel_j1_le: new Date(now).toISOString() }).eq("id", r.id);
        j1++;
      }
      // H-1 : dans l'heure qui précède, tant que le créneau n'est pas passé.
      if (!r.rappel_h1_le && now >= t - 1 * 36e5 && now < t) {
        await envoyer(r.email, "dans 1 heure", j, r.creneau, r.annul_token).catch(() => {});
        await admin.from("admin_rdv").update({ rappel_h1_le: new Date(now).toISOString() }).eq("id", r.id);
        h1++;
      }
    }
  }
  return json({ ok: true, rappels_j1: j1, rappels_h1: h1 });
});
