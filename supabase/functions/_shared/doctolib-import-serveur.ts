// Import des résultats Doctolib (fichier CSV relu à l'écran, ou connecteur MCP) : logique
// commune, mêmes contrôles quelle que soit l'entrée. Signaux validés d'office au nom de
// l'importateur, datés du relevé, source = la fiche Doctolib (décision du 16/11).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { valeurAdmise } from "./reseau-signaux.ts";
import { urlDoctolibValide, urlPropre } from "./doctolib.ts";

/** Le signal validé précédent du même type passe à « remplacé » (un seul validé à la fois). */
export async function remplacerAncien(db: any, praticienId: string, type: string, saufId?: string) {
  let q = db.from("admin_reseau_signaux").update({ statut: "remplace" })
    .eq("praticien_id", praticienId).eq("type", type).eq("statut", "valide");
  if (saufId) q = q.neq("id", saufId);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

/** `email` : l'importateur (opérateur, ou « MCP <nom de la clé> »). Lève une erreur si rien à importer. */
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
      const signaux: [string, unknown, string][] = [
        ["creneau_doctolib", l?.creneau, premier ? `Import Doctolib, relevé du ${dateFr(releve)} : premier créneau le ${dateFr(premier)}${sept !== null ? `, ${sept} créneau(x) sur 7 jours` : ""}.` : `Import Doctolib, relevé du ${dateFr(releve)} : aucun créneau pour un nouveau patient.`],
        ["nouveaux_patients", l?.nouveauxPatients, `Import Doctolib, relevé du ${dateFr(releve)} : nouveaux patients « ${l?.nouveauxPatients} ».`],
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
        await remplacerAncien(db, p.id, type);
        const { error: eS } = await db.from("admin_reseau_signaux").insert({
          praticien_id: p.id, type, valeur, url: lien, origine: "operateur", statut: "valide",
          propose_par: `${email} (import)`, propose_le: `${releve}T12:00:00Z`,
          decide_par: `${email} (import)`, decide_le: `${releve}T12:00:00Z`,
        });
        if (!eS) { bilan.signaux++; points.push(type === "creneau_doctolib" ? "premier créneau" : "nouveaux patients"); }
      }
      if (points.length) {
        bilan.a_valider.push({ id: p.id, rpps: r, nom: p.nom, prenom: p.prenom, departement: p.admin_reseau_lieux?.[0]?.departement ?? null, points });
      }
      await db.from("admin_reseau_historique").insert({ praticien_id: p.id, acteur: email, action: "doctolib_import", detail: { url: lien, releve_le: releve } });
    }
    return bilan;
}
