// Edge Function : importe (ou réimporte) les médecins d'un département depuis
// l'extraction RPPS en libre accès de l'Annuaire Santé (ANS), publiée sur
// data.gouv.fr, via l'API tabulaire : seules les lignes utiles sont lues, le
// fichier (≈ 800 Mo) n'est jamais téléchargé.
//
// Rejouable : un RPPS déjà connu est mis à jour, jamais recréé. Un RPPS exclu est
// ignoré. Un praticien déjà présent dans la liste des contacts y est relié.
//
// Entrée : { departement: "38" }. Réservé au droit « sante ».
//
// Déploiement : supabase functions deploy reseau-import

/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { clientService, cors, json, paquets, verifierAccesSante } from "../_shared/acces-sante.ts";
import {
  bornesCodePostal,
  estDepartement,
  type LigneRpps,
  planifierImport,
  type PraticienRpps,
  regrouperParPraticien,
  SPECIALITES,
} from "../_shared/reseau-rpps.ts";

// Fichier « ps-libreacces-personne-activite » du jeu ANS sur data.gouv.fr.
const RESSOURCE = Deno.env.get("RPPS_RESSOURCE_ID") ?? "fffda7e9-0ea2-4c35-bba0-4496f3af935d";
const TABULAIRE = `https://tabular-api.data.gouv.fr/api/resources/${RESSOURCE}`;
const COL_CP = "Code postal (coord. structure)";

async function lireJson(url: string): Promise<any> {
  let derniere = "";
  for (let essai = 1; essai <= 4; essai++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
      if (r.ok) return await r.json();
      derniere = `réponse ${r.status}`;
      if (r.status < 500 && r.status !== 429) break; // erreur de requête : inutile d'insister
    } catch (e) {
      derniere = e instanceof Error ? e.message : String(e);
    }
    await new Promise((ok) => setTimeout(ok, 1500 * essai));
  }
  throw new Error(`L'API de data.gouv.fr ne répond pas (${derniere}). Réessayez dans quelques minutes.`);
}

/** Toutes les lignes d'une spécialité dont le code postal tombe dans le département. */
async function lignesDe(code: string, departement: string): Promise<LigneRpps[]> {
  const { min, max } = bornesCodePostal(departement);
  // Bornes élargies d'une unité : le tri final se fait sur le département du lieu.
  const params = new URLSearchParams({
    "Code savoir-faire__exact": code,
    [`${COL_CP}__greater`]: String(Number(min) - 1).padStart(5, "0"),
    [`${COL_CP}__less`]: String(Number(max) + 1).padStart(5, "0"),
    page_size: "200",
  });
  let url: string | null = `${TABULAIRE}/data/?${params}`;
  const lignes: LigneRpps[] = [];
  for (let page = 0; url && page < 100; page++) {
    const d: any = await lireJson(url);
    lignes.push(...(Array.isArray(d?.data) ? d.data : []));
    url = d?.links?.next ?? null;
  }
  return lignes;
}

