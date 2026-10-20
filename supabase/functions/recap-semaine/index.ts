// Le récap de la semaine — fonction planifiée, le vendredi à 19 h (heure de Paris).
//
// Olivier, 20/10 : « tous les vendredis soirs, un mail de récap à l'ensemble des
// associés d'AvisDoc ». Maquette validée (version 4) : quatre chiffres, les actions de
// la semaine avec la note de la fiche, la semaine suivante si quelque chose y est
// programmé, la prospection en résumé, les dépenses.
//
// Protégée comme le récap du soir : un secret tiré au hasard dans la base (migration
// 0074). La tâche passe le vendredi à 17 h et 18 h UTC ; seule celle qui tombe à 19 h à
// Paris envoie, une seule fois par semaine (la semaine est réservée en base AVANT
// l'envoi). `{ "essai": true }` envoie tout de suite à Olivier seul (olivier@audeger.fr), sans rien réserver, objet « [Essai] ».
//
// Ne dit que ce que la base contient : rien n'est estimé ni deviné. Les notes des
// fiches sont reprises mot pour mot.
//
// Le mail est fait de tableaux et de styles en ligne, en polices système : Outlook
// ignore les grilles CSS et les polices du web.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("RDV_FROM") ?? "AvisDoc <noreply@avisdoc.fr>";
const ADMIN = "https://admin.avisdoc.fr";

/** Les associés d'AvisDoc (Olivier, 20/10). */
const DESTINATAIRES = [
  "henry.pawin@avisdoc.fr",
  "laurent.boukobza@avisdoc.fr",
  "irene.lefondre@avisdoc.fr",
  "arthur.aurientis@avisdoc.fr",
  "stephan.nacer@avisdoc.fr",
];

/** Un essai ne va qu'à Olivier (20/10) : les associés ne reçoivent que le vrai récap du vendredi. */
const ESSAI_A = ["olivier@audeger.fr"];

/** Tarifs des modèles, en dollars par million de jetons : les mêmes que l'écran des coûts (src/admin/lib/couts.ts). */
const TARIFS: Record<string, { entree: number; sortie: number }> = {
  "claude-haiku-4-5": { entree: 1, sortie: 5 },
  "claude-sonnet-5": { entree: 2, sortie: 10 },
  "claude-opus-5": { entree: 5, sortie: 25 },
};
const TARIF_RECHERCHE_WEB = 10 / 1000;

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const echapper = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const QUOI: Record<string, string> = {
  appel: "Appel",
  email: "E-mail",
  rdv: "Rendez-vous",
  presentation: "Présentation",
  tache: "À faire",
  salon: "Salon",
  sms: "SMS ou WhatsApp",
  linkedin: "Message LinkedIn",
  devis: "Devis envoyé",
};
const COMMENT: Record<string, string> = { appel: "Téléphone", email: "E-mail", sms: "SMS", linkedin: "LinkedIn", devis: "E-mail" };
const MODE: Record<string, string> = { visio: "Visio", sur_place: "Sur place", chez_client: "Chez le client" };
const SECTEURS: Record<string, string> = {
  btp: "Travaux publics et BTP",
  espaces_verts: "Espaces verts",
  agriculture: "Agriculture et viticulture",
  collectivites: "Collectivités",
  sante_beaute: "Santé et beauté",
  autre: "Autre",
};

/** Les prénoms tels qu'on les écrit : l'adresse « stephan.nacer@ » est celle de Stéphane. */
const PRENOMS: Record<string, string> = { stephan: "Stéphane", irene: "Irène", henry: "Henry", laurent: "Laurent", arthur: "Arthur", olivier: "Olivier" };

/** « stephan.nacer@avisdoc.fr » → « Stéphane » : les associés se connaissent par leur prénom. */
const prenom = (email: string | null | undefined) => {
  const p = ((email ?? "").split("@")[0].split(/[.\-_]/)[0] ?? "").toLowerCase();
  return PRENOMS[p] ?? (p ? p[0].toUpperCase() + p.slice(1) : "—");
};

/** Le jour et l'heure à Paris, quel que soit le fuseau du serveur. */
function aParis(d: Date): { jour: string; heure: number } {
  const p = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { jour: `${v("year")}-${v("month")}-${v("day")}`, heure: Number(v("hour")) % 24 };
}

