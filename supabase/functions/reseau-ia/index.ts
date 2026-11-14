// Edge Function : recherche assistée par IA pour le réseau d'aval.
//
// Rien n'est inventé (décision du 14/11) :
//   1. l'IA doit citer, pour chaque information, l'adresse de la page ET la phrase
//      exacte qui la justifie ;
//   2. le serveur charge la page et vérifie que la phrase y figure mot pour mot, et
//      que la page nomme bien le praticien ; sinon la proposition est écartée ;
//   3. ce qui passe est enregistré « proposé » : un opérateur valide ou rejette.
//      Seuls les signaux validés comptent dans le score.
// Doctolib, LinkedIn, Google et les sites d'avis sont exclus de la recherche.
//
// Actions (réponse immédiate, travail en tâche de fond, suivi dans
// admin_reseau_recherches_ia) :
//   • praticien      { praticien_id } — signaux absents de la fiche Google
//   • mg_departement { departement }  — généralistes formés à la dermoscopie,
//                                       rapprochés du RPPS puis ajoutés aux candidats
//
// Secrets : ANTHROPIC_API_KEY (déjà utilisé par Merx). Modèle réglable par
// RESEAU_MODEL_RECHERCHE. Déploiement : supabase functions deploy reseau-ia

/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { clientService, cors, json, verifierAccesSante } from "../_shared/acces-sante.ts";
import { DEPARTEMENTS, estDepartement, normaliserRpps, praticienDepuisLignes } from "../_shared/reseau-rpps.ts";
import { normaliser } from "../_shared/reseau-signaux.ts";
import { dateExtraction, lignesDuNom, lignesDuRpps } from "../_shared/tabulaire-rpps.ts";
import { enregistrerPraticien } from "../_shared/enregistrer-praticien.ts";
import { enTacheDeFond, Suivi } from "../_shared/suivi.ts";
import { chercherLiens } from "../_shared/liens.ts";

import {
  consignesCommunes, demander, echouer, hoteDe, MAX_CANDIDATS_MG, RECHERCHES_WEB, rechercherPraticien, verifierSource,
} from "../_shared/ia.ts";

// ── Action « mg_departement » ────────────────────────────────────────────────

const SCHEMA_MG = {
  type: "object",
  additionalProperties: false,
  required: ["medecins"],
  properties: {
    medecins: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nom", "prenom", "commune", "url", "extrait", "teleexpertise_url", "teleexpertise_extrait"],
        properties: {
          nom: { type: "string" },
          prenom: { type: "string" },
          commune: { type: "string" },
          url: { type: "string" },
          extrait: { type: "string" },
          teleexpertise_url: { type: "string", description: "Vide si rien ne l'établit." },
          teleexpertise_extrait: { type: "string", description: "Vide si rien ne l'établit." },
        },
      },
    },
  },
};

const nomRpps = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const premierPrenom = (t: string) => normaliser(t).split(/[\s-]+/)[0] ?? "";

/** Le RPPS d'un généraliste nommé sur une page, s'il est UNIQUE dans le département. */
async function rapprocher(nom: string, prenom: string, commune: string, dep: string): Promise<{ rpps: string } | { motif: string }> {
  const lignes = await lignesDuNom(nomRpps(nom), dep);
  const mg = lignes.filter((l) =>
    String(l["Code profession"]) === "10" &&
    ["SM26", "SM53", "SM54"].includes(String(l["Code savoir-faire"])) &&
    premierPrenom(String(l["Prénom d'exercice"] ?? "")) === premierPrenom(prenom));
  let rpps = [...new Set(mg.map((l) => normaliserRpps(l["Identifiant PP"])).filter(Boolean))] as string[];
  if (rpps.length > 1) { // homonymes : la commune départage, sinon on s'abstient
    const c = normaliser(commune);
    rpps = [...new Set(mg.filter((l) => normaliser(String(l["Libellé commune (coord. structure)"] ?? "")) === c)
      .map((l) => normaliserRpps(l["Identifiant PP"])).filter(Boolean))] as string[];
  }
  if (rpps.length === 0) return { motif: "généraliste introuvable dans le RPPS du département" };
  if (rpps.length > 1) return { motif: "plusieurs homonymes dans le RPPS : non retenu" };
  return { rpps: rpps[0] };
}

