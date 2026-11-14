// Réseau d'aval — écran 2 : un département. Action principale : importer (ou
// rafraîchir) les médecins depuis l'extraction RPPS. Liste filtrable, fiche
// résumée du praticien, exclusion définitive.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Loader2, Sparkles, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge, Card, Modal, PageHeader } from "../components/ui";
import { lectureSeuleActive } from "../lib/lectureSeule";
import {
  DEPARTEMENTS,
  ETAT_DEPARTEMENT_LABEL,
  ETAT_PRATICIEN_BADGE,
  ETAT_PRATICIEN_LABEL,
  ETATS_PRATICIEN,
  POPULATION_LIBELLE,
  POPULATION_PLURIEL,
  POPULATIONS,
  ROLE_LABEL,
  ROLES,
  SOURCE_RPPS,
  TEXTES,
  dateFr,
  estPerime,
  type EtatPraticien,
  type Population,
  type Role,
} from "../reseau/libelles";
import { reseauRepo, type DepartementReseau, type ImportReseau, type PraticienReseau, type RechercheIa, type SignalReseau } from "../reseau/reseauRepo";
import { calculerScore } from "../../../supabase/functions/_shared/reseau-signaux";
import FichePraticien from "./reseau/FichePraticien";
import { cn } from "@/lib/utils";

const COLS_FULL = "minmax(170px,1.6fr) 140px minmax(170px,1.6fr) 90px 110px 74px";
const COLS_COMPACT = "minmax(160px,1.4fr) 110px 64px";

