// Le récap du soir — fonction planifiée, 19 h (heure de Paris), tous les jours.
//
// Olivier, 19/10 : « tous les soirs à 19 h, un mail de récap de tout ce qui s'est
// passé sur AvisDoc Admin ». Pour l'instant à Arthur seul. Aujourd'hui, c'est la
// partie commerciale (Merx, Prospection, Pipeline, Clients, Planning, Débrief) ; ce
// qu'on développera ensuite (communication, veille…) s'ajoutera ici, section par section.
//
// Protégée comme les rappels : un secret tiré au hasard dans la base (migration 0071),
// que la tâche planifiée envoie et que la fonction compare. La tâche passe à 17 h et à
// 18 h UTC ; seule celle qui tombe à 19 h à Paris envoie (heure d'été comme d'hiver),
// et jamais deux fois le même jour : le jour est réservé en base AVANT l'envoi.
//
// Le récap couvre tout depuis le précédent : rien de ce qui se passe après 19 h ne se perd.
//
// Ne dit que ce que la base contient : rien n'est estimé ni deviné.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("RDV_FROM") ?? "AvisDoc <noreply@avisdoc.fr>";
const HUB = "https://admin.avisdoc.fr/admin.html#";

/** Qui reçoit le récap. Olivier, 19/10 : Arthur seul pour l'instant. */
const DESTINATAIRES = ["arthur@avisdoc.fr"];

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const echapper = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const NOMS: Record<string, string> = {
  appel: "Appel",
  email: "Mail",
  rdv: "Rendez-vous",
  presentation: "Présentation",
  tache: "À faire",
  salon: "Salon",
  sms: "SMS ou WhatsApp",
  linkedin: "Message LinkedIn",
  devis: "Devis envoyé",
  note: "Note",
};

