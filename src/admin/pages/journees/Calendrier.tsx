// Statistiques › Journées (ex-Calendrier) — les journées de dépistage mois par mois, et le détail de chacune.
//
// Un clic sur un jour affiche ses journées. En dessous, la liste complète : à venir d'abord
// (la plus proche en tête), puis les passées (la plus récente en tête).

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, SectionLabel } from "../../components/ui";
import { useExpertisesStats, useJournees, useRegles } from "../../data/journeesStore";
import { cleJournee } from "../../lib/expertises";
import {
  aujourdhuiISO,
  compterPar,
  estPassee,
  etatDe,
  grilleDuMois,
  moisDecale,
  nbJournees,
  type EtatJournee,
  type JourneeDepistage,
  blocsJournees,
} from "../../lib/journees";
import { cn } from "@/lib/utils";
import { requisMasque } from "../../lib/masquage";
import { CadreJournees, Choix, ListeJourneesGroupees, boutonCls, capitale, jour } from "./commun";

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const TEINTE: Record<EtatJournee, string> = {
  passee: "bg-muted text-muted-foreground",
  prete: "bg-avisdoc-teal-soft text-avisdoc-ink",
  "a-confirmer": "bg-avisdoc-coral-soft text-avisdoc-ink",
};
const LEGENDE: { etat: EtatJournee; label: string }[] = [
  { etat: "a-confirmer", label: "À confirmer" },
  { etat: "prete", label: "Confirmée" },
  { etat: "passee", label: "Passée" },
];

export default function Calendrier() {
  return (
    <CadreJournees titre="Journées">
      <Contenu />
    </CadreJournees>
  );
}

