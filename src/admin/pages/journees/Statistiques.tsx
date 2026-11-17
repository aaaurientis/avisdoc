// Statistiques › Vue globale — en trois parties, sous les mêmes filtres (période, client, requis) :
// 1. Journées : combien et quand, confirmation des journées à venir, avancement des contrats ;
// 2. Expertises : l'essentiel des avis (détail sur la page Expertises) ;
// 3. Journées et expertises : avis rendus en journée, journées sans avis, consultation en / hors journée.

import { useMemo, useState } from "react";
import { Card, SectionLabel } from "../../components/ui";
import { useExpertises, useJournees, useRegles } from "../../data/journeesStore";
import { cleJournee } from "../../lib/expertises";
import { BoutonRapport, ouvrirRapport } from "./ExpertisesJournee";
import { PartieExpertises, PartieLien, Titre } from "./VueGlobaleParties";
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
import { AxeMois, CadreJournees, Choix, capitale, jour, nombre, pct, selectCls } from "./commun";
import NomPro, { nomPro } from "../../components/NomPro";

const PERIODES: { cle: Periode; label: string }[] = [
  { cle: "avenir", label: "À venir" },
  { cle: "30j", label: "30 jours" },
  { cle: "90j", label: "90 jours" },
  { cle: "12m", label: "12 mois" },
  { cle: "tout", label: "Tout" },
];

type Axe = "requis" | "requerant" | "lieu" | "client" | "typologie";
const AXES: { cle: Axe; label: string }[] = [
  { cle: "typologie", label: "Typologie" },
  { cle: "requis", label: "Requis" },
  { cle: "requerant", label: "Requérant" },
  { cle: "lieu", label: "Lieu" },
  { cle: "client", label: "Client" },
];

const mois = (cle: string) => capitale(new Date(`${cle}-15T12:00:00`).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }));

export default function Statistiques() {
  return (
    <CadreJournees titre="Vue globale">
      <Contenu />
    </CadreJournees>
  );
}

