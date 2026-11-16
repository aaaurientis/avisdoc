// Réseau d'aval — fiche praticien (lot 2) : score expliqué, recherche IA,
// propositions à valider, grille des signaux sourcés, fiche Google Maps.
// Toute information affichée porte sa source ; rien n'est écrit sans validation.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, ExternalLink, Loader2, Search, Sparkles, Star, X } from "lucide-react";
import { toast } from "sonner";
import { confirmer } from "../../components/Confirmation";
import { Badge, Card, Modal, SectionLabel } from "../../components/ui";
import {
  DEPARTEMENTS,
  ETAT_PRATICIEN_BADGE,
  ETAT_PRATICIEN_LABEL,
  MOTIF_EXCLUSION_LABEL,
  POPULATION_LIBELLE,
  ROLE_LABEL,
  SOURCE_RPPS,
  TEXTES,
  dateFr,
  DOCTOLIB_AIDE,
  DOCTOLIB_BADGE,
  DOCTOLIB_LABEL,
  FORCE_LABEL,
  NON_RESERVABLE,
  nonReservableDoctolib,
  GOOGLE_AIDE,
  GOOGLE_BADGE,
  GOOGLE_LABEL,
  estPerime,
  type MotifExclusion,
} from "../../reseau/libelles";
import {
  reseauRepo,
  type CandidatGoogle,
  type InfosDoctolib,
  type FicheGoogle,
  type PraticienReseau,
  type RechercheIa,
  type SignalReseau,
} from "../../reseau/reseauRepo";
import {
  calculerScore,
  releveCreneauPerime,
  SIGNAUX,
  TYPES_SIGNAL,
  VALEUR_LIBELLE,
  urlValide,
  type TypeSignal,
} from "../../../../supabase/functions/_shared/reseau-signaux";
import { cn } from "@/lib/utils";
import { memeAdresse, porteLeNom } from "../../../../supabase/functions/_shared/google-correspondance";
import AvancementIa from "./AvancementIa";
import { lienRechercheDoctolib, specialiteDuLienDoctolib, specialiteHorsCible, urlDoctolibValide } from "../../../../supabase/functions/_shared/doctolib";

const lienCls = "inline-flex items-center gap-1 font-semibold text-avisdoc-ink underline-offset-2 hover:underline";
const btnSec = "inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[12.5px] font-semibold text-avisdoc-ink hover:bg-muted disabled:opacity-50";
const hote = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const pourcent = (p: number) => `${Math.round(p * 100)} %`;
const virgule = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" });

