// Journée — suivi des journées de dépistage à partir des extractions CSV déposées sur S3.
//
// Une extraction = un fichier CSV = une journée ; une ligne du fichier = une personne
// (ou un acte) de la journée. La date vient du nom du fichier quand il en contient une,
// sinon de la date de dépôt dans le bucket.
//
// Les colonnes ne sont pas imposées : la répartition se fait sur la colonne qu'on choisit,
// et l'écran propose d'office celle qui s'y prête le mieux (peu de valeurs différentes).

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { Card, PageHeader, SectionLabel } from "../components/ui";
import { chargerJournees, ErreurJournees, MAX_JOURNEES, type Chargement } from "../data/journeesRepo";
import {
  colonneARepartir,
  colonnesCommunes,
  dansLaPeriode,
  repartition,
  type JourneeExtraite,
  type Periode,
} from "../lib/journees";
import { cn } from "@/lib/utils";

const PERIODES: { cle: Periode; label: string }[] = [
  { cle: "30j", label: "30 jours" },
  { cle: "90j", label: "90 jours" },
  { cle: "12m", label: "12 mois" },
  { cle: "tout", label: "Tout" },
];

const jour = (iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", opts) : "—";
const nombre = (n: number) => n.toLocaleString("fr-FR");

export default function Journees() {
  const [donnees, setDonnees] = useState<Chargement | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<{ message: string; nonConfigure: boolean } | null>(null);
  const [periode, setPeriode] = useState<Periode>("tout");
  const [colonne, setColonne] = useState<string>("");
  const [ouverte, setOuverte] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      setDonnees(await chargerJournees());
    } catch (e) {
      setErreur({
        message: e instanceof Error ? e.message : String(e),
        nonConfigure: e instanceof ErreurJournees && e.nonConfigure,
      });
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const journees = useMemo(() => dansLaPeriode(donnees?.journees ?? [], periode), [donnees, periode]);
  const colonnes = useMemo(() => colonnesCommunes(journees), [journees]);
  const colonneActive = colonne && colonnes.includes(colonne) ? colonne : colonneARepartir(journees) ?? "";

  const totalLignes = journees.reduce((s, j) => s + j.table.lignes.length, 0);
  const enErreur = journees.filter((j) => j.erreur).length;

  return (
    <div>
      <PageHeader
        title="Journées"
        subtitle={
          donnees
            ? `Extractions des journées de dépistage — bucket ${donnees.bucket}${donnees.prefixe ? ` / ${donnees.prefixe}` : ""}`
            : "Extractions des journées de dépistage (AWS S3)"
        }
        action={
          <button
            type="button"
            onClick={() => void charger()}
            disabled={chargement}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-[13px] font-semibold text-avisdoc-ink transition-colors hover:border-avisdoc-ink disabled:opacity-60"
          >
            {chargement ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Actualiser
          </button>
        }
      />

      {erreur && (
        <Card className="mb-6 border-avisdoc-coral/40 p-5 text-sm">
          <div className="font-semibold text-avisdoc-ink">Les extractions n'ont pas pu être lues.</div>
          <div className="mt-1 text-muted-foreground">{erreur.message}</div>
          {erreur.nonConfigure && (
            <div className="mt-3 text-[13px] text-muted-foreground">
              À renseigner dans Supabase → Edge Functions → Secrets : <code>AWS_ACCESS_KEY_ID</code>,{" "}
              <code>AWS_SECRET_ACCESS_KEY</code>, <code>AWS_REGION</code>, <code>JOURNEES_S3_BUCKET</code> et, si les
              fichiers sont dans un dossier, <code>JOURNEES_S3_PREFIX</code>.
            </div>
          )}
        </Card>
      )}

      {chargement && !donnees && (
        <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Lecture des extractions…
        </Card>
      )}

      {donnees && (
        <>
          {/* Période : un seul rang de filtres, au-dessus de tout ce qu'il pilote. */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {PERIODES.map((p) => (
              <button
                key={p.cle}
                type="button"
                onClick={() => setPeriode(p.cle)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                  periode === p.cle
                    ? "border-avisdoc-ink bg-avisdoc-ink text-white"
                    : "border-border bg-card text-muted-foreground hover:text-avisdoc-ink",
                )}
              >
                {p.label}
              </button>
            ))}
            {donnees.total > MAX_JOURNEES && (
              <span className="text-[12px] text-muted-foreground">
                {nombre(donnees.total)} fichiers dans le bucket : les {MAX_JOURNEES} plus récents sont analysés.
              </span>
            )}
          </div>

          <div className="ad-kpi-grid mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Journées" valeur={nombre(journees.length)} pied={enErreur ? `${enErreur} fichier(s) illisible(s)` : "fichiers d'extraction"} />
            <Kpi label="Lignes extraites" valeur={nombre(totalLignes)} pied="toutes journées confondues" />
            <Kpi
              label="Moyenne par journée"
              valeur={journees.length ? nombre(Math.round((totalLignes / journees.length) * 10) / 10) : "—"}
              pied="lignes par extraction"
            />
            <Kpi label="Dernière journée" valeur={journees[0] ? jour(journees[0].date, { day: "numeric", month: "short" }) : "—"} pied={journees[0]?.nom ?? "—"} />
          </div>

          {journees.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">Aucune extraction sur cette période.</Card>
          ) : (
            <>
              <div className="mb-6 grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_380px]">
                <Card className="p-[22px]">
                  <h2 className="font-display text-lg font-semibold text-avisdoc-ink">Lignes par journée</h2>
                  <p className="mb-4 text-[12.5px] text-muted-foreground">Une barre par extraction, de la plus ancienne à la plus récente.</p>
                  <Barres journees={journees} />
                </Card>

                <Card className="p-[22px]">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="font-display text-lg font-semibold text-avisdoc-ink">Répartition</h2>
                    <select
                      value={colonneActive}
                      onChange={(e) => setColonne(e.target.value)}
                      className="min-w-0 max-w-[60%] rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px] text-avisdoc-ink"
                      aria-label="Colonne à répartir"
                    >
                      {!colonneActive && <option value="">Choisir une colonne</option>}
                      {colonnes.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  {colonneActive ? (
                    <Repartition journees={journees} colonne={colonneActive} />
                  ) : (
                    <p className="text-sm text-muted-foreground">Choisissez une colonne pour voir la répartition de ses valeurs.</p>
                  )}
                </Card>
              </div>

              <Card className="overflow-hidden">
                <div className="border-b border-border px-5 py-3.5">
                  <SectionLabel>Extractions</SectionLabel>
                </div>
                <div className="divide-y divide-border">
                  {journees.map((j) => (
                    <LigneJournee
                      key={j.key}
                      j={j}
                      ouverte={ouverte === j.key}
                      basculer={() => setOuverte((o) => (o === j.key ? null : j.key))}
                    />
                  ))}
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </div>
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

/** Une barre par journée, dans l'ordre du temps. Survol : la date, le fichier, le nombre de lignes. */
function Barres({ journees }: { journees: JourneeExtraite[] }) {
  const [survol, setSurvol] = useState<number | null>(null);
  const serie = useMemo(() => [...journees].sort((a, b) => a.date.localeCompare(b.date)), [journees]);
  const max = Math.max(1, ...serie.map((j) => j.table.lignes.length));
  const actif = survol !== null ? serie[survol] : null;
  // Quelques repères de date sous l'axe, pas une étiquette par barre.
  const pas = Math.max(1, Math.ceil(serie.length / 6));

  return (
    <div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border" />
        <span className="pointer-events-none absolute -top-2.5 right-0 bg-card pl-1.5 text-[11px] text-muted-foreground">{nombre(max)}</span>
        <div className="flex h-48 items-end gap-[2px] border-b border-border" onMouseLeave={() => setSurvol(null)}>
          {serie.map((j, i) => (
            <div
              key={j.key}
              className="flex h-full min-w-0 flex-1 cursor-default items-end"
              onMouseEnter={() => setSurvol(i)}
              aria-label={`${jour(j.date)} : ${j.table.lignes.length} lignes`}
            >
              <div
                className={cn("w-full rounded-t-[4px] bg-avisdoc-teal transition-opacity", survol !== null && survol !== i && "opacity-40")}
                style={{ height: `${Math.max(1, (j.table.lignes.length / max) * 100)}%` }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-[2px] text-[10.5px] text-muted-foreground">
        {serie.map((j, i) => (
          <div key={j.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">
            {i % pas === 0 ? jour(j.date, { day: "numeric", month: "short" }) : ""}
          </div>
        ))}
      </div>
      <div className="mt-3 min-h-[20px] text-[12.5px] text-muted-foreground">
        {actif ? (
          <>
            <span className="font-semibold text-avisdoc-ink">{jour(actif.date)}</span> · {nombre(actif.table.lignes.length)} lignes ·{" "}
            {actif.nom}
          </>
        ) : (
          "Survolez une barre pour le détail."
        )}
      </div>
    </div>
  );
}

function Repartition({ journees, colonne }: { journees: JourneeExtraite[]; colonne: string }) {
  const parts = useMemo(() => repartition(journees, colonne), [journees, colonne]);
  const total = parts.reduce((s, p) => s + p.nombre, 0) || 1;
  const max = Math.max(1, ...parts.map((p) => p.nombre));
  return (
    <div className="flex flex-col gap-3">
      {parts.map((p) => (
        <div key={p.valeur} title={`${p.valeur} : ${p.nombre} (${Math.round((p.nombre / total) * 100)} %)`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-semibold text-avisdoc-ink">{p.valeur}</span>
            <span className="shrink-0 text-muted-foreground">
              {nombre(p.nombre)} · {Math.round((p.nombre / total) * 100)} %
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

const MAX_LIGNES_VISIBLES = 100;

function LigneJournee({ j, ouverte, basculer }: { j: JourneeExtraite; ouverte: boolean; basculer: () => void }) {
  return (
    <div>
      <button
        type="button"
        onClick={basculer}
        className="flex w-full items-center gap-3 px-5 py-3 text-left text-[13.5px] transition-colors hover:bg-accent"
      >
        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", ouverte && "rotate-90")} />
        <span className="w-28 shrink-0 font-semibold text-avisdoc-ink">{jour(j.date)}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {j.nom}
          {!j.dateDuNom && <span className="ml-2 text-[11.5px]">(date de dépôt)</span>}
        </span>
        {j.erreur ? (
          <span className="shrink-0 text-[12.5px] font-semibold text-avisdoc-coral">Illisible</span>
        ) : (
          <span className="shrink-0 font-semibold text-avisdoc-ink">{nombre(j.table.lignes.length)} lignes</span>
        )}
      </button>
      {ouverte && (
        <div className="border-t border-border bg-background px-5 py-4">
          {j.erreur ? (
            <p className="text-sm text-muted-foreground">{j.erreur}</p>
          ) : j.table.lignes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Fichier vide.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12.5px]">
                  <thead>
                    <tr className="text-muted-foreground">
                      {j.table.colonnes.map((c) => (
                        <th key={c} className="whitespace-nowrap px-2 py-1.5 font-semibold">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {j.table.lignes.slice(0, MAX_LIGNES_VISIBLES).map((l, i) => (
                      <tr key={i} className="border-t border-border text-avisdoc-ink">
                        {j.table.colonnes.map((c) => (
                          <td key={c} className="whitespace-nowrap px-2 py-1.5">
                            {l[c]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {j.table.lignes.length > MAX_LIGNES_VISIBLES && (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  {MAX_LIGNES_VISIBLES} premières lignes sur {nombre(j.table.lignes.length)}.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