function Contenu() {
  const { extraction } = useJournees();
  const [periode, setPeriode] = useState<Periode>("tout");
  const [client, setClient] = useState("");
  const [requis, setRequis] = useState("");
  const [axe, setAxe] = useState<Axe>("requis");

  const toutes = useMemo(() => extraction?.journees ?? [], [extraction]);
  const clients = useMemo(() => compterPar(toutes, (j) => j.client).map((c) => c.cle), [toutes]);
  const lesRequis = useMemo(() => compterPar(toutes, (j) => j.requis).map((c) => c.cle), [toutes]);
  const journees = useMemo(
    () => dansLaPeriode(toutes, periode).filter((j) => (!client || j.client === client) && (!requis || j.requis === requis)),
    [toutes, periode, client, requis],
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
        <Choix valeur={requis} changer={setRequis} options={lesRequis} tous="Tous les requis" noms />
      </div>

      <Titre numero="01" titre="Journées" />
      <div className="ad-kpi-grid mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Journées" valeur={nombre(journees.length)} pied={`sur ${nombre(toutes.length)} dans l'extraction`} />
        <Kpi label="Passées" valeur={nombre(passees.length)} pied={journees.length ? `${pct(passees.length, journees.length)} % des journées` : "—"} />
        <Kpi label="À venir" valeur={nombre(aVenir.length)} pied={prochaine ? `prochaine : ${jour(prochaine.date, { day: "numeric", month: "short" })}` : "aucune"} />
        <Kpi
          label="Clients"
          valeur={nombre(new Set(journees.map((j) => j.client)).size)}
          pied={`${nombre(new Set(journees.map((j) => j.requis).filter(Boolean)).size)} requis mobilisés`}
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
              <h2 className="font-display text-lg font-semibold text-avisdoc-ink">Confirmation des journées à venir</h2>
              <PreparationCarte journees={aVenir} />
            </Card>
          </div>

          <Card className="mb-6 overflow-hidden">
            <div className="border-b border-border px-5 py-3.5">
              <SectionLabel>Avancement des contrats</SectionLabel>
            </div>
            <Contrats journees={journees} />
          </Card>
          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
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

      <PartieExpertises periode={periode} client={client} requis={requis} journees={journees} />
      <PartieLien periode={periode} client={client} requis={requis} journees={journees} />
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
      <AxeMois etiquettes={serie.map((m) => mois(m.cle))} actif={survol} />
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
  const { reglesDe } = useRegles();
  const p = preparation(journees, reglesDe);
  if (!p.total) return <p className="mt-3 text-sm text-muted-foreground">Aucune journée à venir sur ces filtres.</p>;
  // Chaque critère est compté sur les seules journées dont la typologie l'exige.
  const lignes = [
    { label: "Journées confirmées", n: p.confirmees, sur: p.total },
    ...p.criteres.map((c) => ({ label: c.label, n: c.acquises, sur: c.exigees })),
  ];
  return (
    <div className="mt-1">
      <p className="mb-4 text-[12.5px] text-muted-foreground">
        {nombre(p.total)} journée{p.total > 1 ? "s" : ""} à venir. Ce qui est exigé dépend de la typologie du client (Admin › Typologies clients).
      </p>
      <div className="flex flex-col gap-3.5">
        {lignes.map((l) => (
          <div key={l.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="font-semibold text-avisdoc-ink">{l.label}</span>
              <span className="shrink-0 text-muted-foreground">
                {l.n} / {l.sur}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-avisdoc-teal" style={{ width: `${pct(l.n, l.sur)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Contrats({ journees }: { journees: JourneeDepistage[] }) {
  const liste = useMemo(() => contrats(journees), [journees]);
  const { typologieDe } = useRegles();
  const { index, statut } = useExpertises();
  /** Avis rendus par contrat : la somme des avis de ses journées. */
  const avisDe = (client: string, devis: string) =>
    journees.filter((j) => j.client === client && j.devis === devis).reduce((s, j) => s + (index.get(cleJournee(j))?.length ?? 0), 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-[13px]">
        <thead>
          <tr className="text-[11.5px] text-muted-foreground">
            <th className="min-w-[200px] px-5 py-2.5 font-semibold">Client · devis</th>
            <th className="px-3 py-2.5 text-right font-semibold">Commandées</th>
            <th className="px-3 py-2.5 text-right font-semibold">Planifiées</th>
            <th className="px-3 py-2.5 text-right font-semibold">Passées</th>
            <th className="w-32 px-3 py-2.5 font-semibold">Avancement</th>
            <th className="px-3 py-2.5 font-semibold">Prochaine</th>
            <th className="px-3 py-2.5 text-right font-semibold">Avis</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold" title="Avis rendus ÷ journées passées du contrat">Avis / journée</th>
            <th className="px-5 py-2.5 font-semibold">Rapport</th>
          </tr>
        </thead>
        <tbody>
          {liste.map((c) => {
            const base = c.commandees ?? c.planifiees;
            return (
              <tr key={`${c.client}|${c.devis}`} className="border-t border-border">
                <td className="px-5 py-2.5">
                  <div className="font-semibold text-avisdoc-ink">{c.client || "(sans client)"}</div>
                  <div className="text-[11.5px] text-muted-foreground">
                    {c.devis || "sans n° de devis"} · {typologieDe(c.client)?.nom ?? "règle par défaut"}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right text-avisdoc-ink">{c.commandees ?? "—"}</td>
                <td className="px-3 py-2.5 text-right text-avisdoc-ink">{c.planifiees}</td>
                <td className="px-3 py-2.5 text-right text-avisdoc-ink">{c.passees}</td>
                <td className="px-3 py-2.5" title={`${c.passees} passées sur ${base}`}>
                  <div className="h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-avisdoc-teal" style={{ width: `${Math.min(100, pct(c.passees, base))}%` }} />
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{c.prochaine ? jour(c.prochaine, { day: "numeric", month: "short" }) : "—"}</td>
                <td className="px-3 py-2.5 text-right text-avisdoc-ink">{statut === "pret" ? nombre(avisDe(c.client, c.devis)) : "…"}</td>
                <td className="px-3 py-2.5 text-right text-avisdoc-ink">
                  {statut !== "pret" ? "…" : c.passees ? nombre(Math.round(avisDe(c.client, c.devis) / c.passees)) : "—"}
                </td>
                <td className="px-5 py-2.5">
                  <BoutonRapport nbAvis={avisDe(c.client, c.devis)} onClick={() => ouvrirRapport({ client: c.client, devis: c.devis })} libelle="Rapport" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Repartition({ journees, axe }: { journees: JourneeDepistage[]; axe: Axe }) {
  const estNom = axe === "requis" || axe === "requerant";
  const { typologieDe } = useRegles();
  const parts = useMemo(() => {
    const toutes = compterPar(journees, (j) => (axe === "typologie" ? typologieDe(j.client)?.nom ?? "Règle par défaut" : j[axe]));
    if (toutes.length <= 10) return toutes;
    return [...toutes.slice(0, 10), { cle: "Autres", nombre: toutes.slice(10).reduce((s, p) => s + p.nombre, 0) }];
  }, [journees, axe, typologieDe]);
  const total = parts.reduce((s, p) => s + p.nombre, 0);
  const max = Math.max(1, ...parts.map((p) => p.nombre));
  return (
    <div className="flex flex-col gap-3">
      {parts.map((p) => (
        <div key={p.cle} title={`${estNom ? nomPro(p.cle) : p.cle} : ${p.nombre} journées (${pct(p.nombre, total)} %)`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-semibold text-avisdoc-ink">{estNom ? <NomPro nom={p.cle} /> : p.cle}</span>
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
