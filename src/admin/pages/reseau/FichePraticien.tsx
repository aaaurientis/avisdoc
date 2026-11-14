// Réseau d'aval — fiche praticien (lot 2) : score expliqué, recherche IA,
// propositions à valider, grille des signaux sourcés, fiche Google Maps.
// Toute information affichée porte sa source ; rien n'est écrit sans validation.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ExternalLink, Loader2, MapPin, Search, Sparkles, Star, X } from "lucide-react";
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
  estPerime,
  type MotifExclusion,
} from "../../reseau/libelles";
import {
  reseauRepo,
  type CandidatGoogle,
  type FicheGoogle,
  type PraticienReseau,
  type RechercheIa,
  type SignalReseau,
} from "../../reseau/reseauRepo";
import {
  calculerScore,
  SIGNAUX,
  TYPES_SIGNAL,
  VALEUR_LIBELLE,
  urlValide,
  type TypeSignal,
} from "../../../../supabase/functions/_shared/reseau-signaux";
import { cn } from "@/lib/utils";

const lienCls = "inline-flex items-center gap-1 font-semibold text-avisdoc-ink underline-offset-2 hover:underline";
const btnSec = "inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[12.5px] font-semibold text-avisdoc-ink hover:bg-muted disabled:opacity-50";
const hote = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const pourcent = (p: number) => `${Math.round(p * 100)} %`;
const virgule = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" });

