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

// Découpe une adresse libre (Pappers) en rue / code postal / ville pour Qonto.
// Repère le code postal FR (5 chiffres) : ce qui précède = rue, ce qui suit = ville.
function adresseQonto(adr?: string): Record<string, string> | undefined {
  const s = (adr ?? "").trim();
  if (!s) return undefined;
  const m = s.match(/\b(\d{5})\b/);
  if (!m || m.index === undefined) return { street_address: s, country_code: "FR" };
  const zip = m[1];
  const rue = s.slice(0, m.index).replace(/[,\s]+$/, "").trim();
  const ville = s.slice(m.index + zip.length).replace(/^[,\s]+/, "").trim();
  const out: Record<string, string> = { country_code: "FR", zip_code: zip };
  if (rue) out.street_address = rue;
  if (ville) out.city = ville;
  return out;
}

// Découpe un nom complet en prénom / nom (1er mot = prénom, le reste = nom).
function splitNom(full?: string): { prenom?: string; nom?: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { prenom: parts[0] };
  return { prenom: parts[0], nom: parts.slice(1).join(" ") };
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
  const { data: c, error: cErr } = await admin.from("admin_clients")
    .select("id, company, siren, adresse, email_facturation, jours, tarif, qonto_client_id")
    .eq("id", client_id).maybeSingle();
  // Erreur de lecture (souvent : colonnes qonto_client_id/email_facturation
  // absentes = migration 0008 non appliquée) → on la remonte telle quelle.
  if (cErr) return json({ error: "lecture client échouée (migration 0008 appliquée ?)", details: cErr.message }, 500);
  if (!c) return json({ error: "client introuvable dans admin_clients" }, 404);

  const digits = (x?: string) => (x ?? "").replace(/\D/g, "");
  const lower = (x?: string) => (x ?? "").trim().toLowerCase();

  // Cherche un client Qonto existant par SIREN (n° fiscal) ou par raison sociale.
  async function chercherClient(): Promise<{ id: string; name?: string } | null> {
    const r = await qonto("/clients?per_page=100");
    if (!r.ok) return null;
    const list = (r.data as any)?.clients ?? (r.data as any)?.data ?? [];
    const siren = digits(c!.siren);
    const f = list.find((cl: any) =>
      (siren && digits(cl.tax_identification_number) === siren) ||
      lower(cl.name) === lower(c!.company));
    return f ? { id: f.id, name: f.name } : null;
  }

  // Associe (id déjà connu → existant Qonto → sinon crée) et mémorise l'id.
  async function assurerClient(): Promise<{ id?: string; cree?: boolean; erreur?: unknown }> {
    if (c!.qonto_client_id) return { id: c!.qonto_client_id, cree: false };
    const existant = await chercherClient();
    if (existant) {
      await admin.from("admin_clients").update({ qonto_client_id: existant.id }).eq("id", c!.id);
      return { id: existant.id, cree: false };
    }
    // Contact référent (source unique) : prénom / nom saisis en 2 champs (0009).
    // Repli sur un découpage de `name` pour les contacts créés avant la migration.
    const { data: cts } = await admin.from("admin_client_contacts")
      .select("prenom, nom, name, email").eq("client_id", c!.id).limit(1);
    const ct = cts?.[0];
    const sp = splitNom(ct?.name);
    const prenom = ct?.prenom || sp.prenom || undefined;
    const nom = ct?.nom || sp.nom || undefined;
    const email = ct?.email || undefined;

    // Payload à plat (pas de wrapper) ; société => kind=company + name.
    const payload: Record<string, unknown> = {
      kind: "company",
      name: c!.company,
      first_name: prenom,
      last_name: nom,
      email: email || c!.email_facturation || undefined,
      tax_identification_number: c!.siren || undefined,
      vat_number: tvaFR(c!.siren),
      billing_address: adresseQonto(c!.adresse),
    };
    const r = await qonto("/clients", "POST", payload);
    if (!r.ok) return { erreur: r.data };
    const id = (r.data as any)?.client?.id ?? (r.data as any)?.data?.id ?? (r.data as any)?.id;
    if (id) await admin.from("admin_clients").update({ qonto_client_id: id }).eq("id", c!.id);
    return { id, cree: true };
  }

  // Statut sans rien modifier : lié, trouvé dans Qonto (non lié), ou absent.
  if (action === "statut_client") {
    if (c!.qonto_client_id) return json({ lie: true, id: c!.qonto_client_id });
    const trouve = await chercherClient();
    return json({ lie: false, trouve });
  }

  // Associer/créer explicitement.
  if (action === "associer_client" || action === "sync_client") {
    const r = await assurerClient();
    if (r.erreur) return json({ error: "création/association client Qonto refusée", qonto: r.erreur }, 400);
    return json({ ok: true, qonto_client_id: r.id, cree: r.cree });
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
