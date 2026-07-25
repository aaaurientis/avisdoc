// Réservation publique de créneaux (sans compte), gérée par jeton.
// verify_jwt = false : la page publique appelle cette fonction ; le jeton de la
// journée fait foi. Aucune table n'est exposée à anon (tout passe ici, en
// service_role). Actions : "infos" (journée + créneaux) et "reserver".
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

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const toMin = (t: string) => { const [h, m] = t.split(":"); return +h * 60 + +m; };
const toHHMM = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

// Liste des créneaux d'une journée (hors pause déjeuner éventuelle).
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

async function confirmer(email: string, j: any, creneau: string) {
  if (!RESEND_API_KEY) return;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;">
      <h2 style="color:#16283C;">Rendez-vous confirmé</h2>
      <p style="color:#4a5967;font-size:15px;line-height:1.6;">Votre dépistage dermatologique est réservé :</p>
      <table style="font-size:14px;color:#16283C;border-collapse:collapse;">
        <tr><td style="padding:4px 12px 4px 0;color:#8a97a6;">Date</td><td><strong>${dateFr(j.date)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#8a97a6;">Heure</td><td><strong>${creneau}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#8a97a6;">Lieu</td><td><strong>${j.lieu || "—"}</strong></td></tr>
      </table>
      <p style="color:#9aa6b2;font-size:12px;margin-top:20px;">L'examen dure moins de 15 minutes. Votre employeur n'a accès à aucune information médicale.</p>
    </div>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: email, subject: "Confirmation de votre rendez-vous de dépistage", html }),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  const { action, token, creneau, nom, email, telephone } = await req.json().catch(() => ({}));
  if (!token) return json({ error: "token requis" }, 400);

  const admin = createClient(URL, SERVICE);
  const { data: j } = await admin
    .from("admin_journees")
    .select("*, admin_clients(company)")
    .eq("token", token)
    .maybeSingle();
  if (!j || !j.actif) return json({ error: "Lien invalide ou clôturé." }, 404);

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
    }).select("id").single();
    if (ins.error) return json({ error: "Ce créneau vient d'être réservé." }, 409); // viol. unique

    await confirmer(email.trim(), j, c).catch(() => {});
    return json({ ok: true, creneau: c });
  }

  return json({ error: "action inconnue" }, 400);
});
