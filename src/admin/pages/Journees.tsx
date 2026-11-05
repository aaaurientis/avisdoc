// Journée — suivi des journées de dépistage à partir de l'extraction CSV.
//
// Une extraction liste toutes les journées (une ligne = une journée). Elle vient du bucket
// S3 (le fichier le plus récent), ou d'un CSV importé à la main tant que S3 n'est pas branché.
// L'écran répond à trois questions : combien de journées et quand ; où en est chaque contrat ;
// les journées à venir sont-elles prêtes (confirmations, dermatoscope) ?

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Loader2, RefreshCw, Upload } from "lucide-react";
import { Card, PageHeader, SectionLabel } from "../components/ui";
import {
  ErreurJournees,
  dateDuFichier,
  listerExtractions,
  lireExtractionS3,
  lireFichierLocal,
  type Source,
} from "../data/journeesRepo";
import {
  aujourdhuiISO,
  compterPar,
  contrats,
  dansLaPeriode,
  estPassee,
  lireExtraction,
  manques,
  parMois,
  preparation,
  type FichierS3,
  type JourneeDepistage,
  type Periode,
} from "../lib/journees";
import { cn } from "@/lib/utils";

const PERIODES: { cle: Periode; label: string }[] = [
  { cle: "avenir", label: "À venir" },
  { cle: "30j", label: "30 jours" },
  { cle: "90j", label: "90 jours" },
  { cle: "12m", label: "12 mois" },
  { cle: "tout", label: "Tout" },
];

type Axe = "expert" | "dermatologue" | "lieu" | "client";
const AXES: { cle: Axe; label: string }[] = [
  { cle: "expert", label: "Expert" },
  { cle: "dermatologue", label: "Dermatologue" },
  { cle: "lieu", label: "Lieu" },
  { cle: "client", label: "Client" },
];

