// Import des résultats Doctolib (fichier CSV relu à l'écran, ou connecteur MCP) : logique
// commune, mêmes contrôles quelle que soit l'entrée. Signaux validés d'office au nom de
// l'importateur, datés du relevé, source = la fiche Doctolib (décision du 16/11).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { valeurAdmise } from "./reseau-signaux.ts";
import { urlDoctolibValide, urlPropre } from "./doctolib.ts";
import { analyserCreneaux, analyserFicheDoctolib } from "./doctolib-fiche.ts";

const texte = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.slice(0, n) : null);
const liste = (v: unknown, n = 30, m = 200) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x: string) => x.trim().slice(0, m)).slice(0, n) : []);

/** Le signal validé précédent du même type passe à « remplacé » (un seul validé à la fois). */
export async function remplacerAncien(db: any, praticienId: string, type: string, saufId?: string) {
  let q = db.from("admin_reseau_signaux").update({ statut: "remplace" })
    .eq("praticien_id", praticienId).eq("type", type).eq("statut", "valide");
  if (saufId) q = q.neq("id", saufId);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

/** `email` : l'importateur (opérateur, ou « MCP <nom de la clé> »). Lève une erreur si rien à importer. */
const LIBELLE_POINT: Record<string, string> = {
  creneau_doctolib: "premier créneau", nouveaux_patients: "nouveaux patients", dermoscopie: "dermoscopie",
  motif_exerese: "exérèse", chirurgie_sur_place: "chirurgie sur place",
};

export async function importerResultatsDoctolib(db: any, email: string, lignesRecues: unknown) {
    // Résultats Doctolib relevés par l'équipe (fichier importé, vérifié à l'écran avant envoi).
    // Chaque ligne porte sa source (lien de la fiche) et la date du relevé ; rien n'est déduit d'autre.
    const lignes = Array.isArray(lignesRecues) ? lignesRecues.slice(0, 2000) : [];
    if (!lignes.length) throw new Error("Aucune ligne à importer.");
    const jour = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const rpps = [...new Set(lignes.map((l: any) => String(l?.rpps ?? "")).filter((r: string) => /^\d{11}$/.test(r)))] as string[];
    const parRpps = new Map<string, any>();
    for (let i = 0; i < rpps.length; i += 200) {
      const { data } = await db.from("admin_reseau_praticiens").select("id, rpps, nom, prenom, etat, doctolib_infos, doctolib_releve_le, admin_reseau_lieux(departement)").in("rpps", rpps.slice(i, i + 200));
      for (const p of data ?? []) parRpps.set(p.rpps, p);
    }
    const bilan = {
      mis_a_jour: 0, signaux: 0, deja_valides: 0, inconnus: [] as string[], exclus: [] as string[], refuses: [] as string[],
      /** Signaux qui n'ont pas pu être enregistrés, avec la raison (pour ne plus avoir « 0 » sans explication). */
      erreurs_signaux: [] as string[],
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
      const releveDate = new Date(`${releve}T12:00:00Z`);
      // Contenu complet relevé : analysé comme une fiche Doctolib (rubriques, « Voir plus »), conservé.
      const texteFiche = texte(l?.texteFiche, 60000);
      const texteCreneaux = texte(l?.texteCreneaux, 60000);
      const fiche = texteFiche ? analyserFicheDoctolib(texteFiche, releveDate) : null;
      const dispo = texteCreneaux ? analyserCreneaux(texteCreneaux, releveDate) : null;
      const reservable = typeof l?.reservable === "boolean" ? l.reservable : fiche?.reservable ?? null;
      const infos: Record<string, unknown> = { ...(p.doctolib_infos ?? {}) };
      if (reservable !== null) infos.reservable = reservable;
      if (fiche) {
        Object.assign(infos, {
          specialite: fiche.specialite ?? infos.specialite ?? null, expertises: fiche.expertises, conventionnement: fiche.conventionnement,
          carteVitale: fiche.carteVitale, teleconsultation: fiche.teleconsultation, tarifs: fiche.tarifs, langues: fiche.langues,
          presentation: fiche.presentation, adresses: fiche.adresses, texte_integral: texteFiche,
        });
      }
      if (texteCreneaux) infos.texte_creneaux = texteCreneaux;
      const releveSur = texte(l?.releveSur, 300);
      if (releveSur) infos.releve_creneaux_sur = releveSur;
      const site = texte(l?.siteWeb, 500);
      if (site) infos.site_web = site;
      for (const [cle, val] of [["telephones", liste(l?.telephones)], ["motifs", liste(l?.motifs, 60)], ["lieux", liste(l?.lieux)]] as const) {
        if (val.length) infos[cle] = val;
      }
      // Liste structurée des horaires (« AAAA-MM-JJ HH:MM ») : comptés par jour.
      const horaires = liste(l?.creneaux, 200, 30).map((c) => c.slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
      const dispoListe = horaires.length ? (() => {
        const parJour = [...horaires.reduce((m, d) => m.set(d, (m.get(d) ?? 0) + 1), new Map<string, number>())].map(([date, n]) => ({ date, n }));
        const jours = (d: string) => Math.round((Date.parse(d) - Date.parse(releve)) / 86_400_000);
        const premierJ = parJour[0];
        return {
          creneaux: horaires.length, sous7Jours: horaires.filter((d) => jours(d) >= 0 && jours(d) < 7).length, parJour,
          premier: premierJ ? { date: premierJ.date, jours: Math.max(0, jours(premierJ.date)) } : null,
        };
      })() : null;
      const autres = l?.autres && typeof l.autres === "object" ? Object.fromEntries(Object.entries(l.autres).filter(([, v]) => typeof v === "string" && v.trim()).slice(0, 40).map(([k, v]) => [String(k).slice(0, 60), String(v).slice(0, 20000)])) : null;
      if (autres && Object.keys(autres).length) infos.autres = { ...(infos.autres as object ?? {}), ...autres };
      if (dispoListe) {
        infos.disponibilites = { ...dispoListe, motif: null, releve_le: `${releve}T12:00:00Z`, releve_par: `${email} (import)` };
      } else if (dispo && dispo.parJour.length) {
        infos.disponibilites = {
          creneaux: dispo.creneaux, sous7Jours: dispo.sous7Jours, parJour: dispo.parJour, premier: dispo.premier,
          motif: null, releve_le: `${releve}T12:00:00Z`, releve_par: `${email} (import)`,
        };
      } else if (premier || sept !== null) {
        infos.disponibilites = {
          creneaux: sept ?? 0, sous7Jours: sept ?? 0, parJour: [],
          premier: premier ? { date: premier, jours: Math.max(0, Math.round((Date.parse(premier) - Date.parse(releve)) / 86_400_000)) } : null,
          motif: null, releve_le: `${releve}T12:00:00Z`, releve_par: `${email} (import)`,
        };
      }
      const { error } = await db.from("admin_reseau_praticiens").update({
        doctolib_url: lien, doctolib_statut: "confirme", doctolib_par: `${email} (import)`, doctolib_le: new Date().toISOString(), doctolib_infos: infos,
        // Date du dernier relevé de la page (le plus récent l'emporte) : sert au suivi de la collecte.
        ...(!p.doctolib_releve_le || Date.parse(p.doctolib_releve_le) < Date.parse(`${releve}T12:00:00Z`)
          ? { doctolib_releve_le: `${releve}T12:00:00Z`, doctolib_releve_par: `${email} (import)` } : {}),
      }).eq("id", p.id);
      if (error) { bilan.refuses.push(r); continue; }
      bilan.mis_a_jour++;
      // Signaux : VALIDÉS d'office au nom de l'importateur (décision du 16/11, qui remplace la
      // validation une à une). Datés du relevé (la péremption du créneau part de cette date),
      // source = la fiche Doctolib.
      const dateFr = (d: string) => d.split("-").reverse().join("/");
      // Valeurs explicites d'abord ; à défaut, ce que l'analyse des textes a trouvé sur la fiche.
      const delai = dispoListe?.premier?.jours;
      const creneauListe = delai == null ? null : delai < 7 ? "moins_7j" : delai <= 30 ? "7_30j" : "plus_30j";
      const creneau = l?.creneau ?? creneauListe ?? dispo?.valeur ?? fiche?.premierCreneau?.valeur ?? null;
      const nouveaux = l?.nouveauxPatients ?? fiche?.nouveauxPatients?.valeur ?? null;
      const signaux: [string, unknown, string][] = [
        ["creneau_doctolib", creneau, premier ? `Import Doctolib, relevé du ${dateFr(releve)} : premier créneau le ${dateFr(premier)}${sept !== null ? `, ${sept} créneau(x) sur 7 jours` : ""}.` : `Import Doctolib, relevé du ${dateFr(releve)}.`],
        ["nouveaux_patients", nouveaux, `Import Doctolib, relevé du ${dateFr(releve)} : nouveaux patients « ${nouveaux} ».`],
        // Grille du brief : signaux repérés dans les expertises de la fiche (dermoscopie, exérèse, chirurgie).
        ...(fiche?.signaux ?? []).filter((x) => !["creneau_doctolib", "nouveaux_patients"].includes(x.type))
          .map((x) => [x.type, x.valeur, x.extrait] as [string, unknown, string]),
      ];
      const points: string[] = [];
      for (const [type, valeur, extrait] of signaux) {
        if (typeof valeur !== "string" || !valeurAdmise(type as any, valeur)) continue;
        // Déjà validé avec la même valeur : on ne redemande pas (décision du 16/11). Pour un
        // créneau, un relevé plus récent rafraîchit seulement sa date (péremption à 14 jours).
        const { data: deja } = await db.from("admin_reseau_signaux").select("id, decide_le")
          .eq("praticien_id", p.id).eq("type", type).eq("statut", "valide").eq("valeur", valeur).maybeSingle();
        if (deja) {
          const releveIso = `${releve}T12:00:00Z`;
          if (type === "creneau_doctolib" && (!deja.decide_le || Date.parse(deja.decide_le) < Date.parse(releveIso))) {
            await db.from("admin_reseau_signaux").update({ decide_le: releveIso, url: lien }).eq("id", deja.id);
          }
          await db.from("admin_reseau_signaux").delete().eq("praticien_id", p.id).eq("type", type).eq("statut", "propose").eq("url", lien);
          bilan.deja_valides++;
          continue;
        }
        void extrait;
        // Les propositions d'imports précédents pour ce signal n'ont plus lieu d'être.
        await db.from("admin_reseau_signaux").delete().eq("praticien_id", p.id).eq("type", type).eq("statut", "propose").like("propose_par", "%(import)");
        try { await remplacerAncien(db, p.id, type); } catch (e) { bilan.erreurs_signaux.push(`${r} · ${type} : ${(e as Error).message}`); continue; }
        const { error: eS } = await db.from("admin_reseau_signaux").insert({
          praticien_id: p.id, type, valeur, url: lien, origine: "operateur", statut: "valide",
          propose_par: `${email} (import)`, propose_le: `${releve}T12:00:00Z`,
          decide_par: `${email} (import)`, decide_le: `${releve}T12:00:00Z`,
        });
        if (!eS) { bilan.signaux++; points.push(LIBELLE_POINT[type] ?? type); }
        else bilan.erreurs_signaux.push(`${r} · ${type} : ${eS.message}`);
      }
      if (points.length) {
        bilan.a_valider.push({ id: p.id, rpps: r, nom: p.nom, prenom: p.prenom, departement: p.admin_reseau_lieux?.[0]?.departement ?? null, points });
      }
      await db.from("admin_reseau_historique").insert({ praticien_id: p.id, acteur: email, action: "doctolib_import", detail: { url: lien, releve_le: releve } });
    }
    return bilan;
}

/**
 * Fiche Doctolib « inexistante » (« Cette page n'existe plus ») signalée par un relevé : le lien
 * est retiré et mémorisé pour ne plus être reproposé — comme le bouton « N'existe plus ».
 * Seulement si le lien signalé est bien celui de la fiche (sinon rien n'est touché).
 */
export async function retirerPageDisparue(db: any, email: string, rpps: string, url: string): Promise<"retiree" | "inconnu" | "autre_lien"> {
  const { data: p } = await db.from("admin_reseau_praticiens").select("id, doctolib_url, doctolib_infos").eq("rpps", rpps).maybeSingle();
  if (!p) return "inconnu";
  if (!p.doctolib_url || !urlDoctolibValide(url) || urlPropre(url) !== p.doctolib_url) return "autre_lien";
  const disparues = [...new Set([...(Array.isArray(p.doctolib_infos?.pages_disparues) ? p.doctolib_infos.pages_disparues : []), p.doctolib_url])].slice(-10);
  await db.from("admin_reseau_praticiens").update({
    doctolib_url: null, doctolib_statut: "aucun", doctolib_par: `${email} (import)`, doctolib_le: new Date().toISOString(),
    doctolib_infos: { ...(p.doctolib_infos ?? {}), reservable: null, disponibilites: null, pages_disparues: disparues },
  }).eq("id", p.id);
  await db.from("admin_reseau_historique").insert({ praticien_id: p.id, acteur: email, action: "doctolib", detail: { url: p.doctolib_url, statut: "aucun", page_disparue: p.doctolib_url } });
  return "retiree";
}
