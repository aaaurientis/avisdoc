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
const ALERTE_A = ["arthur@avisdoc.fr"];

/** Les postes qui décident d'une journée de dépistage, en français et en anglais. */
const TITRES = [
  "DRH", "Directeur des ressources humaines", "Directrice des ressources humaines", "Responsable des ressources humaines",
  "Responsable RH", "Chargé RH", "HR Director", "Head of HR", "HR Manager", "HR Business Partner",
  "Responsable QSE", "Responsable HSE", "Responsable QHSE", "Responsable sécurité", "Responsable prévention", "HSE Manager", "QHSE Manager", "Health and Safety Manager",
  "Directeur d'agence", "Directrice d'agence", "Responsable d'agence", "Chef d'agence", "Branch Manager",
  "Directeur général", "Directrice générale", "Gérant", "Gérante", "General Manager", "CEO",
];

/** Ce qu'une demande coûtera au plus, pour ne jamais dépasser le plafond. */
const ESTIMATION: Record<string, number> = { contacts: 2.5, contacts_plus: 2.5, mobile: 10 };


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

/** FullEnrich limite à 60 appels par minute : on s'arrête et on reprend au passage suivant. */
class LimiteDeDebit extends Error {
  constructor() {
    super("limite de débit FullEnrich");
  }
}

