// Le planning de la semaine : tout ce qui est programmé, d'où que ça vienne.
//
// C'est l'écran qu'on ouvre le matin. Les appels, rendez-vous, e-mails et notes
// notés depuis la prospection, le Pipeline ou le fichier client s'y retrouvent tous,
// rangés par jour — au lieu de dormir chacun dans sa fiche.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, ChevronLeft, ChevronRight, Loader2, Mail, NotebookPen, Phone } from "lucide-react";
import { PageHeader, SectionLabel } from "../components/ui";
import { LIBELLE, type Origine } from "../lib/corbeille";
import { chargerPlanning, lundiDe, memeJour, type Rendezvous } from "../lib/planning";
import type { GenreEchange } from "../lib/echanges";
import ModifierAction from "../components/ModifierAction";
import { cn } from "@/lib/utils";

const ICONES: Record<GenreEchange, typeof Phone> = {
  appel: Phone,
  email: Mail,
  rdv: CalendarClock,
  note: NotebookPen,
};

const TEINTES: Record<GenreEchange, string> = {
  appel: "bg-avisdoc-teal text-white",
  rdv: "bg-avisdoc-coral text-white",
  email: "bg-violet-500 text-white",
  note: "bg-slate-500 text-white",
};

const NOMS: Record<GenreEchange, string> = { appel: "appel", rdv: "rendez-vous", email: "e-mail", note: "note" };

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/** La semaine de travail. Le week-end s'ajoutera le jour où on y travaillera. */
const JOURS_OUVRES = 5;

const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** Où mène une action : sur la fiche qui la porte. */
const chemin: Record<Origine, (id: string) => string> = {
  affaire: (id) => `/crm/${id}`,
  prospect: () => "/prospects",
  client: () => "/fichier-client",
};