export default function FichePraticien({ praticien: p, lectureSeule, onClose, onChange }: {
  praticien: PraticienReseau;
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
    }, 5000);
  }, [charger, onChange]);

  useEffect(() => {
    setErreur(null);
    setSaisie(null);
    void charger().then((r) => { if (r?.statut === "en_cours") suivre(); });
    return () => { if (suivi.current) window.clearInterval(suivi.current); };
  }, [charger, suivre]);

  const valides = useMemo(() => signaux.filter((s) => s.statut === "valide"), [signaux]);
  const propositions = useMemo(() => signaux.filter((s) => s.statut === "propose"), [signaux]);
  const score = useMemo(() => calculerScore(p, valides), [p, valides]);
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
  const motifExclure = lectureSeule ? TEXTES.motifLectureSeule : p.etat === "exclu" ? "Ce praticien est déjà exclu." : null;

  return (
    <Card className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-lg font-semibold text-avisdoc-ink">{p.civilite ? `${p.civilite} ` : ""}{p.prenom} {p.nom}</div>
          <div className="text-[12.5px] text-muted-foreground">{POPULATION_LIBELLE[p.population]} · RPPS {p.rpps}</div>
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

      {/* Score expliqué */}
      <SectionLabel className="mt-5">Probabilité d'adhésion au réseau</SectionLabel>
      <div className="mt-1.5 rounded-xl bg-muted/50 px-3.5 py-3">
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
          Probabilité = 1 / (1 + e<sup>−z</sup>). Seuls les signaux validés comptent ; « inconnu » vaut 0. Le score classe la file de contact, il ne décide jamais d'une entrée dans le réseau.
        </p>
      </div>

      {/* Recherche IA */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <SectionLabel>Recherche assistée par IA</SectionLabel>
        <button type="button" onClick={() => void lancerIa()} disabled={!!motifIa} title={motifIa ?? undefined} className={btnSec}>
          {enCours || occupe === "ia" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {enCours ? "Recherche en cours…" : "Lancer la recherche"}
        </button>
      </div>
      <ResumeRecherche recherche={recherche} />

      {propositions.length > 0 && (
        <>
          <SectionLabel className="mt-4">À valider ({propositions.length})</SectionLabel>
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

      {/* Grille des signaux */}
      <SectionLabel className="mt-5">Signaux validés</SectionLabel>
      <div className="mt-1.5 divide-y divide-border/60 rounded-xl border border-border/60">
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

      <BlocGoogle praticien={p} lectureSeule={lectureSeule} onChange={onChange} />

      <SectionLabel className="mt-5">Spécialités (RPPS)</SectionLabel>
      <div className="mt-1 text-[13px] text-avisdoc-ink">{p.specialites.join(", ") || "—"}</div>

      <SectionLabel className="mt-5">Lieux d'exercice</SectionLabel>
      <div className="mt-1.5 space-y-2.5">
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

      <div className="mt-5 border-t border-border/60 pt-4">
        <button type="button" onClick={() => setExclusion(true)} disabled={!!motifExclure} title={motifExclure ?? undefined}
          className="rounded-full border border-rose-200 px-4 py-2 text-[13px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
          {TEXTES.exclure}
        </button>
        {motifExclure && <span className="ml-2 text-[11.5px] text-muted-foreground">{motifExclure}</span>}
      </div>

      {exclusion && <ExclusionModal praticien={p} onClose={() => setExclusion(false)} onFait={() => { setExclusion(false); onChange(); }} />}
    </Card>
  );
}

function ResumeRecherche({ recherche: r }: { recherche: RechercheIa | null }) {
  const [details, setDetails] = useState(false);
  if (!r) return <p className="mt-1 text-[12px] text-muted-foreground">Jamais lancée. L'IA cherche sur le web public les signaux absents de la fiche Google ; chaque proposition est contrôlée sur sa source, puis validée par vous.</p>;
  if (r.statut === "en_cours") return <p className="mt-1 text-[12px] text-muted-foreground">Lancée le {dateFr(r.debut)}. Les propositions s'affichent dès qu'elle se termine.</p>;
  if (r.statut === "echec") return <p className="mt-1 text-[12px] font-semibold text-rose-700">Dernière recherche en échec : {r.erreur}</p>;
  const ec = r.resultat?.ecartees ?? [];
  return (
    <div className="mt-1 text-[12px] text-muted-foreground">
      Le {dateFr(r.fin ?? r.debut)} : {r.resultat?.propositions ?? 0} trouvées, {r.resultat?.retenues ?? 0} retenues après contrôle de la source
      {ec.length > 0 && (
        <>
          , {ec.length} écartées.{" "}
          <button type="button" onClick={() => setDetails(!details)} className="font-semibold text-avisdoc-ink underline-offset-2 hover:underline">{details ? "Masquer" : "Pourquoi ?"}</button>
          {details && (
            <ul className="mt-1 list-disc pl-4">
              {ec.map((e, i) => <li key={i}>{e.type ? `${SIGNAUX[e.type as TypeSignal]?.libelle ?? e.type} : ` : ""}{e.motif}{e.url ? ` (${hote(e.url)})` : ""}</li>)}
            </ul>
          )}
        </>
      )}
      {ec.length === 0 && "."}
    </div>
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

function BlocGoogle({ praticien: p, lectureSeule, onChange }: { praticien: PraticienReseau; lectureSeule: boolean; onChange: () => void }) {
  const [candidats, setCandidats] = useState<CandidatGoogle[] | null>(null);
  const [fiche, setFiche] = useState<FicheGoogle | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => { setCandidats(null); setFiche(null); setErreur(null); }, [p.id, p.googlePlaceId]);

  const faire = async (cle: string, f: () => Promise<void>) => {
    setOccupe(cle);
    setErreur(null);
    try { await f(); } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); } finally { setOccupe(null); }
  };
  const chercher = () => faire("chercher", async () => setCandidats((await reseauRepo.chercherGoogle(p.id)).candidats));
  const rattacher = (choix: { placeId: string } | { aucune: true } | { retirer: true }) =>
    faire("rattacher", async () => { await reseauRepo.rattacherGoogle(p.id, choix); setCandidats(null); onChange(); });
  const afficher = (avis: boolean) => faire(avis ? "avis" : "fiche", async () => setFiche(await reseauRepo.ficheGoogle(p.id, avis)));
  const bloque = lectureSeule || p.etat === "exclu";

  return (
    <>
      <SectionLabel className="mt-5">Fiche Google Maps</SectionLabel>
      {erreur && <div role="alert" className="mt-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">{erreur}</div>}

      {!p.googlePlaceId && !p.googleAucuneFiche && !candidats && (
        <div className="mt-1.5 flex items-center gap-2">
          <button type="button" onClick={() => void chercher()} disabled={bloque || !!occupe} title={bloque ? "Action indisponible." : undefined} className={btnSec}>
            {occupe === "chercher" ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />} Trouver la fiche
          </button>
          <span className="text-[11.5px] text-muted-foreground">Vous choisirez la bonne fiche parmi les résultats.</span>
        </div>
      )}

      {candidats && (
        <div className="mt-1.5 space-y-1.5">
          {candidats.length === 0 && <p className="text-[12px] text-muted-foreground">Aucune fiche trouvée.</p>}
          {candidats.map((c) => (
            <button key={c.place_id} type="button" disabled={!!occupe} onClick={() => void rattacher({ placeId: c.place_id })}
              className="block w-full rounded-xl border border-border px-3 py-2 text-left text-[12.5px] hover:border-avisdoc-teal disabled:opacity-50">
              <div className="font-semibold text-avisdoc-ink">{c.nom}{c.ferme ? " · fermé définitivement" : ""}</div>
              <div className="text-muted-foreground">{[c.categorie, c.adresse].filter(Boolean).join(" · ")}</div>
            </button>
          ))}
          <div className="flex gap-2">
            <button type="button" disabled={!!occupe} onClick={() => void rattacher({ aucune: true })} className={btnSec}>Aucune ne correspond</button>
            <button type="button" onClick={() => setCandidats(null)} className="text-[12px] font-semibold text-muted-foreground">Annuler</button>
          </div>
        </div>
      )}

      {p.googleAucuneFiche && (
        <div className="mt-1.5 flex items-center gap-2 text-[12px] text-muted-foreground">
          Pas de fiche Google (cela ne pénalise pas).
          <button type="button" disabled={bloque || !!occupe} onClick={() => void rattacher({ retirer: true })} className="font-semibold text-avisdoc-ink underline-offset-2 hover:underline disabled:opacity-50">Chercher à nouveau</button>
        </div>
      )}

      {p.googlePlaceId && !fiche && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void afficher(false)} disabled={!!occupe} className={btnSec}>
            {occupe === "fiche" ? <Loader2 className="size-3.5 animate-spin" /> : <MapPin className="size-3.5" />} Afficher la fiche
          </button>
          <button type="button" disabled={bloque || !!occupe} onClick={() => void rattacher({ retirer: true })} className="text-[12px] font-semibold text-muted-foreground disabled:opacity-50">Changer de fiche</button>
        </div>
      )}

      {fiche && (
        <div className="mt-1.5 rounded-xl bg-muted/50 px-3 py-2.5 text-[12.5px]">
          <div className="font-semibold text-avisdoc-ink">{fiche.nom}</div>
          <div className="text-muted-foreground">{[fiche.categorie, fiche.statut === "CLOSED_PERMANENTLY" ? "Fermé définitivement" : null].filter(Boolean).join(" · ")}</div>
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
              <button type="button" onClick={() => void afficher(true)} disabled={!!occupe} className="font-semibold text-avisdoc-ink underline-offset-2 hover:underline disabled:opacity-50">
                {occupe === "avis" ? "Chargement…" : "Voir les avis"}
              </button>
            )}
            <span className="ml-auto text-muted-foreground">Données Google Maps, affichées sans être enregistrées</span>
          </div>
        </div>
      )}
    </>
  );
}

function ExclusionModal({ praticien: p, onClose, onFait }: { praticien: PraticienReseau; onClose: () => void; onFait: () => void }) {
  const [motif, setMotif] = useState<"" | MotifExclusion>("");
  const [precision, setPrecision] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const raison = !motif ? "Choisissez un motif." : motif === "autre" && !precision.trim() ? "Précisez le motif." : envoi ? "Exclusion en cours…" : null;

  const valider = async () => {
    if (raison || !motif) return;
    const ok = await confirmer({
      titre: `Exclure ${p.prenom} ${p.nom} ?`,
      message: "L'exclusion est définitive : ce praticien ne reviendra jamais dans le réseau, même après un nouvel import.",
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
