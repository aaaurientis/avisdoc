// Journée › Calendrier — les journées de dépistage mois par mois, et le détail de chacune.
//
// Un clic sur un jour affiche ses journées. En dessous, la liste complète : à venir d'abord
// (la plus proche en tête), puis les passées (la plus récente en tête).

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, SectionLabel } from "../../components/ui";
import { useJournees } from "../../data/journeesStore";
import {
  aujourdhuiISO,
  compterPar,
  estPassee,
  etatDe,
  grilleDuMois,
  moisDecale,
  type EtatJournee,
  type JourneeDepistage,
} from "../../lib/journees";
import { cn } from "@/lib/utils";
import { CadreJournees, Choix, LigneJournee, boutonCls, capitale, jour } from "./commun";

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const TEINTE: Record<EtatJournee, string> = {
  passee: "bg-muted text-muted-foreground",
  prete: "bg-avisdoc-teal-soft text-avisdoc-ink",
  "a-confirmer": "bg-avisdoc-coral-soft text-avisdoc-ink",
};
const LEGENDE: { etat: EtatJournee; label: string }[] = [
  { etat: "a-confirmer", label: "À confirmer" },
  { etat: "prete", label: "Prête" },
  { etat: "passee", label: "Passée" },
];

export default function Calendrier() {
  return (
    <CadreJournees titre="Calendrier des journées">
      <Contenu />
    </CadreJournees>
  );
}