export default function Planning() {
  const navigate = useNavigate();
  const [debut, setDebut] = useState(() => lundiDe(new Date()));
  const [lignes, setLignes] = useState<Rendezvous[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aModifier, setAModifier] = useState<Rendezvous | null>(null);

  // La lecture s'arrête au vendredi soir : ce qui tombe le week-end n'est pas montré,
  // et ne doit donc pas être compté.
  const fin = useMemo(() => {
    const f = new Date(debut);
    f.setDate(f.getDate() + JOURS_OUVRES);
    return f;
  }, [debut]);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      setLignes(await chargerPlanning(debut, fin));
      setErreur(null);
    } catch (e) {
      const m = e instanceof Error ? e.message : "Chargement impossible.";
      setErreur(
        /Could not find the table .* in the schema cache/i.test(m)
          ? "Le planning attend la migration 0028 : collez-la dans le SQL Editor."
          : m,
      );
    } finally {
      setChargement(false);
    }
  }, [debut, fin]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const semaine = useMemo(
    () =>
      Array.from({ length: JOURS_OUVRES }, (_, i) => {
        const jour = new Date(debut);
        jour.setDate(jour.getDate() + i);
        return { jour, actions: lignes.filter((l) => memeJour(new Date(l.au), jour)) };
      }),
    [debut, lignes],
  );

  const decaler = (semaines: number) => {
    const d = new Date(debut);
    d.setDate(d.getDate() + semaines * 7);
    setDebut(d);
  };

  const cetteSemaine = memeJour(debut, lundiDe(new Date()));
  const duAu = `${debut.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} au ${new Date(fin.getTime() - 1).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;

  return (
    <div>
      <PageHeader
        title="Planning"
        subtitle={
          chargement
            ? "Chargement…"
            : `${lignes.length} action${lignes.length > 1 ? "s" : ""} du ${duAu} — prospection, Pipeline et clients réunis`
        }
        action={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => decaler(-1)}
              aria-label="Semaine précédente"
              className="rounded-full border border-border p-2 text-muted-foreground transition-colors hover:border-avisdoc-teal hover:text-avisdoc-ink"
            >
              <ChevronLeft className="size-4" />
            </button>
            {!cetteSemaine && (
              <button
                type="button"
                onClick={() => setDebut(lundiDe(new Date()))}
                className="rounded-full border border-border px-4 py-2 text-[13px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal"
              >
                Cette semaine
              </button>
            )}
            <button
              type="button"
              onClick={() => decaler(1)}
              aria-label="Semaine suivante"
              className="rounded-full border border-border p-2 text-muted-foreground transition-colors hover:border-avisdoc-teal hover:text-avisdoc-ink"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        }
      />

      {erreur && <div className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">{erreur}</div>}

      {chargement ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Chargement…
        </div>
      ) : (
        <div className="ad-kanban grid gap-3 overflow-x-auto pb-1 overscroll-x-contain" style={{ gridTemplateColumns: `repeat(${JOURS_OUVRES}, minmax(220px, 1fr))` }}>
          {semaine.map(({ jour, actions }) => {
            const aujourdhui = memeJour(jour, new Date());
            return (
              <div
                key={jour.toISOString()}
                className={cn(
                  "flex min-h-[320px] flex-col rounded-2xl border p-3.5",
                  aujourdhui ? "border-avisdoc-teal bg-avisdoc-teal/5" : "border-border",
                )}
              >
                <div className="mb-2.5 flex items-baseline justify-between gap-2">
                  <div className={cn("min-w-0", aujourdhui ? "text-avisdoc-teal" : "text-avisdoc-ink")}>
                    <div className="truncate text-[13px] font-bold">
                      {JOURS[(jour.getDay() + 6) % 7]} {jour.getDate()}
                    </div>
                    <div className="truncate text-[11px] font-semibold text-muted-foreground">
                      {aujourdhui ? "aujourd’hui" : jour.toLocaleDateString("fr-FR", { month: "long" })}
                    </div>
                  </div>
                  {actions.length > 0 && (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                      {actions.length}
                    </span>
                  )}
                </div>

                {actions.length === 0 ? (
                  <p className="text-[12.5px] text-muted-foreground">Rien de prévu.</p>
                ) : (
                  <div className="flex-1 space-y-1.5">
                    {actions.map((a) => {
                      const Icone = ICONES[a.kind];
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setAModifier(a)}
                          className="flex w-full items-start gap-2.5 rounded-xl border border-border bg-card p-2.5 text-left transition-colors hover:border-avisdoc-teal"
                        >
                          <span className={cn("mt-0.5 inline-flex size-[26px] shrink-0 items-center justify-center rounded-full", TEINTES[a.kind])}>
                            <Icone className="size-3.5" strokeWidth={2.4} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline gap-1.5">
                              <span className="font-mono text-[12.5px] font-bold text-avisdoc-ink">{heure(a.au)}</span>
                              <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
                                {NOMS[a.kind]}
                              </span>
                            </span>
                            <span className="mt-0.5 block text-[13px] font-semibold leading-snug text-avisdoc-ink">{a.titre}</span>
                            <span className="mt-0.5 block text-[12px] font-semibold leading-snug text-avisdoc-teal">{a.fiche}</span>
                            {a.detail && (
                              <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{a.detail}</span>
                            )}
                            <span className="mt-1 flex items-center gap-2 text-[11px]">
                              <span className="text-muted-foreground">Cliquez pour déplacer</span>
                              <span
                                role="link"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(chemin[a.origine](a.ficheId));
                                }}
                                onKeyDown={(e) => {
                                  if (e.key !== "Enter") return;
                                  e.stopPropagation();
                                  navigate(chemin[a.origine](a.ficheId));
                                }}
                                className="cursor-pointer font-semibold text-avisdoc-teal underline-offset-2 hover:underline"
                              >
                                ouvrir la fiche
                              </span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!chargement && lignes.length === 0 && (
        <div className="mt-3 rounded-2xl bg-muted/60 p-6 text-center">
          <SectionLabel>Semaine libre</SectionLabel>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Les appels, rendez-vous et relances que vous notez depuis l’onglet Action d’une fiche apparaissent ici, au
            jour et à l’heure prévus.
          </p>
        </div>
      )}
      {aModifier && (
        <ModifierAction
          action={{
            id: aModifier.id,
            kind: aModifier.kind,
            titre: aModifier.titre,
            detail: aModifier.detail,
            au: aModifier.au,
            par: aModifier.par,
          }}
          onClose={() => setAModifier(null)}
          onFait={charger}
        />
      )}
    </div>
  );
}
