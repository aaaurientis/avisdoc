// Edge Function : les transitions du réseau d'aval. Le front ne fait que lire ;
// tout changement d'état passe ici et laisse une trace dans l'historique.
//
// Actions (corps JSON, champ `action`) :
//   • departement_ajouter  { code, ordre? }
//   • departement_modifier { code, etat?, ordre? }   — l'utilisateur décide (14/11)
//   • exclure              { praticien_id, motif, precision? } — définitif
//   • signal_saisir        { praticien_id, type, valeur, url } — saisi par un opérateur, donc validé
//   • signal_valider       { signal_id } — proposition de l'IA acceptée
//   • signal_rejeter       { signal_id }
//   • google_rattacher     { praticien_id, place_ids: [...] } | { praticien_id, aucune: true } | { praticien_id, retirer: true }
//   • doctolib_fiche       { praticien_id, url, infos, signaux: [{ type, valeur }] } — relevé vérifié par l'opérateur
//   • doctolib_import      { lignes: ResultatDoctolib[] } — résultats relevés par l'équipe (fichier importé)
//   • doctolib_creneaux    { praticien_id, url, disponibilites, creneau? } — créneaux relevés sur la page de rendez-vous
//   • doctolib             { praticien_id, url } | { praticien_id, aucun: true } | { praticien_id, retirer: true } | { praticien_id, confirmer: true }
//                          | { praticien_id, non_reservable: boolean } (page « n'est pas sur Doctolib »)
//   • google_confirmer     { praticien_id } — la fiche trouvée automatiquement est la bonne
//   • ajouter_rpps         { rpps } — contrôlé dans l'extraction RPPS (MG_DERM compris)
//
// Réservé au droit « sante ». Déploiement : supabase functions deploy reseau-action

/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { clientService, cors, json, verifierAccesSante } from "../_shared/acces-sante.ts";
import { estDepartement, normaliserRpps, praticienDepuisLignes } from "../_shared/reseau-rpps.ts";
import { estTypeSignal, urlValide, valeurAdmise } from "../_shared/reseau-signaux.ts";
import { dateExtraction, lignesDuRpps } from "../_shared/tabulaire-rpps.ts";
import { enregistrerPraticien } from "../_shared/enregistrer-praticien.ts";
import { chercherLiens } from "../_shared/liens.ts";
import { urlDoctolibValide, urlPropre } from "../_shared/doctolib.ts";
import { enTacheDeFond } from "../_shared/suivi.ts";

const ETATS_DEPARTEMENT = ["a_ouvrir", "importe", "en_qualification", "en_contact", "couvert", "en_veille"];
const MOTIFS_EXCLUSION = ["hors_cible", "opposition", "esthetique_dominante", "n_exerce_plus", "autre"];

const ordreValide = (v: unknown) => v == null || v === "" || (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) < 1000);

/** Le rôle « futur requérant » suit le signal de télé-expertise validé. */
async function majRoleRequerant(db: any, praticienId: string) {
  const [{ data: p }, { data: s }] = await Promise.all([
    db.from("admin_reseau_praticiens").select("roles").eq("id", praticienId).single(),
    db.from("admin_reseau_signaux").select("valeur").eq("praticien_id", praticienId).eq("type", "teleexpertise").eq("statut", "valide").maybeSingle(),
  ]);
  const roles: string[] = (p?.roles ?? []).filter((r: string) => r !== "requerant");
  if (s?.valeur === "oui") roles.push("requerant");
  await db.from("admin_reseau_praticiens").update({ roles }).eq("id", praticienId);
}

