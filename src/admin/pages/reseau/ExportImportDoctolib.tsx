// Réseau d'aval — export des liens Doctolib (tous départements) et import des résultats
// relevés par l'équipe. Le fichier importé est analysé et montré AVANT tout envoi : lignes
// retenues, erreurs ligne par ligne. Chaque résultat garde sa source (lien) et sa date.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Card, Modal } from "../../components/ui";
import { reseauRepo, type PraticienReseau } from "../../reseau/reseauRepo";
import { cn } from "@/lib/utils";
import { DOCTOLIB_LABEL, doctolibRenseigne, POPULATION_LIBELLE, TEXTES } from "../../reseau/libelles";
import { analyserImport, COLONNES_EXPORT, versCsv, type LectureImport } from "../../../../supabase/functions/_shared/doctolib-import";
import { VALEUR_LIBELLE } from "../../../../supabase/functions/_shared/reseau-signaux";

const btn = "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-[13px] font-semibold text-avisdoc-ink hover:bg-muted disabled:opacity-50";

/** Date du dernier relevé de la page Doctolib (relevé de fiche ou de créneaux, import). */
function dernierReleve(p: PraticienReseau): string | null {
  return [p.doctolibReleveLe, p.doctolibInfos?.disponibilites?.releve_le].filter((d): d is string => !!d).sort().pop() ?? null;
}