const jour = (iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", opts) : "—";
const mois = (cle: string) => {
  const s = new Date(`${cle}-15T12:00:00`).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const nombre = (n: number) => n.toLocaleString("fr-FR");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

interface S3Etat {
  bucket: string;
  prefixe: string;
  fichiers: FichierS3[];
}

export default function Journees() {
  const [s3, setS3] = useState<S3Etat | null>(null);
  const [s3Info, setS3Info] = useState<{ message: string; nonConfigure: boolean } | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [periode, setPeriode] = useState<Periode>("tout");
  const [client, setClient] = useState("");
  const [expert, setExpert] = useState("");
  const [axe, setAxe] = useState<Axe>("expert");
  const fichierRef = useRef<HTMLInputElement>(null);

  const lireS3 = useCallback(async (f: FichierS3, etat: S3Etat) => {
    setChargement(true);
    setErreur(null);
    try {
      setSource(await lireExtractionS3(f, etat.bucket, etat.prefixe));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setChargement(false);
    }
  }, []);

  const chargerS3 = useCallback(async () => {
    setChargement(true);
    setS3Info(null);
    try {
      const etat = await listerExtractions();
      setS3(etat);
      if (etat.fichiers.length) await lireS3(etat.fichiers[0], etat);
      else setS3Info({ message: `Aucun fichier CSV dans ${etat.bucket}/${etat.prefixe}.`, nonConfigure: false });
    } catch (e) {
      setS3(null);
      setS3Info({
        message: e instanceof Error ? e.message : String(e),
        nonConfigure: e instanceof ErreurJournees && e.nonConfigure,
      });
    } finally {
      setChargement(false);
    }
  }, [lireS3]);

  useEffect(() => {
    void chargerS3();
  }, [chargerS3]);

  const importer = async (f: File | undefined) => {
    if (!f) return;
    setErreur(null);
    try {
      setSource(await lireFichierLocal(f));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  };

  const extraction = useMemo(() => (source ? lireExtraction(source.texte) : null), [source]);
  const toutes = useMemo(() => extraction?.journees ?? [], [extraction]);
  const clients = useMemo(() => compterPar(toutes, (j) => j.client).map((c) => c.cle), [toutes]);
  const experts = useMemo(() => compterPar(toutes, (j) => j.expert).map((c) => c.cle), [toutes]);

  const journees = useMemo(
    () =>
      dansLaPeriode(toutes, periode).filter(
        (j) => (!client || j.client === client) && (!expert || j.expert === expert),
      ),
    [toutes, periode, client, expert],
  );
  const auj = aujourdhuiISO();
  const passees = journees.filter((j) => estPassee(j, auj));
  const aVenir = journees.filter((j) => !estPassee(j, auj));

  return (
    <div>
      <PageHeader
        title="Journées"
        subtitle={
          source
            ? `Journées de dépistage — extraction du ${jour(source.date)} (${source.origine} · ${source.nom})`
            : "Journées de dépistage — suivi et statistiques"
        }
        action={
          <div className="flex flex-wrap gap-2">
            <input ref={fichierRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void importer(e.target.files?.[0])} />
            <button type="button" onClick={() => fichierRef.current?.click()} className={boutonCls}>
              <Upload className="size-4" /> Importer un CSV
            </button>
            {s3 && (
              <button type="button" onClick={() => void chargerS3()} disabled={chargement} className={boutonCls}>
                {chargement ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Actualiser
              </button>
            )}
          </div>
        }
      />

      {/* S3 pas encore branché : on le dit sans alarmer, et l'import manuel prend le relais. */}
      {s3Info && !source && (
        <Card className="mb-6 p-5 text-sm">
          <div className="font-semibold text-avisdoc-ink">
            {s3Info.nonConfigure ? "Le bucket S3 n'est pas encore branché." : "Les extractions S3 n'ont pas pu être lues."}
          </div>
          <div className="mt-1 text-muted-foreground">{s3Info.message}</div>
          <div className="mt-3 text-muted-foreground">
            En attendant, importez l'extraction CSV avec le bouton « Importer un CSV » : elle est lue dans votre navigateur, rien n'est envoyé.
          </div>
        </Card>
      )}

      {erreur && <Card className="mb-6 border-avisdoc-coral/40 p-5 text-sm text-avisdoc-ink">{erreur}</Card>}

      {chargement && !source && !s3Info && (
        <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Lecture de l'extraction…
        </Card>
      )}

      {extraction && extraction.colonnesManquantes.length > 0 && (
        <Card className="mb-6 p-4 text-[13px] text-muted-foreground">
          Colonnes absentes de ce fichier (l'export a-t-il changé ?) : {extraction.colonnesManquantes.join(", ")}.
        </Card>
      )}

      {source && (
        <>
          {/* Un seul rang de filtres, au-dessus de tout ce qu'ils pilotent. */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {PERIODES.map((p) => (
              <button
                key={p.cle}
                type="button"
                onClick={() => setPeriode(p.cle)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                  periode === p.cle ? "border-avisdoc-ink bg-avisdoc-ink text-white" : "border-border bg-card text-muted-foreground hover:text-avisdoc-ink",
                )}
              >
                {p.label}
              </button>
            ))}
            <Choix valeur={client} changer={setClient} options={clients} tous="Tous les clients" />
            <Choix valeur={expert} changer={setExpert} options={experts} tous="Tous les experts" />
            {s3 && s3.fichiers.length > 1 && (
              <select
                value={s3.fichiers.find((f) => f.key.endsWith(source.nom))?.key ?? ""}
                onChange={(e) => {
                  const f = s3.fichiers.find((x) => x.key === e.target.value);
                  if (f) void lireS3(f, s3);
                }}
                className={selectCls}
                aria-label="Extraction"
              >
                {s3.fichiers.map((f) => (
                  <option key={f.key} value={f.key}>
                    Extraction du {jour(dateDuFichier(f))}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="ad-kpi-grid mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Journées" valeur={nombre(journees.length)} pied={`sur ${nombre(toutes.length)} dans l'extraction`} />
            <Kpi label="Passées" valeur={nombre(passees.length)} pied={journees.length ? `${pct(passees.length, journees.length)} % des journées` : "—"} />
            <Kpi
              label="À venir"
              valeur={nombre(aVenir.length)}
              pied={aVenir.length ? `prochaine : ${jour([...aVenir].sort((a, b) => a.date.localeCompare(b.date))[0].date, { day: "numeric", month: "short" })}` : "aucune"}
            />
            <Kpi label="Clients" valeur={nombre(new Set(journees.map((j) => j.client)).size)} pied={`${nombre(new Set(journees.map((j) => j.expert).filter(Boolean)).size)} experts mobilisés`} />
          </div>

          {journees.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">Aucune journée pour ces filtres.</Card>
          ) : (
            <>
              <div className="mb-6 grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_380px]">
                <Card className="p-[22px]">
                  <h2 className="font-display text-lg font-semibold text-avisdoc-ink">Journées par mois</h2>
                  <p className="mb-4 text-[12.5px] text-muted-foreground">Selon la date de la journée.</p>
                  <BarresMois journees={journees} />
                </Card>
                <Card className="p-[22px]">
                  <h2 className="font-display text-lg font-semibold text-avisdoc-ink">Préparation des journées à venir</h2>
                  <PreparationCarte journees={aVenir} />
                </Card>
              </div>

              <div className="mb-6 grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_380px]">
                <Card className="overflow-hidden">
                  <div className="border-b border-border px-5 py-3.5">
                    <SectionLabel>Avancement des contrats</SectionLabel>
                  </div>
                  <Contrats journees={journees} />
                </Card>
                <Card className="p-[22px]">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="font-display text-lg font-semibold text-avisdoc-ink">Répartition</h2>
                    <select value={axe} onChange={(e) => setAxe(e.target.value as Axe)} className={selectCls} aria-label="Répartir par">
                      {AXES.map((a) => (
                        <option key={a.cle} value={a.cle}>
                          Par {a.label.toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Repartition journees={journees} axe={axe} />
                </Card>
              </div>

              <ListeJournees aVenir={aVenir} passees={passees} />
            </>
          )}
        </>
      )}
    </div>
  );
}

const boutonCls =
  "inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-[13px] font-semibold text-avisdoc-ink transition-colors hover:border-avisdoc-ink disabled:opacity-60";
const selectCls = "min-w-0 max-w-[260px] rounded-full border border-border bg-card px-3 py-1.5 text-[13px] text-avisdoc-ink";

function Choix({ valeur, changer, options, tous }: { valeur: string; changer: (v: string) => void; options: string[]; tous: string }) {
  return (
    <select value={valeur} onChange={(e) => changer(e.target.value)} className={selectCls} aria-label={tous}>
      <option value="">{tous}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
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

/** Une barre par mois, sans trou. Survol : le mois et son nombre de journées. */
function BarresMois({ journees }: { journees: JourneeDepistage[] }) {
  const [survol, setSurvol] = useState<number | null>(null);
  const serie = useMemo(() => parMois(journees), [journees]);
  const max = Math.max(1, ...serie.map((m) => m.nombre));
  const actif = survol !== null ? serie[survol] : null;
  const pas = Math.max(1, Math.ceil(serie.length / 8));
  return (
    <div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border" />
        <span className="pointer-events-none absolute -top-2.5 right-0 bg-card pl-1.5 text-[11px] text-muted-foreground">{nombre(max)}</span>
        <div className="flex h-44 items-end gap-[2px] border-b border-border" onMouseLeave={() => setSurvol(null)}>
          {serie.map((m, i) => (
            <div
              key={m.cle}
              className="flex h-full min-w-0 flex-1 items-end"
              onMouseEnter={() => setSurvol(i)}
              aria-label={`${mois(m.cle)} : ${m.nombre} journées`}
            >
              <div
                className={cn("mx-auto w-full max-w-[56px] rounded-t-[4px] bg-avisdoc-teal transition-opacity", survol !== null && survol !== i && "opacity-40")}
                style={{ height: m.nombre ? `${(m.nombre / max) * 100}%` : "2px" }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-[2px] text-[10.5px] text-muted-foreground">
        {serie.map((m, i) => (
          <div key={m.cle} className="min-w-0 flex-1 truncate text-center">
            {i % pas === 0 ? mois(m.cle) : ""}
          </div>
        ))}
      </div>
      <div className="mt-3 min-h-[20px] text-[12.5px] text-muted-foreground">
        {actif ? (
          <>
            <span className="font-semibold text-avisdoc-ink">{mois(actif.cle)}</span> · {nombre(actif.nombre)} journée{actif.nombre > 1 ? "s" : ""}
          </>
        ) : (
          "Survolez une barre pour le détail."
        )}
      </div>
    </div>
  );
}

function PreparationCarte({ journees }: { journees: JourneeDepistage[] }) {
  const p = preparation(journees);
  if (!p.total) return <p className="mt-3 text-sm text-muted-foreground">Aucune journée à venir sur ces filtres.</p>;
  const lignes = [
    { label: "Confirmées par le client", n: p.confClient },
    { label: "Consentements confirmés", n: p.confConsentements },
    { label: "Confirmées par le requérant", n: p.confRequerant },
    { label: "Dermatoscope envoyé", n: p.dermatoscopeEnvoye },
  ];
  return (
    <div className="mt-1">
      <p className="mb-4 text-[12.5px] text-muted-foreground">
        {nombre(p.total)} journée{p.total > 1 ? "s" : ""} à venir.
      </p>
      <div className="flex flex-col gap-3.5">
        {lignes.map((l) => (
          <div key={l.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="font-semibold text-avisdoc-ink">{l.label}</span>
              <span className="shrink-0 text-muted-foreground">
                {l.n} / {p.total}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-avisdoc-teal" style={{ width: `${pct(l.n, p.total)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Contrats({ journees }: { journees: JourneeDepistage[] }) {
  const liste = useMemo(() => contrats(journees), [journees]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead>
          <tr className="text-[11.5px] text-muted-foreground">
            <th className="min-w-[200px] px-5 py-2.5 font-semibold">Client · devis</th>
            <th className="px-3 py-2.5 text-right font-semibold">Commandées</th>
            <th className="px-3 py-2.5 text-right font-semibold">Planifiées</th>
            <th className="px-3 py-2.5 text-right font-semibold">Passées</th>
            <th className="w-32 px-3 py-2.5 font-semibold">Avancement</th>
            <th className="px-5 py-2.5 font-semibold">Prochaine</th>
          </tr>
        </thead>
        <tbody>
          {liste.map((c) => {
            const base = c.commandees ?? c.planifiees;
            return (
              <tr key={`${c.client}|${c.devis}`} className="border-t border-border">
                <td className="px-5 py-2.5">
                  <div className="font-semibold text-avisdoc-ink">{c.client || "(sans client)"}</div>
                  <div className="text-[11.5px] text-muted-foreground">{c.devis || "sans n° de devis"}</div>
                </td>
                <td className="px-3 py-2.5 text-right text-avisdoc-ink">{c.commandees ?? "—"}</td>
                <td className="px-3 py-2.5 text-right text-avisdoc-ink">{c.planifiees}</td>
                <td className="px-3 py-2.5 text-right text-avisdoc-ink">{c.passees}</td>
                <td className="px-3 py-2.5" title={`${c.passees} passées sur ${base}`}>
                  <div className="h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-avisdoc-teal" style={{ width: `${Math.min(100, pct(c.passees, base))}%` }} />
                  </div>
                </td>
                <td className="whitespace-nowrap px-5 py-2.5 text-muted-foreground">{c.prochaine ? jour(c.prochaine, { day: "numeric", month: "short" }) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Repartition({ journees, axe }: { journees: JourneeDepistage[]; axe: Axe }) {
  const parts = useMemo(() => {
    const toutes = compterPar(journees, (j) => j[axe]);
    if (toutes.length <= 10) return toutes;
    return [...toutes.slice(0, 10), { cle: "Autres", nombre: toutes.slice(10).reduce((s, p) => s + p.nombre, 0) }];
  }, [journees, axe]);
  const total = parts.reduce((s, p) => s + p.nombre, 0);
  const max = Math.max(1, ...parts.map((p) => p.nombre));
  return (
    <div className="flex flex-col gap-3">
      {parts.map((p) => (
        <div key={p.cle} title={`${p.cle} : ${p.nombre} journées (${pct(p.nombre, total)} %)`}>
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

/** Au-delà, les journées passées se replient : on suit surtout ce qui vient et ce qui vient de se faire. */
const PASSEES_VISIBLES = 10;

/** À venir d'abord (la plus proche en tête), puis les passées (la plus récente en tête). */
function ListeJournees({ aVenir, passees }: { aVenir: JourneeDepistage[]; passees: JourneeDepistage[] }) {
  const [ouverte, setOuverte] = useState<number | null>(null);
  const [toutVoir, setToutVoir] = useState(false);
  const groupes = [
    { titre: "À venir", liste: [...aVenir].sort((a, b) => a.date.localeCompare(b.date)), avenir: true },
    { titre: "Passées", liste: [...passees].sort((a, b) => b.date.localeCompare(a.date)), avenir: false },
  ].filter((g) => g.liste.length);
  return (
    <Card className="overflow-hidden">
      {groupes.map((g) => (
        <div key={g.titre}>
          <div className="border-b border-border bg-background px-5 py-3">
            <SectionLabel>
              {g.titre} · {g.liste.length}
            </SectionLabel>
          </div>
          <div>
            {(g.avenir || toutVoir ? g.liste : g.liste.slice(0, PASSEES_VISIBLES)).map((j) => (
              <LigneJournee key={j.id} j={j} avenir={g.avenir} ouverte={ouverte === j.id} basculer={() => setOuverte((o) => (o === j.id ? null : j.id))} />
            ))}
          </div>
          {!g.avenir && g.liste.length > PASSEES_VISIBLES && (
            <button
              type="button"
              onClick={() => setToutVoir((v) => !v)}
              className="w-full border-t border-border px-5 py-3 text-center text-[13px] font-semibold text-avisdoc-teal transition-colors hover:bg-accent"
            >
              {toutVoir ? "Réduire" : `Voir les ${g.liste.length} journées passées`}
            </button>
          )}
        </div>
      ))}
    </Card>
  );
}

function LigneJournee({ j, avenir, ouverte, basculer }: { j: JourneeDepistage; avenir: boolean; ouverte: boolean; basculer: () => void }) {
  const reste = manques(j);
  return (
    <div className="border-b border-border last:border-b-0">
      <button type="button" onClick={basculer} className="flex w-full items-center gap-3 px-5 py-3 text-left text-[13px] transition-colors hover:bg-accent">
        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", ouverte && "rotate-90")} />
        <span className="w-24 shrink-0 font-semibold text-avisdoc-ink">{jour(j.date)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-avisdoc-ink">
            {j.client}
            {j.numero !== null && (
              <span className="ml-1.5 font-normal text-muted-foreground">
                · journée {j.numero}
                {j.commandees ? `/${j.commandees}` : ""}
              </span>
            )}
          </span>
          <span className="block truncate text-[12px] text-muted-foreground">
            {j.lieu || "lieu non renseigné"} · {j.expert || "expert non renseigné"}
          </span>
        </span>
        {avenir &&
          (reste.length ? (
            <span className="hidden shrink-0 rounded-full bg-avisdoc-coral-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-avisdoc-ink sm:inline">
              À confirmer : {reste.join(", ")}
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-avisdoc-teal-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-avisdoc-ink">
              <Check className="size-3.5" /> Prête
            </span>
          ))}
      </button>
      {ouverte && (
        <div className="grid grid-cols-1 gap-x-8 gap-y-2 border-t border-border bg-background px-5 py-4 text-[12.5px] sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Devis" valeur={j.devis} />
          <Info label="Dermatologue" valeur={j.dermatologue} />
          <Info label="Expert" valeur={j.expert} />
          <Info label="Contact" valeur={[j.contactNom, j.contactTel, j.contactEmail].filter(Boolean).join(" · ")} />
          <Info label="Salle" valeur={j.salle} />
          <Info label="Accès" valeur={j.acces} />
          <Info label="Confirmations" valeur={`client ${oui(j.confClient)} · consentements ${oui(j.confConsentements)} · requérant ${oui(j.confRequerant)}`} />
          <Info label="Dermatoscope — envoi" valeur={j.envoiDermatoscope ? `n° ${j.envoiDermatoscope} · ${jour(j.dateEnvoiDermatoscope)}` : ""} />
          <Info label="Dermatoscope — retour" valeur={j.retourDermatoscope ? `n° ${j.retourDermatoscope} · ${jour(j.dateRetourDermatoscope)}` : ""} />
          <Info label="Date de facture" valeur={j.dateFacture ? jour(j.dateFacture) : ""} />
          <Info label="Créée le" valeur={j.creeLe ? jour(j.creeLe) : ""} />
          <Info label="Autres informations" valeur={j.autres} />
        </div>
      )}
    </div>
  );
}

const oui = (v: boolean) => (v ? "oui" : "non");

function Info({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">{label}</div>
      <div className="break-words text-avisdoc-ink">{valeur || "—"}</div>
    </div>
  );
}
