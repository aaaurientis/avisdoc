/* eslint-disable @typescript-eslint/no-explicit-any */
// Edge Function : conversion d'un document Office en PDF pour l'aperçu intégré.
//
// Utilise un service LibreOffice AUTO-HÉBERGÉ (Gotenberg) — aucun fichier n'est
// envoyé à un tiers. Le PDF est mis en cache dans le bucket `admin-documents`
// (colonne admin_documents.preview_path) : la conversion n'a lieu qu'une fois.
//
// Secrets requis (Supabase → Edge Functions → Secrets) :
//   GOTENBERG_URL        ex. https://gotenberg.mon-infra.fr   (obligatoire)
//   GOTENBERG_USER       (optionnel — si le service est derrière Basic Auth)
//   GOTENBERG_PASSWORD   (optionnel)
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY sont injectés automatiquement.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BUCKET = "admin-documents";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // 1. Contrôle du domaine appelant (@avisdoc.fr) via son JWT.
    const authHeader = req.headers.get("Authorization") ?? "";
    const asUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u } = await asUser.auth.getUser();
    const email = u.user?.email ?? "";
    if (!email.toLowerCase().endsWith("@avisdoc.fr")) {
      return json({ error: "Accès réservé aux comptes @avisdoc.fr." }, 403);
    }

    const { id } = await req.json();
    if (!id) return json({ error: "id manquant." }, 400);

    // 2. Accès privilégié (service role) pour lire le Storage et écrire la table.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: doc, error: docErr } = await admin
      .from("admin_documents")
      .select("id, name, storage_path, preview_path")
      .eq("id", id)
      .maybeSingle();
    if (docErr) throw docErr;
    if (!doc?.storage_path) return json({ error: "Document introuvable." }, 404);

    // 3. Déjà converti ? On renvoie une URL signée du PDF en cache.
    if (doc.preview_path) {
      const { data: signed } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(doc.preview_path, 3600);
      if (signed?.signedUrl) return json({ url: signed.signedUrl, cached: true });
    }

    // 4. Sinon : conversion via Gotenberg (LibreOffice auto-hébergé).
    const gotenberg = Deno.env.get("GOTENBERG_URL");
    if (!gotenberg) {
      return json({ error: "Convertisseur non configuré (GOTENBERG_URL absent)." }, 501);
    }

    const dl = await admin.storage.from(BUCKET).download(doc.storage_path);
    if (dl.error || !dl.data) throw dl.error ?? new Error("Téléchargement du fichier échoué.");

    const form = new FormData();
    form.append("files", dl.data, doc.name || "document");

    const headers: Record<string, string> = {};
    const gUser = Deno.env.get("GOTENBERG_USER");
    const gPass = Deno.env.get("GOTENBERG_PASSWORD");
    if (gUser && gPass) headers["Authorization"] = "Basic " + btoa(`${gUser}:${gPass}`);

    const conv = await fetch(
      `${gotenberg.replace(/\/$/, "")}/forms/libreoffice/convert`,
      { method: "POST", body: form, headers },
    );
    if (!conv.ok) {
      const txt = await conv.text().catch(() => "");
      return json({ error: `Conversion échouée (${conv.status}). ${txt.slice(0, 200)}` }, 502);
    }
    const pdf = new Uint8Array(await conv.arrayBuffer());

    // 5. Mise en cache du PDF + mémorisation du chemin.
    const previewPath = `${id}/preview.pdf`;
    const up = await admin.storage
      .from(BUCKET)
      .upload(previewPath, pdf, { upsert: true, contentType: "application/pdf" });
    if (up.error) throw up.error;

    await admin.from("admin_documents").update({ preview_path: previewPath }).eq("id", id);

    const { data: signed } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(previewPath, 3600);
    return json({ url: signed?.signedUrl ?? null, cached: false });
  } catch (e) {
    console.error(e);
    return json({ error: (e as any)?.message ?? "Erreur interne." }, 500);
  }
});
