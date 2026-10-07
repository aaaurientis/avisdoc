// Edge Function : l'admin envoie le contrat à signer (Yousign).
//
// Pour une inscription « prête à signer » : génère le PDF de la convention,
// crée la demande de signature, archive la ligne req_contrats et passe
// l'inscription en « contrat_envoye ». Renvoie le lien de signature, aussi
// envoyé par e-mail (Resend, best-effort). Réservée aux comptes @avisdoc.fr.
//
// Secrets : YOUSIGN_API_KEY (+ YOUSIGN_BASE_URL), RESEND_API_KEY & REQ_EMAIL_FROM
//           (optionnels), REQUERANT_APP_URL (optionnel).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { creerYousign } from "../_shared/signature.ts";
import { genererContratPdf, MODELE_VERSION, SIGN_FIELD } from "../_shared/contrat-pdf.ts";

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
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("REQ_EMAIL_FROM") ?? "AvisDoc <noreply@avisdoc.fr>";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(SB_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: u } = await asUser.auth.getUser();
  const adminEmail = u.user?.email ?? "";
  if (!adminEmail.toLowerCase().endsWith("@avisdoc.fr")) {
    return json({ error: "Réservé aux comptes @avisdoc.fr." }, 403);
  }

  const { id } = await req.json().catch(() => ({}));
  if (!id) return json({ error: "id requis." }, 400);

  const admin = createClient(SB_URL, SERVICE);
  const { data: ins, error: insErr } = await admin
    .from("req_inscriptions").select("*").eq("id", id).maybeSingle();
  if (insErr) return json({ error: insErr.message }, 500);
  if (!ins) return json({ error: "Inscription introuvable." }, 404);
  if (ins.etat !== "pret_a_signer") {
    return json({ error: "L'inscription doit être « prête à signer »." }, 409);
  }

  // 1. Génère le contrat PDF.
  const pdf = await genererContratPdf({ nom: ins.nom, prenom: ins.prenom, email: ins.email, rpps: ins.rpps });

  // 2. Envoie pour signature (Yousign, derrière l'interface).
  let resultat;
  try {
    const service = creerYousign();
    resultat = await service.envoyer({
      titre: `Convention AvisDoc — ${ins.prenom} ${ins.nom}`,
      pdf,
      nomFichier: "convention-avisdoc.pdf",
      signataire: { nom: ins.nom, prenom: ins.prenom, email: ins.email },
      champ: SIGN_FIELD,
    });
  } catch (e) {
    console.error("Signature:", e);
    return json({ error: "Envoi à la signature impossible (configuration Yousign ?)." }, 502);
  }

  // 3. Enregistre le contrat et fait avancer l'inscription.
  const { data: contrat, error: cErr } = await admin.from("req_contrats").insert({
    inscription_id: ins.id,
    modele_version: MODELE_VERSION,
    statut: "envoye",
    yousign_request_id: resultat.requestId,
    yousign_signer_id: resultat.signerId,
    sign_url: resultat.signUrl,
  }).select("id").single();
  if (cErr) return json({ error: cErr.message }, 500);

  await admin.from("req_inscriptions").update({
    etat: "contrat_envoye", derniere_action_le: new Date().toISOString(),
  }).eq("id", ins.id);
  await admin.from("req_historique").insert({
    inscription_id: ins.id, acteur: adminEmail, action: "contrat_envoye",
    detail: { contrat_id: contrat.id, request_id: resultat.requestId },
  });

  // 4. E-mail au signataire (best-effort) avec le lien de signature.
  let email_envoye = false;
  if (RESEND_API_KEY && resultat.signUrl) {
    const html =
      `<p>Bonjour ${escapeHtml(ins.prenom)},</p>` +
      `<p>Votre dossier d'infirmière requérante AvisDoc est complet. Il ne reste qu'à signer ` +
      `votre convention de partenariat :</p>` +
      `<p><a href="${resultat.signUrl}">Signer ma convention</a></p>` +
      `<p>Vous pouvez aussi la signer depuis votre espace de suivi.</p>`;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: EMAIL_FROM, to: ins.email, subject: "Signez votre convention AvisDoc", html }),
      });
      email_envoye = res.ok;
      if (!res.ok) console.error("Resend:", res.status, await res.text().catch(() => ""));
    } catch (e) {
      console.error(e);
    }
  }

  return json({ contratId: contrat.id, signUrl: resultat.signUrl, email_envoye });
});