function telecharger(nom: string, contenu: string) {
  const url = URL.createObjectURL(new Blob([contenu], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ExportImportDoctolib({ lectureSeule }: { lectureSeule: boolean }) {
  const [exportEnCours, setExportEnCours] = useState(false);
  // Propositions laissées en attente par des imports antérieurs au 16/11 (validation une à une, abandonnée).
  const [enAttente, setEnAttente] = useState(0);
  const [validation, setValidation] = useState(false);
  useEffect(() => { reseauRepo.nbPropositionsImport().then(setEnAttente).catch(() => setEnAttente(0)); }, []);

  // Point sur la collecte (tous départements, praticiens non exclus ayant un lien).
  const [point, setPoint] = useState<{ liens: number; aCollecter: number; jamais: number; anciens: number; aValider: number; aChoisir: number } | null>(null);
  const calculerPoint = () => Promise.all([reseauRepo.praticiensAvecDoctolib(), reseauRepo.nbDoctolibAChoisir().catch(() => 0)]).then(([ps, aChoisir]) => {
    const limite = Date.now() - 180 * 86_400_000;
    let jamais = 0, anciens = 0, aValider = 0;
    for (const p of ps) {
      const d = dernierReleve(p);
      if (!d) jamais++;
      else if (Date.parse(d) < limite) anciens++;
      // Lien trouvé automatiquement, page jamais relevée : à vérifier.
      if (p.doctolibStatut === "trouve_auto" && !doctolibRenseigne(p)) aValider++;
    }
    setPoint({ liens: ps.length, aCollecter: jamais + anciens, jamais, anciens, aValider, aChoisir });
  }).catch(() => setPoint(null));
  useEffect(() => { void calculerPoint(); }, []);
  const validerTout = async () => {
    setValidation(true);
    try {
      const r = await reseauRepo.validerPropositionsImport();
      toast.success(`${r.valides} signal${r.valides > 1 ? "aux" : ""} d'import validé${r.valides > 1 ? "s" : ""}.`);
      setEnAttente(await reseauRepo.nbPropositionsImport().catch(() => 0));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setValidation(false);
    }
  };
  const [lecture, setLecture] = useState<(LectureImport & { fichier: string }) | null>(null);
  const fichier = useRef<HTMLInputElement>(null);

  const exporter = async () => {
    setExportEnCours(true);
    try {
      const ps = await reseauRepo.praticiensAvecDoctolib();
      if (!ps.length) { toast.info("Aucun lien Doctolib à exporter pour l'instant."); return; }
      const lignes = ps
        .sort((a, b) => (a.lieux[0]?.departement ?? "").localeCompare(b.lieux[0]?.departement ?? "") || a.nom.localeCompare(b.nom, "fr"))
        .map((p) => ({
          rpps: p.rpps, nom: p.nom, prenom: p.prenom, population: POPULATION_LIBELLE[p.population],
          ville: [...new Set(p.lieux.map((l) => l.commune).filter(Boolean))].join(", "),
          statut_lien: DOCTOLIB_LABEL[p.doctolibStatut], url_doctolib: p.doctolibUrl,
          dernier_releve: dernierReleve(p)?.slice(0, 10) ?? "",
        }));
      telecharger(`liens-doctolib-${new Date().toISOString().slice(0, 10)}.csv`, versCsv(lignes, COLONNES_EXPORT));
      toast.success(`${lignes.length} liens exportés.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setExportEnCours(false);
    }
  };

  const lire = async (f: File) => {
    const texte = await f.text();
    setLecture({ ...analyserImport(texte), fichier: f.name });
  };

  return (
    <Card className="mt-6 p-5 text-[13px]">
      <div className="font-display text-base font-semibold text-avisdoc-ink">Liens Doctolib : export et import des résultats</div>
      {/* Point rapide sur la collecte : liens, jamais relevés, relevés de plus de 180 jours. */}
      <div className="mt-2 flex flex-wrap gap-2 text-[12.5px]">
        {point === null ? <span className="text-muted-foreground">Calcul…</span> : (
          <>
            <span className="rounded-full bg-muted/60 px-3 py-1"><b className="text-avisdoc-ink">{point.liens}</b> <span className="text-muted-foreground">lien{point.liens > 1 ? "s" : ""} Doctolib</span></span>
            <span className={cn("rounded-full px-3 py-1", point.aCollecter ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800")}>
              <b>{point.aCollecter}</b> à collecter
              {point.aCollecter > 0 && <span className="opacity-80"> · {point.jamais} jamais relevé{point.jamais > 1 ? "s" : ""}, {point.anciens} de plus de 180 jours</span>}
            </span>
            <span className="rounded-full bg-muted/60 px-3 py-1"><b className="text-avisdoc-ink">{point.liens - point.aCollecter}</b> <span className="text-muted-foreground">relevé{point.liens - point.aCollecter > 1 ? "s" : ""} depuis moins de 180 jours</span></span>
            <span className={cn("rounded-full px-3 py-1", point.aValider + point.aChoisir ? "bg-violet-50 text-violet-900" : "bg-muted/60 text-muted-foreground")}
              title="Liens trouvés automatiquement à confirmer, et fiches à choisir (plusieurs fiches possibles)">
              <b>{point.aValider + point.aChoisir}</b> lien{point.aValider + point.aChoisir > 1 ? "s" : ""} à valider
              {point.aValider + point.aChoisir > 0 && <span className="opacity-80"> · {point.aValider} trouvé{point.aValider > 1 ? "s" : ""}, {point.aChoisir} à choisir</span>}
            </span>
          </>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void exporter()} disabled={exportEnCours} className={btn}>
          {exportEnCours ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Exporter les liens Doctolib
        </button>
        <button type="button" onClick={() => fichier.current?.click()} disabled={lectureSeule} title={lectureSeule ? TEXTES.motifLectureSeule : undefined} className={btn}>
          <Upload className="size-4" /> Importer les résultats
        </button>
        {enAttente > 0 && (
          <button type="button" onClick={() => void validerTout()} disabled={lectureSeule || validation}
            className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-violet-700 disabled:opacity-50">
            {validation ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Valider les {enAttente} proposition{enAttente > 1 ? "s" : ""} des imports précédents
          </button>
        )}
        <input ref={fichier} type="file" accept=".csv,text/csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void lire(f); e.target.value = ""; }} />
      </div>
      {lecture && <ApercuImport lecture={lecture} onClose={() => { setLecture(null); void calculerPoint(); }} />}
    </Card>
  );
}

function ApercuImport({ lecture, onClose }: { lecture: LectureImport & { fichier: string }; onClose: () => void }) {
  const [envoi, setEnvoi] = useState(false);
  const [bilan, setBilan] = useState<Awaited<ReturnType<typeof reseauRepo.importerResultatsDoctolib>> | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const { resultats, erreurs } = lecture;

  const importer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      const b = await reseauRepo.importerResultatsDoctolib(resultats);
      setBilan(b);
      toast.success(`${b.mis_a_jour} praticien${b.mis_a_jour > 1 ? "s" : ""} mis à jour, ${b.signaux} signal${b.signaux > 1 ? "aux" : ""} validé${b.signaux > 1 ? "s" : ""}.`);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="font-display text-xl font-semibold text-avisdoc-ink">Import des résultats Doctolib</h2>
      <p className="mt-1 text-[12.5px] text-muted-foreground">{lecture.fichier} · {resultats.length} ligne{resultats.length > 1 ? "s" : ""} retenue{resultats.length > 1 ? "s" : ""} · {erreurs.length} erreur{erreurs.length > 1 ? "s" : ""}</p>
      {erreur && <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800">{erreur}</div>}

      {bilan ? (
        <div className="mt-4 space-y-1.5 text-[13px]">
          <p><b>{bilan.mis_a_jour}</b> praticien{bilan.mis_a_jour > 1 ? "s" : ""} mis à jour · <b>{bilan.signaux}</b> signal{bilan.signaux > 1 ? "aux" : ""} validé{bilan.signaux > 1 ? "s" : ""}
            {bilan.deja_valides > 0 ? <> · {bilan.deja_valides} inchangé{bilan.deja_valides > 1 ? "s" : ""} (déjà validé{bilan.deja_valides > 1 ? "s" : ""} avec la même valeur)</> : null}.</p>
          {bilan.a_valider.length > 0 && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2">
              <div className="font-semibold text-violet-900">Signaux mis à jour ({bilan.a_valider.length} praticien{bilan.a_valider.length > 1 ? "s" : ""})</div>
              <ul className="mt-1 max-h-56 space-y-0.5 overflow-y-auto text-[12.5px]">
                {bilan.a_valider.map((x) => (
                  <li key={x.id}>
                    <Link to={x.departement ? `/reseau-aval/${x.departement}?praticien=${x.id}` : "/reseau-aval"} onClick={onClose}
                      className="font-semibold text-violet-900 underline-offset-2 hover:underline">{x.prenom} {x.nom}</Link>
                    <span className="text-violet-900/80"> · {x.points.join(", ")}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11.5px] text-violet-900/80">Validés à votre nom, datés du relevé, avec la fiche Doctolib comme source. Un signal se corrige sur la fiche du praticien (« Modifier »).</p>
            </div>
          )}
          {bilan.inconnus.length > 0 && <p className="text-amber-800">RPPS absents de la liste (ignorés) : {bilan.inconnus.join(", ")}</p>}
          {bilan.exclus.length > 0 && <p className="text-muted-foreground">Praticiens exclus (ignorés) : {bilan.exclus.join(", ")}</p>}
          {bilan.refuses.length > 0 && <p className="text-rose-700">Refusés par le serveur : {bilan.refuses.join(", ")}</p>}
          <div className="flex justify-end pt-2"><button type="button" onClick={onClose} className="rounded-full bg-avisdoc-teal px-5 py-2 text-sm font-bold text-white">Fermer</button></div>
        </div>
      ) : (
        <>
          {erreurs.length > 0 && (
            <div className="mt-3 max-h-40 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              {erreurs.map((e, i) => <div key={i}>Ligne {e.ligne} : {e.message}</div>)}
            </div>
          )}
          {resultats.length > 0 ? (
            <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-border/60">
              <table className="w-full text-[12px]">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr><th className="px-2 py-1.5">RPPS</th><th className="px-2">Relevé</th><th className="px-2">Réservable</th><th className="px-2">Nouveaux patients</th><th className="px-2">Premier créneau</th><th className="px-2">7 jours</th></tr>
                </thead>
                <tbody>
                  {resultats.slice(0, 200).map((r) => (
                    <tr key={r.rpps} className="border-t border-border/60">
                      <td className="px-2 py-1"><a href={r.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">{r.rpps}</a></td>
                      <td className="px-2">{new Date(r.releveLe).toLocaleDateString("fr-FR")}</td>
                      <td className="px-2">{r.reservable === null ? "—" : r.reservable ? "oui" : "non"}</td>
                      <td className="px-2">{r.nouveauxPatients ?? "—"}</td>
                      <td className="px-2">{r.premierCreneau ? `${new Date(r.premierCreneau).toLocaleDateString("fr-FR")} (${VALEUR_LIBELLE[r.creneau!]?.toLowerCase()})` : r.creneau ? VALEUR_LIBELLE[r.creneau] : "—"}</td>
                      <td className="px-2">{r.creneaux7j ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="mt-3 text-[13px] text-muted-foreground">Aucune ligne remplie à importer.</p>}
          <p className="mt-2 text-[11.5px] text-muted-foreground">À l'enregistrement : lien confirmé, « réservable » et créneaux mis à jour. « Premier créneau » et « nouveaux patients » sont <b>validés d'office</b> à votre nom, datés du relevé, avec la fiche Doctolib comme source.</p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground">Annuler</button>
            <button type="button" onClick={() => void importer()} disabled={!resultats.length || envoi}
              className="hub-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
              {envoi && <Loader2 className="size-4 animate-spin" />} Importer {resultats.length} ligne{resultats.length > 1 ? "s" : ""}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