function Contenu() {
  const { extraction } = useJournees();
  const auj = aujourdhuiISO();
  const [mois, setMois] = useState(auj.slice(0, 7));
  const [choisi, setChoisi] = useState(auj);
  const [client, setClient] = useState("");
  const [expert, setExpert] = useState("");

  const toutes = useMemo(() => extraction?.journees ?? [], [extraction]);
  const clients = useMemo(() => compterPar(toutes, (j) => j.client).map((c) => c.cle), [toutes]);
  const experts = useMemo(() => compterPar(toutes, (j) => j.expert).map((c) => c.cle), [toutes]);
  const journees = useMemo(
    () => toutes.filter((j) => (!client || j.client === client) && (!expert || j.expert === expert)),
    [toutes, client, expert],
  );
  const parJour = useMemo(() => {
    const m = new Map<string, JourneeDepistage[]>();
    for (const j of journees) if (j.date) m.set(j.date, [...(m.get(j.date) ?? []), j]);
    for (const l of m.values()) l.sort((a, b) => a.client.localeCompare(b.client));
    return m;
  }, [journees]);

  const grille = grilleDuMois(mois);
  const titreMois = capitale(new Date(`${mois}-15T12:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }));
  const duMois = journees.filter((j) => j.date.startsWith(mois)).length;
  const duJour = parJour.get(choisi) ?? [];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMois((m) => moisDecale(m, -1))} className={cn(boutonCls, "px-2.5")} aria-label="Mois précédent">
            <ChevronLeft className="size-4" />
          </button>
          <div className="min-w-[150px] text-center font-display text-lg font-semibold text-avisdoc-ink">{titreMois}</div>
          <button type="button" onClick={() => setMois((m) => moisDecale(m, 1))} className={cn(boutonCls, "px-2.5")} aria-label="Mois suivant">
            <ChevronRight className="size-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setMois(auj.slice(0, 7));
            setChoisi(auj);
          }}
          className={boutonCls}
        >
          Aujourd'hui
        </button>
        <Choix valeur={client} changer={setClient} options={clients} tous="Tous les clients" />
        <Choix valeur={expert} changer={setExpert} options={experts} tous="Tous les experts" />
      </div>

      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <SectionLabel>
            {duMois} journée{duMois > 1 ? "s" : ""} en {titreMois.toLowerCase()}
          </SectionLabel>
          <div className="flex flex-wrap gap-3 text-[12px] text-muted-foreground">
            {LEGENDE.map((l) => (
              <span key={l.etat} className="inline-flex items-center gap-1.5">
                <span className={cn("size-3 rounded-[3px]", TEINTE[l.etat])} />
                {l.label}
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-border text-center text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          {JOURS.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {grille.map((d, i) => {
            const liste = parJour.get(d) ?? [];
            const horsMois = !d.startsWith(mois);
            return (
              <button
                key={d}
                type="button"
                onClick={() => setChoisi(d)}
                className={cn(
                  "flex min-h-[64px] min-w-0 flex-col gap-1 border-border p-1.5 text-left transition-colors hover:bg-accent sm:min-h-[104px]",
                  i % 7 !== 6 && "border-r",
                  i < 35 && "border-b",
                  horsMois && "bg-background/60",
                  choisi === d && "bg-accent ring-2 ring-inset ring-avisdoc-ink",
                )}
                aria-label={`${jour(d)} : ${liste.length} journée${liste.length > 1 ? "s" : ""}`}
              >
                <span
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-full text-[12px] font-semibold",
                    d === auj ? "bg-avisdoc-ink text-white" : horsMois ? "text-muted-foreground/60" : "text-avisdoc-ink",
                  )}
                >
                  {Number(d.slice(8))}
                </span>
                {/* Grand écran : le client de chaque journée. Téléphone : le nombre seulement. */}
                <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                  {liste.slice(0, 3).map((j) => (
                    <span key={j.id} className={cn("truncate rounded px-1.5 py-0.5 text-[11px] font-semibold", TEINTE[etatDe(j, auj)])} title={`${j.client} · ${j.lieu}`}>
                      {j.client}
                    </span>
                  ))}
                  {liste.length > 3 && <span className="px-1.5 text-[11px] text-muted-foreground">+{liste.length - 3}</span>}
                </span>
                {liste.length > 0 && (
                  <span className={cn("self-start rounded-full px-1.5 text-[11px] font-bold sm:hidden", TEINTE[etatDe(liste[0], auj)])}>{liste.length}</span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="mb-6 overflow-hidden">
        <div className="border-b border-border bg-background px-5 py-3">
          <SectionLabel>
            {capitale(jour(choisi, { weekday: "long", day: "numeric", month: "long", year: "numeric" }))} · {duJour.length} journée{duJour.length > 1 ? "s" : ""}
          </SectionLabel>
        </div>
        {duJour.length ? (
          <ListeSimple liste={duJour} avecDate={false} />
        ) : (
          <p className="px-5 py-4 text-sm text-muted-foreground">Aucune journée ce jour-là.</p>
        )}
      </Card>

      <ListeJournees journees={journees} />
    </>
  );
}

function ListeSimple({ liste, avecDate = true }: { liste: JourneeDepistage[]; avecDate?: boolean }) {
  const [ouverte, setOuverte] = useState<number | null>(null);
  return (
    <div>
      {liste.map((j) => (
        <LigneJournee key={j.id} j={j} avecDate={avecDate} ouverte={ouverte === j.id} basculer={() => setOuverte((o) => (o === j.id ? null : j.id))} />
      ))}
    </div>
  );
}

/** Au-delà, les journées passées se replient : on suit surtout ce qui vient et ce qui vient de se faire. */
const PASSEES_VISIBLES = 10;

/** Toutes les journées : à venir d'abord (la plus proche en tête), puis les passées (la plus récente en tête). */
function ListeJournees({ journees }: { journees: JourneeDepistage[] }) {
  const [toutVoir, setToutVoir] = useState(false);
  const auj = aujourdhuiISO();
  const aVenir = journees.filter((j) => !estPassee(j, auj)).sort((a, b) => a.date.localeCompare(b.date));
  const passees = journees.filter((j) => estPassee(j, auj)).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Card className="overflow-hidden">
      {aVenir.length > 0 && (
        <>
          <div className="border-b border-border bg-background px-5 py-3">
            <SectionLabel>À venir · {aVenir.length}</SectionLabel>
          </div>
          <ListeSimple liste={aVenir} />
        </>
      )}
      {passees.length > 0 && (
        <>
          <div className="border-y border-border bg-background px-5 py-3">
            <SectionLabel>Passées · {passees.length}</SectionLabel>
          </div>
          <ListeSimple liste={toutVoir ? passees : passees.slice(0, PASSEES_VISIBLES)} />
          {passees.length > PASSEES_VISIBLES && (
            <button
              type="button"
              onClick={() => setToutVoir((v) => !v)}
              className="w-full border-t border-border px-5 py-3 text-center text-[13px] font-semibold text-avisdoc-teal transition-colors hover:bg-accent"
            >
              {toutVoir ? "Réduire" : `Voir les ${passees.length} journées passées`}
            </button>
          )}
        </>
      )}
      {!aVenir.length && !passees.length && <p className="px-5 py-4 text-sm text-muted-foreground">Aucune journée pour ces filtres.</p>}
    </Card>
  );
}