/** « stephane.martin@avisdoc.fr » → « Stephane Martin ». */
const qui = (email: string | null | undefined) =>
  (email ?? "").includes("@")
    ? email!.split("@")[0].split(/[.\-_]/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(" ")
    : email || "—";

/** L'heure et le jour à Paris, quel que soit le fuseau du serveur. */
function aParis(d: Date): { jour: string; heure: number } {
  const p = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { jour: `${v("year")}-${v("month")}-${v("day")}`, heure: Number(v("hour")) % 24 };
}

/** Minuit à Paris pour un jour « AAAA-MM-JJ », en instant UTC. */
function minuitParis(jour: string): Date {
  // On part de midi UTC ce jour-là, et on corrige du décalage de Paris à cette date…
  const midi = new Date(`${jour}T12:00:00Z`);
  const heureParis = aParis(midi).heure; // 13 (hiver) ou 14 (été)
  let t = midi.getTime() - (heureParis - 12) * 3_600_000 - 12 * 3_600_000;
  // … puis on recale : un jour de changement d'heure, le décalage de minuit n'est pas celui de midi.
  const vu = aParis(new Date(t));
  t = vu.jour === jour ? t - vu.heure * 3_600_000 : t + (24 - vu.heure) * 3_600_000;
  return new Date(t);
}

const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

Deno.serve(async (req) => {
  const admin = createClient(URL, SERVICE);
  const { data: secret } = await admin.from("admin_secrets_internes").select("valeur").eq("cle", "recap_du_soir").maybeSingle();
  if (!secret?.valeur || req.headers.get("x-secret") !== secret.valeur) return json({ error: "non autorisé" }, 401);
  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY non configurée" }, 500);

  const maintenant = new Date();
  const { jour, heure: h } = aParis(maintenant);
  // La tâche passe deux fois (17 h et 18 h UTC) : seule celle de 19 h à Paris envoie.
  if (h !== 19) return json({ ok: true, ignore: `il est ${h} h à Paris` });

  // Le dernier récap : « jour|instant ». On réserve AUJOURD'HUI d'un seul geste
  // (mise à jour conditionnelle) : deux appels simultanés ne peuvent pas passer tous
  // les deux. Si l'envoi échoue, on rend la place pour que le passage suivant réessaie.
  const { data: avant, error: lecture } = await admin.from("admin_secrets_internes").select("valeur").eq("cle", "recap_du_soir_dernier").maybeSingle();
  if (lecture) return json({ error: lecture.message }, 500);
  const precedent = avant?.valeur ?? "";
  if (precedent.startsWith(`${jour}|`)) return json({ ok: true, ignore: "déjà envoyé aujourd'hui" });
  const reserve = `${jour}|${maintenant.toISOString()}`;
  const { data: pris, error: reservation } = await admin
    .from("admin_secrets_internes")
    .update({ valeur: reserve })
    .eq("cle", "recap_du_soir_dernier")
    .eq("valeur", precedent)
    .select("cle");
  if (reservation) return json({ error: reservation.message }, 500);
  if (!pris?.length) return json({ ok: true, ignore: "un autre envoi est en cours" });
  const rendre = () => admin.from("admin_secrets_internes").update({ valeur: precedent }).eq("cle", "recap_du_soir_dernier").eq("valeur", reserve);

  // Depuis le récap précédent (s'il date de moins de deux jours), sinon les dernières 24 h.
  const depuisPrecedent = precedent.includes("|") ? new Date(precedent.split("|")[1]) : null;
  const du =
    depuisPrecedent && !isNaN(depuisPrecedent.getTime()) && maintenant.getTime() - depuisPrecedent.getTime() < 48 * 3_600_000
      ? depuisPrecedent
      : new Date(maintenant.getTime() - 24 * 3_600_000);
  const debutDuJour = minuitParis(jour);
  const demain = minuitParis(aParis(new Date(debutDuJour.getTime() + 36 * 3_600_000)).jour);
  const apresDemain = minuitParis(aParis(new Date(demain.getTime() + 36 * 3_600_000)).jour);
  const entre = (a: Date, b: Date) => [a.toISOString(), b.toISOString()] as const;
  const [d0, d1] = entre(du, maintenant);

  const [faites, programmees, aDemain, nouveauxProspects, approfondis, demandes, affaires, clients, notes, jeteesP, jeteesA, jeteesC] = await Promise.all([
    // Ce qui a été NOTÉ depuis le dernier récap (même si l'action avait eu lieu avant).
    admin.from("admin_echanges").select("kind, titre, resultat, au, par, avec, prospect_id, client_id, account_id").eq("prevu", false).gte("created_at", d0).lt("created_at", d1).order("au").limit(5000),
    admin.from("admin_echanges").select("id").eq("prevu", true).gte("created_at", d0).lt("created_at", d1).limit(5000),
    admin.from("admin_echanges").select("kind, titre, au, par, avec, rdv_mode, prospect_id, client_id, account_id").eq("prevu", true).is("traite_le", null).gte("au", demain.toISOString()).lt("au", apresDemain.toISOString()).order("au"),
    admin.from("admin_prospects").select("name, city, found_by, owner_email, deleted_at").gte("created_at", d0).lt("created_at", d1),
    admin.from("admin_prospects").select("name").gte("enriched_at", d0).lt("enriched_at", d1),
    admin.from("admin_merx_demandes").select("kind, request, status, found_count, requested_by").eq("kind", "recherche").gte("created_at", d0).lt("created_at", d1).order("created_at"),
    admin.from("admin_clients").select("company, stage, referent").gte("created_at", d0).lt("created_at", d1),
    admin.from("admin_accounts").select("name").gte("created_at", d0).lt("created_at", d1),
    admin.from("admin_notes_dictees").select("owner_email, statut").gte("created_at", d0).lt("created_at", d1),
    admin.from("admin_prospects").select("name").gte("deleted_at", d0).lt("deleted_at", d1),
    admin.from("admin_clients").select("company").gte("deleted_at", d0).lt("deleted_at", d1),
    admin.from("admin_accounts").select("name").gte("deleted_at", d0).lt("deleted_at", d1),
  ]);
  const erreur = [faites, programmees, aDemain, nouveauxProspects, approfondis, demandes, affaires, clients, notes, jeteesP, jeteesA, jeteesC].find((r) => r.error)?.error;
  if (erreur) return json({ error: erreur.message }, 500);

  type Action = { kind: string; titre: string; resultat?: string | null; au: string; par: string; avec: string | null; rdv_mode?: string | null; prospect_id: string | null; client_id: string | null; account_id: string | null };
  const actionsFaites = (faites.data ?? []) as Action[];
  const actionsDemain = (aDemain.data ?? []) as Action[];

  // Le nom des fiches concernées, en trois requêtes.
  const toutes = [...actionsFaites, ...actionsDemain];
  const ids = (cle: "prospect_id" | "client_id" | "account_id") => [...new Set(toutes.map((a) => a[cle]).filter((v): v is string => Boolean(v)))];
  const [np, nc, na] = await Promise.all([
    ids("prospect_id").length ? admin.from("admin_prospects").select("id, name").in("id", ids("prospect_id")) : { data: [] },
    ids("client_id").length ? admin.from("admin_clients").select("id, company").in("id", ids("client_id")) : { data: [] },
    ids("account_id").length ? admin.from("admin_accounts").select("id, name").in("id", ids("account_id")) : { data: [] },
  ]);
  const nom = new Map<string, string>();
  for (const r of (np.data ?? []) as { id: string; name: string }[]) nom.set(r.id, r.name);
  for (const r of (nc.data ?? []) as { id: string; company: string }[]) nom.set(r.id, r.company);
  for (const r of (na.data ?? []) as { id: string; name: string }[]) nom.set(r.id, r.name);
  const ficheDe = (a: Action) => nom.get(a.client_id ?? a.prospect_id ?? a.account_id ?? "") ?? "";

  // ── Le mail ────────────────────────────────────────────────────────────────
  const titre = (t: string) => `<h2 style="font-size:16px;margin:22px 0 8px;color:#16283C;">${echapper(t)}</h2>`;
  const liste = (lignes: string[]) =>
    lignes.length ? `<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.55;">${lignes.map((l) => `<li>${l}</li>`).join("")}</ul>` : `<p style="font-size:14px;color:#6b7a88;margin:0;">Rien aujourd’hui.</p>`;
  const ligneAction = (a: Action, avecHeure = true) =>
    [
      avecHeure ? `<strong>${heure(a.au)}</strong>` : "",
      echapper(NOMS[a.kind] ?? a.kind),
      ficheDe(a) ? `— ${echapper(ficheDe(a))}` : "",
      // Le titre, quand il dit quelque chose de plus que le genre (« Préparer la tournée »).
      a.titre && !a.titre.endsWith("prévu") && a.titre !== NOMS[a.kind] && a.titre !== "Note" ? `« ${echapper(a.titre)} »` : "",
      a.avec ? `avec ${echapper(a.avec)}` : "",
      a.resultat ? `: <em>${echapper(a.resultat)}</em>` : "",
    ].filter(Boolean).join(" ");

  // Les actions de la journée, commercial par commercial.
  const parPersonne = new Map<string, Action[]>();
  for (const a of actionsFaites) parPersonne.set(a.par, [...(parPersonne.get(a.par) ?? []), a]);
  const blocActions = [...parPersonne.entries()]
    .map(([p, as]) => `<p style="font-size:14px;margin:10px 0 4px;"><strong>${echapper(qui(p))}</strong> — ${as.length} action${as.length > 1 ? "s" : ""}</p>${liste(as.map((a) => ligneAction(a)))}`)
    .join("");

  const prospects = (nouveauxProspects.data ?? []) as { name: string; city: string | null; found_by: string | null; owner_email: string; deleted_at: string | null }[];
  const parMerx = prospects.filter((p) => p.found_by).length;
  const aLaMain = prospects.length - parMerx;
  const recherches = (demandes.data ?? []) as { request: string; status: string; found_count: number | null; requested_by: string }[];
  const nouvellesAffaires = (affaires.data ?? []) as { company: string; stage: string; referent: string | null }[];
  const nouveauxClients = (clients.data ?? []) as { name: string }[];
  const dictees = (notes.data ?? []) as { owner_email: string; statut: string }[];
  const jetees = [...((jeteesP.data ?? []) as { name: string }[]).map((x) => x.name), ...((jeteesA.data ?? []) as { company: string }[]).map((x) => x.company), ...((jeteesC.data ?? []) as { name: string }[]).map((x) => x.name)];

  const dateLongue = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(maintenant);
  const enBref = [
    `${actionsFaites.length} action${actionsFaites.length > 1 ? "s" : ""} notée${actionsFaites.length > 1 ? "s" : ""}`,
    `${(programmees.data ?? []).length} programmée${(programmees.data ?? []).length > 1 ? "s" : ""}`,
    `${prospects.length} nouvelle${prospects.length > 1 ? "s" : ""} fiche${prospects.length > 1 ? "s" : ""} en Prospection`,
    `${nouvellesAffaires.length} nouvelle${nouvellesAffaires.length > 1 ? "s" : ""} affaire${nouvellesAffaires.length > 1 ? "s" : ""} au Pipeline`,
    `${nouveauxClients.length} nouveau${nouveauxClients.length > 1 ? "x" : ""} client${nouveauxClients.length > 1 ? "s" : ""}`,
  ].join(" · ");

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#16283C;max-width:640px;">
    <p style="font-size:18px;font-weight:bold;margin:0 0 4px;">AvisDoc Admin — le point du ${echapper(dateLongue)}</p>
    <p style="font-size:13px;color:#6b7a88;margin:0 0 6px;">Depuis le ${echapper(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(du))}.</p>
    <p style="font-size:14px;color:#4a5967;margin:0 0 6px;">${echapper(enBref)}.</p>

    ${titre("Commercial — ce qui a été fait")}
    ${blocActions || liste([])}

    ${titre("Merx — recherches lancées")}
    ${liste(recherches.map((r) => `${echapper(qui(r.requested_by))} : « ${echapper(r.request)} » — ${r.status === "terminee" ? `${r.found_count ?? 0} fiche${(r.found_count ?? 0) > 1 ? "s" : ""}` : r.status === "echec" ? "échec" : "en cours"}`))}

    ${titre("Prospection")}
    ${liste([
      ...(prospects.length ? [`${prospects.length} nouvelle${prospects.length > 1 ? "s" : ""} fiche${prospects.length > 1 ? "s" : ""} : ${parMerx} trouvée${parMerx > 1 ? "s" : ""} par Merx, ${aLaMain} saisie${aLaMain > 1 ? "s" : ""} ou importée${aLaMain > 1 ? "s" : ""}`] : []),
      ...((approfondis.data ?? []).length ? [`${(approfondis.data ?? []).length} fiche${(approfondis.data ?? []).length > 1 ? "s" : ""} approfondie${(approfondis.data ?? []).length > 1 ? "s" : ""} par Merx`] : []),
    ])}

    ${titre("Pipeline et clients")}
    ${liste([
      ...nouvellesAffaires.map((a) => `Nouvelle affaire : <strong>${echapper(a.company)}</strong> (${echapper(a.stage)}${a.referent ? `, suivie par ${echapper(qui(a.referent))}` : ""})`),
      ...nouveauxClients.map((c) => `Nouveau client : <strong>${echapper(c.name)}</strong>`),
    ])}

    ${titre("Débrief")}
    ${liste(
      dictees.length
        ? [`${dictees.length} note${dictees.length > 1 ? "s" : ""} dictée${dictees.length > 1 ? "s" : ""} (${[...new Set(dictees.map((d) => qui(d.owner_email)))].map(echapper).join(", ")})${dictees.some((d) => d.statut === "echec") ? ` — ${dictees.filter((d) => d.statut === "echec").length} en échec` : ""}`]
        : [],
    )}

    ${jetees.length ? `${titre("Corbeille")}${liste([`${jetees.length} fiche${jetees.length > 1 ? "s" : ""} supprimée${jetees.length > 1 ? "s" : ""} (gardée${jetees.length > 1 ? "s" : ""} 30 jours) : ${jetees.slice(0, 10).map(echapper).join(", ")}${jetees.length > 10 ? "…" : ""}`])}` : ""}

    ${titre("Demain au Planning")}
    ${liste(actionsDemain.map((a) => `${ligneAction(a)} — ${echapper(qui(a.par))}`))}

    <p style="margin:22px 0 0;font-size:13px;"><a href="${HUB}/dashboard" style="color:#29B1E0;">Ouvrir le Hub</a></p>
  </div>`;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: DESTINATAIRES, subject: `AvisDoc Admin — le point du ${dateLongue}`, html }),
  });
  if (!r.ok) {
    await rendre();
    return json({ error: `Resend ${r.status} : ${await r.text()}` }, 502);
  }
  return json({ ok: true, envoye_a: DESTINATAIRES, jour });
});