async function appeler(chemin: string, init?: RequestInit): Promise<any> {
  const r = await fetch(`${API}${chemin}`, {
    ...init,
    signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${CLE}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const corps = await r.json().catch(() => null);
  // « en cours » n'est pas une erreur : on relira au passage suivant.
  if (r.status === 400 && /in_progress/i.test(JSON.stringify(corps))) return { status: "IN_PROGRESS" };
  if (r.status === 429) throw new LimiteDeDebit();
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

/**
 * Le dirigeant de la fiche (registre, ou contact principal posé par Merx), s'il n'a pas
 * encore d'e-mail. « Jean Pierre MARTIN » : le nom est la partie en capitales. Une
 * société dirigeante (« HOLDING DUPONT SAS ») n'est pas une personne : on l'écarte.
 */
function dirigeantDe(p: any): { prenom: string; nom: string; complet: string } | null {
  const complet = String(p.leaders?.[0]?.name ?? p.contact_name ?? "").trim();
  if (!complet || /\b(sas|sasu|sarl|sa|sci|eurl|holding|groupe|societe|soci[ée]t[ée])\b/i.test(complet)) return null;
  const deja = ((p.personnes ?? []) as { nom: string; email?: string | null }[]).find((q) => q.nom?.trim().toLowerCase() === complet.toLowerCase());
  if (deja?.email || (p.contact_email && String(p.contact_name ?? "").trim().toLowerCase() === complet.toLowerCase())) return null;
  const mots = complet.split(/\s+/);
  if (mots.length < 2) return null;
  const capitales = mots.filter((m) => m.length > 1 && m === m.toUpperCase());
  const nom = capitales.length && capitales.length < mots.length ? capitales.join(" ") : mots[mots.length - 1];
  const prenom = mots.filter((m) => !nom.split(" ").includes(m))[0] ?? mots[0];
  return { prenom, nom, complet };
}

/** Les personnes que FullEnrich nous a déjà données sur la fiche, pour ne pas les redemander. */
const dejaSurLaFiche = (p: any): Set<string> =>
  new Set([p.contact_name, ...((p.personnes ?? []) as { nom: string }[]).map((q) => q.nom)].filter(Boolean).map((n: string) => n.trim().toLowerCase()));

/** Étape 1 : chercher 2 personnes aux bons postes, puis demander leur e-mail pro. */
async function lancerContacts(sb: SupabaseClient, l: Ligne): Promise<{ credits: number; message?: string; fini?: boolean }> {
  const { data: p } = await sb.from("admin_prospects").select("*").eq("id", l.prospect_id).maybeSingle();
  if (!p) return { credits: 0, message: "Fiche introuvable.", fini: true };
  const domaine = domaineDe(p.website);
  // Les postes, dans les catégories que FullEnrich reconnaît (ses listes officielles) :
  // des intitulés en français (« DRH », « Responsable QSE ») ne ramenaient personne
  // (19/10, 58 fiches sur 58). Une recherche qui ne rend personne ne coûte rien : on
  // élargit donc par paliers, du plus précis au plus large.
  // Essai réel du 19/10 : par le NOM, « COLAS FRANCE » rend les RH de Colas France en
  // Normandie et « Bouygues Immobilier » son DRH ; par le SITE, colas.com rendait Mayotte
  // et le Moyen-Orient (toutes les filiales du monde), bouygues-immobilier.com personne.
  // Le nom d'abord, en France ; le site seulement en dernier recours.
  const parNom = { current_company_names: [{ value: nomSocieteDe(p), exact_match: false, exclude: false }] };
  const parSite = domaine ? { current_company_domains: [{ value: domaine, exact_match: true, exclude: false }] } : null;
  const enFrance = { person_locations: [{ value: "France", exact_match: false, exclude: false }] };
  const v = (xs: string[]) => xs.map((value) => ({ value, exclude: false }));
  // Les intitulés tels que les gens les écrivent sur leur profil : en français pour la
  // plupart des salariés en France, en anglais dans les grands groupes.
  const titres = { current_position_titles: TITRES.map((value) => ({ value, exact_match: false, exclude: false })) };
  const fonctions = { current_position_job_functions: v(["Human Resources", "Executive & Leadership", "Operations"]) };
  const niveaux = { current_position_seniority_level: v(["Owner", "Founder", "C-level", "Partner", "VP", "Head", "Director", "Manager"]) };
  const ville = p.registre?.agence && p.city ? { person_locations: [{ value: p.city, exact_match: false, exclude: false }] } : null;
  const paliers: Record<string, unknown>[] = [
    // Une agence : d'abord les gens de SA ville.
    ...(ville ? [{ ...parNom, ...titres, ...ville }] : []),
    { ...parNom, ...titres, ...enFrance },
    { ...parNom, ...fonctions, ...niveaux, ...enFrance },
    ...(parSite ? [{ ...parSite, ...titres, ...enFrance }] : []),
  ];
  let r: any = null;
  let credits = 0;
  for (const filtres of paliers) {
    r = await appeler("/people/search", { method: "POST", body: JSON.stringify({ limit: 2, offset: l.kind === "contacts_plus" ? 2 : 0, ...filtres }) });
    credits += Number(r?.metadata?.credits ?? 0) || 0.25 * (r?.people?.length ?? 0);
    if (r?.people?.length) break;
  }
  const deja = dejaSurLaFiche(p);
  const gens = ((r?.people ?? []) as any[]).filter((x) => x.full_name && !deja.has(String(x.full_name).trim().toLowerCase()));

  // Une petite entreprise (un domaine viticole, un artisan) n'a ni DRH ni QSE : la bonne
  // personne est son dirigeant, que la fiche connaît déjà par le registre. Si la
  // recherche n'a pas donné 2 personnes, on cherche aussi SON e-mail (19/10).
  const dirigeant = l.kind === "contacts" && gens.length < 2 ? dirigeantDe(p) : null;
  if (!gens.length && !dirigeant) {
    return { credits, message: "FullEnrich n’a trouvé personne pour cette entreprise, et la fiche n’a pas de dirigeant connu.", fini: true };
  }

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
      data: [
        ...gens.map((x) => ({
          first_name: x.first_name,
          last_name: x.last_name,
          ...(domaine ? { domain: domaine } : { company_name: nomSocieteDe(p) }),
          ...(x.social_profiles?.professional_network?.url ? { linkedin_url: x.social_profiles.professional_network.url } : {}),
          enrich_fields: ["contact.work_emails"],
          custom: { nom: String(x.full_name).trim() },
        })),
        ...(dirigeant
          ? [{
              first_name: dirigeant.prenom,
              last_name: dirigeant.nom,
              ...(domaine ? { domain: domaine } : { company_name: nomSocieteDe(p) }),
              enrich_fields: ["contact.work_emails"],
              custom: { nom: dirigeant.complet },
            }]
          : []),
      ],
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
  // Le dirigeant, s'il est le contact principal de la fiche et pas dans la liste : son
  // e-mail va dans la case du contact, seulement si elle est vide.
  for (const d of (r.data ?? []) as any[]) {
    const nom = String(d.custom?.nom ?? "").trim();
    const mail = d.contact_info?.most_probable_work_email;
    if (!nom || !mail?.email || ["INVALID", "INVALID_DOMAIN"].includes(mail.status)) continue;
    const { data: maj } = await sb
      .from("admin_prospects")
      .update({ contact_email: mail.email })
      .eq("id", l.prospect_id)
      .ilike("contact_name", nom)
      .is("contact_email", null)
      .select("id");
    if (maj?.length) trouves++;
  }
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

  // Mode « essai » (19/10) : comparer des variantes de recherche sur une vraie entreprise
  // et rendre ce que FullEnrich répond, sans rien écrire. 2 personnes au plus par
  // variante (0,25 crédit chacune). Déclenché à la main depuis le SQL Editor.
  const corps = (await req.json().catch(() => ({}))) as { essai?: { libelle: string; filtres: Record<string, unknown> }[] };
  if (Array.isArray(corps.essai)) {
    const sortie = [];
    for (const t of corps.essai.slice(0, 12)) {
      try {
        const r = await appeler("/people/search", { method: "POST", body: JSON.stringify({ limit: 2, ...t.filtres }) });
        sortie.push({
          libelle: t.libelle,
          total: r?.metadata?.total ?? null,
          credits: r?.metadata?.credits ?? null,
          personnes: ((r?.people ?? []) as any[]).map((x) => `${x.full_name} — ${x.employment?.current?.title ?? "?"} — ${x.employment?.current?.company?.name ?? "?"}`),
        });
      } catch (e) {
        sortie.push({ libelle: t.libelle, erreur: e instanceof Error ? e.message : String(e) });
      }
    }
    return json({ essai: sortie });
  }

  const mois = moisCle();
  const plafond = Number((await reglage(sb, "fullenrich_plafond_mensuel")) ?? 500) || 500;

  // D'abord lire ce qui est parti. Une erreur de lecture se retente au passage suivant ;
  // au bout d'un jour, la demande passe en échec mais GARDE sa réservation (elle a pu
  // être facturée).
  const { data: enCours } = await sb.from("admin_fullenrich").select("*").eq("statut", "enrichissement").order("created_at").limit(25);
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
  // Jusqu'à 12 fiches par minute (jusqu'à cinq appels chacune, sous les 60 par minute de FullEnrich).
  const { data: attente } = await sb.from("admin_fullenrich").select("*").eq("statut", "en_attente").order("created_at").limit(12);
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
      if (err instanceof LimiteDeDebit) {
        // Trop d'appels cette minute : la demande reprend sa place, sans réservation.
        await sb.from("admin_fullenrich").update({ statut: "en_attente", reserve: 0, mois: null }).eq("id", l.id).eq("statut", "lancement");
        break;
      }
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