/** Minuit à Paris pour un jour « AAAA-MM-JJ », en instant UTC (même calcul que le récap du soir). */
function minuitParis(jour: string): Date {
  const midi = new Date(`${jour}T12:00:00Z`);
  const heureParis = aParis(midi).heure;
  let t = midi.getTime() - (heureParis - 12) * 3_600_000 - 12 * 3_600_000;
  const vu = aParis(new Date(t));
  t = vu.jour === jour ? t - vu.heure * 3_600_000 : t + (24 - vu.heure) * 3_600_000;
  return new Date(t);
}

/** « 2026-10-19 » + n jours. */
const plusJours = (jour: string, n: number) => new Date(Date.parse(`${jour}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const jourCourt = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", timeZone: "Europe/Paris" });
const jourLong = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Paris" });
const dateTitre = (jour: string) => new Date(`${jour}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
const dollars = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

interface Echange {
  id: string;
  kind: string;
  titre: string | null;
  au: string;
  created_at: string;
  prevu: boolean;
  traite_le: string | null;
  resultat: string | null;
  avec: string | null;
  par: string;
  detail: string | null;
  rdv_mode: string | null;
  deplace_de: string | null;
  prospect_id: string | null;
  client_id: string | null;
  account_id: string | null;
}

/** Toutes les lignes, page par page : le serveur n'en rend que 1 000 à la fois, et un total faux ne se voit pas. */
async function toutLire<T>(page: (de: number, a: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<{ data: T[]; error: null }> {
  const tout: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await page(de, de + 999);
    if (error) throw new Error(error.message);
    tout.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return { data: tout, error: null };
  }
}

/** Par lots de 200 identifiants : une requête par lot, toutes les lignes gardées. */
async function parLots(ids: string[], requete: (lot: string[]) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<{ data: unknown[] }> {
  const tout: unknown[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await requete(ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    tout.push(...(data ?? []));
  }
  return { data: tout };
}

// --- Le gabarit du mail : tableaux, styles en ligne, polices système. ---
const POLICE = "font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;";
const C = { encre: "#12202f", doux: "#55657a", ligne: "#dde4ea", bleu: "#1f9fd6", bleuPale: "#e6f5fc", corail: "#e2703a", corailPale: "#fdf0e8", vert: "#1b8a5a", vertPale: "#e5f5ec", gris: "#eef2f5" };
const PASTILLES: Record<string, [string, string]> = {
  Fait: [C.vertPale, C.vert],
  Annulé: [C.gris, C.doux],
  Déplacé: [C.bleuPale, C.bleu],
  Prévu: [C.bleuPale, C.bleu],
  "Pas fait": [C.corailPale, C.corail],
};
const pastille = (etat: string) => {
  const [fond, texte] = PASTILLES[etat] ?? [C.gris, C.doux];
  return `<span style="display:inline-block;background:${fond};color:${texte};font-weight:700;font-size:12px;border-radius:999px;padding:1px 8px;white-space:nowrap">${etat}</span>`;
};
const th = (t: string, droite = false) =>
  `<th style="${POLICE}text-align:${droite ? "right" : "left"};font-size:11px;color:${C.doux};font-weight:600;text-transform:uppercase;letter-spacing:.04em;padding:8px 10px 8px 0;border-bottom:1px solid ${C.ligne};white-space:nowrap">${t}</th>`;
const td = (t: string, style = "") =>
  `<td style="${POLICE}font-size:13px;color:${C.encre};padding:8px 10px 8px 0;border-bottom:1px solid ${C.ligne};vertical-align:top;${style}">${t}</td>`;
const titre = (t: string, chapo?: string) =>
  `<h3 style="${POLICE}font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${C.bleu};margin:28px 0 4px;font-weight:700">${t}</h3>` +
  (chapo ? `<p style="${POLICE}font-size:13px;color:${C.doux};margin:0 0 8px">${chapo}</p>` : "");
const tableau = (entetes: string, lignes: string[]) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">${entetes}${lignes.join("")}</table>`;
const sousTexte = (t: string) => `<br><span style="color:${C.doux};font-size:12px">${t}</span>`;

Deno.serve(async (req) => {
  const admin = createClient(URL, SERVICE);
  const { data: secret } = await admin.from("admin_secrets_internes").select("valeur").eq("cle", "recap_semaine").maybeSingle();
  if (!secret?.valeur || req.headers.get("x-secret") !== secret.valeur) return json({ error: "non autorisé" }, 401);
  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY non configurée" }, 500);
  const essai = Boolean(((await req.json().catch(() => ({}))) as { essai?: boolean }).essai);

  const maintenant = new Date();
  const { jour, heure: h } = aParis(maintenant);
  const jourSemaine = new Date(`${jour}T12:00:00Z`).getUTCDay(); // 0 dimanche … 5 vendredi
  // La semaine va du samedi au vendredi 19 h (Olivier, 20/10). Son vendredi : aujourd'hui
  // si l'on est vendredi avant 20 h, sinon le prochain (un essai en milieu de semaine).
  const vendrediJour = plusJours(jour, jourSemaine === 5 && h < 20 ? 0 : (5 - jourSemaine + 7) % 7 || 7);
  const dixNeufHeures = (j: string) => new Date(minuitParis(j).getTime() + 19 * 3_600_000);

  // La réservation : la semaine (son vendredi) d'un seul geste, comme le récap du soir.
  let rendre: () => Promise<unknown> = async () => {};
  if (!essai && (jourSemaine !== 5 || h !== 19)) return json({ ok: true, ignore: `pas vendredi 19 h à Paris (${jour}, ${h} h)` });
  const { data: avant, error: lecture } = await admin.from("admin_secrets_internes").select("valeur").eq("cle", "recap_semaine_dernier").maybeSingle();
  if (lecture) return json({ error: lecture.message }, 500);
  const precedent = avant?.valeur ?? "";
  if (!essai) {
    if (precedent.startsWith(`${vendrediJour}|`)) return json({ ok: true, ignore: "déjà envoyé cette semaine" });
    const reserve = `${vendrediJour}|${maintenant.toISOString()}`;
    const { data: pris, error: reservation } = await admin
      .from("admin_secrets_internes")
      .update({ valeur: reserve })
      .eq("cle", "recap_semaine_dernier")
      .eq("valeur", precedent)
      .select("cle");
    if (reservation) return json({ error: reservation.message }, 500);
    if (!pris?.length) return json({ ok: true, ignore: "un autre envoi est en cours" });
    rendre = async () => {
      await admin.from("admin_secrets_internes").update({ valeur: precedent }).eq("cle", "recap_semaine_dernier").eq("valeur", reserve);
    };
  }

  try {
    // La période : de l'envoi précédent (le vendredi d'avant, 19 h) à maintenant. Chaque
    // récap reprend exactement là où le précédent s'est arrêté : rien en double, rien perdu.
    const finSemaine = dixNeufHeures(vendrediJour);
    const vendrediPrecedent = dixNeufHeures(plusJours(vendrediJour, -7));
    const envoiPrecedent = precedent.includes("|") ? new Date(precedent.split("|")[1]) : null;
    const depuis =
      envoiPrecedent && !isNaN(envoiPrecedent.getTime()) && envoiPrecedent < maintenant && maintenant.getTime() - envoiPrecedent.getTime() < 10 * 86_400_000
        ? envoiPrecedent
        : vendrediPrecedent;
    const D = depuis.toISOString();
    const M = maintenant.toISOString();
    // Le planning de la semaine court jusqu'au vendredi 19 h (un essai en milieu de
    // semaine montre donc aussi ce qui reste prévu) ; la semaine suivante, sept jours de plus.
    const F = (finSemaine > maintenant ? finSemaine : maintenant).toISOString();
    // En heure de Paris : une semaine qui passe à l'heure d'hiver ne fait pas 168 heures.
    const FS = dixNeufHeures(plusJours(vendrediJour, 7)).toISOString();
    const COLONNES = "id, kind, titre, au, created_at, prevu, traite_le, resultat, avec, par, detail, rdv_mode, deplace_de, prospect_id, client_id, account_id";

    const [semaine, retard, prochaine, prospects, approfondis, demandes, fe, signes, rdvDeLaSemaine, reportees] = await Promise.all([
      // Ce qui était au planning de la semaine.
      toutLire<Echange>((de, a) => admin.from("admin_echanges").select(COLONNES).neq("kind", "note").gte("au", D).lt("au", F).order("au").order("id").range(de, a)),
      // Daté hors de la semaine, mais noté (fait) ou clos pendant — un rendez-vous de
      // novembre annulé aujourd'hui compris : sinon il ne paraîtrait dans aucun récap.
      toutLire<Echange>((de, a) =>
        admin
          .from("admin_echanges")
          .select(COLONNES)
          .neq("kind", "note")
          .or(`au.lt."${D}",au.gte."${F}"`)
          .or(`and(created_at.gte."${D}",created_at.lt."${M}",prevu.eq.false),and(traite_le.gte."${D}",traite_le.lt."${M}")`)
          .order("au")
          .order("id")
          .range(de, a),
      ),
      toutLire<Echange>((de, a) => admin.from("admin_echanges").select(COLONNES).neq("kind", "note").eq("prevu", true).is("traite_le", null).gte("au", F).lt("au", FS).order("au").order("id").range(de, a)),
      toutLire<{ sector: string | null }>((de, a) => admin.from("admin_prospects").select("sector").gte("created_at", D).lt("created_at", M).is("deleted_at", null).order("id").range(de, a)),
      toutLire<{ name: string; city: string | null; sector: string | null; score_total: number | null; rationale: string | null }>((de, a) =>
        admin.from("admin_prospects").select("name, city, sector, score_total, rationale").gte("enriched_at", D).lt("enriched_at", M).is("deleted_at", null).order("score_total", { ascending: false, nullsFirst: false }).order("id").range(de, a),
      ),
      // Dépenses : à la date où le travail s'est TERMINÉ.
      toutLire((de, a) => admin.from("admin_merx_demandes").select("kind, model, usage, request, status, found_count, requested_by").gte("finished_at", D).lt("finished_at", M).order("finished_at").order("id").range(de, a)),
      toutLire<{ credits: number | string }>((de, a) => admin.from("admin_fullenrich").select("credits").gte("traite_le", D).lt("traite_le", M).order("id").range(de, a)),
      // Signé dans la semaine, à la date de signature (du samedi au vendredi).
      // Plus celles datées du vendredi précédent mais saisies après son envoi de 19 h.
      admin
        .from("admin_accounts")
        .select("name")
        .is("deleted_at", null)
        .or(`and(signed_on.gt.${aParis(depuis).jour},signed_on.lte.${vendrediJour}),and(signed_on.eq.${aParis(depuis).jour},created_at.gte."${D}",created_at.lt."${M}")`),
      // Les rendez-vous PRIS dans la semaine, quelle que soit leur date et ce qu'ils sont
      // devenus : une annulation se lit dans le tableau des actions.
      toutLire<{ id: string }>((de, a) => admin.from("admin_echanges").select("id").eq("kind", "rdv").eq("prevu", true).gte("created_at", D).lt("created_at", M).order("id").range(de, a)),
      // Les reports qui ont fait quitter la semaine (historique 0074).
      toutLire<{ echange_id: string; de: string }>((de, a) =>
        admin.from("admin_echanges_reports").select("echange_id, de").gte("de", D).lt("de", F).gte("vers", F).order("de").order("id").range(de, a),
      ),
    ]);
    for (const r of [semaine, retard, prochaine, prospects, approfondis, demandes, fe, signes, rdvDeLaSemaine, reportees]) if (r.error) throw new Error(r.error.message);

    // Une action programmée puis faite donne deux lignes : la programmée, close, et la
    // faite. On ne garde que la faite (sauf une annulation, qui est son propre état).
    const garder = (e: Echange) => !(e.prevu && e.traite_le && e.resultat !== "Annulé");
    const dansLaSemaine = ((semaine.data ?? []) as Echange[]).filter(garder);
    const enRetard = ((retard.data ?? []) as Echange[]).filter(garder);
    const aVenir = (prochaine.data ?? []) as Echange[];

    // Les actions reportées hors de la semaine, encore à faire et toujours plus tard.
    const quitte = new Map<string, string>();
    for (const r of (reportees.data ?? []) as { echange_id: string; de: string }[]) if (!quitte.has(r.echange_id)) quitte.set(r.echange_id, r.de);
    const { data: lesReportees, error: errReportees } = quitte.size
      ? await admin.from("admin_echanges").select(COLONNES).in("id", [...quitte.keys()]).eq("prevu", true).is("traite_le", null).gte("au", F)
      : { data: [], error: null };
    if (errReportees) throw new Error(errReportees.message);
    const reporteesOuvertes = ((lesReportees ?? []) as Echange[]).map((e) => ({ ...e, deplace_de: quitte.get(e.id) ?? e.deplace_de }));

    // Les sociétés, d'un coup.
    const toutes = [...dansLaSemaine, ...enRetard, ...aVenir, ...reporteesOuvertes];
    const ids = (k: "prospect_id" | "client_id" | "account_id") => [...new Set(toutes.map((e) => e[k]).filter((x): x is string => !!x))];
    const [ps, cs, as] = await Promise.all([
      parLots(ids("prospect_id"), (lot) => admin.from("admin_prospects").select("id, name, converted_client_id").in("id", lot)),
      parLots(ids("client_id"), (lot) => admin.from("admin_clients").select("id, company").in("id", lot)),
      parLots(ids("account_id"), (lot) => admin.from("admin_accounts").select("id, name, client_id").in("id", lot)),
    ]);
    // Une même société, qu'elle soit encore prospect, au Pipeline ou cliente : l'affaire la relie.
    const affaireDe = new Map<string, string>([
      ...((ps.data ?? []) as { id: string; converted_client_id: string | null }[]).filter((x) => x.converted_client_id).map((x) => [x.id, x.converted_client_id!] as [string, string]),
      ...((as.data ?? []) as { id: string; client_id: string | null }[]).filter((x) => x.client_id).map((x) => [x.id, x.client_id!] as [string, string]),
    ]);
    const identite = (e: Echange) => {
      const id = e.prospect_id ?? e.client_id ?? e.account_id ?? "";
      return affaireDe.get(id) ?? id;
    };
    const noms = new Map<string, string>([
      ...((ps.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name] as [string, string]),
      ...((cs.data ?? []) as { id: string; company: string }[]).map((x) => [x.id, x.company] as [string, string]),
      ...((as.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name] as [string, string]),
    ]);
    const societe = (e: Echange) => noms.get(e.prospect_id ?? e.client_id ?? e.account_id ?? "") ?? "—";
    // L'intitulé d'une action libre (« Préparer la tournée ») ; pas « Appel prévu », qui ne dit rien de plus.
    const quoi = (e: Echange) => {
      const base = QUOI[e.kind] ?? e.kind;
      const t = (e.titre ?? "").trim();
      const generique = !t || t === base || /^(appel|e-?mail|mail|rendez-vous|présentation|à faire|salon|sms.*|message linkedin|devis.*|note)( prévue?)?$/i.test(t);
      return generique ? base : `${base}${sousTexte(echapper(t))}`;
    };
    const comment = (e: Echange) => (e.rdv_mode ? MODE[e.rdv_mode] ?? e.rdv_mode : COMMENT[e.kind] ?? "—");
    const etat = (e: Echange): string => {
      if (e.resultat === "Annulé") return "Annulé";
      if (!e.prevu || e.traite_le) return "Fait";
      // Une date passée sans compte rendu reste « Pas fait », même déplacée avant (le
      // report se lit dans la note).
      if (Date.parse(e.au) < maintenant.getTime()) return "Pas fait";
      return e.deplace_de ? "Déplacé" : "Prévu";
    };
    const note = (e: Echange) => {
      const morceaux = [e.resultat && e.resultat !== "Annulé" && e.resultat !== "Fait" ? `<strong>${echapper(e.resultat)}.</strong>` : "", e.detail?.trim() ? echapper(e.detail.trim()).replace(/\n/g, "<br>") : ""].filter(Boolean);
      if (e.deplace_de) morceaux.push(`<span style="color:${C.doux}">Déplacé du ${jourLong(e.deplace_de)}.</span>`);
      return morceaux.join(" ") || `<span style="color:${C.doux}">—</span>`;
    };

    // --- Les chiffres du haut ---
    // Un vrai contact (pas une tâche interne), fait cette semaine ou noté cette semaine
    // pour une date d'avant : compté une seule fois par société.
    const CONTACTS = new Set(["appel", "email", "rdv", "presentation", "sms", "linkedin", "devis"]);
    const faites = [...dansLaSemaine, ...enRetard].filter((e) => etat(e) === "Fait" && CONTACTS.has(e.kind));
    const contactees = new Set(faites.map(identite).filter(Boolean)).size;
    const rdvUniques = (rdvDeLaSemaine.data ?? []).length;
    const nbApprofondis = (approfondis.data ?? []).length;
    const nbSignes = (signes.data ?? []).length;

    // --- Les dépenses ---
    const parPoste = new Map<string, { n: number; cout: number; web: number }>();
    for (const d of (demandes.data ?? []) as { kind: string; model: string | null; usage: { inputTokens?: number; outputTokens?: number; webSearches?: number } | null }[]) {
      const t = TARIFS[d.model ?? "claude-haiku-4-5"] ?? TARIFS["claude-haiku-4-5"];
      const u = d.usage ?? {};
      const cout = ((u.inputTokens ?? 0) / 1e6) * t.entree + ((u.outputTokens ?? 0) / 1e6) * t.sortie + (u.webSearches ?? 0) * TARIF_RECHERCHE_WEB;
      const p = parPoste.get(d.kind) ?? { n: 0, cout: 0, web: 0 };
      p.n++;
      p.cout += cout;
      p.web += u.webSearches ?? 0;
      parPoste.set(d.kind, p);
    }
    const totalIA = [...parPoste.values()].reduce((s, p) => s + p.cout, 0);
    const creditsFE = ((fe.data ?? []) as { credits: number | string }[]).reduce((s, x) => s + Number(x.credits ?? 0), 0);

    // --- Le mail ---
    const tuile = (n: string, l: string, fond = C.bleuPale) =>
      `<td width="25%" style="padding:4px"><div style="background:${fond};border-radius:12px;padding:12px 14px"><div style="${POLICE}font-size:26px;font-weight:700;color:${C.encre};line-height:1">${n}</div><div style="${POLICE}font-size:12px;color:${C.doux};margin-top:5px">${l}</div></div></td>`;
    const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
    const tuiles = [
      tuile(String(nbApprofondis), nbApprofondis > 1 ? "dossiers approfondis" : "dossier approfondi"),
      tuile(String(contactees), contactees > 1 ? "sociétés contactées" : "société contactée"),
      tuile(String(rdvUniques), rdvUniques > 1 ? "rendez-vous pris" : "rendez-vous pris"),
      tuile(dollars(totalIA), "dépensés en IA", C.corailPale),
      ...(nbSignes ? [tuile(String(nbSignes), nbSignes > 1 ? "clients signés" : "client signé", C.vertPale)] : []),
    ];

    // Daté d'avant la semaine : on dit pourquoi il est là — noté, ou annulé, cette semaine.
    const pourquoi = (e: Echange) =>
      Date.parse(e.created_at) >= depuis.getTime() ? `noté le ${jourCourt(e.created_at)}` : e.traite_le ? `${e.resultat === "Annulé" ? "annulé" : "clos"} le ${jourCourt(e.traite_le)}` : "";
    const ligneAction = (e: Echange, retardee = false) =>
      `<tr>${td(`${retardee ? jourLong(e.au) : jourCourt(e.au)}${retardee ? sousTexte(pourquoi(e)) : ""}`, "white-space:nowrap;color:" + C.doux)}${td(`<strong>${echapper(societe(e))}</strong>`)}${td(prenom(e.par))}${td(quoi(e))}${td(comment(e))}${td(echapper(e.avec ?? "—"))}${td(pastille(etat(e)))}${td(note(e), "min-width:240px;line-height:1.5")}</tr>`;
    const ligneReportee = (e: Echange) =>
      `<tr>${td(jourCourt(e.deplace_de!), "white-space:nowrap;color:" + C.doux)}${td(`<strong>${echapper(societe(e))}</strong>`)}${td(prenom(e.par))}${td(quoi(e))}${td(comment(e))}${td(echapper(e.avec ?? "—"))}${td(pastille("Déplacé"))}${td(`Reporté au ${jourLong(e.au)}.`, "min-width:240px;line-height:1.5")}</tr>`;
    const actions = [
      ...dansLaSemaine.map((e) => ligneAction(e)),
      ...reporteesOuvertes.map(ligneReportee),
      ...enRetard.map((e) => ligneAction(e, true)),
    ];

    const sectionActions = actions.length
      ? titre("Les actions de la semaine", "Tout ce qui était au planning, et ce que chacun a noté dans la fiche.") +
        tableau(`<tr>${th("Jour")}${th("Société")}${th("Qui")}${th("Quoi")}${th("Comment")}${th("Avec")}${th("État")}${th("Résultat ou note")}</tr>`, actions)
      : titre("Les actions de la semaine") + `<p style="${POLICE}font-size:14px;color:${C.doux};margin:0">Aucune action au planning cette semaine.</p>`;

    const sectionSuivante = aVenir.length
      ? titre(`La semaine prochaine, du samedi ${dateTitre(plusJours(vendrediJour, 1))} au vendredi ${dateTitre(plusJours(vendrediJour, 7))}`, "Ce qui est déjà programmé.") +
        tableau(
          `<tr>${th("Jour")}${th("Société")}${th("Qui")}${th("Quoi")}${th("Comment")}${th("Avec")}${th("État")}</tr>`,
          aVenir.map((e) => `<tr>${td(jourCourt(e.au), "white-space:nowrap;color:" + C.doux)}${td(`<strong>${echapper(societe(e))}</strong>`)}${td(prenom(e.par))}${td(quoi(e))}${td(comment(e))}${td(echapper(e.avec ?? "—"))}${td(pastille(etat(e)))}</tr>`),
        )
      : "";

    // Prospection : les recherches, puis les fiches par secteur.
    const recherches = ((demandes.data ?? []) as { kind: string; request: string | null; found_count: number | null; requested_by: string | null }[]).filter(
      (d) => d.kind === "recherche" && d.request && !d.request.startsWith("Où on en est"),
    );
    const secteur = (s: string | null) => SECTEURS[(s ?? "").trim()] ?? ((s ?? "").trim() || "Sans secteur");
    const parSecteur = new Map<string, { nouvelles: number; approfondies: number }>();
    for (const p of (prospects.data ?? []) as { sector: string | null }[]) {
      const k = secteur(p.sector);
      const v = parSecteur.get(k) ?? { nouvelles: 0, approfondies: 0 };
      v.nouvelles++;
      parSecteur.set(k, v);
    }
    for (const p of (approfondis.data ?? []) as { sector: string | null }[]) {
      const k = secteur(p.sector);
      const v = parSecteur.get(k) ?? { nouvelles: 0, approfondies: 0 };
      v.approfondies++;
      parSecteur.set(k, v);
    }
    const totalNouvelles = [...parSecteur.values()].reduce((s, v) => s + v.nouvelles, 0);
    const reperes = ((approfondis.data ?? []) as { name: string; city: string | null; rationale: string | null }[]).slice(0, 3);
    const sectionProspection =
      recherches.length || parSecteur.size
        ? titre("Prospection et approfondissements", "Ce qu’on a cherché, ce qui est entré, ce que Merx a creusé.") +
          (recherches.length
            ? tableau(
                `<tr>${th("Recherche")}${th("Par")}${th("Trouvées", true)}</tr>`,
                recherches.map((d) => `<tr>${td(echapper(d.request!.replace(/^Recherche du panneau : /, "")))}${td(prenom(d.requested_by))}${td(String(d.found_count ?? 0), "text-align:right")}</tr>`),
              )
            : "") +
          (parSecteur.size
            ? `<div style="height:12px"></div>` +
              tableau(
                `<tr>${th("Secteur")}${th("Nouvelles fiches", true)}${th("Approfondies", true)}</tr>`,
                [
                  ...[...parSecteur].sort((a, b) => b[1].nouvelles - a[1].nouvelles).map(([k, v]) => `<tr>${td(echapper(k))}${td(String(v.nouvelles), "text-align:right")}${td(String(v.approfondies), "text-align:right")}</tr>`),
                  `<tr>${td("<strong>Total</strong>", "border-bottom:0")}${td(`<strong>${totalNouvelles}</strong>`, "text-align:right;border-bottom:0")}${td(`<strong>${nbApprofondis}</strong>`, "text-align:right;border-bottom:0")}</tr>`,
                ],
              )
            : "") +
          (reperes.length
            ? `<p style="${POLICE}font-size:13px;color:${C.doux};margin:12px 0 4px">Les dossiers les mieux notés de la semaine :</p>` +
              reperes.map((r) => `<p style="${POLICE}font-size:13px;color:${C.encre};margin:0 0 6px"><strong>${echapper(r.name)}</strong>${r.city ? ` (${echapper(r.city)})` : ""}${r.rationale ? ` : ${echapper(r.rationale.slice(0, 200))}` : ""}</p>`).join("")
            : "")
        : "";

    const POSTES: Record<string, string> = { approfondissement: "Merx, approfondissements", recherche: "Merx, recherches et résumés « Où on en est »", email: "Merx, e-mails rédigés", completion: "Merx, fiches complétées" };
    const lignesDepenses = [...parPoste]
      .filter(([, p]) => p.cout > 0)
      .sort((a, b) => b[1].cout - a[1].cout)
      .map(([k, p]) => `<tr>${td(POSTES[k] ?? `Merx, ${k}`)}${td(`${pluriel(p.n, "demande", "demandes")}${p.web ? `, ${pluriel(p.web, "recherche web", "recherches web")}` : ""}`, "color:" + C.doux)}${td(dollars(p.cout), "text-align:right;white-space:nowrap")}</tr>`);
    const sectionDepenses =
      titre("Les dépenses de la semaine") +
      tableau(`<tr>${th("Poste")}${th("Détail")}${th("Montant", true)}</tr>`, [
        ...lignesDepenses,
        `<tr>${td("<strong>Total IA</strong>")}${td("")}${td(`<strong>${dollars(totalIA)}</strong>`, "text-align:right;white-space:nowrap")}</tr>`,
        `<tr>${td("FullEnrich", "border-bottom:0")}${td("Interlocuteurs et e-mails", "color:" + C.doux + ";border-bottom:0")}${td(`${creditsFE.toLocaleString("fr-FR")} crédits`, "text-align:right;white-space:nowrap;border-bottom:0")}</tr>`,
      ]);

    const samediJour = plusJours(vendrediJour, -6);
    // « du 19 au 23 octobre », ou « du 28 septembre au 2 octobre » à cheval sur deux mois.
    const memeMois = samediJour.slice(0, 7) === vendrediJour.slice(0, 7);
    const du = memeMois ? String(Number(samediJour.slice(8))) : dateTitre(samediJour);
    const objet = `${essai ? "[Essai] " : ""}AvisDoc, semaine du ${du} au ${dateTitre(vendrediJour)} : ${pluriel(contactees, "société contactée", "sociétés contactées")}, ${pluriel(nbApprofondis, "dossier approfondi", "dossiers approfondis")}`;
    const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#eef2f5">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#eef2f5"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:860px;background:#ffffff;border-radius:14px"><tr><td style="padding:28px 32px">
${essai ? `<p style="${POLICE}font-size:13px;color:${C.corail};margin:0 0 12px"><strong>Essai, envoyé à vous seul :</strong> le vrai récap partira chaque vendredi à 19 h aux associés. Celui-ci couvre la semaine jusqu’à maintenant.</p>` : ""}
<h2 style="font-family:Georgia,'Times New Roman',serif;font-size:24px;color:${C.encre};margin:0 0 16px;font-weight:600">La semaine d’AvisDoc</h2>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>${tuiles.join("")}</tr></table>
${sectionActions}
${sectionSuivante}
${sectionProspection}
${sectionDepenses}
<p style="margin:28px 0 0"><a href="${ADMIN}" style="${POLICE}display:inline-block;background:${C.bleu};color:#ffffff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:999px;font-size:14px">Ouvrir l’admin AvisDoc</a></p>
<p style="${POLICE}font-size:12px;color:${C.doux};margin:20px 0 0;border-top:1px solid ${C.ligne};padding-top:12px">Récap envoyé chaque vendredi à 19 h aux associés d’AvisDoc. Il couvre la semaine du samedi au vendredi 19 h, à la suite exacte du précédent.</p>
</td></tr></table></td></tr></table></body></html>`;

    // Un mail par associé, chacun à son seul nom (Olivier, 20/10) : pas d'envoi groupé.
    // Envoyés d'un seul appel (lot Resend : un message distinct par destinataire) — pas de
    // limite de débit à franchir, et c'est tout ou rien : un échec rend la semaine.
    const envoi = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify((essai ? ESSAI_A : DESTINATAIRES).map((a) => ({ from: FROM, to: [a], subject: objet, html }))),
    });
    if (!envoi.ok) throw new Error(`Resend ${envoi.status} : ${await envoi.text()}`);
    return json({ ok: true, essai, objet, envoyes: (essai ? ESSAI_A : DESTINATAIRES).length, actions: actions.length, semaineSuivante: aVenir.length });
  } catch (e) {
    await rendre();
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