function Contenu() {
  const { extraction } = useJournees();
  const { reglesDe } = useRegles();
  // Journée terminée : on affiche le nombre d'expertises rendues.
  const { index } = useExpertisesStats();
  const avisDe = (j: JourneeDepistage) => (estPassee(j, auj) ? (index.get(cleJournee(j))?.length ?? 0) : 0);
  /** Avis d'une journée regroupée : ceux de ses créneaux, chacun une fois. */
  const avisDuGroupe = (js: JourneeDepistage[]) =>
    new Set(js.filter((j) => estPassee(j, auj)).flatMap((j) => (index.get(cleJournee(j)) ?? []).map((e) => e.id))).size;
  // Dans le calendrier : les créneaux d'une journée regroupée, montrés sous elle ou non.
  const [creneauxVisibles, setCreneauxVisibles] = useState(true);
  const auj = aujourdhuiISO();
  const [mois, setMois] = useState(auj.slice(0, 7));
  const [choisi, setChoisi] = useState(auj);
  const [client, setClient] = useState("");
  const [requis, setRequis] = useState("");

  const toutes = useMemo(() => extraction?.journees ?? [], [extraction]);
  const clients = useMemo(() => compterPar(toutes, (j) => j.client).map((c) => c.cle), [toutes]);
  // Requis masqués (Admin › Réglages › Statistiques) : absents des listes.
  const lesRequis = useMemo(() => compterPar(toutes, (j) => j.requis).map((c) => c.cle).filter((r) => !requisMasque(r)), [toutes]);
  const journees = useMemo(
    () => toutes.filter((j) => (!client || j.client === client) && (!requis || j.requis === requis)),
    [toutes, client, requis],
  );
  const parJour = useMemo(() => {
    const m = new Map<string, JourneeDepistage[]>();
    for (const j of journees) if (j.date) m.set(j.date, [...(m.get(j.date) ?? []), j]);
    for (const l of m.values()) l.sort((a, b) => a.client.localeCompare(b.client));
    return m;
  }, [journees]);

  const grille = grilleDuMois(mois);
  const titreMois = capitale(new Date(`${mois}-15T12:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }));
  const duMois = nbJournees(journees.filter((j) => j.date.startsWith(mois)));
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
        <Choix valeur={requis} changer={setRequis} options={lesRequis} tous="Tous les requis" noms />
      </div>

      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <SectionLabel>
            {duMois} journée{duMois > 1 ? "s" : ""} en {titreMois.toLowerCase()}
          </SectionLabel>
          <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
            <label className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-avisdoc-ink" title="Journées regroupées (même client, même ville, même jour) : afficher leurs créneaux sous la journée">
              <input type="checkbox" checked={creneauxVisibles} onChange={(e) => setCreneauxVisibles(e.target.checked)} className="size-3.5 accent-avisdoc-ink" />
              Détail des créneaux
            </label>
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
                aria-label={`${jour(d)} : ${nbJournees(liste)} journée${nbJournees(liste) > 1 ? "s" : ""}`}
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
                  {blocsJournees(liste).slice(0, 3).map((b) => {
                    const j = b.journees[0];
                    const puce = (x: JourneeDepistage, creneau = false) => (
                      <span
                        key={x.id}
                        className={cn(
                          "flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 font-semibold",
                          TEINTE[etatDe(x, auj, reglesDe(x))],
                          creneau ? "ml-2.5 border-l-2 border-avisdoc-ink/40 text-[10px] opacity-90" : "text-[11px]",
                        )}
                        title={`${x.client} · ${x.lieu}${creneau ? ` · créneau ${x.groupeRang}/${x.groupeTaille}` : ""}${avisDe(x) ? ` · ${avisDe(x)} avis` : ""}`}
                      >
                        <span className="min-w-0 flex-1 truncate">{x.client}</span>
                        {creneau && <span className="shrink-0 rounded bg-white/70 px-1 text-[9.5px] font-bold text-avisdoc-ink">{x.groupeRang}/{x.groupeTaille}</span>}
                        {avisDe(x) > 0 && <span className="shrink-0 font-bold text-avisdoc-ink">{avisDe(x)}</span>}
                      </span>
                    );
                    if (b.journees.length === 1) return puce(j);
                    const total = avisDuGroupe(b.journees);
                    const aVenir = b.journees.find((x) => !estPassee(x, auj)) ?? j;
                    return (
                      <span key={b.groupe} className="flex min-w-0 flex-col gap-0.5">
                        <span
                          className={cn("flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold ring-1 ring-inset ring-avisdoc-ink/40", TEINTE[etatDe(aVenir, auj, reglesDe(aVenir))])}
                          title={`${j.client} · ${j.lieu} · 1 journée, ${b.journees.length} créneaux (même client, même ville, même jour)${total ? ` · ${total} avis` : ""}`}
                        >
                          <span className="min-w-0 flex-1 truncate">{j.client}</span>
                          <span className="shrink-0 rounded bg-avisdoc-ink px-1 text-[9.5px] font-bold text-white">×{b.journees.length}</span>
                          {total > 0 && <span className="shrink-0 font-bold text-avisdoc-ink">{total}</span>}
                        </span>
                        {creneauxVisibles && b.journees.map((x) => puce(x, true))}
                      </span>
                    );
                  })}
                  {nbJournees(liste) > 3 && <span className="px-1.5 text-[11px] text-muted-foreground">+{nbJournees(liste) - 3}</span>}
                </span>
                {liste.length > 0 && (
                  <span className={cn("self-start rounded-full px-1.5 text-[11px] font-bold sm:hidden", TEINTE[etatDe(liste[0], auj, reglesDe(liste[0]))])}>{nbJournees(liste)}</span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="mb-6 overflow-hidden">
        <div className="border-b border-border bg-background px-5 py-3">
          <SectionLabel>
            {capitale(jour(choisi, { weekday: "long", day: "numeric", month: "long", year: "numeric" }))} · {nbJournees(duJour)} journée{nbJournees(duJour) > 1 ? "s" : ""}
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

const ListeSimple = ListeJourneesGroupees;

/** Au-delà, les journées passées se replient : on suit surtout ce qui vient et ce qui vient de se faire. */
const PASSEES_VISIBLES = 10;

/** Les n premières journées (au sens du regroupement) d'une liste, sans couper un regroupement. */
function premieresJournees(liste: JourneeDepistage[], n: number) {
  const garde = new Set(blocsJournees(liste).slice(0, n).map((b) => b.groupe));
  return liste.filter((j) => garde.has(j.groupe ?? `j${j.id}`));
}

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
            <SectionLabel>À venir · {nbJournees(aVenir)}</SectionLabel>
          </div>
          <ListeSimple liste={aVenir} />
        </>
      )}
      {passees.length > 0 && (
        <>
          <div className="border-y border-border bg-background px-5 py-3">
            <SectionLabel>Passées · {nbJournees(passees)}</SectionLabel>
          </div>
          <ListeSimple liste={toutVoir ? passees : premieresJournees(passees, PASSEES_VISIBLES)} />
          {nbJournees(passees) > PASSEES_VISIBLES && (
            <button
              type="button"
              onClick={() => setToutVoir((v) => !v)}
              className="w-full border-t border-border px-5 py-3 text-center text-[13px] font-semibold text-avisdoc-teal transition-colors hover:bg-accent"
            >
              {toutVoir ? "Réduire" : `Voir les ${nbJournees(passees)} journées passées`}
            </button>
          )}
        </>
      )}
      {!aVenir.length && !passees.length && <p className="px-5 py-4 text-sm text-muted-foreground">Aucune journée pour ces filtres.</p>}
    </Card>
  );
}
