// Réservation publique de créneaux (sans compte), gérée par jeton.
// verify_jwt = false : la page publique appelle cette fonction ; le jeton de la
// journée fait foi. Aucune table n'est exposée à anon (tout passe ici, en
// service_role). Actions : "infos", "reserver", "annuler".
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("RDV_FROM") ?? "AvisDoc <noreply@avisdoc.fr>";
const CLIENT_APP_URL = Deno.env.get("CLIENT_APP_URL") ?? "https://client.avisdoc.fr";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const pad = (n: number) => String(n).padStart(2, "0");
const toMin = (t: string) => { const [h, m] = t.split(":"); return +h * 60 + +m; };
const toHHMM = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

function creneaux(j: any): string[] {
  const out: string[] = [];
  const debut = toMin(j.heure_debut), fin = toMin(j.heure_fin), pas = j.duree_min;
  const pd = j.pause_debut ? toMin(j.pause_debut) : null;
  const pf = j.pause_fin ? toMin(j.pause_fin) : null;
  for (let t = debut; t + pas <= fin; t += pas) {
    if (pd != null && pf != null && t >= pd && t < pf) continue;
    out.push(toHHMM(t));
  }
  return out;
}

const dateFr = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

// Dates de calendrier (heure locale « flottante », pas de fuseau) + variantes ISO.
function bornes(dateIso: string, creneau: string, dureeMin: number) {
  const [y, m, d] = dateIso.split("-").map(Number);
  const s = toMin(creneau), e = s + dureeMin;
  const compact = (mins: number) => `${y}${pad(m)}${pad(d)}T${pad(Math.floor(mins / 60))}${pad(mins % 60)}00`;
  const iso = (mins: number) => `${y}-${pad(m)}-${pad(d)}T${pad(Math.floor(mins / 60))}:${pad(mins % 60)}:00`;
  return { startC: compact(s), endC: compact(e), startISO: iso(s), endISO: iso(e) };
}

const b64utf8 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

