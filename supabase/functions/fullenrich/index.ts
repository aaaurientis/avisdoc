// FullEnrich — les interlocuteurs d'une fiche et leurs coordonnées, dans un plafond.
//
// Olivier, 19/10 :
//   - à chaque recherche Merx, 2 interlocuteurs utiles par fiche, avec leur e-mail pro ;
//   - « Chercher 2 autres contacts », une seule fois par fiche ;
//   - le mobile seulement pour un vrai client (fiche au Pipeline ou dans Clients), à la demande ;
//   - plafond FIXE de 500 crédits par mois : au-delà, plus rien ne part, et une alerte
//     demande de débloquer (réglage `fullenrich_plafond_mensuel`).
//
// File d'attente : table admin_fullenrich (migration 0072). Une tâche planifiée appelle
// cette fonction chaque minute avec un secret tiré dans la base, comme les rappels.
// FullEnrich répond en 30 à 90 secondes : une demande part à un passage, son résultat
// est lu à un passage suivant.
//
// Documentation suivie (19/10) : https://docs.fullenrich.com/api/v2 — people/search
// (synchrone, 0,25 crédit par personne rendue), contact/enrich/bulk (asynchrone, 1 crédit
// par e-mail pro trouvé, 10 par mobile, rien si rien n'est trouvé).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLE = Deno.env.get("FULLENRICH_API_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("RDV_FROM") ?? "AvisDoc <noreply@avisdoc.fr>";
const API = "https://app.fullenrich.com/api/v2";

/** Qui est prévenu quand le plafond approche ou est atteint. */
const ALERTE_A = ["arthur@avisdoc.fr", "olivier@avisdoc.fr"];

/** Ce qu'une demande coûtera au plus, pour ne jamais dépasser le plafond. */
const ESTIMATION: Record<string, number> = { contacts: 2.5, contacts_plus: 2.5, mobile: 10 };

/** Les postes qu'on cherche : ceux qui décident d'une journée de dépistage. */
const POSTES = [
  "DRH",
  "Directeur des ressources humaines",
  "Responsable des ressources humaines",
  "Responsable RH",
  "Responsable QSE",
  "Responsable HSE",
  "Responsable sécurité",
  "Responsable prévention",
  "Directeur d'agence",
  "Responsable d'agence",
  "Directeur général",
  "Gérant",
];

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

interface Ligne {
  id: string;
  created_at: string;
  prospect_id: string;
  kind: "contacts" | "contacts_plus" | "mobile";
  statut: string;
  personne: string | null;
  enrichment_id: string | null;
  credits: number | null;
  demande_par: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

async function appeler(chemin: string, init?: RequestInit): Promise<any> {
  const r = await fetch(`${API}${chemin}`, {
    ...init,
    signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${CLE}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const corps = await r.json().catch(() => null);
  // « en cours » n'est pas une erreur : on relira au passage suivant.
  if (r.status === 400 && /in_progress/i.test(JSON.stringify(corps))) return { status: "IN_PROGRESS" };
  if (!r.ok) throw new Error(`FullEnrich ${r.status} : ${JSON.stringify(corps)?.slice(0, 200)}`);
  return corps;
}

const moisCle = () => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" }).format(new Date());

async function reglage(sb: SupabaseClient, cle: string): Promise<string | null> {
  const { data } = await sb.from("admin_secrets_internes").select("valeur").eq("cle", cle).maybeSingle();
  return (data?.valeur as string | undefined) ?? null;
}

async function poser(sb: SupabaseClient, cle: string, valeur: string) {
  await sb.from("admin_secrets_internes").upsert({ cle, valeur });
}

async function alerter(sb: SupabaseClient, cle: string, sujet: string, texte: string) {
  // Une seule alerte de chaque sorte par mois.
  if ((await reglage(sb, cle)) === moisCle() || !RESEND_API_KEY) return;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: ALERTE_A, subject: sujet, html: `<p style="font-family:Arial,sans-serif;font-size:14px;color:#16283C;">${texte}</p>` }),
  });
  if (r.ok) await poser(sb, cle, moisCle());
}

const nomSocieteDe = (p: any): string => (p.legal_name || p.name || "").trim();

