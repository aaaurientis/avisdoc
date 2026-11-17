// Statistiques › Expertises — les avis rendus, au global : volumes par mois (en journée / hors journée),
// recommandations, délais de réponse, répartition par requis (taux de consultation).
//
// Source : l'extraction « expertise » la plus récente du bucket S3 (une ligne = un avis).

import { useMemo, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { Card, PageHeader, SectionLabel } from "../../components/ui";
import { useAuth } from "../../auth/AuthContext";
import { chargerExpertises, choisirExpertises, useExpertisesStats } from "../../data/journeesStore";
import { dateDuFichier, telechargerExtraction } from "../../data/journeesRepo";
import {
  dansLaPeriode,
  enJournee,
  estExerese,
  MASQUE,
  MOTIF_MASQUE,
  resultatsVisibles,
  SEUIL_AIPD,
  parMois,
  parRequis,
  delaiSuiviMoyen,
  resumer,
  type Expertise,
  type Part,
  type PeriodeExpertises,
} from "../../lib/expertises";
import { cn } from "@/lib/utils";
import { AxeMois, Choix, boutonCls, capitale, jour, nombre, pct, selectCls } from "./commun";
import NomPro from "../../components/NomPro";
import { pourResultats, requisMasque } from "../../lib/masquage";

const PERIODES: { cle: PeriodeExpertises; label: string }[] = [
  { cle: "12m", label: "12 mois" },
  { cle: "24m", label: "24 mois" },
  { cle: "annee", label: "Cette année" },
  { cle: "tout", label: "Tout" },
];
type Origine = "toutes" | "journee" | "hors";
const ORIGINES: { cle: Origine; label: string }[] = [
  { cle: "toutes", label: "Toutes" },
  { cle: "journee", label: "En journée" },
  { cle: "hors", label: "Hors journée" },
];

const heures = (h: number | null) => (h === null ? "—" : h < 10 ? `${h.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} h` : `${Math.round(h)} h`);
const mois = (cle: string) => capitale(new Date(`${cle}-15T12:00:00`).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }));

