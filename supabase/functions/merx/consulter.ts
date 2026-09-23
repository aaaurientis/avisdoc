// Ce que Merx peut aller consulter pour conseiller.
//
// Dans le chat, il ne savait rien : ni les fiches, ni les dossiers qu'il avait
// lui-même montés, ni ce que l'équipe a appris sur le terrain. À la question « j'ai
// une objection chez Les Jardins de Gally, que je réponds ? », il ne savait pas qui
// était Gally et répondait des généralités.
//
// Il rend du TEXTE, pas du JSON : c'est un modèle qui lit, et une phrase se comprend
// mieux qu'une structure.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";

/** Sans accents ni ponctuation : « gally » doit retrouver « Les Jardins de Gally ». */
const nu = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();

interface Dossier {
  a_retenir?: string[];
  qui_aborder?: string;
  accroche?: string;
  arguments?: { argument: string; parce_que: string }[];
  objections?: { objection: string; reponse: string }[];
  offre?: string;
  a_verifier?: string[];
}

function raconterDossier(d: Dossier): string {
  const bouts: string[] = [];
  if (d.accroche?.trim()) bouts.push(`Première phrase à dire : « ${d.accroche} »`);
  if (d.qui_aborder?.trim()) bouts.push(`Qui aborder : ${d.qui_aborder}`);
  if (d.a_retenir?.length) bouts.push(`Ce qu'on sait d'eux :\n${d.a_retenir.map((f) => `  - ${f}`).join("\n")}`);
  if (d.arguments?.length) {
    bouts.push(`Arguments :\n${d.arguments.map((a) => `  - ${a.argument}${a.parce_que ? ` (parce que ${a.parce_que})` : ""}`).join("\n")}`);
  }
  if (d.objections?.length) {
    bouts.push(`Objections prévues :\n${d.objections.map((o) => `  - « ${o.objection} » → ${o.reponse}`).join("\n")}`);
  }
  if (d.offre?.trim()) bouts.push(`Ce qu'on peut proposer : ${d.offre}`);
  if (d.a_verifier?.length) bouts.push(`Reste à leur demander : ${d.a_verifier.join(", ")}`);
  return bouts.join("\n");
}

/**
 * Tout ce qu'on sait d'une entreprise, où qu'elle se trouve : en prospection, au
 * Pipeline ou au fichier client. On cherche large — le commercial dit « Gally », pas
 * « Les Jardins de Gally SAS ».
 */