export default function ReseauDepartement() {
  const { code = "" } = useParams();
  const [dep, setDep] = useState<DepartementReseau | null>(null);
  const [praticiens, setPraticiens] = useState<PraticienReseau[]>([]);
  const [dernier, setDernier] = useState<ImportReseau | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [importEnCours, setImportEnCours] = useState(false);
  const [selection, setSelection] = useState<string | null>(null);
  const [signaux, setSignaux] = useState<SignalReseau[]>([]);
  const [rechercheMg, setRechercheMg] = useState<RechercheIa | null>(null);
  const [ajoutRpps, setAjoutRpps] = useState(false);
  const [filtres, setFiltres] = useState<{ q: string; population: "" | Population; role: "" | Role; etat: "" | EtatPraticien }>({
    q: "", population: "", role: "", etat: "",
  });
  const lectureSeule = lectureSeuleActive();

  const charger = async () => {
    setChargement(true);
    setErreur(null);
    try {
      const [ds, ps, di] = await Promise.all([reseauRepo.departements(), reseauRepo.praticiens(code), reseauRepo.dernierImport(code)]);
      setDep(ds.find((d) => d.code === code) ?? null);
      setPraticiens(ps);
      setDernier(di);
      const [sg, rm] = await Promise.all([reseauRepo.signauxDe(ps.map((x) => x.id)), reseauRepo.derniereRecherche({ departement: code })]);
      setSignaux(sg);
      setRechercheMg(rm);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setChargement(false);
    }
  };
  useEffect(() => { void charger(); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const importer = async () => {
    setImportEnCours(true);
    setErreur(null);
    try {
      const r = await reseauRepo.importer(code);
      const c = r.compteurs ?? {};
      toast.success(`Import terminé : ${c.praticiens ?? 0} praticiens, dont ${c.crees ?? 0} nouveaux.`);
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      void reseauRepo.dernierImport(code).then(setDernier).catch(() => undefined);
    } finally {
      setImportEnCours(false);
    }
  };

  // Score de chaque praticien, à partir de ses seuls signaux validés.
  const scores = useMemo(() => {
    const valides = new Map<string, SignalReseau[]>();
    const enAttente = new Map<string, number>();
    for (const sg of signaux) {
      if (sg.statut === "valide") valides.set(sg.praticienId, [...(valides.get(sg.praticienId) ?? []), sg]);
      else enAttente.set(sg.praticienId, (enAttente.get(sg.praticienId) ?? 0) + 1);
    }
    return new Map(praticiens.map((p) => [p.id, { probabilite: calculerScore(p, valides.get(p.id) ?? []).probabilite, aValider: enAttente.get(p.id) ?? 0 }]));
  }, [praticiens, signaux]);

  const rows = useMemo(() => {
    const q = filtres.q.trim().toLowerCase();
    return praticiens.filter((p) =>
      (!filtres.population || p.population === filtres.population) &&
      (!filtres.role || p.roles.includes(filtres.role)) &&
      (!filtres.etat || p.etat === filtres.etat) &&
      (!q || `${p.nom} ${p.prenom} ${p.rpps} ${p.lieux.map((l) => `${l.raisonSociale ?? ""} ${l.commune ?? ""}`).join(" ")}`.toLowerCase().includes(q)))
      .sort((a, b) => (scores.get(b.id)?.probabilite ?? 0) - (scores.get(a.id)?.probabilite ?? 0) || a.nom.localeCompare(b.nom, "fr"));
  }, [praticiens, filtres, scores]);

  // Recherche IA des généralistes formés à la dermoscopie : suivie toutes les 5 secondes.
  useEffect(() => {
    if (rechercheMg?.statut !== "en_cours") return;
    const t = window.setInterval(async () => {
      const r = await reseauRepo.derniereRecherche({ departement: code }).catch(() => null);
      if (r && r.statut !== "en_cours") { window.clearInterval(t); setRechercheMg(r); void charger(); }
    }, 5000);
    return () => window.clearInterval(t);
  }, [rechercheMg?.statut, code]); // eslint-disable-line react-hooks/exhaustive-deps

  const lancerMg = async () => {
    setErreur(null);
    try {
      await reseauRepo.lancerIaMg(code);
      toast.success("Recherche lancée : les généralistes trouvés arrivent dans quelques minutes.");
      setRechercheMg(await reseauRepo.derniereRecherche({ departement: code }));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  };

  // Niveau 2 : contexte du département, calculé sur l'extraction RPPS. Il informe, il ne filtre pas.
  const contexte = useMemo(() => {
    const parPop = new Map<Population, { total: number; liberaux: number; salaries: number }>();
    for (const p of praticiens) {
      if (p.etat === "exclu") continue;
      const ici = p.lieux.filter((l) => l.departement === code);
      const c = parPop.get(p.population) ?? { total: 0, liberaux: 0, salaries: 0 };
      c.total++;
      if (ici.some((l) => l.modeExercice === "Libéral")) c.liberaux++;
      if (ici.some((l) => l.modeExercice === "Salarié")) c.salaries++;
      parPop.set(p.population, c);
    }
    return parPop;
  }, [praticiens, code]);

  const nom = DEPARTEMENTS[code] ?? code;
  const extraitLe = dernier?.rppsExtraitLe ?? null;
  const motifImport = lectureSeule ? TEXTES.motifLectureSeule : importEnCours ? TEXTES.motifImportEnCours : !dep ? "Département absent de la liste." : null;
  const selectionne = praticiens.find((p) => p.id === selection) ?? null;

  return (
    <div>
      <Link to="/reseau-aval" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-avisdoc-ink">
        <ArrowLeft className="size-4" /> Départements
      </Link>
      <PageHeader
        title={`${code} · ${nom}`}
        subtitle={dep ? `${ETAT_DEPARTEMENT_LABEL[dep.etat]} · ${praticiens.length} praticiens` : undefined}
        action={
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => void importer()}
              disabled={!!motifImport}
              title={motifImport ?? undefined}
              className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {importEnCours ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {importEnCours ? TEXTES.importEnCours : dep?.dernierImportLe ? TEXTES.rafraichir : TEXTES.importer}
            </button>
            {motifImport && <span className="text-[11.5px] text-muted-foreground">{motifImport}</span>}
          </div>
        }
      />

      {erreur && (
        <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">{erreur}</div>
      )}

      {/* Source et fraîcheur, puis contexte du département. */}
      <Card className="mb-4 px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
          <span>
            Source :{" "}
            <a href={SOURCE_RPPS.url} target="_blank" rel="noreferrer" className="font-semibold text-avisdoc-ink underline-offset-2 hover:underline">
              {SOURCE_RPPS.libelle}
            </a>
          </span>
          {extraitLe ? (
            <span className={cn(estPerime(extraitLe) && "font-semibold text-amber-700")}>
              Extraction du {dateFr(extraitLe)}{estPerime(extraitLe) ? ` · ${TEXTES.perime}` : ""}
            </span>
          ) : (
            <span>{TEXTES.pasEncoreImporte}</span>
          )}
          {dernier?.statut === "echec" && <span className="font-semibold text-rose-700">Dernier import en échec : {dernier.erreur}</span>}
          {dernier?.statut === "termine" && dernier.compteurs && (
            <span>
              Dernier import : {dernier.compteurs.crees ?? 0} créés, {dernier.compteurs.mis_a_jour ?? 0} mis à jour,{" "}
              {dernier.compteurs.exclus_ignores ?? 0} exclus ignorés, {dernier.compteurs.relies_liste ?? 0} déjà dans la liste
            </span>
          )}
        </div>
        {contexte.size > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {POPULATIONS.filter((p) => contexte.has(p)).map((p) => {
              const c = contexte.get(p)!;
              return (
                <span key={p} className="rounded-xl bg-muted/60 px-3 py-1.5 text-[12.5px]">
                  <b className="text-avisdoc-ink">{c.total}</b> {c.total > 1 ? POPULATION_PLURIEL[p] : p === "ORL" ? "ORL" : POPULATION_LIBELLE[p].toLowerCase()}
                  <span className="text-muted-foreground">
                    {" · "}{c.liberaux} {c.liberaux > 1 ? "libéraux" : "libéral"}, {c.salaries} {c.salaries > 1 ? "salariés" : "salarié"}
                  </span>
                </span>
              );
            })}
          </div>
        )}
      </Card>

      {/* Actions secondaires : ajouter un praticien hors import */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12.5px]">
        <button type="button" onClick={() => setAjoutRpps(true)} disabled={lectureSeule || !dep} title={lectureSeule ? TEXTES.motifLectureSeule : undefined}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 font-semibold text-avisdoc-ink hover:bg-muted disabled:opacity-50">
          <UserPlus className="size-4" /> Ajouter par RPPS
        </button>
        <button type="button" onClick={() => void lancerMg()} disabled={lectureSeule || !dep || rechercheMg?.statut === "en_cours"}
          title={lectureSeule ? TEXTES.motifLectureSeule : rechercheMg?.statut === "en_cours" ? "Une recherche est en cours." : undefined}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 font-semibold text-avisdoc-ink hover:bg-muted disabled:opacity-50">
          {rechercheMg?.statut === "en_cours" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Chercher les généralistes formés à la dermoscopie (IA)
        </button>
        <span className="text-muted-foreground">
          {rechercheMg?.statut === "en_cours" && `Recherche lancée le ${dateFr(rechercheMg.debut)}…`}
          {rechercheMg?.statut === "echec" && <span className="font-semibold text-rose-700">Dernière recherche en échec : {rechercheMg.erreur}</span>}
          {rechercheMg?.statut === "termine" && `Dernière recherche : ${rechercheMg.resultat?.propositions ?? 0} trouvés, ${rechercheMg.resultat?.crees ?? 0} ajoutés, ${rechercheMg.resultat?.deja_la ?? 0} déjà là, ${rechercheMg.resultat?.ecartees?.length ?? 0} écartés (source non vérifiée ou RPPS introuvable).`}
        </span>
      </div>

      {/* Filtres */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className="ad-input max-w-[280px] flex-1 rounded-full border border-border bg-card px-4 py-2.5 text-[13.5px] outline-none focus:border-avisdoc-teal"
          placeholder="Nom, RPPS, structure, commune…"
          value={filtres.q}
          onChange={(e) => setFiltres((f) => ({ ...f, q: e.target.value }))}
        />
        <Filtre label="Population" tous="toutes" valeur={filtres.population} onChange={(v) => setFiltres((f) => ({ ...f, population: v as "" | Population }))}
          options={POPULATIONS.map((p) => [p, POPULATION_LIBELLE[p]])} />
        <Filtre label="Rôle" tous="tous" valeur={filtres.role} onChange={(v) => setFiltres((f) => ({ ...f, role: v as "" | Role }))}
          options={ROLES.map((r) => [r, ROLE_LABEL[r]])} />
        <Filtre label="État" tous="tous" valeur={filtres.etat} onChange={(v) => setFiltres((f) => ({ ...f, etat: v as "" | EtatPraticien }))}
          options={ETATS_PRATICIEN.map((e) => [e, ETAT_PRATICIEN_LABEL[e]])} />
        <span className="ml-auto text-[12.5px] text-muted-foreground">{rows.length} affichés · triés par probabilité d'adhésion</span>
      </div>

      <div className="grid items-start gap-5" style={{ gridTemplateColumns: selectionne ? "minmax(0,1fr) minmax(360px,1fr)" : "1fr" }}>
        <Card className="overflow-hidden">
          <div className="grid gap-3 border-b border-border/60 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground"
            style={{ gridTemplateColumns: selectionne ? COLS_COMPACT : COLS_FULL }}>
            <div>Praticien</div>
            <div>Population</div>
            {!selectionne && <><div>Lieu d'exercice</div><div>Exercice</div><div>État</div></>}
            <div className="text-right">Score</div>
          </div>
          {chargement && (
            <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Chargement…
            </div>
          )}
          {!chargement && rows.map((p) => {
            const ici = p.lieux.filter((l) => l.departement === code);
            return (
              <button key={p.id} type="button" onClick={() => setSelection(p.id)}
                className={cn("ad-row grid w-full items-center gap-3 border-b border-border/60 px-5 py-3 text-left last:border-b-0",
                  selection === p.id && "bg-sky-50/70")}
                style={{ gridTemplateColumns: selectionne ? COLS_COMPACT : COLS_FULL }}>
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-avisdoc-ink">{p.nom} {p.prenom}</div>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {p.contactId && <Badge className="bg-emerald-50 text-emerald-800">{TEXTES.dejaDansLaListe}</Badge>}
                    {!p.vuAuDernierImport && <Badge className="bg-amber-50 text-amber-800">{TEXTES.absentExtraction}</Badge>}
                  </div>
                </div>
                <div className="text-[12.5px] text-muted-foreground">{POPULATION_LIBELLE[p.population]}</div>
                {!selectionne && (
                  <>
                    <div className="min-w-0 text-[12.5px] text-muted-foreground">
                      <div className="truncate">{ici[0]?.raisonSociale ?? "—"}</div>
                      <div className="truncate">{ici[0]?.commune ?? ""}{ici.length > 1 ? ` · +${ici.length - 1} lieu${ici.length > 2 ? "x" : ""}` : ""}</div>
                    </div>
                    <div className="text-[12.5px] text-muted-foreground">{[...new Set(ici.map((l) => l.modeExercice).filter(Boolean))].join(", ") || "—"}</div>
                    <div><Badge className={ETAT_PRATICIEN_BADGE[p.etat]}>{ETAT_PRATICIEN_LABEL[p.etat]}</Badge></div>
                  </>
                )}
                <div className="text-right">
                  <div className="text-[13px] font-semibold tabular-nums text-avisdoc-ink">{Math.round((scores.get(p.id)?.probabilite ?? 0) * 100)} %</div>
                  {(scores.get(p.id)?.aValider ?? 0) > 0 && <div className="text-[10.5px] font-semibold text-violet-700">{scores.get(p.id)?.aValider} à valider</div>}
                </div>
              </button>
            );
          })}
          {!chargement && rows.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              {praticiens.length === 0 ? TEXTES.pasEncoreImporte : TEXTES.aucunPraticien}
            </div>
          )}
        </Card>

        {selectionne && (
          <FichePraticien
            praticien={selectionne}
            lectureSeule={lectureSeule}
            onClose={() => setSelection(null)}
            onChange={() => void charger()}
          />
        )}
      </div>

      {ajoutRpps && (
        <AjoutRpps onClose={() => setAjoutRpps(false)} onAjoute={(id) => { setAjoutRpps(false); void charger().then(() => setSelection(id)); }} />
      )}
    </div>
  );
}

function AjoutRpps({ onClose, onAjoute }: { onClose: () => void; onAjoute: (id: string) => void }) {
  const [rpps, setRpps] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const chiffres = rpps.replace(/\D/g, "");
  const motif = chiffres.length !== 11 ? "Un numéro RPPS compte 11 chiffres." : envoi ? "Vérification dans l'Annuaire Santé…" : null;

  const valider = async () => {
    if (motif) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await reseauRepo.ajouterRpps(chiffres);
      toast.success(r.statut === "cree" ? `${r.nom} ajouté (${POPULATION_LIBELLE[r.population]}).` : `${r.nom} était déjà dans la liste.`);
      onAjoute(r.id);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e)); // la fenêtre reste ouverte
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="font-display text-xl font-semibold text-avisdoc-ink">Ajouter un praticien par son RPPS</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Le numéro est contrôlé dans l'extraction de l'Annuaire Santé : médecin d'une spécialité du réseau, ou généraliste (il entre alors comme généraliste formé à la dermoscopie). Un praticien exclu ne peut pas revenir.
      </p>
      <input value={rpps} onChange={(e) => setRpps(e.target.value)} inputMode="numeric" placeholder="10000000000" autoFocus
        className="mt-4 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[14px] tabular-nums" />
      {erreur && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12.5px] text-rose-800">{erreur}</div>}
      <div className="mt-6 flex items-center justify-end gap-3">
        <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground">Annuler</button>
        <button type="button" onClick={() => void valider()} disabled={!!motif} title={motif ?? undefined}
          className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          {envoi && <Loader2 className="size-4 animate-spin" />} Ajouter
        </button>
      </div>
      {motif && <p className="mt-2 text-right text-[12px] text-muted-foreground">{motif}</p>}
    </Modal>
  );
}

function Filtre({ label, tous, valeur, onChange, options }: {
  label: string; tous: string; valeur: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <select aria-label={label} value={valeur} onChange={(e) => onChange(e.target.value)}
      className={cn("rounded-full border border-border bg-card px-3.5 py-2.5 text-[13px]", valeur && "border-avisdoc-teal font-semibold")}>
      <option value="">{label} : {tous}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