async function rechercherMg(db: any, rechercheId: string, dep: string, email: string, suivi: Suivi) {
  const consigne = `Tu aides AvisDoc à constituer un réseau de médecins correspondants.
Cherche des médecins GÉNÉRALISTES exerçant dans le département ${dep} (${DEPARTEMENTS[dep]}) qui indiquent publiquement être formés à la dermoscopie : DU ou DIU de dermoscopie, formation au dépistage des cancers de la peau, orientation dermatologique.
Pour chacun, indique aussi s'il pratique la télé-expertise, avec sa propre source (sinon laisse ces deux champs vides).
Au plus ${MAX_CANDIDATS_MG} médecins.

${consignesCommunes}`;

  await suivi.maj({ etape: "L'IA cherche sur le web", progression: 2, ligne: `Recherche lancée : généralistes formés à la dermoscopie, ${DEPARTEMENTS[dep]}` });
  const { resultat, usage } = await demander<{ medecins: any[] }>(consigne, SCHEMA_MG, RECHERCHES_WEB.mg_departement, suivi, [4, 45]);
  const candidats = (Array.isArray(resultat?.medecins) ? resultat.medecins : []).slice(0, MAX_CANDIDATS_MG);
  await suivi.maj({
    etape: "Vérification des médecins trouvés", progression: 47,
    ligne: candidats.length ? `${candidats.length} médecin${candidats.length > 1 ? "s" : ""} proposé${candidats.length > 1 ? "s" : ""} par l'IA : vérification de la source, puis rapprochement avec le RPPS` : "L'IA n'a trouvé aucun généraliste avec une source explicite",
  });
  let k = 0;
  const ecartees: { motif: string; url?: string; nom?: string }[] = [];
  const crees: string[] = [];
  let dejaLa = 0;
  const extraitLe = await dateExtraction();

  for (const c of candidats) {
    k++;
    const nom = String(c.nom ?? "").trim();
    const qui = `${c.prenom ?? ""} ${nom}`.trim();
    await suivi.maj({ etape: `Vérification ${k}/${candidats.length} : ${qui}`, progression: 47 + (50 * (k - 1)) / Math.max(1, candidats.length) });
    const ecarter = (motif: string, url?: string) => {
      ecartees.push({ motif, url, nom: qui });
      return suivi.maj({ ligne: `Écarté : ${qui} : ${motif}`, niveau: "ecarte" });
    };
    if (!nom) { await ecarter("nom absent"); continue; }
    const v = await verifierSource(c.url, c.extrait, nom);
    if (!v.ok) { await ecarter(v.motif, c.url); continue; }
    const r = await rapprocher(nom, String(c.prenom ?? ""), String(c.commune ?? ""), dep);
    if ("motif" in r) { await ecarter(r.motif, c.url); continue; }
    const fiche = praticienDepuisLignes(await lignesDuRpps(r.rpps), r.rpps);
    if ("refus" in fiche) { await ecarter(fiche.refus); continue; }
    if (fiche.praticien.population !== "MG_DERM") { await ecarter("pas généraliste (déjà couvert par l'import)"); continue; }

    const e = await enregistrerPraticien(db, fiche.praticien, { origine: "ia", acteur: email, extraitLe, detail: { recherche_id: rechercheId } });
    if (e.statut === "exclu") { await ecarter("exclu du réseau"); continue; }
    if (e.statut === "deja_la") {
      dejaLa++;
      await suivi.maj({ ligne: `Déjà dans la liste : ${qui} (RPPS ${r.rpps})`, niveau: "info" });
    } else {
      crees.push(e.id);
      await suivi.maj({ ligne: `Ajouté : ${qui} (RPPS ${r.rpps}), source vérifiée sur ${hoteDe(c.url)}`, niveau: "ok" });
    }

    // Les signaux trouvés restent des propositions : un opérateur les valide.
    const signaux: any[] = [{ type: "du_dermoscopie", valeur: "oui", url: c.url, extrait: String(c.extrait).trim().slice(0, 500) }];
    if (c.teleexpertise_url) {
      const vt = await verifierSource(c.teleexpertise_url, c.teleexpertise_extrait, nom);
      if (vt.ok) signaux.push({ type: "teleexpertise", valeur: "oui", url: c.teleexpertise_url, extrait: String(c.teleexpertise_extrait).trim().slice(0, 500) });
      else await ecarter(`télé-expertise : ${vt.motif}`, c.teleexpertise_url);
    }
    const { data: enAttente } = await db.from("admin_reseau_signaux").select("type").eq("praticien_id", e.id).in("statut", ["propose", "valide"]);
    const deja = new Set((enAttente ?? []).map((x: any) => x.type));
    const nouveaux = signaux.filter((s) => !deja.has(s.type));
    if (nouveaux.length) {
      await db.from("admin_reseau_signaux").insert(nouveaux.map((s) => ({ praticien_id: e.id, ...s, origine: "ia", statut: "propose", propose_par: email })));
    }
  }

  if (crees.length) {
    await suivi.maj({ etape: "Carte, fiches Google et Doctolib des généralistes ajoutés", progression: 97 });
    for (const id of crees) {
      const lignes = await chercherLiens(db, id, [dep]).catch((e) => [{ texte: `Liens : ${e instanceof Error ? e.message : String(e)}`, niveau: "ecarte" as const }]);
      for (const l of lignes) await suivi.maj({ ligne: l.texte, niveau: l.niveau });
    }
  }
  await suivi.maj({ ligne: `Terminé : ${crees.length} ajouté${crees.length > 1 ? "s" : ""}, ${dejaLa} déjà là, ${ecartees.length} écarté${ecartees.length > 1 ? "s" : ""}`, niveau: "ok" });
  await suivi.attendre();
  await db.from("admin_reseau_recherches_ia").update({
    statut: "termine", fin: new Date().toISOString(), usage, etape: "Terminé", progression: 100,
    resultat: { propositions: candidats.length, crees: crees.length, deja_la: dejaLa, ecartees },
  }).eq("id", rechercheId);
}

