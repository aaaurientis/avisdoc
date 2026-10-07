// Edge Function : webhook Yousign (RI-07, idempotent).
//
// À la fin de signature : télécharge le contrat signé + le dossier de preuve,
// les archive dans le bucket privé req-contrats, passe le contrat en « signe »
// et l'inscription en « active ». Refus / expiration renvoient l'inscription en
// « pret_a_signer » pour un nouvel envoi.
//
// Public (verify_jwt = false) mais l'authenticité est vérifiée par signature
// HMAC-SHA256 du corps brut (secret YOUSIGN_WEBHOOK_SECRET). Chaque événement
// n'est traité qu'une fois (table req_yousign_events).
//
// Secrets : YOUSIGN_WEBHOOK_SECRET, YOUSIGN_API_KEY (+ YOUSIGN_BASE_URL).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { creerYousign } from "../_shared/signature.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("YOUSIGN_WEBHOOK_SECRET");

// Vérifie la signature HMAC-SHA256 du corps brut (header X-Yousign-Signature-256).
async function signatureValide(raw: string, header: string | null): Promise<boolean> {
  if (!WEBHOOK_SECRET || !header) return false;
  const attendu = header.replace(/^sha256=/, "").trim().toLowerCase();
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const calcule = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (calcule.length !== attendu.length) return false;
  let diff = 0;
  for (let i = 0; i < calcule.length; i++) diff |= calcule.charCodeAt(i) ^ attendu.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  const raw = await req.text();
  const sigHeader = req.headers.get("X-Yousign-Signature-256") ?? req.headers.get("x-yousign-signature-256");
  if (!(await signatureValide(raw, sigHeader))) {
    return json({ error: "signature invalide" }, 401);
  }

  let body: any;
  try { body = JSON.parse(raw); } catch { return json({ error: "corps invalide" }, 400); }

  const eventName: string = body.event_name ?? body.eventName ?? "";
  const sr = body.data?.signature_request ?? body.data?.signatureRequest ?? {};
  const requestId: string = sr.id ?? "";
  const eventId: string =
    body.event_id ?? body.eventId ?? `${requestId}:${eventName}:${body.event_time ?? body.eventTime ?? ""}`;
  if (!requestId || !eventName) return json({ ok: true, ignore: "payload incomplet" });

  const admin = createClient(SB_URL, SERVICE);

  // Idempotence : on n'enregistre qu'une fois par événement (RI-07).
  const { error: dupErr } = await admin.from("req_yousign_events").insert({ event_id: eventId });
  if (dupErr) return json({ ok: true, deja_traite: true }); // clé primaire → déjà vu

  // Contrat correspondant.
  const { data: contrat } = await admin
    .from("req_contrats").select("*").eq("yousign_request_id", requestId).maybeSingle();
  if (!contrat) return json({ ok: true, ignore: "contrat inconnu" });

  const nowIso = new Date().toISOString();

  if (eventName === "signature_request.done") {
    // Archive le signé + la preuve (best-effort pour la preuve).
    let signedPath: string | null = null;
    let preuvePath: string | null = null;
    try {
      const service = creerYousign();
      const signe = await service.telechargerSigne(requestId);
      signedPath = `${contrat.inscription_id}/${contrat.id}/contrat-signe.pdf`;
      await admin.storage.from("req-contrats").upload(signedPath, signe.contenu, {
        contentType: "application/pdf", upsert: true,
      });
      if (contrat.yousign_signer_id) {
        const preuve = await service.telechargerPreuve(requestId, contrat.yousign_signer_id);
        if (preuve) {
          preuvePath = `${contrat.inscription_id}/${contrat.id}/preuve.pdf`;
          await admin.storage.from("req-contrats").upload(preuvePath, preuve.contenu, {
            contentType: "application/pdf", upsert: true,
          });
        }
      }
    } catch (e) {
      console.error("Archivage Yousign:", e);
    }

    await admin.from("req_contrats").update({
      statut: "signe", signe_le: nowIso, sign_url: null,
      signed_path: signedPath, preuve_path: preuvePath,
    }).eq("id", contrat.id);
    await admin.from("req_inscriptions").update({ etat: "active", derniere_action_le: nowIso })
      .eq("id", contrat.inscription_id).eq("etat", "contrat_envoye");
    await admin.from("req_historique").insert({
      inscription_id: contrat.inscription_id, acteur: "systeme", action: "contrat_signe",
      detail: { contrat_id: contrat.id },
    });
    return json({ ok: true, etat: "active" });
  }

  if (eventName === "signature_request.refused" || eventName === "signer.refused") {
    await admin.from("req_contrats").update({ statut: "refuse", sign_url: null }).eq("id", contrat.id);
    await admin.from("req_inscriptions").update({ etat: "pret_a_signer", derniere_action_le: nowIso })
      .eq("id", contrat.inscription_id).eq("etat", "contrat_envoye");
    await admin.from("req_historique").insert({
      inscription_id: contrat.inscription_id, acteur: "systeme", action: "contrat_refuse",
      detail: { contrat_id: contrat.id },
    });
    return json({ ok: true, etat: "pret_a_signer" });
  }

  if (eventName === "signature_request.expired") {
    await admin.from("req_contrats").update({ statut: "expire", sign_url: null }).eq("id", contrat.id);
    await admin.from("req_inscriptions").update({ etat: "pret_a_signer", derniere_action_le: nowIso })
      .eq("id", contrat.inscription_id).eq("etat", "contrat_envoye");
    await admin.from("req_historique").insert({
      inscription_id: contrat.inscription_id, acteur: "systeme", action: "contrat_expire",
      detail: { contrat_id: contrat.id },
    });
    return json({ ok: true, etat: "pret_a_signer" });
  }

  return json({ ok: true, ignore: eventName });
});