function versLigne(p: PraticienRpps, extraitLe: string | null) {
  return {
    rpps: p.rpps,
    civilite: p.civilite,
    nom: p.nom,
    prenom: p.prenom,
    population: p.population,
    roles: p.roles,
    specialites: p.specialites,
    rpps_extrait_le: extraitLe,
    vu_au_dernier_import: true,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const acces = await verifierAccesSante(req);
  if ("refus" in acces) return acces.refus;
  const { email } = acces;

  const { departement } = await req.json().catch(() => ({}));
  const dep = String(departement ?? "").trim().toUpperCase();
  if (!estDepartement(dep)) return json({ error: "Département inconnu." }, 400);

  const db = clientService();
  const { data: depRow } = await db.from("admin_reseau_departements").select("code, etat").eq("code", dep).maybeSingle();
  if (!depRow) return json({ error: "Ajoutez d'abord ce département à la liste." }, 400);

  // Un seul import à la fois par département (un import dure moins de 5 minutes).
  const { data: enCours } = await db
    .from("admin_reseau_imports")
    .select("id")
    .eq("departement", dep)
    .eq("statut", "en_cours")
    .gt("debut", new Date(Date.now() - 10 * 60_000).toISOString())
    .limit(1);
  if (enCours?.length) return json({ error: "Un import de ce département est déjà en cours. Patientez quelques minutes." }, 409);

  const { data: imp, error: eImp } = await db
    .from("admin_reseau_imports")
    .insert({ departement: dep, lance_par: email })
    .select("id")
    .single();
  if (eImp) return json({ error: eImp.message }, 500);

  try {
    // Date de l'extraction indexée par l'API (fraîcheur affichée sur chaque fiche).
    const meta = await lireJson(`${TABULAIRE}/`).catch(() => null);
    const extraitLe: string | null = meta?.created_at ?? null;

    const parCode = await Promise.all(Object.keys(SPECIALITES).map((c) => lignesDe(c, dep)));
    const lignes = parCode.flat();
    const praticiens = regrouperParPraticien(lignes, dep);
    const rppsVus = praticiens.map((p) => p.rpps);

    // État connu : praticiens, exclusions, contacts existants (même RPPS).
    const existants: { id: string; rpps: string; etat: string; contact_id: string | null }[] = [];
    const exclus: string[] = [];
    const contacts = new Map<string, string>();
    for (const lot of paquets(rppsVus)) {
      const [a, b, c] = await Promise.all([
        db.from("admin_reseau_praticiens").select("id, rpps, etat, contact_id").in("rpps", lot),
        db.from("admin_reseau_exclusions").select("rpps").in("rpps", lot),
        db.from("admin_network_contacts").select("id, rpps").in("rpps", lot),
      ]);
      if (a.error || b.error || c.error) throw new Error((a.error ?? b.error ?? c.error)!.message);
      existants.push(...(a.data ?? []));
      exclus.push(...(b.data ?? []).map((x: any) => x.rpps));
      for (const x of c.data ?? []) if (x.rpps && !contacts.has(x.rpps)) contacts.set(x.rpps, x.id);
    }

    const plan = planifierImport(praticiens, existants, exclus);
    const idParRpps = new Map<string, string>();
    let relies = 0;

    // Créations.
    for (const lot of paquets(plan.aCreer, 100)) {
      const { data, error } = await db
        .from("admin_reseau_praticiens")
        .insert(lot.map((p) => {
          const contactId = contacts.get(p.rpps) ?? null;
          if (contactId) relies++;
          return { ...versLigne(p, extraitLe), contact_id: contactId, origine: "import_rpps" };
        }))
        .select("id, rpps");
      if (error) throw new Error(error.message);
      for (const r of data ?? []) idParRpps.set(r.rpps, r.id);
    }

    // Mises à jour (données open data seulement : l'état n'est jamais touché ici).
    const contactExistant = new Map(existants.map((e) => [e.id, e.contact_id]));
    for (const { id, praticien } of plan.aMettreAJour) {
      const maj: Record<string, unknown> = versLigne(praticien, extraitLe);
      delete maj.rpps;
      delete maj.population; // une population saisie ou corrigée n'est pas écrasée
      if (!contactExistant.get(id) && contacts.has(praticien.rpps)) {
        maj.contact_id = contacts.get(praticien.rpps);
        relies++;
      }
      const { error } = await db.from("admin_reseau_praticiens").update(maj).eq("id", id);
      if (error) throw new Error(error.message);
      idParRpps.set(praticien.rpps, id);
    }

    // Lieux du département : on remplace ceux des praticiens vus par l'extraction du jour.
    const ids = [...idParRpps.values()];
    for (const lot of paquets(ids)) {
      const { error } = await db.from("admin_reseau_lieux").delete().eq("departement", dep).in("praticien_id", lot);
      if (error) throw new Error(error.message);
    }
    const lieux = praticiens
      .filter((p) => idParRpps.has(p.rpps))
      .flatMap((p) => p.lieux.map((l) => ({
        praticien_id: idParRpps.get(p.rpps),
        departement: dep,
        cle: l.cle,
        raison_sociale: l.raisonSociale,
        adresse: l.adresse,
        code_postal: l.codePostal,
        commune: l.commune,
        code_commune: l.codeCommune,
        telephone: l.telephone,
        mode_exercice: l.modeExercice,
        secteur: l.secteur,
        finess: l.finess,
        siret: l.siret,
        rpps_extrait_le: extraitLe,
      })));
    for (const lot of paquets(lieux, 200)) {
      const { error } = await db.from("admin_reseau_lieux").insert(lot);
      if (error) throw new Error(error.message);
    }

    // Praticiens du département absents de cette extraction : leurs lieux ici disparaissent.
    const { data: anciens } = await db.from("admin_reseau_lieux").select("praticien_id").eq("departement", dep);
    const exclusConnus = new Set(existants.filter((e) => e.etat === "exclu").map((e) => e.id));
    const disparus = [...new Set((anciens ?? []).map((x: any) => x.praticien_id as string))]
      .filter((id) => !ids.includes(id) && !exclusConnus.has(id));
    for (const lot of paquets(disparus)) {
      await db.from("admin_reseau_lieux").delete().eq("departement", dep).in("praticien_id", lot);
    }
    for (const lot of paquets(disparus)) {
      // Sans plus aucun lieu nulle part : signalé « absent de la dernière extraction ».
      const { data: restants } = await db.from("admin_reseau_lieux").select("praticien_id").in("praticien_id", lot);
      const avecLieu = new Set((restants ?? []).map((x: any) => x.praticien_id));
      const sansLieu = lot.filter((id) => !avecLieu.has(id));
      if (sansLieu.length) await db.from("admin_reseau_praticiens").update({ vu_au_dernier_import: false }).in("id", sansLieu);
    }

    // Historique : une entrée par création.
    const hist = plan.aCreer
      .filter((p) => idParRpps.has(p.rpps))
      .map((p) => ({
        praticien_id: idParRpps.get(p.rpps), departement: dep, acteur: email,
        action: "import_cree", vers: "identifie", detail: { import_id: imp.id },
      }));
    for (const lot of paquets(hist, 200)) await db.from("admin_reseau_historique").insert(lot);

    const compteurs = {
      lignes: lignes.length,
      praticiens: praticiens.length,
      crees: plan.aCreer.length,
      mis_a_jour: plan.aMettreAJour.length,
      exclus_ignores: plan.exclusIgnores.length,
      relies_liste: relies,
      sortis_du_departement: disparus.length,
    };
    const fin = new Date().toISOString();
    await db.from("admin_reseau_imports")
      .update({ statut: "termine", fin, compteurs, rpps_extrait_le: extraitLe })
      .eq("id", imp.id);
    await db.from("admin_reseau_departements")
      .update({ dernier_import_le: fin, ...(depRow.etat === "a_ouvrir" ? { etat: "importe" } : {}) })
      .eq("code", dep);
    if (depRow.etat === "a_ouvrir") {
      await db.from("admin_reseau_historique").insert({
        departement: dep, acteur: email, action: "departement_etat", de: "a_ouvrir", vers: "importe",
      });
    }

    return json({ import_id: imp.id, compteurs, rpps_extrait_le: extraitLe });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(e);
    await db.from("admin_reseau_imports")
      .update({ statut: "echec", fin: new Date().toISOString(), erreur: message })
      .eq("id", imp.id);
    return json({ error: `Import interrompu : ${message}` }, 502);
  }
});
