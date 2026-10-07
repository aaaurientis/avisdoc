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
// Contrat standardisé : si un template Yousign est configuré, on l'utilise ;
// sinon repli sur le PDF généré (gabarit interne).
const YOUSIGN_TEMPLATE_ID = (Deno.env.get("YOUSIGN_TEMPLATE_ID") ?? "").trim();
const YOUSIGN_SIGNER_LABEL = (Deno.env.get("YOUSIGN_SIGNER_LABEL") ?? "Requérant").trim();

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

  // Champs du contrat préremplis depuis les informations de l'inscription.
  // Labels du template (sensibles à la casse) : civilite, name, surname,
  // profession, address, RPPS, birth_date, birth_place.
  const frDate = (iso: string) => { const [y, m, d] = String(iso).slice(0, 10).split("-"); return d && m && y ? `${d}/${m}/${y}` : ""; };
  const adresseComplete = [ins.adresse, [ins.code_postal, ins.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const champs = [
    { label: "civilite", text: ins.civilite ?? "" },
    { label: "name", text: ins.prenom ?? "" },
    { label: "surname", text: ins.nom ?? "" },
    { label: "profession", text: ins.profession ?? "Infirmier(ère)" },
    { label: "address", text: adresseComplete },
    { label: "RPPS", text: ins.rpps ?? "" },
    { label: "birth_date", text: ins.date_naissance ? frDate(ins.date_naissance) : "" },
    { label: "birth_place", text: ins.lieu_naissance ?? "" },
  ];

  // Garde-fou : avec un template, Yousign exige que tous les champs lecture seule
  // soient remplis. On refuse si les informations du requérant sont incomplètes.
  if (YOUSIGN_TEMPLATE_ID && champs.some((c) => !c.text.trim())) {
    return json({ error: "Informations du requérant incomplètes (civilité, naissance, adresse…). À compléter côté infirmière avant l'envoi." }, 409);
  }

  // 1. Envoie pour signature (Yousign, derrière l'interface).
  //    - Template configuré → document standardisé figé dans Yousign (recommandé).
  //    - Sinon → repli sur un PDF généré (gabarit interne).
  const titre = `Convention AvisDoc — ${ins.prenom} ${ins.nom}`;
  const signataire = { nom: ins.nom, prenom: ins.prenom, email: ins.email };
  let resultat;
  const modeleVersion = YOUSIGN_TEMPLATE_ID ? "yousign-template" : MODELE_VERSION;
  try {
    const service = creerYousign();
    if (YOUSIGN_TEMPLATE_ID) {
      resultat = await service.envoyerTemplate({
        titre,
        templateId: YOUSIGN_TEMPLATE_ID,
        signerLabel: YOUSIGN_SIGNER_LABEL,
        signataire,
        champs,
      });
    } else {
      const pdf = await genererContratPdf({ nom: ins.nom, prenom: ins.prenom, email: ins.email, rpps: ins.rpps });
      resultat = await service.envoyer({ titre, pdf, nomFichier: "convention-avisdoc.pdf", signataire, champ: SIGN_FIELD });
    }
  } catch (e) {
    console.error("Signature:", e);
    return json({ error: "Envoi à la signature impossible (configuration Yousign ?)." }, 502);
  }

  // 3. Enregistre le contrat et fait avancer l'inscription.
  const { data: contrat, error: cErr } = await admin.from("req_contrats").insert({
    inscription_id: ins.id,
    modele_version: modeleVersion,
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
