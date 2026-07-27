// Passerelle Qonto (devis) — appelée depuis le back-office admin.
// Garde-fous : appelant @avisdoc.fr ; clé secrète Qonto jamais exposée au front.
// Auth Qonto : en-tête Authorization = "{login}:{secret}" LITTÉRAL (pas de Base64).
//
// Actions : "diag" (valide les identifiants), "sync_client" (crée/associe le
// client Qonto), "creer_devis" (devis depuis l'offre financière + PDF).
//
// NB : les payloads clients/devis Qonto ne sont pas documentés publiquement en
// détail — les erreurs Qonto sont renvoies telles quelles (champ `qonto`) pour
// ajuster les noms de champs au 1er appel réel.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const Q_LOGIN = (Deno.env.get("QONTO_LOGIN") ?? "").trim();
const Q_SECRET = (Deno.env.get("QONTO_SECRET_KEY") ?? "").trim();
const Q_BASE = (Deno.env.get("QONTO_BASE") ?? "https://thirdparty.qonto.com/v2").replace(/\/$/, "");
const TVA = 0.20;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// N° de TVA intracommunautaire FR calculé depuis le SIREN (clients pros).
function tvaFR(siren?: string): string | undefined {
  const s = (siren ?? "").replace(/\D/g, "");
  if (s.length !== 9) return undefined;
  const cle = (12 + 3 * (Number(s) % 97)) % 97;
  return `FR${String(cle).padStart(2, "0")}${s}`;
}

// Appel Qonto générique. Renvoie { ok, status, data|text }.
async function qonto(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${Q_BASE}${path}`, {
    method,
    headers: {
      Authorization: `${Q_LOGIN}:${Q_SECRET}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let data: unknown = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  return { ok: res.ok, status: res.status, data };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const asUser = createClient(URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: u } = await asUser.auth.getUser();
  if (!u?.user) return json({ error: "non authentifié" }, 401);
  if (!(u.user.email ?? "").toLowerCase().endsWith("@avisdoc.fr"))
    return json({ error: "réservé aux comptes @avisdoc.fr" }, 403);

  if (!Q_LOGIN || !Q_SECRET) return json({ error: "QONTO_LOGIN / QONTO_SECRET_KEY manquants" }, 500);

  const { action, client_id, devis_id } = await req.json().catch(() => ({}));
  const admin = createClient(URL, SERVICE);

  // 1) Valider les identifiants sans rien créer.
  if (action === "diag") {
    const r = await qonto("/organization");
    return json({ ok: r.ok, status: r.status, organisation: r.ok ? (r.data as any)?.organization?.slug ?? "ok" : undefined, qonto: r.ok ? undefined : r.data });
  }

  // Supprimer un devis : Qonto (best-effort) + PDF + ligne locale.
  if (action === "supprimer_devis") {
    if (!devis_id) return json({ error: "devis_id requis" }, 400);
    const { data: d } = await admin.from("admin_devis")
      .select("qonto_quote_id, pdf_path").eq("id", devis_id).maybeSingle();
    if (d?.qonto_quote_id) await qonto(`/quotes/${d.qonto_quote_id}`, "DELETE").catch(() => {});
    if (d?.pdf_path) await admin.storage.from("admin-devis").remove([d.pdf_path]);
    await admin.from("admin_devis").delete().eq("id", devis_id);
    return json({ ok: true });
  }

  if (!client_id) return json({ error: "client_id requis" }, 400);
  const { data: c } = await admin.from("admin_clients")
    .select("id, company, siren, adresse, email_facturation, jours, tarif, qonto_client_id")
    .eq("id", client_id).maybeSingle();
  if (!c) return json({ error: "client introuvable" }, 404);

  // 2) Crée le client Qonto s'il n'existe pas encore, et mémorise son id.
  async function assurerClient(): Promise<{ id?: string; erreur?: unknown }> {
    if (c!.qonto_client_id) return { id: c!.qonto_client_id };
    const payload = {
      client: {
        name: c!.company,
        type: "company",
        email: c!.email_facturation || undefined,
        tax_identification_number: c!.siren || undefined,
        vat_number: tvaFR(c!.siren),
        billing_address: c!.adresse ? { street_address: c!.adresse, country_code: "FR" } : undefined,
        locale: "FR",
        currency: "EUR",
      },
    };
    const r = await qonto("/clients", "POST", payload);
    if (!r.ok) return { erreur: r.data };
    const id = (r.data as any)?.client?.id ?? (r.data as any)?.id;
    if (id) await admin.from("admin_clients").update({ qonto_client_id: id }).eq("id", c!.id);
    return { id };
  }

  if (action === "sync_client") {
    const r = await assurerClient();
    if (r.erreur) return json({ error: "création client Qonto refusée", qonto: r.erreur }, 400);
    return json({ ok: true, qonto_client_id: r.id });
  }

  if (action === "creer_devis") {
    const cl = await assurerClient();
    if (cl.erreur || !cl.id) return json({ error: "client Qonto indisponible", qonto: cl.erreur }, 400);

    const jours = Number(c!.jours) || 1;
    const tarif = Number(c!.tarif) || 0;
    const today = new Date().toISOString().slice(0, 10);
    const exp = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const devis = {
      quote: {
        client_id: cl.id,
        issue_date: today,
        expiry_date: exp,
        currency: "EUR",
        items: [{
          title: "Journée de dépistage dermatologique",
          quantity: String(jours),
          unit_price: { value: String(tarif), currency: "EUR" },
          vat_rate: String(TVA),
        }],
      },
    };
    const r = await qonto("/quotes", "POST", devis);
    if (!r.ok) return json({ error: "création devis Qonto refusée", qonto: r.data }, 400);

    const q = (r.data as any)?.quote ?? r.data;
    const numero = q?.number ?? q?.quote_number ?? null;

    // PDF : Qonto expose souvent une URL (pdf_url / invoice_url / attachment.url).
    const pdfUrl: string | undefined =
      q?.pdf_url ?? q?.invoice_url ?? q?.attachment?.url ?? q?.attachment?.file_url;
    let pdf_path: string | null = null;
    if (pdfUrl) {
      try {
        const bin = new Uint8Array(await (await fetch(pdfUrl)).arrayBuffer());
        pdf_path = `${c!.id}/${q?.id ?? crypto.randomUUID()}.pdf`;
        await admin.storage.from("admin-devis").upload(pdf_path, bin, { contentType: "application/pdf", upsert: true });
      } catch { /* PDF best-effort */ }
    }

    const { data: row } = await admin.from("admin_devis").insert({
      client_id: c!.id, qonto_quote_id: q?.id ?? null, numero,
      montant_ht: jours * tarif, montant_ttc: jours * tarif * (1 + TVA),
      statut: q?.status ?? "brouillon", pdf_path,
    }).select("id").single();

    return json({ ok: true, devis_id: row?.id, numero, pdf: !!pdf_path });
  }

  return json({ error: "action inconnue" }, 400);
});
