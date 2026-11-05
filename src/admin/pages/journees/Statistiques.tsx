// Journée › Statistiques — combien de journées et quand, où en est chaque contrat,
// les journées à venir sont-elles prêtes. Le détail jour par jour est dans le Calendrier.

import { useMemo, useState } from "react";
import { Card, SectionLabel } from "../../components/ui";
import { useJournees } from "../../data/journeesStore";
import {
  aujourdhuiISO,
  compterPar,
  contrats,
  dansLaPeriode,
  estPassee,
  parMois,
  preparation,
  type JourneeDepistage,
  type Periode,
} from "../../lib/journees";
import { cn } from "@/lib/utils";
import { CadreJournees, Choix, capitale, jour, nombre, pct, selectCls } from "./commun";

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

const mois = (cle: string) => capitale(new Date(`${cle}-15T12:00:00`).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }));

export default function Statistiques() {
  return (
    <CadreJournees titre="Statistiques des journées">
      <Contenu />
    </CadreJournees>
  );
}

function Contenu() {
  const { extraction } = useJournees();
  const [periode, setPeriode] = useState<Periode>("tout");
  const [client, setClient] = useState("");
  const [expert, setExpert] = useState("");
  const [axe, setAxe] = useState<Axe>("expert");

  const toutes = useMemo(() => extraction?.journees ?? [], [extraction]);
  const clients = useMemo(() => compterPar(toutes, (j) => j.client).map((c) => c.cle), [toutes]);
  const experts = useMemo(() => compterPar(toutes, (j) => j.expert).map((c) => c.cle), [toutes]);
  const journees = useMemo(
    () => dansLaPeriode(toutes, periode).filter((j) => (!client || j.client === client) && (!expert || j.expert === expert)),
    [toutes, periode, client, expert],
  );
  const auj = aujourdhuiISO();
  const passees = journees.filter((j) => estPassee(j, auj));
  const aVenir = journees.filter((j) => !estPassee(j, auj));
  const prochaine = [...aVenir].sort((a, b) => a.date.localeCompare(b.date))[0];

  return (
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
      </div>

      <div className="ad-kpi-grid mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Journées" valeur={nombre(journees.length)} pied={`sur ${nombre(toutes.length)} dans l'extraction`} />
        <Kpi label="Passées" valeur={nombre(passees.length)} pied={journees.length ? `${pct(passees.length, journees.length)} % des journées` : "—"} />
        <Kpi label="À venir" valeur={nombre(aVenir.length)} pied={prochaine ? `prochaine : ${jour(prochaine.date, { day: "numeric", month: "short" })}` : "aucune"} />
        <Kpi
          label="Clients"
          valeur={nombre(new Set(journees.map((j) => j.client)).size)}
          pied={`${nombre(new Set(journees.map((j) => j.expert).filter(Boolean)).size)} experts mobilisés`}
        />
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

          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_380px]">
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
        </>
      )}
    </>
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
            <div key={m.cle} className="flex h-full min-w-0 flex-1 items-end" onMouseEnter={() => setSurvol(i)} aria-label={`${mois(m.cle)} : ${m.nombre} journées`}>
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
