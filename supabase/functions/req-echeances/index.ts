// Edge Function planifiée (quotidienne) : échéances des attestations RCP/URSSAF.
//
//   - Attestation échue (date_fin < aujourd'hui) : pièce « expiree » et inscription
//     « active » → « suspendue » (motif), pour couper l'éligibilité.
//   - Attestation arrivant à échéance (≤ 30 jours) : un rappel e-mail unique à
//     l'infirmière (déduplication via echeance_rappel_le).
//
// Protégée par un secret partagé (en-tête x-secret = REQ_ECHEANCES_SECRET), à la
// manière de rdv-rappels. À planifier dans le dashboard Supabase (cron quotidien).
//
// Secrets : REQ_ECHEANCES_SECRET, RESEND_API_KEY & REQ_EMAIL_FROM (optionnels),
//           REQUERANT_APP_URL (optionnel).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = (Deno.env.get("REQ_ECHEANCES_SECRET") ?? "").trim();
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("REQ_EMAIL_FROM") ?? "AvisDoc <noreply@avisdoc.fr>";
const APP_URL = Deno.env.get("REQUERANT_APP_URL") ?? "https://requerant.avisdoc.fr";

const SEUIL_JOURS = 30;
const LABEL: Record<string, string> = { rcp: "responsabilité civile (RCP)", urssaf: "attestation URSSAF" };

const frDate = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

async function rappel(email: string, prenom: string, type: string, dateFin: string) {
  if (!RESEND_API_KEY) return false;
  const html =
    `<p>Bonjour ${escapeHtml(prenom)},</p>` +
    `<p>Votre ${LABEL[type] ?? type} arrive à échéance le <strong>${frDate(dateFin)}</strong>. ` +
    `Pour continuer à exercer comme infirmière requérante AvisDoc, merci de déposer une ` +
    `attestation à jour depuis votre espace :</p>` +
    `<p><a href="${APP_URL}">Mettre à jour mon attestation</a></p>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: email, subject: "Attestation à renouveler — AvisDoc", html }),
    });
    if (!res.ok) console.error("Resend:", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (e) {
    console.error(e);
    return false;
  }
}

serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "méthode non autorisée" }, 405);
  if (!SECRET || (req.headers.get("x-secret") ?? "").trim() !== SECRET) {
    return json({ error: "non autorisé" }, 401);
  }

  const admin = createClient(SB_URL, SERVICE);
  const today = new Date().toISOString().slice(0, 10);
  const seuil = new Date(Date.now() + SEUIL_JOURS * 86_400_000).toISOString().slice(0, 10);

  // Dernière version validée de chaque RCP/URSSAF, inscriptions non terminées.
  const { data: pieces, error } = await admin
    .from("req_pieces")
    .select("id, inscription_id, type, version, etat, date_fin, echeance_rappel_le, req_inscriptions!inner(id, etat, prenom, email)")
    .in("type", ["rcp", "urssaf"])
    .eq("etat", "validee")
    .not("date_fin", "is", null);
  if (error) return json({ error: error.message }, 500);

  // Ne garder que la version la plus récente par (inscription, type).
  const derniere = new Map<string, any>();
  for (const p of pieces ?? []) {
    const k = `${p.inscription_id}:${p.type}`;
    if (!derniere.has(k) || p.version > derniere.get(k).version) derniere.set(k, p);
  }

  let expirees = 0, rappels = 0;
  for (const p of derniere.values()) {
    const ins = p.req_inscriptions;
    const fin = String(p.date_fin).slice(0, 10);

    if (fin < today) {
      // Échue : pièce expirée ; si active, on suspend pour couper l'éligibilité.
      await admin.from("req_pieces").update({ etat: "expiree" }).eq("id", p.id);
      if (ins.etat === "active") {
        const motif = `Attestation ${LABEL[p.type] ?? p.type} expirée le ${frDate(fin)}.`;
        await admin.from("req_inscriptions")
          .update({ etat: "suspendue", motif, derniere_action_le: new Date().toISOString() })
          .eq("id", ins.id).eq("etat", "active");
        await admin.from("req_historique").insert({
          inscription_id: ins.id, acteur: "systeme", action: "attestation_expiree",
          piece_id: p.id, detail: { type: p.type, date_fin: fin },
        });
      }
      expirees++;
    } else if (fin <= seuil && !p.echeance_rappel_le && ins.etat === "active") {
      // Bientôt échue : un rappel unique.
      const ok = await rappel(ins.email, ins.prenom, p.type, fin);
      await admin.from("req_pieces").update({ echeance_rappel_le: new Date().toISOString() }).eq("id", p.id);
      if (ok) rappels++;
    }
  }

  return json({ ok: true, expirees, rappels });
});