export async function lireFiche(sb: SupabaseClient, nom: string): Promise<string> {
  const q = nu(nom);
  const [prospects, affaires, comptes] = await Promise.all([
    sb.from("admin_prospects").select("name, city, activity, siren, headcount_band, contact_name, contact_role, contact_email, rationale, approach, score_total, dossier, enriched_at, converted_client_id").is("deleted_at", null).limit(400),
    sb.from("admin_clients").select("company, ville, siren, effectif, stage, jours, tarif, depistes, orientes").is("deleted_at", null).limit(400),
    sb.from("admin_accounts").select("name, sector, signed_on").is("deleted_at", null).limit(400),
  ]);

  const morceaux: string[] = [];

  for (const p of prospects.data ?? []) {
    if (!nu(String(p.name)).includes(q)) continue;
    const lignes = [
      `EN PROSPECTION — ${p.name}${p.city ? `, ${p.city}` : ""}${p.activity ? ` (${p.activity})` : ""}`,
      p.siren ? `SIREN ${p.siren}` : "",
      p.headcount_band ? `Effectif (tranche INSEE) : ${p.headcount_band}` : "",
      p.contact_name ? `Interlocuteur : ${p.contact_name}${p.contact_role ? `, ${p.contact_role}` : ""}${p.contact_email ? ` — ${p.contact_email}` : ""}` : "Aucun interlocuteur trouvé.",
      p.score_total != null ? `Note : ${p.score_total}/100` : "",
      p.rationale ? `Pourquoi c'est une cible : ${p.rationale}` : "",
      p.approach ? `Angle d'approche : ${p.approach}` : "",
      p.converted_client_id ? "Elle est déjà passée au Pipeline." : "",
      p.dossier ? `\nLE DOSSIER COMMERCIAL :\n${raconterDossier(p.dossier as Dossier)}` : "\nPas encore de dossier commercial : le commercial peut lancer « Approfondir » sur sa fiche.",
    ].filter(Boolean);
    morceaux.push(lignes.join("\n"));
  }

  for (const c of affaires.data ?? []) {
    if (!nu(String(c.company)).includes(q)) continue;
    morceaux.push(
      [
        `AU PIPELINE — ${c.company}${c.ville ? `, ${c.ville}` : ""}`,
        `Étape : ${c.stage}`,
        c.siren ? `SIREN ${c.siren}` : "",
        c.effectif ? `Effectif : ${c.effectif}` : "",
        c.jours ? `Journées : ${c.jours}` : "",
        c.depistes ? `Dépistés : ${c.depistes}` : "",
        c.orientes ? `Orientés vers un dermatologue : ${c.orientes}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  for (const a of comptes.data ?? []) {
    if (!nu(String(a.name)).includes(q)) continue;
    morceaux.push(`AU FICHIER CLIENT — ${a.name}${a.sector ? ` (${a.sector})` : ""}${a.signed_on ? `, client depuis le ${a.signed_on}` : ""}`);
  }

  if (morceaux.length === 0) {
    return `Aucune fiche ne porte ce nom (« ${nom} »). Dis-le au commercial : il peut la créer, ou te demander de chercher cette entreprise.`;
  }
  return morceaux.join("\n\n———\n\n");
}

/**
 * Ce que l'équipe a appris sur le terrain. Cherche dans les mots dits, dans la
 * famille et dans la réponse : le commercial dit « ils parlent de la médecine du
 * travail », pas le nom exact de la famille.
 */
export async function chercherTerrain(sb: SupabaseClient, sujet: string): Promise<string> {
  const { data, error } = await sb
    .from("admin_terrain")
    .select("nature, verbatim, famille, reponse, entreprise, au")
    .is("deleted_at", null)
    .order("au", { ascending: false })
    .limit(300);

  if (error) return "La bibliothèque du terrain n'a pas pu être lue.";
  const lignes = data ?? [];
  if (lignes.length === 0) {
    return "La bibliothèque du terrain est encore vide : personne n'a débriefé de rendez-vous. Dis-le franchement au commercial plutôt que d'inventer une objection type — et invite-le à raconter ses sorties dans Débrief, c'est ainsi qu'elle se remplit.";
  }

  const q = nu(sujet);
  const colle = (l: Record<string, unknown>) =>
    !q || nu(`${l.verbatim ?? ""} ${l.famille ?? ""} ${l.reponse ?? ""}`).includes(q);

  const objections = lignes.filter((l) => l.nature === "objection" && colle(l));
  const mouches = lignes.filter((l) => l.nature === "mouche" && colle(l));

  if (objections.length === 0 && mouches.length === 0) {
    const familles = [...new Set(lignes.map((l) => l.famille).filter(Boolean))];
    return `Rien sur « ${sujet} » dans ce qu'on a rapporté du terrain.${familles.length ? ` Ce qu'on y trouve pour l'instant : ${familles.join(", ")}.` : ""}`;
  }

  const bouts: string[] = [];
  if (objections.length) {
    bouts.push(
      `CE QUI A BLOQUÉ, et ce qu'on a répondu :\n${objections
        .slice(0, 12)
        .map((o) => `- « ${o.verbatim} »${o.entreprise ? ` (chez ${o.entreprise})` : ""}${o.reponse ? `\n  Réponse apportée : ${o.reponse}` : "\n  Aucune réponse notée."}`)
        .join("\n")}`,
    );
  }
  if (mouches.length) {
    bouts.push(
      `CE QUI A PORTÉ :\n${mouches
        .slice(0, 12)
        .map((m) => `- ${m.verbatim}${m.entreprise ? ` (chez ${m.entreprise})` : ""}`)
        .join("\n")}`,
    );
  }
  return bouts.join("\n\n");
}