/**
 * Modifier les personnes d'une fiche sans écraser ce qu'on y écrit en même temps à
 * l'écran : on relit, on applique, et l'on n'écrit que si la fiche n'a pas bougé entre-
 * temps (date de mise à jour) ; sinon on recommence, trois fois au plus.
 */
async function majPersonnes(sb: SupabaseClient, prospectId: string, changer: (avant: any[]) => any[]): Promise<void> {
  for (let essai = 0; essai < 3; essai++) {
    const { data: p, error } = await sb.from("admin_prospects").select("personnes, updated_at").eq("id", prospectId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!p) return;
    const { data: ecrit, error: e2 } = await sb
      .from("admin_prospects")
      .update({ personnes: changer([...((p.personnes ?? []) as any[])]) })
      .eq("id", prospectId)
      .eq("updated_at", p.updated_at)
      .select("id");
    if (e2) throw new Error(e2.message);
    if (ecrit?.length) return;
  }
  throw new Error("La fiche a changé pendant l'écriture : ce sera repris au passage suivant.");
}
const domaineDe = (site: string | null): string | null => {
  if (!site) return null;
  try {
    return new globalThis.URL(site.startsWith("http") ? site : `https://${site}`).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

/** Les personnes que FullEnrich nous a déjà données sur la fiche, pour ne pas les redemander. */
const dejaSurLaFiche = (p: any): Set<string> =>
  new Set([p.contact_name, ...((p.personnes ?? []) as { nom: string }[]).map((q) => q.nom)].filter(Boolean).map((n: string) => n.trim().toLowerCase()));

/** Étape 1 : chercher 2 personnes aux bons postes, puis demander leur e-mail pro. */
async function lancerContacts(sb: SupabaseClient, l: Ligne): Promise<{ credits: number; message?: string; fini?: boolean }> {
  const { data: p } = await sb.from("admin_prospects").select("*").eq("id", l.prospect_id).maybeSingle();
  if (!p) return { credits: 0, message: "Fiche introuvable.", fini: true };
  const domaine = domaineDe(p.website);
  const recherche: Record<string, unknown> = {
    limit: 2,
    offset: l.kind === "contacts_plus" ? 2 : 0,
    current_position_titles: POSTES.map((value) => ({ value, exact_match: false, exclude: false })),
    ...(domaine
      ? { current_company_domains: [{ value: domaine, exact_match: true, exclude: false }] }
      : { current_company_names: [{ value: nomSocieteDe(p), exact_match: false, exclude: false }] }),
    // Une agence : les gens de SA ville, pas ceux du siège.
    ...(p.registre?.agence && p.city ? { person_locations: [{ value: p.city, exact_match: false, exclude: false }] } : {}),
  };
  const r = await appeler("/people/search", { method: "POST", body: JSON.stringify(recherche) });
  const credits = Number(r?.metadata?.credits ?? 0) || 0.25 * (r?.people?.length ?? 0);
  const deja = dejaSurLaFiche(p);
  const gens = ((r?.people ?? []) as any[]).filter((x) => x.full_name && !deja.has(String(x.full_name).trim().toLowerCase()));
  if (!gens.length) return { credits, message: "FullEnrich n’a trouvé personne à ces postes pour cette entreprise.", fini: true };

  // On range tout de suite les personnes (nom, poste) ; l'e-mail arrivera ensuite.
  const nouvelles = gens.map((x) => ({
    nom: String(x.full_name).trim(),
    fonction: x.employment?.current?.title ?? null,
    email: null,
    telephone: null,
    mobile: null,
    source: x.social_profiles?.professional_network?.url ?? "FullEnrich",
    sur: true,
  }));
  // La recherche est payée : on l'inscrit tout de suite, même si la suite échoue.
  await sb.from("admin_fullenrich").update({ credits }).eq("id", l.id);
  await majPersonnes(sb, p.id, (avant) => {
    const noms = new Set(avant.map((x) => String(x.nom ?? "").trim().toLowerCase()));
    return [...avant, ...nouvelles.filter((n) => !noms.has(n.nom.toLowerCase()))];
  });

  const e = await appeler("/contact/enrich/bulk", {
    method: "POST",
    body: JSON.stringify({
      name: `AvisDoc ${p.name}`,
      data: gens.map((x) => ({
        first_name: x.first_name,
        last_name: x.last_name,
        ...(domaine ? { domain: domaine } : { company_name: nomSocieteDe(p) }),
        ...(x.social_profiles?.professional_network?.url ? { linkedin_url: x.social_profiles.professional_network.url } : {}),
        enrich_fields: ["contact.work_emails"],
        custom: { nom: String(x.full_name).trim() },
      })),
    }),
  });
  await sb.from("admin_fullenrich").update({ enrichment_id: e.enrichment_id, statut: "enrichissement" }).eq("id", l.id);
  return { credits };
}

/** Mobile d'une personne de la fiche (vrai client seulement : vérifié à l'enregistrement). */
async function lancerMobile(sb: SupabaseClient, l: Ligne): Promise<{ credits: number; message?: string; fini?: boolean }> {
  const { data: p } = await sb.from("admin_prospects").select("*").eq("id", l.prospect_id).maybeSingle();
  if (!p || !l.personne) return { credits: 0, message: "Personne introuvable sur la fiche.", fini: true };
  // Le mobile coûte dix fois un e-mail : réservé aux vrais clients (au Pipeline ou dans Clients).
  const { data: affaire } = p.converted_client_id
    ? await sb.from("admin_clients").select("id, deleted_at").eq("id", p.converted_client_id).maybeSingle()
    : { data: null };
  if (!affaire || affaire.deleted_at) return { credits: 0, message: "Le mobile est réservé aux fiches au Pipeline ou dans Clients.", fini: true };
  const q = ((p.personnes ?? []) as any[]).find((x) => x.nom?.trim().toLowerCase() === l.personne!.trim().toLowerCase());
  const [prenom, ...reste] = l.personne.trim().split(/\s+/);
  const domaine = domaineDe(p.website);
  const linkedin = typeof q?.source === "string" && q.source.includes("linkedin.com") ? q.source : null;
  const e = await appeler("/contact/enrich/bulk", {
    method: "POST",
    body: JSON.stringify({
      name: `AvisDoc mobile ${l.personne}`,
      data: [
        {
          first_name: prenom,
          last_name: reste.join(" "),
          ...(domaine ? { domain: domaine } : { company_name: nomSocieteDe(p) }),
          ...(linkedin ? { linkedin_url: linkedin } : {}),
          enrich_fields: ["contact.phones"],
          custom: { nom: l.personne.trim() },
        },
      ],
    }),
  });
  await sb.from("admin_fullenrich").update({ enrichment_id: e.enrichment_id, statut: "enrichissement" }).eq("id", l.id);
  return { credits: 0 };
}

/** Étape 2 : lire le résultat et le ranger sur la fiche — sans rien écraser de saisi. */
async function lireResultat(sb: SupabaseClient, l: Ligne): Promise<{ credits: number; message?: string; fini: boolean }> {
  const r = await appeler(`/contact/enrich/bulk/${l.enrichment_id}`);
  if (["CREATED", "IN_PROGRESS"].includes(r?.status)) return { credits: 0, fini: false };
  if (r?.status !== "FINISHED") return { credits: Number(r?.cost?.credits ?? 0), message: `FullEnrich : ${r?.status ?? "réponse inattendue"}.`, fini: true };

  let trouves = 0;
  await majPersonnes(sb, l.prospect_id, (personnes) => {
    trouves = 0;
    for (const d of (r.data ?? []) as any[]) {
      const nom = String(d.custom?.nom ?? d.input?.full_name ?? "").trim().toLowerCase();
      const q = personnes.find((x) => String(x.nom ?? "").trim().toLowerCase() === nom);
      if (!q) continue;
      // On remplit ce qui est vide, jamais ce qui est saisi.
      const mail = d.contact_info?.most_probable_work_email;
      if (!q.email && mail?.email && !["INVALID", "INVALID_DOMAIN"].includes(mail.status)) {
        q.email = mail.email;
        trouves++;
      }
      const tel = d.contact_info?.most_probable_phone;
      if (l.kind === "mobile" && !q.mobile && tel?.number) {
        q.mobile = tel.number;
        trouves++;
      }
    }
    return personnes;
  });
  return {
    credits: Number(r.cost?.credits ?? 0),
    message: trouves ? undefined : l.kind === "mobile" ? "Aucun mobile trouvé (rien n’a été facturé)." : "Aucun e-mail trouvé (rien n’a été facturé).",
    fini: true,
  };
}

Deno.serve(async (req) => {
  const sb = createClient(URL, SERVICE);
  const { data: secret } = await sb.from("admin_secrets_internes").select("valeur").eq("cle", "fullenrich").maybeSingle();
  if (!secret?.valeur || req.headers.get("x-secret") !== secret.valeur) return json({ error: "non autorisé" }, 401);
  if (!CLE) return json({ error: "FULLENRICH_API_KEY non configurée" }, 500);

  const mois = moisCle();
  const plafond = Number((await reglage(sb, "fullenrich_plafond_mensuel")) ?? 500) || 500;

  // D'abord lire ce qui est parti. Une erreur de lecture se retente au passage suivant ;
  // au bout d'un jour, la demande passe en échec mais GARDE sa réservation (elle a pu
  // être facturée).
  const { data: enCours } = await sb.from("admin_fullenrich").select("*").eq("statut", "enrichissement").order("created_at").limit(20);
  for (const l of (enCours ?? []) as Ligne[]) {
    try {
      const r = await lireResultat(sb, l);
      if (!r.fini) continue;
      await sb.from("admin_fullenrich").update({ statut: "termine", credits: (Number(l.credits) || 0) + r.credits, reserve: 0, message: r.message ?? null, traite_le: new Date().toISOString() }).eq("id", l.id);
    } catch (e) {
      if (Date.now() - new Date(l.created_at).getTime() > 24 * 3_600_000) {
        await sb.from("admin_fullenrich").update({ statut: "echec", message: e instanceof Error ? e.message : String(e), traite_le: new Date().toISOString() }).eq("id", l.id);
      }
    }
  }

  // Puis lancer ce qui attend, chaque demande réservée dans le plafond AVANT de partir
  // (fonction SQL fullenrich_reserver, un passage à la fois).
  const { data: attente } = await sb.from("admin_fullenrich").select("*").eq("statut", "en_attente").order("created_at").limit(20);
  let lances = 0;
  for (const l of (attente ?? []) as Ligne[]) {
    const { data: reponse, error: e } = await sb.rpc("fullenrich_reserver", { p_id: l.id, p_cout: ESTIMATION[l.kind] ?? 10, p_mois: mois });
    if (e) return json({ error: e.message }, 500);
    if (reponse === "plafond") {
      await alerter(sb, "fullenrich_alerte_plafond", "AvisDoc — plafond FullEnrich atteint",
        `Le plafond de ${plafond} crédits FullEnrich est atteint pour ce mois : les recherches de contacts sont bloquées. Pour le relever, l'administrateur change le réglage « fullenrich_plafond_mensuel ».`);
      continue;
    }
    if (reponse !== "ok") continue;
    try {
      const r = l.kind === "mobile" ? await lancerMobile(sb, l) : await lancerContacts(sb, l);
      lances++;
      if (r.fini) {
        await sb.from("admin_fullenrich").update({ statut: "termine", credits: r.credits, reserve: 0, message: r.message ?? null, traite_le: new Date().toISOString() }).eq("id", l.id);
      }
    } catch (err) {
      // La réservation reste : une partie a pu être facturée. Les crédits déjà sûrs sont inscrits.
      await sb.from("admin_fullenrich").update({ statut: "echec", message: err instanceof Error ? err.message : String(err), traite_le: new Date().toISOString() }).eq("id", l.id);
    }
  }

  const { data: duMois } = await sb.from("admin_fullenrich").select("credits, reserve").eq("mois", mois);
  const engage = (duMois ?? []).reduce((s, x) => s + (Number(x.credits) || 0) + (Number(x.reserve) || 0), 0);
  if (engage >= plafond * 0.8) {
    await alerter(sb, "fullenrich_alerte_80", "AvisDoc — 80 % du plafond FullEnrich",
      `Ce mois-ci, ${Math.round(engage)} crédits FullEnrich sur ${plafond} sont utilisés ou réservés.`);
  }
  return json({ ok: true, lances, engage: Math.round(engage * 100) / 100, plafond });
});