export default function Expertises() {
  const { user } = useAuth();
  const { statut, source, expertises, colonnesManquantes, fichiers, info } = useExpertisesStats();
  const [periode, setPeriode] = useState<PeriodeExpertises>("12m");
  const [origine, setOrigine] = useState<Origine>("toutes");
  const [requis, setRequis] = useState("");
  const [profession, setProfession] = useState("");
  const chargement = statut !== "pret";

  const lesRequis = useMemo(() => resumer(expertises).requis.map((p) => p.cle), [expertises]);
  const professions = useMemo(() => resumer(expertises).professions.map((p) => p.cle), [expertises]);
  const liste = useMemo(
    () =>
      dansLaPeriode(expertises, periode).filter(
        (e) =>
          (origine === "toutes" || (origine === "journee") === enJournee(e)) &&
          (!requis || (e.requis || "(non renseigné)") === requis) &&
          (!profession || (e.profession || "(non renseigné)") === profession),
      ),
    [expertises, periode, origine, requis, profession],
  );
  const r = useMemo(() => resumer(liste), [liste]);
  // Résultats : sans les requis masqués (Admin › Réglages › Statistiques) ; volumes : tout.
  const rRes = useMemo(() => resumer(pourResultats(liste)), [liste]);
  const exereses = pourResultats(liste).filter(estExerese).length;

  return (
    <div>
      <PageHeader
        title="Expertises"
        subtitle={source ? `Avis rendus — extraction du ${jour(source.date)} (${source.origine} · ${source.nom})` : "Avis rendus par les requis"}
        action={
          <div className="flex flex-wrap gap-2">
            {source && (
              <button type="button" onClick={() => telechargerExtraction(source, user?.email ?? "")} className={boutonCls}>
                <Download className="size-4" /> Télécharger le CSV
              </button>
            )}
            <button type="button" onClick={() => void chargerExpertises()} disabled={chargement} className={boutonCls}>
              {chargement ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Actualiser
            </button>
            {fichiers.length > 1 && source && (
              <select
                value={fichiers.find((f) => f.key.endsWith(source.nom))?.key ?? ""}
                onChange={(e) => {
                  const f = fichiers.find((x) => x.key === e.target.value);
                  if (f) void choisirExpertises(f);
                }}
                className={selectCls}
                aria-label="Extraction"
              >
                {fichiers.map((f) => (
                  <option key={f.key} value={f.key}>
                    Extraction du {jour(dateDuFichier(f))}
                  </option>
                ))}
              </select>
            )}
          </div>
        }
      />

      {info && !source && (
        <Card className="mb-6 p-5 text-sm">
          <div className="font-semibold text-avisdoc-ink">Les expertises n'ont pas pu être lues.</div>
          <div className="mt-1 text-muted-foreground">{info}</div>
        </Card>
      )}
      {chargement && !source && (
        <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Lecture des expertises…
        </Card>
      )}
      {source && colonnesManquantes.length > 0 && (
        <Card className="mb-6 p-4 text-[13px] text-muted-foreground">
          Colonnes absentes de ce fichier (l'export a-t-il changé ?) : {colonnesManquantes.join(", ")}.
        </Card>
      )}

      {source && (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {PERIODES.map((p) => (
              <Pastille key={p.cle} actif={periode === p.cle} onClick={() => setPeriode(p.cle)}>
                {p.label}
              </Pastille>
            ))}
            <span className="mx-1 h-5 w-px bg-border" />
            {ORIGINES.map((o) => (
              <Pastille key={o.cle} actif={origine === o.cle} onClick={() => setOrigine(o.cle)}>
                {o.label}
              </Pastille>
            ))}
            <Choix valeur={requis} changer={setRequis} options={lesRequis} tous="Tous les requis" />
            <Choix valeur={profession} changer={setProfession} options={professions} tous="Toutes professions" />
          </div>

          <div className="ad-kpi-grid mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Avis rendus" valeur={nombre(r.total)} pied={`${nombre(r.requerants)} requérants · ${r.requis.length} requis`} />
            <Kpi label="En journée" valeur={nombre(r.enJournee)} pied={`${pct(r.enJournee, r.total)} % des avis`} />
            <Kpi
              label="Délai médian de réponse"
              valeur={heures(r.delais.mediane)}
              pied={r.delais.mesures ? `${pct(r.delais.sous24h, r.delais.mesures)} % sous 24 h · ${nombre(r.delais.mesures)} mesurés` : "délai non mesuré sur la période"}
            />
            {resultatsVisibles(rRes.total) ? (
              <Kpi label="Exérèses indispensables" valeur={nombre(exereses)} pied={`${pct(exereses, rRes.total)} % des avis · ${rRes.urgentes} urgent${rRes.urgentes > 1 ? "s" : ""}`} />
            ) : (
              <Kpi label="Exérèses indispensables" valeur={MASQUE} pied={MOTIF_MASQUE} />
            )}
          </div>

          {r.total === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">Aucun avis pour ces filtres.</Card>
          ) : (
            <>
              <Card className="mb-6 p-[22px]">
                <h2 className="font-display text-lg font-semibold text-avisdoc-ink">Avis par mois</h2>
                <p className="mb-4 text-[12.5px] text-muted-foreground">Selon la date d'envoi de la demande.</p>
                <BarresMois liste={liste} />
              </Card>

              <div className="mb-6 grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
                <Card className="p-[22px]">
                  <h2 className="mb-4 font-display text-lg font-semibold text-avisdoc-ink">Recommandations</h2>
                  {resultatsVisibles(rRes.total) ? (
                    <Barres parts={rRes.recommandations} total={rRes.total} />
                  ) : (
                    <p className="text-sm text-muted-foreground">{MOTIF_MASQUE}</p>
                  )}
                  {resultatsVisibles(rRes.total) && rRes.delaiRecoMedian !== null && (
                    <p className="mt-4 text-[12.5px] text-muted-foreground">
                      Délai recommandé médian, quand une consultation est conseillée : {rRes.delaiRecoMedian} jours.
                    </p>
                  )}
                </Card>
                <Card className="p-[22px]">
                  <h2 className="mb-1 font-display text-lg font-semibold text-avisdoc-ink">Délai de traitement</h2>
                  <p className="mb-4 text-[12.5px] text-muted-foreground">
                    De l'envoi à la réponse. Mesuré sur {nombre(r.delais.mesures)} avis ({pct(r.delais.mesures, r.total)} %) : l'export ne le donne que pour les avis récents.
                  </p>
                  {r.delais.mesures ? (
                    <div className="grid grid-cols-2 gap-4">
                      <Mesure label="Médiane" valeur={heures(r.delais.mediane)} />
                      <Mesure label="Moyenne" valeur={heures(r.delais.moyenne)} />
                      <Mesure label="9 avis sur 10 en moins de" valeur={heures(r.delais.p90)} />
                      <Mesure label="Sous 24 h / 48 h" valeur={`${pct(r.delais.sous24h, r.delais.mesures)} % / ${pct(r.delais.sous48h, r.delais.mesures)} %`} />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Aucun délai mesuré sur ces filtres.</p>
                  )}
                </Card>
              </div>

              <Card className="overflow-hidden">
                <div className="border-b border-border px-5 py-3.5">
                  <SectionLabel>Par requis</SectionLabel>
                </div>
                <TableRequis liste={liste} />
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Pastille({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
        actif ? "border-avisdoc-ink bg-avisdoc-ink text-white" : "border-border bg-card text-muted-foreground hover:text-avisdoc-ink",
      )}
    >
      {children}
    </button>
  );
}

function Kpi({ label, valeur, pied }: { label: string; valeur: string; pied: string }) {
  return (
    <Card className="p-5">
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-2 font-display text-[30px] font-bold text-avisdoc-ink">{valeur}</div>
      <div className="mt-1 truncate text-[12.5px] text-muted-foreground">{pied}</div>
    </Card>
  );
}

function Mesure({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div className="rounded-xl border border-border px-4 py-3">
      <div className="text-[11.5px] font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-[22px] font-bold text-avisdoc-ink">{valeur}</div>
    </div>
  );
}

export function Barres({ parts, total }: { parts: Part[]; total: number }) {
  const max = Math.max(1, ...parts.map((p) => p.nombre));
  return (
    <div className="flex flex-col gap-3">
      {parts.map((p) => (
        <div key={p.cle} title={`${p.cle} : ${p.nombre} (${pct(p.nombre, total)} %)`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-semibold text-avisdoc-ink">{p.cle}</span>
            <span className="shrink-0 text-muted-foreground">
              {nombre(p.nombre)} · {pct(p.nombre, total)} %
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-avisdoc-teal" style={{ width: `${(p.nombre / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Barres empilées par mois : hors journée (cyan) et en journée (bleu marine). Survol : le détail du mois. */
function BarresMois({ liste }: { liste: Expertise[] }) {
  const [survol, setSurvol] = useState<number | null>(null);
  const serie = useMemo(() => parMois(liste), [liste]);
  const max = Math.max(1, ...serie.map((m) => m.total));
  const actif = survol !== null ? serie[survol] : null;
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-[3px] bg-avisdoc-teal" /> Hors journée
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-[3px] bg-avisdoc-ink" /> En journée
        </span>
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border" />
        <span className="pointer-events-none absolute -top-2.5 right-0 bg-card pl-1.5 text-[11px] text-muted-foreground">{nombre(max)}</span>
        <div className="flex h-52 items-end gap-[2px] border-b border-border" onMouseLeave={() => setSurvol(null)}>
          {serie.map((m, i) => (
            <div key={m.mois} className="flex h-full min-w-0 flex-1 items-end" onMouseEnter={() => setSurvol(i)} aria-label={`${mois(m.mois)} : ${m.total} avis dont ${m.enJournee} en journée`}>
              <div className={cn("mx-auto flex w-full max-w-[44px] flex-col justify-end transition-opacity", survol !== null && survol !== i && "opacity-40")} style={{ height: `${(m.total / max) * 100}%` }}>
                <div className="w-full rounded-t-[4px] bg-avisdoc-teal" style={{ flexGrow: m.total - m.enJournee }} />
                {m.enJournee > 0 && <div className={cn("w-full bg-avisdoc-ink", m.total === m.enJournee && "rounded-t-[4px]")} style={{ flexGrow: m.enJournee, marginTop: m.total > m.enJournee ? 2 : 0 }} />}
              </div>
            </div>
          ))}
        </div>
      </div>
      <AxeMois etiquettes={serie.map((m) => mois(m.mois))} actif={survol} />
      <div className="mt-3 min-h-[20px] text-[12.5px] text-muted-foreground">
        {actif ? (
          <>
            <span className="font-semibold text-avisdoc-ink">{mois(actif.mois)}</span> · {nombre(actif.total)} avis, dont {nombre(actif.enJournee)} en journée
          </>
        ) : (
          "Survolez un mois pour le détail."
        )}
      </div>
    </div>
  );
}

/**
 * Par requis : combien d'avis, et ce qu'ils recommandent. Le taux de consultation (avis qui
 * orientent vers un dermatologue : consultation conseillée ou exérèse) se lit sur la barre ;
 * le trait vertical marque le taux de l'ensemble des requis, pour comparer d'un coup d'œil.
 */
function TableRequis({ liste }: { liste: Expertise[] }) {
  const [tri, setTri] = useState<"avis" | "taux" | "suivi">("avis");
  const lignes = useMemo(() => {
    const l = parRequis(liste);
    // Requis masqués : en fin de liste, pour que le tri ne trahisse pas leurs résultats.
    const suivi = (x: (typeof l)[number]) => (requisMasque(x.requis) ? Infinity : delaiSuiviMoyen(x) ?? Infinity);
    const taux = (x: (typeof l)[number]) => (requisMasque(x.requis) ? -1 : x.orientations / (x.renseignes || 1));
    if (tri === "suivi") return [...l].sort((a, b) => suivi(a) - suivi(b));
    return tri === "taux" ? [...l].sort((a, b) => taux(b) - taux(a)) : l;
  }, [liste, tri]);
  const tous = lignes.filter((l) => !requisMasque(l.requis)).reduce((s, l) => ({ o: s.o + l.orientations, r: s.r + l.renseignes }), { o: 0, r: 0 });
  const tauxGlobal = pct(tous.o, tous.r);
  // Délai moyen de suivi : même lecture que le taux — barre par requis, trait = ensemble des requis.
  const suiviTous = lignes.filter((l) => !requisMasque(l.requis)).reduce((s, l) => ({ somme: s.somme + l.delaiSuiviSomme, n: s.n + l.delaiSuiviMesures }), { somme: 0, n: 0 });
  const suiviGlobal = suiviTous.n ? suiviTous.somme / suiviTous.n : null;
  const suiviMax = Math.max(1, ...lignes.filter((l) => resultatsVisibles(l.total) && !requisMasque(l.requis)).map((l) => delaiSuiviMoyen(l) ?? 0), suiviGlobal ?? 0);
  const jours = (v: number | null) => (v === null ? "—" : `${Math.round(v)} j`);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-3 text-[12px] text-muted-foreground">
        <span>
          Taux de consultation = avis qui orientent vers un dermatologue (consultation ou exérèse), sur les avis où la recommandation est renseignée. Ensemble des requis : <b className="text-avisdoc-ink">{resultatsVisibles(tous.r) ? `${tauxGlobal} %` : MASQUE}</b>, délai moyen de suivi <b className="text-avisdoc-ink">{resultatsVisibles(tous.r) ? jours(suiviGlobal) : MASQUE}</b>. Un requis à {SEUIL_AIPD} avis ou moins n'affiche pas ses résultats (règle de l'AIPD).
        </span>
        <select value={tri} onChange={(e) => setTri(e.target.value as "avis" | "taux" | "suivi")} className={selectCls} aria-label="Trier">
          <option value="avis">Trier par nombre d'avis</option>
          <option value="taux">Trier par taux de consultation</option>
          <option value="suivi">Trier par délai de suivi</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-[13px]">
          <thead>
            <tr className="text-[11.5px] text-muted-foreground">
              <th className="px-5 py-2.5 font-semibold">Requis</th>
              <th className="px-3 py-2.5 text-right font-semibold">Avis</th>
              <th className="w-56 px-3 py-2.5 font-semibold">Taux de consultation</th>
              <th className="w-48 px-3 py-2.5 font-semibold" title="Délai de suivi recommandé dans les avis (jours), en moyenne ; le trait marque l'ensemble des requis">Délai moyen de suivi</th>
              <th className="px-3 py-2.5 text-right font-semibold">Consultation</th>
              <th className="px-3 py-2.5 text-right font-semibold">Exérèse</th>
              <th className="px-3 py-2.5 text-right font-semibold">Non indispensable</th>
              <th className="px-3 py-2.5 text-right font-semibold">Délai médian</th>
              <th className="px-5 py-2.5 text-right font-semibold">Urgents</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => {
              const taux = pct(l.orientations, l.renseignes);
              const visible = resultatsVisibles(l.total) && !requisMasque(l.requis);
              return (
                <tr key={l.requis} className="border-t border-border">
                  <td className="px-5 py-2.5 font-semibold text-avisdoc-ink"><NomPro nom={l.requis} /></td>
                  <td className="px-3 py-2.5 text-right text-avisdoc-ink">{nombre(l.total)}</td>
                  <td className="px-3 py-2.5" title={visible ? `${l.orientations} orientations sur ${l.renseignes} avis renseignés` : MOTIF_MASQUE}>
                    <div className="flex items-center gap-2">
                      <div className="relative h-2 flex-1 rounded-full bg-muted">
                        <div className="h-2 rounded-full bg-avisdoc-teal" style={{ width: `${visible ? taux : 0}%` }} />
                        <div className="absolute -top-1 h-4 w-0.5 bg-avisdoc-ink/60" style={{ left: `${tauxGlobal}%` }} />
                      </div>
                      <span className="w-10 shrink-0 text-right font-semibold text-avisdoc-ink">{visible && l.renseignes ? `${taux} %` : MASQUE}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5" title={visible ? `${l.delaiSuiviMesures} avis avec un délai recommandé` : MOTIF_MASQUE}>
                    <div className="flex items-center gap-2">
                      <div className="relative h-2 flex-1 rounded-full bg-muted">
                        <div className="h-2 rounded-full bg-avisdoc-teal" style={{ width: `${visible && delaiSuiviMoyen(l) !== null ? (100 * delaiSuiviMoyen(l)!) / suiviMax : 0}%` }} />
                        {suiviGlobal !== null && <div className="absolute -top-1 h-4 w-0.5 bg-avisdoc-ink/60" style={{ left: `${(100 * suiviGlobal) / suiviMax}%` }} />}
                      </div>
                      <span className="w-12 shrink-0 text-right font-semibold text-avisdoc-ink">{visible ? jours(delaiSuiviMoyen(l)) : MASQUE}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground">{visible ? `${pct(l.consultations, l.renseignes)} %` : MASQUE}</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground">{visible ? `${pct(l.exereses, l.renseignes)} %` : MASQUE}</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground">{visible ? `${pct(l.nonIndispensables, l.renseignes)} %` : MASQUE}</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground">{heures(l.delaiMedian)}</td>
                  <td className="px-5 py-2.5 text-right text-avisdoc-ink">{visible ? l.urgentes : MASQUE}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