async function confirmer(email: string, j: any, creneau: string, annulToken: string) {
  if (!RESEND_API_KEY) return;
  const titre = "Dépistage dermatologique";
  const lieu = j.lieu || "";
  const { startC, endC, startISO, endISO } = bornes(j.date, creneau, j.duree_min);
  const details = "Examen de dépistage des cancers de la peau, en téléexpertise avec AvisDoc.";

  const gcal = "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(titre)}&dates=${startC}/${endC}` +
    `&location=${encodeURIComponent(lieu)}&details=${encodeURIComponent(details)}`;
  const ocal = "https://outlook.office.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent" +
    `&subject=${encodeURIComponent(titre)}&startdt=${startISO}&enddt=${endISO}&location=${encodeURIComponent(lieu)}` +
    `&body=${encodeURIComponent(details)}`;
  const annul = `${CLIENT_APP_URL}/annuler/${j.token}?a=${annulToken}`;

  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AvisDoc//RDV//FR", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:${annulToken}@avisdoc.fr`, `DTSTAMP:${startC}`,
    `DTSTART:${startC}`, `DTEND:${endC}`, `SUMMARY:${titre}`,
    `LOCATION:${lieu.replace(/,/g, "\\,")}`, `DESCRIPTION:${details}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");

  const bouton = (href: string, label: string, plein = true) =>
    `<a href="${href}" style="display:inline-block;padding:11px 20px;margin:4px 6px 4px 0;border-radius:999px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;` +
    (plein ? "background:#16283C;color:#ffffff;" : "border:1.5px solid #cfd8e0;color:#16283C;") + `">${label}</a>`;

  const html = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;margin:0;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:92%;background:#ffffff;border:1px solid #e6ebf0;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
          <tr><td style="height:5px;background:#29B1E0;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:26px 34px 6px;">
            <div style="font-size:20px;font-weight:bold;color:#16283C;">AvisDoc<span style="color:#29B1E0;">.</span></div>
            <div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#8a97a6;margin-top:2px;">Dépistage dermatologique</div>
          </td></tr>
          <tr><td style="padding:14px 34px 6px;">
            <h1 style="margin:0 0 12px;font-size:22px;color:#16283C;">Rendez-vous confirmé</h1>
            <table style="font-size:14px;color:#16283C;border-collapse:collapse;margin-bottom:18px;">
              <tr><td style="padding:4px 14px 4px 0;color:#8a97a6;">Date</td><td><strong>${dateFr(j.date)}</strong></td></tr>
              <tr><td style="padding:4px 14px 4px 0;color:#8a97a6;">Heure</td><td><strong>${creneau}</strong></td></tr>
              <tr><td style="padding:4px 14px 4px 0;color:#8a97a6;">Lieu</td><td><strong>${lieu || "—"}</strong></td></tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#4a5967;">Ajoutez le rendez-vous à votre agenda :</p>
            <div style="margin-bottom:16px;">${bouton(gcal, "Google Agenda")}${bouton(ocal, "Outlook", false)}</div>
            <p style="margin:0 0 18px;font-size:12px;color:#8a97a6;">Un fichier <strong>.ics</strong> est joint pour Apple Calendar et les autres agendas.</p>
            <p style="margin:0 0 18px;font-size:13px;color:#4a5967;">
              Empêchement ? <a href="${annul}" style="color:#29B1E0;">Annuler mon rendez-vous</a>.
            </p>
          </td></tr>
          <tr><td style="padding:14px 34px 26px;border-top:1px solid #eef2f5;">
            <p style="margin:12px 0 0;font-size:11px;color:#9aa6b2;">Examen de moins de 15 minutes. Votre employeur n'a accès à aucune information médicale.</p>
            <p style="margin:8px 0 0;font-size:11px;color:#9aa6b2;">AvisDoc · Téléexpertise dermatologique · Hébergement de données de santé agréé · Conforme RGPD</p>
          </td></tr>
        </table>
      </td></tr>
    </table>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM, to: email, subject: "Confirmation de votre rendez-vous de dépistage", html,
      attachments: [{ filename: "rendez-vous.ics", content: b64utf8(ics) }],
    }),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  const { action, token, creneau, nom, email, telephone, annul } = await req.json().catch(() => ({}));
  if (!token) return json({ error: "token requis" }, 400);

  const admin = createClient(URL, SERVICE);
  const { data: j } = await admin
    .from("admin_journees")
    .select("*, admin_clients(company)")
    .eq("token", token)
    .maybeSingle();
  if (!j) return json({ error: "Lien invalide." }, 404);

  // Annulation : ne dépend pas de l'état "actif" (on peut toujours se désinscrire).
  if (action === "annuler") {
    if (!annul) return json({ error: "jeton d'annulation requis" }, 400);
    const { data: sup } = await admin.from("admin_rdv")
      .delete().eq("journee_id", j.id).eq("annul_token", annul).select("id");
    if (!sup || sup.length === 0) return json({ error: "Rendez-vous introuvable ou déjà annulé." }, 404);
    return json({ ok: true });
  }

  if (!j.actif) return json({ error: "Lien clôturé." }, 404);

  const tous = creneaux(j);
  const { data: pris } = await admin.from("admin_rdv").select("creneau").eq("journee_id", j.id);
  const prisSet = new Set((pris ?? []).map((r: any) => String(r.creneau).slice(0, 5)));

  if (action === "infos") {
    return json({
      entreprise: j.admin_clients?.company ?? "",
      journee: { date: j.date, lieu: j.lieu, duree_min: j.duree_min },
      creneaux: tous.map((c) => ({ heure: c, libre: !prisSet.has(c) })),
    });
  }

  if (action === "reserver") {
    const c = String(creneau ?? "").slice(0, 5);
    if (!tous.includes(c)) return json({ error: "Créneau invalide." }, 400);
    if (prisSet.has(c)) return json({ error: "Ce créneau vient d'être réservé." }, 409);
    if (!nom?.trim() || !email?.trim()) return json({ error: "Nom et e-mail requis." }, 400);

    const ins = await admin.from("admin_rdv").insert({
      journee_id: j.id, creneau: c,
      nom: nom.trim(), email: email.trim(), telephone: (telephone ?? "").trim(),
    }).select("id, annul_token").single();
    if (ins.error) return json({ error: "Ce créneau vient d'être réservé." }, 409); // viol. unique

    await confirmer(email.trim(), j, c, ins.data.annul_token).catch(() => {});
    return json({ ok: true, creneau: c });
  }

  return json({ error: "action inconnue" }, 400);
});