export default function FichePraticien({ praticien: p, departement, lectureSeule, onClose, onChange }: {
  praticien: PraticienReseau;
  /** Le département de l'écran : la recherche Google s'y limite. */
  departement?: string;
  lectureSeule: boolean;
  onClose: () => void;
  /** Un changement a eu lieu (exclusion, signal, fiche Google) : la liste se recharge. */
  onChange: () => void;
}) {
  const [signaux, setSignaux] = useState<SignalReseau[]>([]);
  const [recherche, setRecherche] = useState<RechercheIa | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [exclusion, setExclusion] = useState(false);
  const [saisie, setSaisie] = useState<TypeSignal | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const suivi = useRef<number | null>(null);

  const charger = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([reseauRepo.signaux(p.id), reseauRepo.derniereRecherche({ praticienId: p.id })]);
      setSignaux(s);
      setRecherche(r);
      return r;
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [p.id]);

  // Tant qu'une recherche IA tourne, on suit son avancement toutes les 5 secondes.
  const suivre = useCallback(() => {
    if (suivi.current) window.clearInterval(suivi.current);
    suivi.current = window.setInterval(async () => {
      const r = await charger();
      if (!r || r.statut !== "en_cours") {
        if (suivi.current) window.clearInterval(suivi.current);
        suivi.current = null;
        if (r?.statut === "termine") onChange();
      }
    }, 3000);
  }, [charger, onChange]);

  useEffect(() => {
    setErreur(null);
    setSaisie(null);
    void charger().then((r) => { if (r?.statut === "en_cours") suivre(); });
    return () => { if (suivi.current) window.clearInterval(suivi.current); };
  }, [charger, suivre]);

  const valides = useMemo(() => signaux.filter((s) => s.statut === "valide"), [signaux]);
  const propositions = useMemo(() => signaux.filter((s) => s.statut === "propose"), [signaux]);
  const score = useMemo(() => calculerScore(p, valides.map((v) => ({ ...v, le: v.decideLe }))), [p, valides]);
  const parType = useMemo(() => new Map(valides.map((s) => [s.type, s])), [valides]);

  const agir = async (cle: string, action: () => Promise<unknown>, succes?: string) => {
    setOccupe(cle);
    setErreur(null);
    try {
      await action();
      if (succes) toast.success(succes);
      await charger();
      onChange();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(null);
    }
  };

  const enCours = recherche?.statut === "en_cours";
  const motifIa = lectureSeule ? TEXTES.motifLectureSeule : p.etat === "exclu" ? "Ce praticien est exclu." : enCours ? "Une recherche est en cours." : occupe ? "Patientez…" : null;
  const lancerIa = async () => {
    setOccupe("ia");
    setErreur(null);
    try {
      await reseauRepo.lancerIaPraticien(p.id);
      toast.success("Recherche IA lancée : les propositions arrivent dans une à deux minutes.");
      await charger();
      suivre();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(null);
    }
  };

  const perime = estPerime(p.rppsExtraitLe);
  // Spécialité hors du réseau repérée sur Doctolib (adresse de la fiche ou relevé) : simple alerte.
  const horsCible = specialiteHorsCible(specialiteDuLienDoctolib(p.doctolibUrl), p.doctolibInfos?.specialite);
  const motifExclure = lectureSeule ? TEXTES.motifLectureSeule : p.etat === "exclu" ? "Ce praticien est déjà exclu." : null;

  return (
    <Card className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-lg font-semibold text-avisdoc-ink">{p.civilite ? `${p.civilite} ` : ""}{p.prenom} {p.nom}</div>
          <div className="text-[12.5px] text-muted-foreground">{POPULATION_LIBELLE[p.population]} · RPPS {p.rpps}</div>
          {p.specialites.length > 0 && <div className="text-[12px] text-muted-foreground">Spécialités RPPS : {p.specialites.join(", ")}</div>}
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer la fiche" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted">
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge className={ETAT_PRATICIEN_BADGE[p.etat]}>{ETAT_PRATICIEN_LABEL[p.etat]}</Badge>
        {p.roles.map((r) => <Badge key={r} className="bg-muted text-avisdoc-ink">{ROLE_LABEL[r]}</Badge>)}
        {p.contactId && <Badge className="bg-emerald-50 text-emerald-800">{TEXTES.dejaDansLaListe}</Badge>}
        {p.origine === "ia" && <Badge className="bg-violet-50 text-violet-800">Repéré par l'IA</Badge>}
        {p.origine === "manuel" && <Badge className="bg-sky-50 text-sky-800">Ajouté par RPPS</Badge>}
      </div>

      {erreur && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12.5px] text-rose-800">{erreur}</div>}

      {horsCible && p.etat !== "exclu" && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-900">
          <span><b>Hors cible ?</b> Doctolib le présente comme {horsCible}. S'il n'a pas sa place dans le réseau d'aval, excluez-le.</span>
          <button type="button" onClick={() => setExclusion(true)} disabled={!!motifExclure}
            className="ml-auto rounded-full border border-amber-400 bg-white px-3 py-1 text-[12px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50">
            Exclure : non concerné
          </button>
        </div>
      )}

      <Section id="score" titre="Probabilité d'adhésion au réseau" resume={score.elimine ? "Éliminé" : pourcent(score.probabilite)}>
        <div className="rounded-xl bg-muted/50 px-3.5 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-display text-3xl font-semibold text-avisdoc-ink">{pourcent(score.probabilite)}</span>
            <span className="text-right text-[11.5px] text-muted-foreground">{score.calibre ? "Probabilité calibrée" : "Estimation a priori, non calibrée"}<br />{score.version}</span>
          </div>
          {score.elimine ? (
            <p className="mt-2 text-[12.5px] font-semibold text-rose-700">Critère éliminatoire : {score.elimine}</p>
          ) : (
            <table className="mt-2 w-full text-[12px]">
              <tbody>
                <tr className="text-muted-foreground"><td className="py-0.5">Base (taux d'adhésion attendu 20 %)</td><td className="text-right tabular-nums">{virgule(score.base)}</td></tr>
                {score.contributions.map((c) => (
                  <tr key={c.libelle}>
                    <td className="py-0.5">
                      {c.libelle} : {c.valeur}{" "}
                      <a href={c.url} target="_blank" rel="noreferrer" className="text-muted-foreground underline-offset-2 hover:underline">({hote(c.url)})</a>
                    </td>
                    <td className={cn("text-right tabular-nums font-semibold", c.points > 0 ? "text-emerald-700" : "text-rose-700")}>{virgule(c.points)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border/60 font-semibold"><td className="pt-1">Somme z</td><td className="pt-1 text-right tabular-nums">{virgule(score.z)}</td></tr>
              </tbody>
            </table>
          )}
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Probabilité = 1 / (1 + e<sup>−z</sup>). Seuls comptent les signaux validés et la présence en ligne (fiche Google, prise de rendez-vous Doctolib) ; « inconnu » vaut 0. Le score classe la file de contact, il ne décide jamais d'une entrée dans le réseau.
          </p>
        </div>
      </Section>

      <Section id="ia" titre="Recherche assistée par IA" resume={propositions.length ? `${propositions.length} à valider` : enCours ? "En cours…" : undefined} forcerOuvert={propositions.length > 0 || enCours}>
        {/* Recherche IA */}
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => void lancerIa()} disabled={!!motifIa} title={motifIa ?? undefined} className={btnSec}>
            {enCours || occupe === "ia" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {enCours ? "Recherche en cours…" : "Lancer la recherche"}
          </button>
        </div>
        <ResumeRecherche recherche={recherche} />

        {propositions.length > 0 && (
          <>
            <SousTitre className="mt-4">À valider ({propositions.length})</SousTitre>
            <div className="mt-1.5 space-y-2">
              {propositions.map((s) => (
                <div key={s.id} className="rounded-xl border border-violet-200 bg-violet-50/50 px-3 py-2.5 text-[12.5px]">
                  <div className="font-semibold text-avisdoc-ink">{SIGNAUX[s.type].libelle} : {VALEUR_LIBELLE[s.valeur] ?? s.valeur}</div>
                  {s.extrait && <blockquote className="mt-1 border-l-2 border-violet-300 pl-2 italic text-muted-foreground">« {s.extrait} »</blockquote>}
                  <a href={s.url} target="_blank" rel="noreferrer" className={cn(lienCls, "mt-1 text-[12px]")}>{hote(s.url)} <ExternalLink className="size-3" /></a>
                  <div className="mt-2 flex gap-2">
                    <button type="button" disabled={lectureSeule || !!occupe} title={lectureSeule ? TEXTES.motifLectureSeule : undefined}
                      onClick={() => void agir(s.id, () => reseauRepo.validerSignal(s.id), "Signal validé.")}
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-[12px] font-bold text-white disabled:opacity-50">
                      {occupe === s.id ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Valider
                    </button>
                    <button type="button" disabled={lectureSeule || !!occupe}
                      onClick={() => void agir(s.id, () => reseauRepo.rejeterSignal(s.id))}
                      className="rounded-full border border-border px-3 py-1 text-[12px] font-semibold text-muted-foreground disabled:opacity-50">Rejeter</button>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">Ouvrez la source avant de valider. L'extrait est effacé dès la décision.</p>
          </>
        )}
      </Section>

      <Section id="signaux" titre="Signaux validés" resume={`${valides.length} / ${TYPES_SIGNAL.length}`} ouvertParDefaut={false}>
        {/* Grille des signaux */}
        <div className="divide-y divide-border/60 rounded-xl border border-border/60">
          {TYPES_SIGNAL.map((t) => {
            const s = parType.get(t);
            return (
              <div key={t} className="px-3 py-2 text-[12.5px]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-avisdoc-ink">{SIGNAUX[t].libelle}</div>
                    {s ? (
                      <div className="text-[11.5px] text-muted-foreground">
                        <b className="text-avisdoc-ink">{VALEUR_LIBELLE[s.valeur] ?? s.valeur}</b>{" · "}
                        <a href={s.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">{hote(s.url)}</a>
                        {" · "}{dateFr(s.decideLe)}{" · "}{s.origine === "ia" ? `IA, validé par ${s.decidePar}` : s.decidePar}
                      </div>
                    ) : (
                      <div className="text-[11.5px] text-muted-foreground">Inconnu · d'habitude : {SIGNAUX[t].source}</div>
                    )}
                  </div>
                  <button type="button" onClick={() => setSaisie(saisie === t ? null : t)} disabled={lectureSeule || p.etat === "exclu"}
                    title={lectureSeule ? TEXTES.motifLectureSeule : undefined}
                    className="shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-avisdoc-teal hover:bg-muted disabled:opacity-40">
                    {s ? "Modifier" : "Saisir"}
                  </button>
                </div>
                {saisie === t && (
                  <SaisieSignal type={t} onAnnuler={() => setSaisie(null)} occupe={occupe === `saisie-${t}`}
                    onValider={(valeur, url) => void agir(`saisie-${t}`, async () => { await reseauRepo.saisirSignal(p.id, t, valeur, url); setSaisie(null); }, "Signal enregistré.")} />
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section id="adresses" titre="Adresses et fiches en ligne"
        resume={<span className="flex gap-1"><Badge className={GOOGLE_BADGE[p.googleStatut]}>Google</Badge><Badge className={nonReservableDoctolib(p) ? NON_RESERVABLE.badge : DOCTOLIB_BADGE[p.doctolibStatut]}>Doctolib</Badge></span>}>
        <SousTitre>Lieux d'exercice (RPPS)</SousTitre>
        <div className="mt-1.5 space-y-2">
          {p.lieux.map((l, i) => (
            <div key={i} className="rounded-xl bg-muted/50 px-3 py-2.5 text-[12.5px]">
              <div className="font-semibold text-avisdoc-ink">{l.raisonSociale ?? "Structure non renseignée"}</div>
              <div className="text-muted-foreground">{[l.adresse, [l.codePostal, l.commune].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</div>
              <div className="text-muted-foreground">
                {[l.modeExercice, l.secteur, l.telephone ? `Tél. ${l.telephone}` : null, DEPARTEMENTS[l.departement]].filter(Boolean).join(" · ")}
              </div>
            </div>
          ))}
        </div>
        <div className={cn("mt-3 text-[12px]", perime ? "font-semibold text-amber-700" : "text-muted-foreground")}>
          <a href={SOURCE_RPPS.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
            {SOURCE_RPPS.libelle} <ExternalLink className="size-3" />
          </a>
          {" · "}{p.rppsExtraitLe ? `extraction du ${dateFr(p.rppsExtraitLe)}` : "date d'extraction inconnue"}{perime ? ` · ${TEXTES.perime}` : ""}
        </div>
        <BlocGoogle praticien={p} departement={departement} lectureSeule={lectureSeule} onChange={onChange} />
        <BlocDoctolib praticien={p} releve={parType.get("creneau_doctolib")} lectureSeule={lectureSeule} onChange={() => { void charger(); onChange(); }} />
      </Section>

      <div className="mt-5 border-t border-border/60 pt-4">
        <button type="button" onClick={() => setExclusion(true)} disabled={!!motifExclure} title={motifExclure ?? undefined}
          className="rounded-full border border-rose-200 px-4 py-2 text-[13px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
          {TEXTES.exclure}
        </button>
        {motifExclure && <span className="ml-2 text-[11.5px] text-muted-foreground">{motifExclure}</span>}
      </div>

      {exclusion && <ExclusionModal praticien={p} motifInitial={horsCible ? "hors_cible" : ""} onClose={() => setExclusion(false)} onFait={() => { setExclusion(false); onChange(); }} />}
    </Card>
  );
}

const CLE_SECTIONS = "avisdoc.reseau.fiche.sections";
function lireSections(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(CLE_SECTIONS) ?? "{}") ?? {}; } catch { return {}; }
}

/** Section repliable de la fiche ; le choix ouvert / replié est retenu d'une fiche à l'autre. */
function Section({ id, titre, resume, ouvertParDefaut = true, forcerOuvert = false, children }: {
  id: string; titre: string; resume?: React.ReactNode; ouvertParDefaut?: boolean; forcerOuvert?: boolean; children: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(() => lireSections()[id] ?? ouvertParDefaut);
  // Quelque chose demande l'attention (propositions, recherche en cours) : on ouvre.
  useEffect(() => { if (forcerOuvert) setOuvert(true); }, [forcerOuvert]);
  const basculer = () => {
    const n = !ouvert;
    setOuvert(n);
    try { localStorage.setItem(CLE_SECTIONS, JSON.stringify({ ...lireSections(), [id]: n })); } catch { /* sans mémoire */ }
  };
  return (
    <section className="mt-4 rounded-2xl border border-border/70">
      <button type="button" onClick={basculer} aria-expanded={ouvert}
        className="flex w-full items-center gap-2 rounded-2xl px-3.5 py-2.5 text-left hover:bg-muted/40">
        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", ouvert && "rotate-90")} />
        <span className="text-[12px] font-bold uppercase tracking-wide text-avisdoc-ink">{titre}</span>
        {resume != null && <span className="ml-auto text-[12px] font-semibold text-muted-foreground">{resume}</span>}
      </button>
      {ouvert && <div className="px-3.5 pb-3.5">{children}</div>}
    </section>
  );
}

function SousTitre({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("text-[11.5px] font-bold uppercase tracking-wide text-muted-foreground", className)}>{children}</div>;
}

function ResumeRecherche({ recherche: r }: { recherche: RechercheIa | null }) {
  if (!r) return <p className="mt-1 text-[12px] text-muted-foreground">Jamais lancée. L'IA cherche sur le web public les signaux absents de la fiche Google ; chaque proposition est contrôlée sur sa source, puis validée par vous.</p>;
  if (r.statut !== "termine") return <AvancementIa recherche={r} />;
  const nbEcartees = r.resultat?.ecartees?.length ?? 0;
  return (
    <>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Le {dateFr(r.fin ?? r.debut)} : {r.resultat?.propositions ?? 0} trouvées, {r.resultat?.retenues ?? 0} retenues après contrôle de la source, {nbEcartees} écartée{nbEcartees > 1 ? "s" : ""}.
      </p>
      <AvancementIa recherche={r} ouvertParDefaut={false} />
    </>
  );
}

function SaisieSignal({ type, occupe, onValider, onAnnuler }: {
  type: TypeSignal; occupe: boolean; onValider: (valeur: string, url: string) => void; onAnnuler: () => void;
}) {
  const [valeur, setValeur] = useState("");
  const [url, setUrl] = useState("");
  const motif = !valeur ? "Choisissez une valeur." : !urlValide(url.trim()) ? "Collez l'adresse complète de la page source (https://…)." : occupe ? "Enregistrement…" : null;
  return (
    <div className="mt-2 rounded-xl bg-muted/50 p-2.5">
      <div className="flex flex-wrap gap-1.5">
        {SIGNAUX[type].valeurs.map((v) => (
          <button key={v} type="button" onClick={() => setValeur(v)}
            className={cn("rounded-full border px-2.5 py-1 text-[11.5px] font-semibold", valeur === v ? "border-avisdoc-teal bg-avisdoc-teal text-white" : "border-border bg-card")}>
            {VALEUR_LIBELLE[v] ?? v}
          </button>
        ))}
      </div>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Source : https://…"
        className="mt-2 w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[12.5px]" />
      <div className="mt-2 flex items-center justify-end gap-2">
        {motif && <span className="mr-auto text-[11px] text-muted-foreground">{motif}</span>}
        <button type="button" onClick={onAnnuler} className="text-[12px] font-semibold text-muted-foreground">Annuler</button>
        <button type="button" disabled={!!motif} onClick={() => onValider(valeur, url.trim())}
          className="inline-flex items-center gap-1 rounded-full bg-avisdoc-teal px-3 py-1 text-[12px] font-bold text-white disabled:opacity-50">
          {occupe && <Loader2 className="size-3 animate-spin" />} Enregistrer
        </button>
      </div>
    </div>
  );
}

/** Le lieu RPPS à la même adresse que la fiche Google (nom du praticien + code postal + voie), s'il y en a un. */
function lieuCorrespondant(f: FicheGoogle, p: PraticienReseau): string | null {
  if (!f.adresse || !porteLeNom(f.nom, p.nom)) return null;
  const l = p.lieux.find((x) => memeAdresse(f.adresse!, { codePostal: x.codePostal, adresse: x.adresse }));
  return l ? (l.raisonSociale ?? [l.adresse, l.codePostal, l.commune].filter(Boolean).join(" ")) : null;
}

function CarteFicheGoogle({ fiche, lieuRpps, onAvis, occupeAvis }: { fiche: FicheGoogle; lieuRpps: string | null; onAvis: () => void; occupeAvis: boolean }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2.5 text-[12.5px]">
      {lieuRpps && (
        <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
          <Check className="size-3" /> Même adresse que le lieu RPPS « {lieuRpps} »
        </div>
      )}
      {!lieuRpps && fiche.distance != null && fiche.distance <= 50 && (
        <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
          <Check className="size-3" /> À {fiche.distance} m d'un lieu RPPS (positions GPS)
        </div>
      )}
      {!lieuRpps && !(fiche.distance != null && fiche.distance <= 50) && fiche.verificationIa && (
        <div className="mb-1.5 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800"><b>Vérifiée par IA :</b> {fiche.verificationIa}</div>
      )}
      <div className="font-semibold text-avisdoc-ink">{fiche.nom}</div>
      <div className="text-muted-foreground">{[fiche.categorie, fiche.statut === "CLOSED_PERMANENTLY" ? "Fermé définitivement" : null].filter(Boolean).join(" · ")}</div>
      {specialiteHorsCible(fiche.categorie) && (
        <div className="mt-1 text-[11.5px] font-semibold text-amber-800">Hors cible ? Google le classe comme {specialiteHorsCible(fiche.categorie)}.</div>
      )}
      {fiche.adresse && <div className="mt-1">{fiche.adresse}</div>}
      {fiche.telephone && <div>Tél. {fiche.telephone}</div>}
      {fiche.site && <div><a href={fiche.site} target="_blank" rel="noreferrer" className={lienCls}>{hote(fiche.site)} <ExternalLink className="size-3" /></a></div>}
      {fiche.note != null && <div className="mt-1 flex items-center gap-1"><Star className="size-3.5 fill-amber-400 text-amber-400" /> {fiche.note.toLocaleString("fr-FR")} ({fiche.nombreAvis ?? 0} avis)</div>}
      {fiche.horaires.length > 0 && <ul className="mt-1 text-[11.5px] text-muted-foreground">{fiche.horaires.map((h) => <li key={h}>{h}</li>)}</ul>}
      {fiche.avis && (
        <div className="mt-2 space-y-1.5">
          {fiche.avis.map((a, i) => (
            <div key={i} className="rounded-lg bg-card px-2.5 py-1.5 text-[11.5px]">
              <div className="text-muted-foreground">
                {a.lienAuteur ? <a href={a.lienAuteur} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">{a.auteur}</a> : a.auteur}
                {a.note != null ? ` · ${a.note}/5` : ""} · {a.quand}
              </div>
              <div>{a.texte}</div>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">Avis lus à l'écran, jamais enregistrés. Saisissez le signal « Plaintes sur les délais » avec le lien de la fiche.</p>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11.5px]">
        {fiche.lien && <a href={fiche.lien} target="_blank" rel="noreferrer" className={lienCls}>Ouvrir dans Google Maps <ExternalLink className="size-3" /></a>}
        {!fiche.avis && (
          <button type="button" onClick={onAvis} disabled={occupeAvis} className="font-semibold text-avisdoc-ink underline-offset-2 hover:underline disabled:opacity-50">
            {occupeAvis ? "Chargement…" : "Voir les avis"}
          </button>
        )}
        <span className="ml-auto text-muted-foreground">Données Google Maps, affichées sans être enregistrées</span>
      </div>
    </div>
  );
}

function BlocGoogle({ praticien: p, departement, lectureSeule, onChange }: {
  praticien: PraticienReseau; departement?: string; lectureSeule: boolean; onChange: () => void;
}) {
  const [candidats, setCandidats] = useState<CandidatGoogle[] | null>(null);
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [voirFaibles, setVoirFaibles] = useState(false);
  const [fiches, setFiches] = useState<Record<string, FicheGoogle | "erreur">>({});
  const [occupe, setOccupe] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const cleFiches = p.googlePlaceIds.join(",");

  // Les fiches rattachées s'affichent d'elles-mêmes, pour valider d'un coup d'œil.
  useEffect(() => {
    setCandidats(null); setErreur(null); setFiches({}); setVoirFaibles(false);
    let annule = false;
    for (const id of p.googlePlaceIds) {
      reseauRepo.ficheGoogle(p.id, id)
        .then((f) => {
          if (annule) return;
          setFiches((x) => ({ ...x, [id]: f }));
          // Au nom et à l'adresse RPPS : validée d'office par le serveur, on rafraîchit le statut.
          if (f.valideeAuto) { toast.success(f.verificationIa ? `Fiche Google validée par l'IA : ${f.verificationIa}` : "Fiche Google validée : même nom et même adresse que le RPPS."); onChange(); }
        })
        .catch((e) => { if (!annule) { setFiches((x) => ({ ...x, [id]: "erreur" })); setErreur(e instanceof Error ? e.message : String(e)); } });
    }
    return () => { annule = true; };
  }, [p.id, cleFiches]); // eslint-disable-line react-hooks/exhaustive-deps

  const faire = async (cle: string, f: () => Promise<void>) => {
    setOccupe(cle);
    setErreur(null);
    try { await f(); } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); } finally { setOccupe(null); }
  };
  const chercher = () => faire("chercher", async () => {
    const r = await reseauRepo.chercherGoogle(p.id, departement);
    // Au nom et à l'adresse RPPS : le serveur a validé d'office, on recharge le statut.
    if (r.valideesAuto?.length) {
      toast.success(`Fiche${r.valideesAuto.length > 1 ? "s" : ""} Google validée${r.valideesAuto.length > 1 ? "s" : ""} : même nom et même adresse que le RPPS.`);
      setCandidats(null);
      onChange();
      return;
    }
    setCandidats(r.candidats);
    // Pré-cocher les correspondances sûres et celles déjà rattachées.
    setCoches(new Set(r.candidats.filter((c) => c.force === "certaine" || c.force === "forte" || p.googlePlaceIds.includes(c.place_id)).map((c) => c.place_id)));
  });
  const rattacher = (choix: { placeIds: string[] } | { aucune: true } | { retirer: true }) =>
    faire("rattacher", async () => { await reseauRepo.rattacherGoogle(p.id, choix); setCandidats(null); onChange(); });
  const avis = (id: string) => faire(`avis-${id}`, async () => {
    const f = await reseauRepo.ficheGoogle(p.id, id, true);
    setFiches((x) => ({ ...x, [id]: f }));
  });
  const bloque = lectureSeule || p.etat === "exclu";
  const visibles = (candidats ?? []).filter((c) => c.force !== "faible");
  const faibles = (candidats ?? []).filter((c) => c.force === "faible");

  return (
    <>
      <div className="mt-4 flex items-center justify-between gap-2">
        <SousTitre>Fiche{p.googlePlaceIds.length > 1 ? "s" : ""} Google Maps</SousTitre>
        <span title={GOOGLE_AIDE[p.googleStatut]}><Badge className={GOOGLE_BADGE[p.googleStatut]}>{GOOGLE_LABEL[p.googleStatut]}</Badge></span>
      </div>
      {erreur && <div role="alert" className="mt-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">{erreur}</div>}

      {/* Fiches rattachées, affichées directement */}
      {p.googlePlaceIds.length > 0 && !candidats && (
        <div className="mt-1.5 space-y-2">
          {p.googleStatut === "trouvee_auto" && (
            <p className="text-[11.5px] text-muted-foreground">Rattachée automatiquement : même nom et même code postal qu'un lieu RPPS. Vérifiez puis confirmez.</p>
          )}
          {p.googleStatut === "confirmee" && p.googlePlaceIds.length > 0 && (
            <p className="text-[11.5px] text-muted-foreground">
              {p.googleRattachePar?.startsWith("automatique")
                ? "Validée automatiquement : même nom et même adresse qu'un lieu RPPS."
                : p.googleRattachePar ? `Choisie par ${p.googleRattachePar}.` : "Validée."}
              {p.googleRattacheLe ? ` Le ${dateFr(p.googleRattacheLe)}.` : ""}
            </p>
          )}
          {p.googlePlaceIds.map((id) => {
            const f = fiches[id];
            if (!f) return <div key={id} className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-[12px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Chargement de la fiche Google…</div>;
            if (f === "erreur") return <div key={id} className="rounded-xl bg-muted/50 px-3 py-2.5 text-[12px] text-muted-foreground">Fiche indisponible pour l'instant.</div>;
            return <CarteFicheGoogle key={id} fiche={f} lieuRpps={lieuCorrespondant(f, p)} onAvis={() => void avis(id)} occupeAvis={occupe === `avis-${id}`} />;
          })}
          <div className="flex flex-wrap items-center gap-2">
            {p.googleStatut === "trouvee_auto" && (
              <button type="button" disabled={bloque || !!occupe} onClick={() => void faire("confirmer", async () => { await reseauRepo.confirmerGoogle(p.id); onChange(); })}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50">
                {occupe === "confirmer" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} C'est la bonne fiche
              </button>
            )}
            <button type="button" disabled={bloque || !!occupe} onClick={() => void chercher()} className={btnSec}>
              {occupe === "chercher" ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />} Modifier ou ajouter des fiches
            </button>
          </div>
        </div>
      )}

      {p.googlePlaceIds.length === 0 && !candidats && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {p.googleAucuneFiche ? (
            <span className="text-[12px] text-muted-foreground">Pas de fiche Google (cela ne pénalise pas).</span>
          ) : (
            <span className="text-[11.5px] text-muted-foreground">
              {p.googleStatut === "a_confirmer" ? "Aucune fiche à une adresse RPPS. Des fiches portent son nom dans une autre commune du département : choisissez-en une si elle correspond." : p.googleStatut === "introuvable" ? "Aucune fiche à son nom dans le département." : "Pas encore cherchée."}
            </span>
          )}
          <button type="button" onClick={() => void chercher()} disabled={bloque || !!occupe} className={btnSec}>
            {occupe === "chercher" ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />} Voir les fiches du département
          </button>
        </div>
      )}

      {/* Choix : plusieurs fiches possibles ; les correspondances faibles restent en retrait */}
      {candidats && (
        <div className="mt-1.5 space-y-1.5">
          {visibles.length === 0 && <p className="text-[12px] text-muted-foreground">Aucune fiche à son nom dans le département.</p>}
          {[...visibles, ...(voirFaibles ? faibles : [])].map((c) => (
            <label key={c.place_id} className={cn("flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-[12.5px]",
              coches.has(c.place_id) ? "border-avisdoc-teal bg-sky-50/60" : "border-border", c.force === "faible" && "opacity-70")}>
              <input type="checkbox" className="mt-0.5" checked={coches.has(c.place_id)}
                onChange={() => setCoches((x) => { const n = new Set(x); if (n.has(c.place_id)) n.delete(c.place_id); else n.add(c.place_id); return n; })} />
              <span className="min-w-0">
                <span className="font-semibold text-avisdoc-ink">{c.nom}{c.ferme ? " · fermé définitivement" : ""}</span>
                <span className="block text-muted-foreground">{[c.categorie, c.adresse].filter(Boolean).join(" · ")}</span>
                <span className={cn("text-[11px] font-semibold", c.force === "certaine" || c.force === "forte" ? "text-emerald-700" : c.force === "moyenne" ? "text-amber-700" : "text-slate-500")}>
                  {FORCE_LABEL[c.force]}{c.verifieIa ? " (vérifié par IA)" : ""}{c.distance != null ? ` · à ${c.distance < 1000 ? `${Math.round(c.distance)} m` : `${(c.distance / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`} du lieu RPPS` : ""}
                </span>
                {c.verifieIa && <span className="block text-[11px] text-muted-foreground">{c.verifieIa}</span>}
              </span>
            </label>
          ))}
          {faibles.length > 0 && !voirFaibles && (
            <button type="button" onClick={() => setVoirFaibles(true)} className="text-[11.5px] text-muted-foreground underline-offset-2 hover:underline">
              {faibles.length} autre{faibles.length > 1 ? "s" : ""} résultat{faibles.length > 1 ? "s" : ""} sans le nom du praticien
            </button>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" disabled={!coches.size || !!occupe} onClick={() => void rattacher({ placeIds: [...coches] })}
              title={!coches.size ? "Cochez au moins une fiche." : undefined}
              className="inline-flex items-center gap-1 rounded-full bg-avisdoc-teal px-3.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50">
              {occupe === "rattacher" && <Loader2 className="size-3.5 animate-spin" />} Rattacher {coches.size > 1 ? `les ${coches.size} fiches` : "la fiche"}
            </button>
            <button type="button" disabled={!!occupe} onClick={() => void rattacher({ aucune: true })} className={btnSec}>Aucune ne correspond</button>
            <button type="button" onClick={() => setCandidats(null)} className="text-[12px] font-semibold text-muted-foreground">Annuler</button>
          </div>
        </div>
      )}
    </>
  );
}

const CRENEAUX = ["moins_7j", "7_30j", "plus_30j", "aucun_nouveau"] as const;

function BlocDoctolib({ praticien: p, releve, lectureSeule, onChange }: {
  praticien: PraticienReseau; releve: SignalReseau | undefined; lectureSeule: boolean; onChange: () => void;
}) {
  const [saisie, setSaisie] = useState(false);
  const [url, setUrl] = useState("");
  const [occupe, setOccupe] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => { setSaisie(false); setUrl(""); setErreur(null); }, [p.id]);
  const faire = async (cle: string, f: () => Promise<unknown>) => {
    setOccupe(cle);
    setErreur(null);
    try { await f(); onChange(); } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); } finally { setOccupe(null); }
  };
  const bloque = lectureSeule || p.etat === "exclu";
  const communes = [...new Set(p.lieux.map((l) => l.commune).filter(Boolean))] as string[];
  const perime = releve ? releveCreneauPerime(releve.decideLe) : false;
  const nonReservable = nonReservableDoctolib(p);

  return (
    <>
      <div className="mt-4 flex items-center justify-between gap-2">
        <SousTitre>Doctolib</SousTitre>
        {nonReservable
          ? <span title={NON_RESERVABLE.aide}><Badge className={NON_RESERVABLE.badge}>{NON_RESERVABLE.label}</Badge></span>
          : <span title={DOCTOLIB_AIDE[p.doctolibStatut]}><Badge className={DOCTOLIB_BADGE[p.doctolibStatut]}>{DOCTOLIB_LABEL[p.doctolibStatut]}</Badge></span>}
      </div>
      {erreur && <div role="alert" className="mt-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">{erreur}</div>}

      {p.doctolibUrl ? (
        <div className="mt-1.5 rounded-xl bg-muted/50 px-3 py-2.5 text-[12.5px]">
          <a href={p.doctolibUrl} target="_blank" rel="noreferrer" className={lienCls}>{p.doctolibUrl.replace(/^https:\/\/(www\.)?/, "")} <ExternalLink className="size-3" /></a>
          {nonReservable && (
            <p className="mt-1 rounded-lg bg-rose-50 px-2 py-1 text-[11.5px] font-semibold text-rose-800">
              Page Doctolib sans rendez-vous en ligne : « n'est pas sur Doctolib, pas réservable en ligne ».
            </p>
          )}
          {p.doctolibStatut === "trouve_auto" && !nonReservable && <p className="mt-1 text-[11.5px] text-muted-foreground">{DOCTOLIB_AIDE.trouve_auto}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {p.doctolibStatut === "trouve_auto" && (
              <button type="button" disabled={bloque || !!occupe} onClick={() => void faire("confirmer", () => reseauRepo.doctolib(p.id, { confirmer: true }))}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-[12px] font-bold text-white disabled:opacity-50">
                <Check className="size-3" /> C'est la bonne fiche
              </button>
            )}
            <button type="button" disabled={bloque || !!occupe} onClick={() => void faire("reservable", () => reseauRepo.doctolib(p.id, { non_reservable: !nonReservable }))}
              title={nonReservable ? undefined : "La page indique « n'est pas sur Doctolib » ou « pas réservable en ligne »."}
              className={cn("rounded-full border px-3 py-1 text-[12px] font-semibold disabled:opacity-50", nonReservable ? "border-border text-muted-foreground" : "border-rose-200 text-rose-700 hover:bg-rose-50")}>
              {occupe === "reservable" ? "…" : nonReservable ? "Finalement réservable" : "Non réservable en ligne"}
            </button>
            <button type="button" disabled={bloque || !!occupe} onClick={() => void faire("retirer", () => reseauRepo.doctolib(p.id, { retirer: true }))} className="text-[12px] font-semibold text-muted-foreground disabled:opacity-50">Changer de lien</button>
          </div>

          {p.doctolibInfos && <InfosDoctolibBloc infos={p.doctolibInfos} le={p.doctolibReleveLe} par={p.doctolibRelevePar} />}

          {/* Relevé du premier créneau : lu par l'opérateur sur la fiche, enregistré avec son lien et sa date */}
          <div className="mt-3 border-t border-border/60 pt-2">
            <div className="text-[11.5px] font-semibold text-avisdoc-ink">Premier créneau pour un nouveau patient</div>
            {releve && (
              <div className={cn("text-[11.5px]", perime ? "font-semibold text-amber-700" : "text-muted-foreground")}>
                {VALEUR_LIBELLE[releve.valeur] ?? releve.valeur} · relevé le {dateFr(releve.decideLe)} par {releve.decidePar}{perime ? " · périmé (plus de 14 jours) : relevez-le à nouveau" : ""}
              </div>
            )}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {CRENEAUX.map((v) => (
                <button key={v} type="button" disabled={bloque || !!occupe}
                  onClick={() => void faire(`creneau-${v}`, () => reseauRepo.saisirSignal(p.id, "creneau_doctolib", v, p.doctolibUrl!))}
                  className={cn("rounded-full border px-2.5 py-1 text-[11.5px] font-semibold disabled:opacity-50",
                    releve?.valeur === v && !perime ? "border-avisdoc-teal bg-avisdoc-teal text-white" : "border-border bg-card")}>
                  {occupe === `creneau-${v}` ? "…" : VALEUR_LIBELLE[v]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Ouvrez la fiche Doctolib, regardez le premier créneau proposé, puis cliquez. Le Hub ne lit jamais Doctolib lui-même.</p>
          </div>
        </div>
      ) : (
        <div className="mt-1.5 space-y-2 text-[12px]">
          <p className="text-muted-foreground">{p.doctolibStatut === "aucun" ? "Pas sur Doctolib (cela ne pénalise pas)." : DOCTOLIB_AIDE[p.doctolibStatut]}</p>
          <div className="flex flex-wrap items-center gap-2">
            <a href={lienRechercheDoctolib({ nom: p.nom, prenom: p.prenom, communes })} target="_blank" rel="noreferrer" className={btnSec}>
              <Search className="size-3.5" /> Chercher sur Doctolib
            </a>
            <button type="button" disabled={bloque} onClick={() => setSaisie(!saisie)} className={btnSec}>Coller le lien</button>
            {p.doctolibStatut !== "aucun" && (
              <button type="button" disabled={bloque || !!occupe} onClick={() => void faire("aucun", () => reseauRepo.doctolib(p.id, { aucun: true }))} className="text-[12px] font-semibold text-muted-foreground disabled:opacity-50">Pas sur Doctolib</button>
            )}
          </div>
          {saisie && (
            <div className="flex items-center gap-2">
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.doctolib.fr/…" className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[12.5px]" />
              <button type="button" disabled={!urlDoctolibValide(url.trim()) || !!occupe} title={!urlDoctolibValide(url.trim()) ? "Collez l'adresse complète d'une fiche Doctolib." : undefined}
                onClick={() => void faire("lien", () => reseauRepo.doctolib(p.id, { url: url.trim() }))}
                className="rounded-full bg-avisdoc-teal px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50">Enregistrer</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function InfosDoctolibBloc({ infos, le, par }: { infos: InfosDoctolib; le: string | null; par: string | null }) {
  const lignes: [string, string | null][] = [
    ["Spécialité", infos.specialite],
    ["Rendez-vous en ligne", infos.reservable === false ? "Non : pas réservable en ligne" : infos.reservable ? "Oui" : null],
    ["Créneaux affichés", infos.disponibilites
      ? `${infos.disponibilites.creneaux} (dont ${infos.disponibilites.sous7Jours} dans les 7 jours)${infos.disponibilites.premier ? `, premier le ${new Date(infos.disponibilites.premier.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : ""} · relevé le ${dateFr(infos.disponibilites.releve_le)}`
      : null],
    ["Conventionnement", infos.conventionnement],
    ["Carte Vitale", infos.carteVitale === null ? null : infos.carteVitale ? "Acceptée" : "Non acceptée"],
    ["Téléconsultation", infos.teleconsultation ? "Proposée" : null],
    ["Langues", infos.langues.join(", ") || null],
    ["Tarifs", infos.tarifs.join(" · ") || null],
  ];
  return (
    <div className="mt-3 border-t border-border/60 pt-2 text-[12px]">
      <div className="font-semibold text-avisdoc-ink">Relevé de la fiche Doctolib</div>
      <div className="text-muted-foreground">Le {dateFr(le)}{par ? ` par ${par}` : ""}</div>
      {lignes.filter(([, v]) => v).map(([t, v]) => (
        <div key={t} className="mt-1 grid grid-cols-[110px_1fr] gap-2"><span className="text-muted-foreground">{t}</span><span className="text-avisdoc-ink">{v}</span></div>
      ))}
      {infos.expertises.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">{infos.expertises.map((x) => <Badge key={x} className="bg-card text-avisdoc-ink">{x}</Badge>)}</div>
      )}
      {infos.presentation && (
        <details className="mt-1.5"><summary className="cursor-pointer font-semibold text-avisdoc-ink">Présentation</summary><p className="mt-1 text-muted-foreground">{infos.presentation}</p></details>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">Pour mettre à jour : ouvrez la fiche Doctolib et cliquez sur le favori « Relever sur Doctolib ».</p>
    </div>
  );
}

function ExclusionModal({ praticien: p, motifInitial = "", onClose, onFait }: {
  praticien: PraticienReseau; motifInitial?: "" | MotifExclusion; onClose: () => void; onFait: () => void;
}) {
  const [motif, setMotif] = useState<"" | MotifExclusion>(motifInitial);
  const [precision, setPrecision] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const raison = !motif ? "Choisissez un motif." : motif === "autre" && !precision.trim() ? "Précisez le motif." : envoi ? "Exclusion en cours…" : null;

  const valider = async () => {
    if (raison || !motif) return;
    const ok = await confirmer({
      titre: `Exclure ${p.prenom} ${p.nom} ?`,
      message: motif === "hors_cible"
        ? "Il sort de la liste et ne sera jamais réimporté (contrôle sur son RPPS)."
        : "L'exclusion est définitive : ce praticien ne reviendra jamais dans le réseau, même après un nouvel import.",
      action: "Exclure définitivement",
      definitif: true,
    });
    if (!ok) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await reseauRepo.exclure(p.id, motif, precision.trim());
      toast.success(`${p.prenom} ${p.nom} est exclu.`);
      onFait();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e)); // la fenêtre reste ouverte
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="font-display text-xl font-semibold text-avisdoc-ink">Exclure {p.prenom} {p.nom}</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">Définitif. Le contrôle se fait sur le RPPS {p.rpps}.</p>
      <div className="mt-4 space-y-2">
        {(Object.keys(MOTIF_EXCLUSION_LABEL) as MotifExclusion[]).map((m) => (
          <label key={m} className="flex items-center gap-2 text-[13.5px]">
            <input type="radio" name="motif" checked={motif === m} onChange={() => setMotif(m)} /> {MOTIF_EXCLUSION_LABEL[m]}
          </label>
        ))}
      </div>
      <label className="mt-4 block text-[12.5px] font-semibold text-avisdoc-ink">
        Précision {motif !== "autre" && <span className="font-normal text-muted-foreground">(facultatif)</span>}
        <textarea value={precision} onChange={(e) => setPrecision(e.target.value)} maxLength={500} rows={2}
          className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-[13.5px]" placeholder="Aucune donnée de patient." />
      </label>
      {erreur && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12.5px] text-rose-800">{erreur}</div>}
      <div className="mt-6 flex items-center justify-end gap-3">
        <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground">Annuler</button>
        <button type="button" onClick={() => void valider()} disabled={!!raison} title={raison ?? undefined}
          className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          {envoi && <Loader2 className="size-4 animate-spin" />} {TEXTES.exclure}
        </button>
      </div>
      {raison && <p className="mt-2 text-right text-[12px] text-muted-foreground">{raison}</p>}
    </Modal>
  );
}
