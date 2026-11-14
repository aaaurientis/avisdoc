// Edge Function : importe (ou réimporte) les médecins d'un département depuis
// l'extraction RPPS en libre accès de l'Annuaire Santé (ANS), publiée sur
// data.gouv.fr, via l'API tabulaire : seules les lignes utiles sont lues, le
// fichier (≈ 800 Mo) n'est jamais téléchargé.
//
// Rafraîchir = AJOUTER, jamais annuler et remplacer (décision du 14/11) :
//   • un nouveau praticien est ajouté ;
//   • un praticien déjà présent n'est pas modifié (nom, rôles, population, état,
//     fiche Google restent tels quels) : on lui ajoute seulement ses nouvelles
//     spécialités et ses nouveaux lieux d'exercice, et la date d'extraction ;
//   • aucun lieu n'est supprimé ; un praticien absent de la nouvelle extraction
//     reste dans la liste, signalé « absent de la dernière extraction ».
// Un RPPS exclu est ignoré. Un praticien déjà présent dans les contacts y est relié.
//
// Entrée : { departement: "38" }. Réservé au droit « sante ».
//
// Déploiement : supabase functions deploy reseau-import

/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { clientService, cors, json, paquets, verifierAccesSante } from "../_shared/acces-sante.ts";
import {
  estDepartement,
  planifierImport,
  type PraticienRpps,
  regrouperParPraticien,
  SPECIALITES,
} from "../_shared/reseau-rpps.ts";
import { dateExtraction, lignesSpecialiteDepartement } from "../_shared/tabulaire-rpps.ts";
import { lancerFile, praticiensATraiter } from "../_shared/file.ts";

/** Un NOUVEAU praticien (les praticiens déjà présents ne sont jamais réécrits). */
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
    const extraitLe = await dateExtraction();

    const parCode = await Promise.all(Object.keys(SPECIALITES).map((c) => lignesSpecialiteDepartement(c, dep)));
    const lignes = parCode.flat();
    const praticiens = regrouperParPraticien(lignes, dep);
    const rppsVus = praticiens.map((p) => p.rpps);

    // État connu : praticiens, exclusions, contacts existants (même RPPS).
    const existants: { id: string; rpps: string; etat: string; contact_id: string | null; specialites: string[] | null }[] = [];
    const exclus: string[] = [];
    const contacts = new Map<string, string>();
    for (const lot of paquets(rppsVus)) {
      const [a, b, c] = await Promise.all([
        db.from("admin_reseau_praticiens").select("id, rpps, etat, contact_id, specialites").in("rpps", lot),
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

    // Praticiens déjà présents : on COMPLÈTE sans rien écraser.
    const parId = new Map(existants.map((e) => [e.id, e]));
    for (const { id, praticien } of plan.aMettreAJour) {
      const e = parId.get(id);
      const specialites = [...new Set([...(e?.specialites ?? []), ...praticien.specialites])];
      const maj: Record<string, unknown> = { specialites, rpps_extrait_le: extraitLe, vu_au_dernier_import: true };
      if (!e?.contact_id && contacts.has(praticien.rpps)) {
        maj.contact_id = contacts.get(praticien.rpps);
        relies++;
      }
      const { error } = await db.from("admin_reseau_praticiens").update(maj).eq("id", id);
      if (error) throw new Error(error.message);
      idParRpps.set(praticien.rpps, id);
    }

    // Lieux : on ajoute ceux qu'on ne connaît pas encore, sans jamais en supprimer.
    const ids = [...idParRpps.values()];
    const connus = new Set<string>();
    for (const lot of paquets(ids)) {
      const { data, error } = await db.from("admin_reseau_lieux").select("praticien_id, cle").in("praticien_id", lot);
      if (error) throw new Error(error.message);
      for (const l of data ?? []) connus.add(`${l.praticien_id}|${l.cle}`);
    }
    const lieux = praticiens
      .filter((p) => idParRpps.has(p.rpps))
      .flatMap((p) => p.lieux.map((l) => ({
        praticien_id: idParRpps.get(p.rpps)!,
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
      })))
      .filter((l) => !connus.has(`${l.praticien_id}|${l.cle}`));
    for (const lot of paquets(lieux, 200)) {
      const { error } = await db.from("admin_reseau_lieux").upsert(lot, { onConflict: "praticien_id,cle", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }

    // Praticiens du département absents de cette extraction : CONSERVÉS. Ceux qui n'exercent
    // nulle part ailleurs sont seulement signalés « absent de la dernière extraction ».
    const { data: ici } = await db.from("admin_reseau_lieux").select("praticien_id").eq("departement", dep).limit(20000);
    const exclusConnus = new Set(existants.filter((e) => e.etat === "exclu").map((e) => e.id));
    const vus = new Set(ids);
    const absents = [...new Set<string>((ici ?? []).map((x: any) => x.praticien_id as string))]
      .filter((id) => !vus.has(id) && !exclusConnus.has(id));
    let signalesAbsents = 0;
    for (const lot of paquets(absents)) {
      const { data: ailleurs } = await db.from("admin_reseau_lieux").select("praticien_id").in("praticien_id", lot).neq("departement", dep);
      const exerceAilleurs = new Set((ailleurs ?? []).map((x: any) => x.praticien_id));
      const aSignaler = lot.filter((id) => !exerceAilleurs.has(id));
      if (aSignaler.length) {
        await db.from("admin_reseau_praticiens").update({ vu_au_dernier_import: false }).in("id", aSignaler);
        signalesAbsents += aSignaler.length;
      }
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
      lieux_ajoutes: lieux.length,
      exclus_ignores: plan.exclusIgnores.length,
      relies_liste: relies,
      absents_extraction: absents.length,
      signales_absents: signalesAbsents,
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

    // Carte, fiches Google et liens Doctolib des nouveaux venus : cherchés aussitôt, en file.
    const rechercheGoogle = await praticiensATraiter(db, "google_departement", dep)
      .then((ids) => lancerFile(db, "google_departement", dep, ids, email))
      .then((r) => r?.id ?? null)
      .catch((e) => { console.error(e); return null; });

    return json({ import_id: imp.id, compteurs, rpps_extrait_le: extraitLe, recherche_google_id: rechercheGoogle });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(e);
    await db.from("admin_reseau_imports")
      .update({ statut: "echec", fin: new Date().toISOString(), erreur: message })
      .eq("id", imp.id);
    return json({ error: `Import interrompu : ${message}` }, 502);
  }
});
