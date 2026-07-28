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

// Construit la billing_address Qonto. Utilise en priorité le code postal et la
// ville saisis explicitement (colonnes dédiées) ; à défaut, découpe l'adresse
// libre en repérant le code postal FR (5 chiffres).
function adresseQonto(adr?: string, cp?: string, ville?: string): Record<string, string> | undefined {
  const s = (adr ?? "").trim();
  const cpx = (cp ?? "").trim();
  const villex = (ville ?? "").trim();
  if (cpx || villex) {
    // Rue = adresse complète amputée du CP/ville s'ils y figurent.
    let rue = s;
    const m = s.match(/\b(\d{5})\b/);
    if (m && m.index !== undefined) rue = s.slice(0, m.index).replace(/[,\s]+$/, "").trim();
    const out: Record<string, string> = { country_code: "FR" };
    if (rue) out.street_address = rue;
    if (cpx) out.zip_code = cpx;
    if (villex) out.city = villex;
    return out;
  }
  if (!s) return undefined;
  const m = s.match(/\b(\d{5})\b/);
  if (!m || m.index === undefined) return { street_address: s, country_code: "FR" };
  const zip = m[1];
  const rue = s.slice(0, m.index).replace(/[,\s]+$/, "").trim();
  const villeParsed = s.slice(m.index + zip.length).replace(/^[,\s]+/, "").trim();
  const out: Record<string, string> = { country_code: "FR", zip_code: zip };
  if (rue) out.street_address = rue;
  if (villeParsed) out.city = villeParsed;
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

  // Vue « Clients Qonto » : tous les clients, montant facturé par année et
  // montant des devis en cours. Source de vérité : Qonto (3 listes paginées).
  if (action === "apercu_clients") {
    // Liste paginée générique (clients / client_invoices / quotes).
    async function toutes(path: string, cle: string): Promise<any[]> {
      const out: any[] = [];
      let page = 1;
      for (let i = 0; i < 20; i++) { // garde-fou 20 pages (2000 lignes)
        const r = await qonto(`${path}?per_page=100&page=${page}`);
        if (!r.ok) break;
        const d = r.data as any;
        const rows = d?.[cle] ?? d?.data ?? [];
        out.push(...rows);
        const next = d?.meta?.next_page;
        if (!next) break;
        page = Number(next);
      }
      return out;
    }

    const [clients, factures, devis] = await Promise.all([
      toutes("/clients", "clients"),
      toutes("/client_invoices", "client_invoices"),
      toutes("/quotes", "quotes"),
    ]);

    const montant = (x: any): number =>
      Number(x?.total_amount?.value ?? x?.amount?.value ?? x?.total_amount ?? 0) || 0;

    // Détail par client : lignes factures + devis (l'agrégation FY / YTD se
    // fait côté front, qui a besoin des dates ligne à ligne).
    const parClient: Record<string, { factures: any[]; devis: any[] }> = {};
    const entree = (id: string) => (parClient[id] ??= { factures: [], devis: [] });

    for (const f of factures) {
      const cid = f?.client_id ?? f?.client?.id;
      if (!cid) continue;
      entree(cid).factures.push({
        id: f.id,
        numero: f.invoice_number ?? f.number ?? null,
        date: f.issue_date ?? String(f.created_at ?? "").slice(0, 10) ?? null,
        statut: String(f.status ?? "").toLowerCase(),
        montant: montant(f),
      });
    }
    for (const q of devis) {
      const cid = q?.client_id ?? q?.client?.id;
      if (!cid) continue;
      entree(cid).devis.push({
        id: q.id,
        numero: q.quote_number ?? q.number ?? null,
        date: q.issue_date ?? String(q.created_at ?? "").slice(0, 10) ?? null,
        statut: String(q.status ?? "").toLowerCase(),
        montant: montant(q),
      });
    }

    return json({
      ok: true,
      clients: clients.map((cl: any) => {
        const ba = cl.billing_address ?? {};
        return {
          id: cl.id,
          name: cl.name ?? [cl.first_name, cl.last_name].filter(Boolean).join(" "),
          tax_id: cl.tax_identification_number ?? null,
          email: cl.email ?? null,
          rue: ba.street_address ?? null,
          code_postal: ba.zip_code ?? null,
          ville: ba.city ?? null,
          ...entree(cl.id),
        };
      }),
    });
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

  // Télécharger le PDF d'un devis : récupéré À LA DEMANDE depuis Qonto (le
  // PDF est généré en asynchrone — il n'est pas dans la réponse de création),
  // mis en cache dans le bucket admin-devis, puis servi en URL signée.
  if (action === "telecharger_devis") {
    if (!devis_id) return json({ error: "devis_id requis" }, 400);
    const { data: d } = await admin.from("admin_devis")
      .select("id, client_id, qonto_quote_id, pdf_path").eq("id", devis_id).maybeSingle();
    if (!d) return json({ error: "devis introuvable" }, 404);

    const signer = async (chemin: string) => {
      const { data: s } = await admin.storage.from("admin-devis").createSignedUrl(chemin, 3600);
      return s?.signedUrl ?? null;
    };

    // 1) Déjà en cache dans le Storage.
    if (d.pdf_path) {
      const url = await signer(d.pdf_path);
      if (url) return json({ ok: true, url });
    }

    if (!d.qonto_quote_id) return json({ error: "devis sans identifiant Qonto" }, 400);

    // 2) Relire le devis chez Qonto et chercher l'URL du PDF.
    const r = await qonto(`/quotes/${d.qonto_quote_id}`);
    if (!r.ok) return json({ error: "lecture du devis Qonto refusée", qonto: r.data }, 400);
    const q = (r.data as any)?.quote ?? r.data;
    let pdfUrl: string | undefined =
      q?.pdf_url ?? q?.invoice_url ?? q?.attachment?.url ?? q?.attachment?.file_url;
    // 3) À défaut, via la pièce jointe (GET /attachments/{id} → url temporaire).
    const attId = q?.attachment_id ?? q?.attachment?.id;
    if (!pdfUrl && attId) {
      const ra = await qonto(`/attachments/${attId}`);
      if (ra.ok) {
        const a = (ra.data as any)?.attachment ?? ra.data;
        pdfUrl = a?.url ?? a?.file_url;
      }
    }
    if (!pdfUrl) return json({ error: "PDF pas encore disponible chez Qonto — réessaie dans quelques secondes.", qonto: q }, 404);

    // 4) Rapatrier + mettre en cache + servir.
    const bin = new Uint8Array(await (await fetch(pdfUrl)).arrayBuffer());
    const chemin = `${d.client_id}/${d.qonto_quote_id}.pdf`;
    const { error: upErr } = await admin.storage.from("admin-devis")
      .upload(chemin, bin, { contentType: "application/pdf", upsert: true });
    if (upErr) return json({ error: "stockage du PDF échoué", details: upErr.message }, 500);
    await admin.from("admin_devis").update({ pdf_path: chemin }).eq("id", d.id);
    const url = await signer(chemin);
    return json({ ok: true, url });
  }

  if (!client_id) return json({ error: "client_id requis" }, 400);
  const { data: c, error: cErr } = await admin.from("admin_clients")
    .select("id, company, siren, siret, adresse, code_postal, ville, email_facturation, jours, tarif, qonto_client_id")
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
    // Comparaison sur les 9 premiers chiffres : Qonto peut stocker un SIRET (14)
    // ou un SIREN (9), notre référence est le SIREN.
    const siren = digits(c!.siren).slice(0, 9) || digits(c!.siret).slice(0, 9);
    const f = list.find((cl: any) =>
      (siren && digits(cl.tax_identification_number).slice(0, 9) === siren) ||
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
    // Contact retenu = le « référent » (rôle contenant « référent »), à défaut
    // le 1er contact. Prénom / nom saisis en 2 champs (0009) ; repli sur un
    // découpage de `name` pour les contacts créés avant la migration.
    const { data: cts } = await admin.from("admin_client_contacts")
      .select("prenom, nom, name, email, role").eq("client_id", c!.id);
    const liste = cts ?? [];
    const ct = liste.find((x: any) => /r[ée]f[ée]rent/i.test(x.role ?? "")) ?? liste[0];
    const sp = splitNom(ct?.name);
    const prenom = ct?.prenom || sp.prenom || undefined;
    const nom = ct?.nom || sp.nom || undefined;
    const email = ct?.email || undefined;

    // Payload à plat (pas de wrapper) ; société => kind=company + name.
    // locale + currency : exigés ensuite pour créer un devis sur ce client.
    const payload: Record<string, unknown> = {
      kind: "company",
      name: c!.company,
      locale: "fr",
      currency: "EUR",
      first_name: prenom,
      last_name: nom,
      email: email || c!.email_facturation || undefined,
      // SIRET (14 ch.) en priorité — Qonto valide automatiquement l'entreprise ;
      // repli sur le SIREN (9 ch.) si le SIRET n'est pas connu.
      tax_identification_number: digits(c!.siret) || digits(c!.siren) || undefined,
      vat_number: tvaFR(c!.siren),
      billing_address: adresseQonto(c!.adresse, c!.code_postal, c!.ville),
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

    // Rattrapage : les clients créés avant n'ont ni locale ni currency, que
    // Qonto exige pour émettre un devis. Complétion best-effort (idempotent).
    await qonto(`/clients/${cl.id}`, "PATCH", { locale: "fr", currency: "EUR" }).catch(() => {});

    const jours = Number(c!.jours) || 1;
    const tarif = Number(c!.tarif) || 0;
    const today = new Date().toISOString().slice(0, 10);
    const exp = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    // Payload à plat (pas de wrapper `quote`) — comme pour la création de
    // client, Qonto ignore l'enveloppe et réclame sinon tous les champs.
    const devis = {
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