/** Le signal validé précédent du même type passe à « remplacé » (un seul validé à la fois). */
async function remplacerAncien(db: any, praticienId: string, type: string, saufId?: string) {
  let q = db.from("admin_reseau_signaux").update({ statut: "remplace" })
    .eq("praticien_id", praticienId).eq("type", type).eq("statut", "valide");
  if (saufId) q = q.neq("id", saufId);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const acces = await verifierAccesSante(req);
  if ("refus" in acces) return acces.refus;
  const { email } = acces;
  const corps = await req.json().catch(() => ({}));
  const db = clientService();

  switch (corps.action) {
    case "departement_ajouter": {
      const code = String(corps.code ?? "").trim().toUpperCase();
      if (!estDepartement(code)) return json({ error: "Département inconnu." }, 400);
      if (!ordreValide(corps.ordre)) return json({ error: "L'ordre doit être un nombre entier positif." }, 400);
      const { data: deja } = await db.from("admin_reseau_departements").select("code").eq("code", code).maybeSingle();
      if (deja) return json({ error: "Ce département est déjà dans la liste." }, 409);
      const ordre = corps.ordre == null || corps.ordre === "" ? null : Number(corps.ordre);
      const { error } = await db.from("admin_reseau_departements").insert({ code, ordre, ajoute_par: email });
      if (error) return json({ error: error.message }, 500);
      await db.from("admin_reseau_historique").insert({
        departement: code, acteur: email, action: "departement_ajoute", vers: "a_ouvrir",
      });
      return json({ code });
    }

    case "departement_modifier": {
      const code = String(corps.code ?? "").trim().toUpperCase();
      const { data: dep } = await db.from("admin_reseau_departements").select("code, etat, ordre").eq("code", code).maybeSingle();
      if (!dep) return json({ error: "Département introuvable." }, 404);
      const maj: Record<string, unknown> = {};
      if (corps.etat !== undefined) {
        if (!ETATS_DEPARTEMENT.includes(corps.etat)) return json({ error: "État de département inconnu." }, 400);
        if (corps.etat !== dep.etat) maj.etat = corps.etat;
      }
      if (corps.ordre !== undefined) {
        if (!ordreValide(corps.ordre)) return json({ error: "L'ordre doit être un nombre entier positif." }, 400);
        maj.ordre = corps.ordre === null || corps.ordre === "" ? null : Number(corps.ordre);
      }
      if (Object.keys(maj).length === 0) return json({ code });
      const { error } = await db.from("admin_reseau_departements").update(maj).eq("code", code);
      if (error) return json({ error: error.message }, 500);
      if (maj.etat) {
        await db.from("admin_reseau_historique").insert({
          departement: code, acteur: email, action: "departement_etat", de: dep.etat, vers: maj.etat,
        });
      }
      return json({ code });
    }

    case "exclure": {
      const motif = String(corps.motif ?? "");
      if (!MOTIFS_EXCLUSION.includes(motif)) return json({ error: "Choisissez le motif de l'exclusion." }, 400);
      const precision = String(corps.precision ?? "").trim().slice(0, 500) || null;
      if (motif === "autre" && !precision) return json({ error: "Précisez le motif « autre »." }, 400);
      const { data: p } = await db
        .from("admin_reseau_praticiens").select("id, rpps, etat").eq("id", String(corps.praticien_id ?? "")).maybeSingle();
      if (!p) return json({ error: "Praticien introuvable." }, 404);
      if (p.etat === "exclu") return json({ error: "Ce praticien est déjà exclu." }, 409);
      // L'exclusion d'abord : elle est définitive et bloque toute recréation par le RPPS.
      const { error: eEx } = await db.from("admin_reseau_exclusions").insert({ rpps: p.rpps, motif, precision, auteur: email });
      if (eEx && !/duplicate|unique/i.test(eEx.message)) return json({ error: eEx.message }, 500);
      const { error } = await db.from("admin_reseau_praticiens").update({ etat: "exclu" }).eq("id", p.id);
      if (error) return json({ error: error.message }, 500);
      await db.from("admin_reseau_historique").insert({
        praticien_id: p.id, acteur: email, action: "exclu", de: p.etat, vers: "exclu", detail: { motif, precision },
      });
      return json({ id: p.id });
    }

    case "signal_saisir": {
      const { praticien_id, type, valeur, url } = corps;
      if (!estTypeSignal(type)) return json({ error: "Type de signal inconnu." }, 400);
      if (!valeurAdmise(type, valeur)) return json({ error: "Valeur non admise pour ce signal." }, 400);
      if (!urlValide(url)) return json({ error: "Indiquez l'adresse complète de la page source (https://…)." }, 400);
      const { data: p } = await db.from("admin_reseau_praticiens").select("id, etat").eq("id", String(praticien_id ?? "")).maybeSingle();
      if (!p) return json({ error: "Praticien introuvable." }, 404);
      if (p.etat === "exclu") return json({ error: "Ce praticien est exclu." }, 409);
      try { await remplacerAncien(db, p.id, type); } catch (e) { return json({ error: (e as Error).message }, 500); }
      const maintenant = new Date().toISOString();
      const { data: sig, error } = await db.from("admin_reseau_signaux").insert({
        praticien_id: p.id, type, valeur, url, origine: "operateur", statut: "valide",
        propose_par: email, decide_par: email, decide_le: maintenant,
      }).select("id").single();
      if (error) return json({ error: error.message }, 500);
      if (type === "teleexpertise") await majRoleRequerant(db, p.id);
      await db.from("admin_reseau_historique").insert({
        praticien_id: p.id, acteur: email, action: "signal_saisi", detail: { type, valeur, url },
      });
      return json({ id: sig.id });
    }

    case "signal_valider":
    case "signal_rejeter": {
      const { data: sig } = await db.from("admin_reseau_signaux")
        .select("id, praticien_id, type, valeur, url, statut, propose_le").eq("id", String(corps.signal_id ?? "")).maybeSingle();
      if (!sig) return json({ error: "Proposition introuvable." }, 404);
      if (sig.statut !== "propose") return json({ error: "Cette proposition a déjà été traitée." }, 409);
      const valider = corps.action === "signal_valider";
      if (valider) {
        try { await remplacerAncien(db, sig.praticien_id, sig.type, sig.id); } catch (e) { return json({ error: (e as Error).message }, 500); }
      }
      // L'extrait est effacé dès la décision : aucun verbatim n'est conservé.
      // Un créneau relevé (import) date du relevé, pas de la validation : sa péremption (14 j) part de là.
      const decideLe = valider && sig.type === "creneau_doctolib" && sig.propose_le ? sig.propose_le : new Date().toISOString();
      const { error } = await db.from("admin_reseau_signaux").update({
        statut: valider ? "valide" : "rejete", extrait: null, decide_par: email, decide_le: decideLe,
      }).eq("id", sig.id).eq("statut", "propose");
      if (error) return json({ error: error.message }, 500);
      if (sig.type === "teleexpertise") await majRoleRequerant(db, sig.praticien_id);
      await db.from("admin_reseau_historique").insert({
        praticien_id: sig.praticien_id, acteur: email, action: valider ? "signal_valide" : "signal_rejete",
        detail: { type: sig.type, valeur: sig.valeur, url: sig.url },
      });
      return json({ id: sig.id });
    }

    case "google_rattacher": {
      const { data: p } = await db.from("admin_reseau_praticiens").select("id").eq("id", String(corps.praticien_id ?? "")).maybeSingle();
      if (!p) return json({ error: "Praticien introuvable." }, 404);
      const maintenant = new Date().toISOString();
      let maj: Record<string, unknown>;
      // « Retirer » : l'opérateur choisira lui-même parmi les fiches (pas de nouvelle recherche automatique).
      if (corps.retirer) maj = { google_place_id: null, google_place_ids: [], google_aucune_fiche: false, google_rattache_par: null, google_rattache_le: null, google_statut: "a_confirmer" };
      else if (corps.aucune) maj = { google_place_id: null, google_place_ids: [], google_aucune_fiche: true, google_rattache_par: email, google_rattache_le: maintenant, google_statut: "aucune" };
      else {
        // Une ou plusieurs fiches (cabinet, hôpital…) : les identifiants seuls.
        const ids = [...new Set<string>((Array.isArray(corps.place_ids) ? corps.place_ids : [corps.place_id]).map((x: unknown) => String(x ?? "").trim()))]
          .filter((x) => /^[A-Za-z0-9_-]{10,300}$/.test(x));
        if (!ids.length || ids.length > 10) return json({ error: "Choisissez entre une et dix fiches Google." }, 400);
        maj = { google_place_id: ids[0], google_place_ids: ids, google_aucune_fiche: false, google_rattache_par: email, google_rattache_le: maintenant, google_statut: "confirmee" };
      }
      const { error } = await db.from("admin_reseau_praticiens").update(maj).eq("id", p.id);
      if (error) return json({ error: error.message }, 500);
      await db.from("admin_reseau_historique").insert({
        praticien_id: p.id, acteur: email, action: "google_rattache",
        detail: { place_ids: maj.google_place_ids ?? [], aucune: maj.google_aucune_fiche ?? false },
      });
      return json({ id: p.id });
    }

    case "doctolib_fiche": {
      // Relevé d'une fiche Doctolib ouverte par l'opérateur, vérifié dans le Hub avant envoi.
      const url = corps.url;
      if (!urlDoctolibValide(url)) return json({ error: "Adresse de fiche Doctolib invalide." }, 400);
      const { data: p } = await db.from("admin_reseau_praticiens").select("id, etat, doctolib_infos").eq("id", String(corps.praticien_id ?? "")).maybeSingle();
      if (!p) return json({ error: "Praticien introuvable." }, 404);
      if (p.etat === "exclu") return json({ error: "Ce praticien est exclu." }, 409);
      const i = corps.infos ?? {};
      const txt = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);
      const lst = (v: unknown, n: number, m: number) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x: string) => x.slice(0, m)).slice(0, n) : []);
      const infos = {
        specialite: txt(i.specialite, 120), expertises: lst(i.expertises, 40, 120), conventionnement: txt(i.conventionnement, 160),
        carteVitale: typeof i.carteVitale === "boolean" ? i.carteVitale : null, teleconsultation: typeof i.teleconsultation === "boolean" ? i.teleconsultation : null,
        tarifs: lst(i.tarifs, 20, 160), langues: lst(i.langues, 15, 40), presentation: txt(i.presentation, 1500), adresses: lst(i.adresses, 5, 160),
        reservable: typeof i.reservable === "boolean" ? i.reservable : null,
        premierCreneau: i.premierCreneau && typeof i.premierCreneau === "object"
          ? { date: txt(i.premierCreneau.date, 10), jours: Number.isFinite(i.premierCreneau.jours) ? i.premierCreneau.jours : null, valeur: txt(i.premierCreneau.valeur, 20) }
          : null,
      };
      const lien = urlPropre(url);
      const maintenant = new Date().toISOString();
      const { error } = await db.from("admin_reseau_praticiens").update({
        doctolib_url: lien, doctolib_statut: "confirme", doctolib_par: email, doctolib_le: maintenant,
        doctolib_infos: { ...infos, disponibilites: p.doctolib_infos?.disponibilites ?? null }, doctolib_releve_le: maintenant, doctolib_releve_par: email,
      }).eq("id", p.id);
      if (error) return json({ error: error.message }, 500);

      // Signaux cochés par l'opérateur : validés, avec la fiche Doctolib comme source.
      const enregistres: string[] = [];
      for (const sg of Array.isArray(corps.signaux) ? corps.signaux.slice(0, 12) : []) {
        if (!estTypeSignal(sg?.type) || !valeurAdmise(sg.type, sg.valeur)) continue;
        await remplacerAncien(db, p.id, sg.type);
        const { error: eS } = await db.from("admin_reseau_signaux").insert({
          praticien_id: p.id, type: sg.type, valeur: sg.valeur, url: lien, origine: "operateur", statut: "valide",
          propose_par: email, decide_par: email, decide_le: maintenant,
        });
        if (!eS) enregistres.push(sg.type);
        if (sg.type === "teleexpertise") await majRoleRequerant(db, p.id);
      }
      await db.from("admin_reseau_historique").insert({
        praticien_id: p.id, acteur: email, action: "doctolib_releve", detail: { url: lien, signaux: enregistres },
      });
      return json({ id: p.id, signaux: enregistres });
    }

    case "doctolib_import": {
      // Résultats Doctolib relevés par l'équipe (fichier importé, vérifié à l'écran avant envoi).
      // Chaque ligne porte sa source (lien de la fiche) et la date du relevé ; rien n'est déduit d'autre.
      const lignes = Array.isArray(corps.lignes) ? corps.lignes.slice(0, 2000) : [];
      if (!lignes.length) return json({ error: "Aucune ligne à importer." }, 400);
      const jour = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
      const aujourdhui = new Date().toISOString().slice(0, 10);
      const rpps = [...new Set(lignes.map((l: any) => String(l?.rpps ?? "")).filter((r: string) => /^\d{11}$/.test(r)))] as string[];
      const parRpps = new Map<string, any>();
      for (let i = 0; i < rpps.length; i += 200) {
        const { data } = await db.from("admin_reseau_praticiens").select("id, rpps, nom, prenom, etat, doctolib_infos, admin_reseau_lieux(departement)").in("rpps", rpps.slice(i, i + 200));
        for (const p of data ?? []) parRpps.set(p.rpps, p);
      }
      const bilan = {
        mis_a_jour: 0, signaux: 0, inconnus: [] as string[], exclus: [] as string[], refuses: [] as string[],
        /** Praticiens qui ont désormais des propositions à valider (lien vers leur fiche). */
        a_valider: [] as { id: string; rpps: string; nom: string; prenom: string; departement: string | null; points: string[] }[],
      };
      for (const l of lignes) {
        const r = String(l?.rpps ?? "");
        const p = parRpps.get(r);
        const releve = jour(l?.releveLe);
        if (!p) { bilan.inconnus.push(r); continue; }
        if (p.etat === "exclu") { bilan.exclus.push(r); continue; }
        if (!urlDoctolibValide(l?.url) || !releve || releve > aujourdhui) { bilan.refuses.push(r); continue; }
        const lien = urlPropre(l.url);
        const premier = jour(l?.premierCreneau);
        const sept = Number.isFinite(l?.creneaux7j) && l.creneaux7j >= 0 ? Math.min(Math.round(l.creneaux7j), 10000) : null;
        const reservable = typeof l?.reservable === "boolean" ? l.reservable : null;
        const infos: Record<string, unknown> = { ...(p.doctolib_infos ?? {}) };
        if (reservable !== null) infos.reservable = reservable;
        if (premier || sept !== null) {
          infos.disponibilites = {
            creneaux: sept ?? 0, sous7Jours: sept ?? 0, parJour: [],
            premier: premier ? { date: premier, jours: Math.max(0, Math.round((Date.parse(premier) - Date.parse(releve)) / 86_400_000)) } : null,
            motif: null, releve_le: `${releve}T12:00:00Z`, releve_par: `${email} (import)`,
          };
        }
        const { error } = await db.from("admin_reseau_praticiens").update({
          doctolib_url: lien, doctolib_statut: "confirme", doctolib_par: `${email} (import)`, doctolib_le: new Date().toISOString(), doctolib_infos: infos,
        }).eq("id", p.id);
        if (error) { bilan.refuses.push(r); continue; }
        bilan.mis_a_jour++;
        // Signaux : PROPOSÉS, à valider sur la fiche (décision du 16/11). Datés du relevé (la
        // péremption du créneau part de cette date), source = la fiche, valeur lue en extrait.
        const dateFr = (d: string) => d.split("-").reverse().join("/");
        const signaux: [string, unknown, string][] = [
          ["creneau_doctolib", l?.creneau, premier ? `Import Doctolib, relevé du ${dateFr(releve)} : premier créneau le ${dateFr(premier)}${sept !== null ? `, ${sept} créneau(x) sur 7 jours` : ""}.` : `Import Doctolib, relevé du ${dateFr(releve)} : aucun créneau pour un nouveau patient.`],
          ["nouveaux_patients", l?.nouveauxPatients, `Import Doctolib, relevé du ${dateFr(releve)} : nouveaux patients « ${l?.nouveauxPatients} ».`],
        ];
        const points: string[] = [];
        for (const [type, valeur, extrait] of signaux) {
          if (typeof valeur !== "string" || !valeurAdmise(type as any, valeur)) continue;
          // Une proposition identique d'un import précédent est remplacée, pas doublée.
          await db.from("admin_reseau_signaux").delete().eq("praticien_id", p.id).eq("type", type).eq("statut", "propose").eq("url", lien);
          const { error: eS } = await db.from("admin_reseau_signaux").insert({
            praticien_id: p.id, type, valeur, url: lien, origine: "operateur", statut: "propose", extrait,
            propose_par: `${email} (import)`, propose_le: `${releve}T12:00:00Z`,
          });
          if (!eS) { bilan.signaux++; points.push(type === "creneau_doctolib" ? "premier créneau" : "nouveaux patients"); }
        }
        if (points.length) {
          bilan.a_valider.push({ id: p.id, rpps: r, nom: p.nom, prenom: p.prenom, departement: p.admin_reseau_lieux?.[0]?.departement ?? null, points });
        }
        await db.from("admin_reseau_historique").insert({ praticien_id: p.id, acteur: email, action: "doctolib_import", detail: { url: lien, releve_le: releve } });
      }
      return json(bilan);
    }

    case "doctolib_creneaux": {
      // Créneaux relevés par l'opérateur sur la page de prise de rendez-vous, vérifiés dans le Hub.
      const url = corps.url;
      if (!urlDoctolibValide(url)) return json({ error: "Adresse de fiche Doctolib invalide." }, 400);
      const { data: p } = await db.from("admin_reseau_praticiens").select("id, etat, doctolib_infos").eq("id", String(corps.praticien_id ?? "")).maybeSingle();
      if (!p) return json({ error: "Praticien introuvable." }, 404);
      if (p.etat === "exclu") return json({ error: "Ce praticien est exclu." }, 409);
      const d = corps.disponibilites ?? {};
      const entier = (v: unknown) => (Number.isFinite(v) && (v as number) >= 0 ? Math.min(Math.round(v as number), 10000) : 0);
      const jourIso = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
      const maintenant = new Date().toISOString();
      const disponibilites = {
        creneaux: entier(d.creneaux), sous7Jours: entier(d.sous7Jours),
        parJour: (Array.isArray(d.parJour) ? d.parJour : []).slice(0, 31).map((j: any) => ({ date: jourIso(j?.date), n: entier(j?.n) })).filter((j: any) => j.date),
        premier: d.premier && jourIso(d.premier.date) ? { date: jourIso(d.premier.date), jours: entier(d.premier.jours) } : null,
        motif: typeof d.motif === "string" ? d.motif.slice(0, 120) : null,
        releve_le: maintenant, releve_par: email,
      };
      const lien = urlPropre(url);
      const { error } = await db.from("admin_reseau_praticiens").update({
        doctolib_url: lien, doctolib_statut: "confirme", doctolib_par: email, doctolib_le: maintenant,
        doctolib_infos: { ...(p.doctolib_infos ?? {}), reservable: true, disponibilites },
      }).eq("id", p.id);
      if (error) return json({ error: error.message }, 500);
      let signal = false;
      if (typeof corps.creneau === "string" && valeurAdmise("creneau_doctolib", corps.creneau)) {
        await remplacerAncien(db, p.id, "creneau_doctolib");
        const { error: eS } = await db.from("admin_reseau_signaux").insert({
          praticien_id: p.id, type: "creneau_doctolib", valeur: corps.creneau, url: lien, origine: "operateur", statut: "valide",
          propose_par: email, decide_par: email, decide_le: maintenant,
        });
        signal = !eS;
      }
      await db.from("admin_reseau_historique").insert({
        praticien_id: p.id, acteur: email, action: "doctolib_creneaux", detail: { url: lien, creneaux: disponibilites.creneaux, sous7Jours: disponibilites.sous7Jours, signal },
      });
      return json({ id: p.id, signal });
    }

    case "doctolib": {
      const { data: p } = await db.from("admin_reseau_praticiens").select("id, doctolib_statut, doctolib_url, doctolib_infos").eq("id", String(corps.praticien_id ?? "")).maybeSingle();
      if (!p) return json({ error: "Praticien introuvable." }, 404);
      const maintenant = new Date().toISOString();
      let maj: Record<string, unknown>;
      if (corps.retirer) maj = { doctolib_url: null, doctolib_statut: "a_confirmer", doctolib_par: null, doctolib_le: null };
      else if (typeof corps.non_reservable === "boolean") {
        // Constaté par l'opérateur sur la fiche : « … n'est pas sur Doctolib, pas réservable en ligne ».
        if (!p.doctolib_url) return json({ error: "Aucune fiche Doctolib rattachée." }, 409);
        maj = { doctolib_infos: { ...(p.doctolib_infos ?? {}), reservable: !corps.non_reservable }, doctolib_statut: "confirme", doctolib_par: email, doctolib_le: maintenant };
      } else if (corps.aucun) maj = { doctolib_url: null, doctolib_statut: "aucun", doctolib_par: email, doctolib_le: maintenant };
      else if (corps.confirmer) {
        if (p.doctolib_statut !== "trouve_auto" || !p.doctolib_url) return json({ error: "Aucun lien trouvé automatiquement à confirmer." }, 409);
        maj = { doctolib_statut: "confirme", doctolib_par: email, doctolib_le: maintenant };
      } else {
        if (!urlDoctolibValide(corps.url)) return json({ error: "Collez l'adresse complète d'une fiche Doctolib (https://www.doctolib.fr/…)." }, 400);
        maj = { doctolib_url: urlPropre(corps.url), doctolib_statut: "confirme", doctolib_par: email, doctolib_le: maintenant };
      }
      const { error } = await db.from("admin_reseau_praticiens").update(maj).eq("id", p.id);
      if (error) return json({ error: error.message }, 500);
      await db.from("admin_reseau_historique").insert({ praticien_id: p.id, acteur: email, action: "doctolib", detail: { url: maj.doctolib_url ?? p.doctolib_url ?? null, statut: maj.doctolib_statut, ...(typeof corps.non_reservable === "boolean" ? { non_reservable: corps.non_reservable } : {}) } });
      return json({ id: p.id });
    }

    case "google_confirmer": {
      const { data: p } = await db.from("admin_reseau_praticiens").select("id, google_statut, google_place_id, google_place_ids").eq("id", String(corps.praticien_id ?? "")).maybeSingle();
      if (!p) return json({ error: "Praticien introuvable." }, 404);
      if (p.google_statut !== "trouvee_auto" || !(p.google_place_ids?.length || p.google_place_id)) return json({ error: "Aucune fiche trouvée automatiquement à confirmer." }, 409);
      const { error } = await db.from("admin_reseau_praticiens")
        .update({ google_statut: "confirmee", google_rattache_par: email, google_rattache_le: new Date().toISOString() }).eq("id", p.id);
      if (error) return json({ error: error.message }, 500);
      await db.from("admin_reseau_historique").insert({ praticien_id: p.id, acteur: email, action: "google_confirme", detail: { place_ids: p.google_place_ids ?? [p.google_place_id] } });
      return json({ id: p.id });
    }

    case "ajouter_rpps": {
      const rpps = normaliserRpps(corps.rpps);
      if (!rpps) return json({ error: "Un numéro RPPS compte 11 chiffres." }, 400);
      try {
        const [lignes, extraitLe] = await Promise.all([lignesDuRpps(rpps), dateExtraction()]);
        const r = praticienDepuisLignes(lignes, rpps);
        if ("refus" in r) return json({ error: r.refus }, 422);
        const e = await enregistrerPraticien(db, r.praticien, { origine: "manuel", acteur: email, extraitLe });
        if (e.statut === "exclu") return json({ error: "Ce praticien est exclu du réseau : il ne peut pas y revenir." }, 409);
        // Sa fiche Google se cherche aussitôt, en tâche de fond.
        if (e.statut === "cree") enTacheDeFond(chercherLiens(db, e.id).catch((x) => console.error(x)));
        return json({
          ...e, nom: `${r.praticien.prenom} ${r.praticien.nom}`, population: r.praticien.population,
          departements: [...new Set(r.praticien.lieux.map((l) => l.departement))],
        });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 502);
      }
    }

    default:
      return json({ error: "Action inconnue." }, 400);
  }
});