// ── Point d'entrée ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  const acces = await verifierAccesSante(req);
  if ("refus" in acces) return acces.refus;
  const { email } = acces;
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "La clé de l'IA n'est pas configurée sur le projet." }, 500);

  const corps = await req.json().catch(() => ({}));
  const db = clientService();

  // Une recherche à la fois par cible (un praticien, un département).
  const cible = corps.action === "praticien" ? { col: "praticien_id", val: String(corps.praticien_id ?? "") }
    : { col: "departement", val: String(corps.departement ?? "").toUpperCase() };
  const { data: enCours } = await db.from("admin_reseau_recherches_ia").select("id")
    .eq(cible.col, cible.val).eq("statut", "en_cours").gt("debut", new Date(Date.now() - 10 * 60_000).toISOString()).limit(1);
  if (enCours?.length) return json({ error: "Une recherche est déjà en cours : patientez quelques minutes." }, 409);

  if (corps.action === "praticien") {
    const { data: p } = await db.from("admin_reseau_praticiens")
      .select("id, rpps, nom, prenom, population, etat, admin_reseau_lieux(raison_sociale, commune)")
      .eq("id", cible.val).maybeSingle();
    if (!p) return json({ error: "Praticien introuvable." }, 404);
    if (p.etat === "exclu") return json({ error: "Ce praticien est exclu." }, 409);
    const { data: r, error } = await db.from("admin_reseau_recherches_ia")
      .insert({ type: "praticien", praticien_id: p.id, lance_par: email }).select("id").single();
    if (error) return json({ error: error.message }, 500);
    const suivi = new Suivi(db, r.id);
    enTacheDeFond(rechercherPraticien(db, r.id, p, email, suivi).catch((e) => echouer(db, r.id, suivi, e)));
    return json({ recherche_id: r.id }, 202);
  }

  if (corps.action === "mg_departement") {
    const dep = cible.val;
    if (!estDepartement(dep)) return json({ error: "Département inconnu." }, 400);
    const { data: d } = await db.from("admin_reseau_departements").select("code").eq("code", dep).maybeSingle();
    if (!d) return json({ error: "Ajoutez d'abord ce département à la liste." }, 400);
    const { data: r, error } = await db.from("admin_reseau_recherches_ia")
      .insert({ type: "mg_derm_departement", departement: dep, lance_par: email }).select("id").single();
    if (error) return json({ error: error.message }, 500);
    const suivi = new Suivi(db, r.id);
    enTacheDeFond(rechercherMg(db, r.id, dep, email, suivi).catch((e) => echouer(db, r.id, suivi, e)));
    return json({ recherche_id: r.id }, 202);
  }

  return json({ error: "Action inconnue." }, 400);
});
