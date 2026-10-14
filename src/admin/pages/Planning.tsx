// Le planning de la semaine, ou du mois : tout ce qui est programmé, d'où que ça vienne.
//
// C'est l'écran qu'on ouvre le matin. Les appels, rendez-vous, e-mails et notes
// notés depuis la prospection, le Pipeline ou le fichier client s'y retrouvent tous,
// rangés par jour — au lieu de dormir chacun dans sa fiche.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, ChevronLeft, ChevronRight, Eye, FileText, Linkedin, ListTodo, Loader2, Mail, MessageSquare, NotebookPen, Pencil, Phone, Plus, Presentation, Store, Trash2 } from "lucide-react";
import { PageHeader, SectionLabel } from "../components/ui";
import { LIBELLE, type Origine } from "../lib/corbeille";
import { chargerPlanning, lundiDe, memeJour, type Rendezvous } from "../lib/planning";
import type { GenreEchange } from "../lib/echanges";
import ModifierAction from "../components/ModifierAction";
import NouvelleAction from "../components/NouvelleAction";
import ApercuFiche from "../components/ApercuFiche";
import ProjectView from "./crm/ProjectView";
import FicheClient from "./clients/FicheClient";
import { useAdminData } from "../data/AdminDataContext";
import { annulerAction, estColonneRdv } from "../lib/echanges";
import { useAuth } from "../auth/AuthContext";
import { prenomDe } from "../lib/actions-fiche";
import { cn } from "@/lib/utils";
import { confirmer } from "../components/Confirmation";

const ICONES: Record<GenreEchange, typeof Phone> = {
  appel: Phone,
  email: Mail,
  rdv: CalendarClock,
  tache: ListTodo,
  note: NotebookPen,
  presentation: Presentation,
  salon: Store,
  sms: MessageSquare,
  linkedin: Linkedin,
  devis: FileText,
};

const TEINTES: Record<GenreEchange, string> = {
  appel: "bg-avisdoc-teal text-white",
  rdv: "bg-avisdoc-coral text-white",
  email: "bg-violet-500 text-white",
  tache: "bg-amber-500 text-white",
  note: "bg-slate-500 text-white",
  presentation: "bg-sky-600 text-white",
  salon: "bg-emerald-600 text-white",
  sms: "bg-teal-600 text-white",
  linkedin: "bg-blue-600 text-white",
  devis: "bg-indigo-500 text-white",
};

const NOMS: Record<GenreEchange, string> = {
  appel: "appel",
  rdv: "rendez-vous",
  email: "e-mail",
  tache: "à faire",
  note: "note",
  presentation: "présentation",
  salon: "salon",
  sms: "SMS",
  linkedin: "LinkedIn",
  devis: "devis",
};

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/** La semaine de travail. Le week-end s'ajoutera le jour où on y travaillera. */
const JOURS_OUVRES = 5;

const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** Où mène une action : sur la fiche qui la porte. */
const chemin: Record<Origine, (id: string) => string> = {
  affaire: (id) => `/crm/${id}`,
  prospect: () => "/prospects",
  client: () => "/fichier-client",
  // Une note n'apparaît jamais au planning — elle n'est pas une action à faire —,
  // mais le type l'exige : on renvoie au Débrief, d'où elle vient.
  note: () => "/debrief",
};

/** Le 1er du mois d'une date, à minuit. */
const premierDuMois = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/** Combien d'actions un jour du mois montre avant « + N autres ». */
const PAR_JOUR_DANS_LE_MOIS = 3;

export default function Planning() {
  const navigate = useNavigate();
  const [vue, setVue] = useState<"semaine" | "mois">("semaine");
  const [debut, setDebut] = useState(() => lundiDe(new Date()));
  const [mois, setMois] = useState(() => premierDuMois(new Date()));
  const [lignes, setLignes] = useState<Rendezvous[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aModifier, setAModifier] = useState<Rendezvous | null>(null);
  const [aVoir, setAVoir] = useState<Rendezvous | null>(null);
  const [ajout, setAjout] = useState(false);
  const { clients, accounts, setClientStage } = useAdminData();
  const { user } = useAuth();

  // La fiche s'ouvre telle qu'elle est ailleurs — mêmes onglets, mêmes actions.
  const affaireVue = aVoir?.origine === "affaire" ? clients.find((c) => c.id === aVoir.ficheId) : undefined;
  const clientVu = aVoir?.origine === "client" ? accounts.find((a) => a.id === aVoir.ficheId) : undefined;

  const supprimer = async (a: Rendezvous) => {
    if (
      !(await confirmer({ titre: `Annuler « ${a.titre} » ?`, action: "Annuler l’action", message: "Elle quitte le Planning et les actions à venir. Elle reste dans l’historique de la fiche, « Annulé »." }))
    )
      return;
    try {
      await apresSuppression(await annulerAction(a.id, prenomDe(user?.email) || (user?.email ?? "")));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L’annulation a échoué.");
    }
  };

  /** Un rendez-vous retiré : l'affaire qu'il avait passée en « RDV » retourne dans sa colonne d'avant. */
  const apresSuppression = async (retour?: { clientId: string; colonne: string } | null) => {
    const affaire = retour ? clients.find((c) => c.id === retour.clientId) : undefined;
    if (retour && affaire && estColonneRdv(affaire.stage)) setClientStage(retour.clientId, retour.colonne);
    await charger();
  };

  // La semaine s'arrête au vendredi soir : ce qui tombe le week-end n'y est pas montré,
  // et ne doit donc pas être compté. Le mois, lui, montre tout, week-ends compris, du
  // lundi de sa première semaine au dimanche de sa dernière.
  const fin = useMemo(() => {
    const f = new Date(debut);
    f.setDate(f.getDate() + JOURS_OUVRES);
    return f;
  }, [debut]);
  const grille = useMemo(() => {
    const du = lundiDe(mois);
    const dernier = new Date(mois.getFullYear(), mois.getMonth() + 1, 0);
    const au = lundiDe(dernier);
    au.setDate(au.getDate() + 7);
    return { du, au };
  }, [mois]);
  const plage = vue === "semaine" ? { du: debut, au: fin } : grille;

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      setLignes(await chargerPlanning(plage.du, plage.au));
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
    // plage change avec ses deux dates : on les suit, elles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plage.du.getTime(), plage.au.getTime()]);

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

  /** Les jours de la grille du mois, semaine par semaine, avec leurs actions. */
  const jours = useMemo(() => {
    const liste: { jour: Date; actions: Rendezvous[] }[] = [];
    for (const j = new Date(grille.du); j < grille.au; j.setDate(j.getDate() + 1)) {
      const jour = new Date(j);
      liste.push({ jour, actions: lignes.filter((l) => memeJour(new Date(l.au), jour)) });
    }
    return liste;
  }, [grille, lignes]);

  const decaler = (pas: number) => {
    if (vue === "mois") return setMois(new Date(mois.getFullYear(), mois.getMonth() + pas, 1));
    const d = new Date(debut);
    d.setDate(d.getDate() + pas * 7);
    setDebut(d);
  };

  /** Un jour du mois cliqué : sa semaine s'ouvre, avec tout le détail. */
  const ouvrirSemaine = (jour: Date) => {
    setDebut(lundiDe(jour));
    setVue("semaine");
  };

  const cetteSemaine = memeJour(debut, lundiDe(new Date()));
  const ceMois = memeJour(mois, premierDuMois(new Date()));
  const surAujourdhui = vue === "semaine" ? cetteSemaine : ceMois;
  const duAu = `${debut.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} au ${new Date(fin.getTime() - 1).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;
  const nomDuMois = mois.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  // Le compte du mois ne prend que les jours du mois, pas ceux des semaines qui débordent.
  const dansLeMois = lignes.filter((l) => {
    const d = new Date(l.au);
    return d.getMonth() === mois.getMonth() && d.getFullYear() === mois.getFullYear();
  }).length;

  return (
    <div>
      <PageHeader
        title="Planning"
        subtitle={
          chargement
            ? "Chargement…"
            : vue === "semaine"
              ? `${lignes.length} action${lignes.length > 1 ? "s" : ""} du ${duAu} — prospection, Pipeline et clients réunis`
              : `${dansLeMois} action${dansLeMois > 1 ? "s" : ""} en ${nomDuMois} — prospection, Pipeline et clients réunis`
        }
        action={
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setAjout(true)}
              className="ad-btn-accent mr-1 inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-4 py-2 text-[13px] font-bold text-white"
            >
              <Plus className="size-3.5" /> Ajouter une action
            </button>
            <div className="mr-1 inline-flex rounded-full border border-border p-0.5" role="group" aria-label="Vue du planning">
              {(["semaine", "mois"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={vue === v}
                  onClick={() => {
                    // On passe au mois de la semaine regardée, et inversement.
                    if (v === "mois") setMois(premierDuMois(debut));
                    else if (vue === "mois") setDebut(lundiDe(ceMois ? new Date() : mois));
                    setVue(v);
                  }}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors",
                    vue === v ? "bg-avisdoc-ink text-white" : "text-muted-foreground hover:text-avisdoc-ink",
                  )}
                >
                  {v === "semaine" ? "Semaine" : "Mois"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => decaler(-1)}
              aria-label={vue === "semaine" ? "Semaine précédente" : "Mois précédent"}
              className="rounded-full border border-border p-2 text-muted-foreground transition-colors hover:border-avisdoc-teal hover:text-avisdoc-ink"
            >
              <ChevronLeft className="size-4" />
            </button>
            {!surAujourdhui && (
              <button
                type="button"
                onClick={() => (vue === "semaine" ? setDebut(lundiDe(new Date())) : setMois(premierDuMois(new Date())))}
                className="rounded-full border border-border px-4 py-2 text-[13px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal"
              >
                {vue === "semaine" ? "Cette semaine" : "Ce mois-ci"}
              </button>
            )}
            <button
              type="button"
              onClick={() => decaler(1)}
              aria-label={vue === "semaine" ? "Semaine suivante" : "Mois suivant"}
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
      ) : vue === "mois" ? (
        <div>
          <h2 className="mb-3 font-display text-xl font-semibold capitalize text-avisdoc-ink">{nomDuMois}</h2>
          {/* Les noms des jours ; sur téléphone, les jours s'empilent et portent leur nom. */}
          <div className="mb-1.5 grid grid-cols-7 gap-1.5 max-sm:hidden">
            {JOURS.map((j, i) => (
              <div key={j} className={cn("px-2 text-[11px] font-bold uppercase tracking-wide", i >= 5 ? "text-muted-foreground/70" : "text-muted-foreground")}>
                {j}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5 max-sm:grid-cols-1">
            {jours.map(({ jour, actions }) => {
              const aujourdhui = memeJour(jour, new Date());
              const horsDuMois = jour.getMonth() !== mois.getMonth();
              const weekEnd = jour.getDay() === 0 || jour.getDay() === 6;
              const montrees = actions.slice(0, PAR_JOUR_DANS_LE_MOIS);
              return (
                <div
                  key={jour.toISOString()}
                  className={cn(
                    "flex min-h-[112px] min-w-0 flex-col rounded-xl border p-1.5 max-sm:min-h-0",
                    aujourdhui ? "border-avisdoc-teal bg-avisdoc-teal/5" : "border-border",
                    weekEnd && !aujourdhui && "bg-muted/40",
                    horsDuMois && "opacity-50",
                    // Sur téléphone, un jour sans rien ne prend pas de place.
                    actions.length === 0 && "max-sm:hidden",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => ouvrirSemaine(jour)}
                    title="Voir la semaine"
                    className={cn(
                      "mb-1 flex items-baseline gap-1.5 rounded-md px-1 text-left text-[12.5px] font-bold hover:text-avisdoc-teal",
                      aujourdhui ? "text-avisdoc-teal" : "text-avisdoc-ink",
                    )}
                  >
                    <span className="sm:hidden">{JOURS[(jour.getDay() + 6) % 7]}</span>
                    {jour.getDate()}
                    {jour.getDate() === 1 && <span className="font-semibold">{jour.toLocaleDateString("fr-FR", { month: "short" })}</span>}
                  </button>
                  <div className="flex min-w-0 flex-col gap-1">
                    {montrees.map((a) => {
                      const Icone = ICONES[a.kind];
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => (a.modifiable ? setAModifier(a) : a.fiche && setAVoir(a))}
                          title={[heure(a.au), a.titre, a.fiche].filter(Boolean).join(" · ")}
                          className="flex min-w-0 flex-col rounded-md bg-card px-1 py-0.5 text-left text-[11.5px] leading-tight transition-colors hover:bg-accent"
                        >
                          {/* L'heure, puis le nom sur sa propre ligne : côte à côte, une case
                              étroite ne laissait voir qu'une lettre du nom. */}
                          <span className="flex items-center gap-1">
                            <span className={cn("inline-flex size-4 shrink-0 items-center justify-center rounded-full", TEINTES[a.kind])}>
                              <Icone className="size-2.5" strokeWidth={2.6} />
                            </span>
                            <span className="font-mono font-bold text-avisdoc-ink">{heure(a.au)}</span>
                          </span>
                          <span className={cn("min-w-0 truncate font-semibold", a.modifiable ? "text-avisdoc-ink" : "text-muted-foreground line-through")}>
                            {a.fiche || a.titre}
                          </span>
                        </button>
                      );
                    })}
                    {actions.length > PAR_JOUR_DANS_LE_MOIS && (
                      <button
                        type="button"
                        onClick={() => ouvrirSemaine(jour)}
                        className="rounded-md px-1 text-left text-[11.5px] font-bold text-avisdoc-teal hover:underline"
                      >
                        + {actions.length - PAR_JOUR_DANS_LE_MOIS} autre{actions.length - PAR_JOUR_DANS_LE_MOIS > 1 ? "s" : ""}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          // Sur un téléphone, les jours s'empilent : en colonnes, la semaine faisait
          // 1348 pixels de large, soit quatre écrans à faire défiler pour voir vendredi.
          className="ad-kanban grid gap-3 overflow-x-auto pb-1 overscroll-x-contain max-sm:!grid-cols-1 max-sm:overflow-x-visible"
          style={{ gridTemplateColumns: `repeat(${JOURS_OUVRES}, minmax(260px, 1fr))` }}
        >
          {semaine.map(({ jour, actions }) => {
            const aujourdhui = memeJour(jour, new Date());
            return (
              <div
                key={jour.toISOString()}
                className={cn(
                  "flex flex-col rounded-2xl border p-3.5 max-sm:min-h-0 sm:min-h-[320px]",
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
                  <div className="flex-1 space-y-2">
                    {actions.map((a) => {
                      const Icone = ICONES[a.kind];
                      return (
                        <div
                          key={a.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => (a.modifiable ? setAModifier(a) : a.fiche && setAVoir(a))}
                          onKeyDown={(e) => e.key === "Enter" && (a.modifiable ? setAModifier(a) : a.fiche && setAVoir(a))}
                          className="group flex w-full cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-avisdoc-teal"
                        >
                          <span className={cn("mt-0.5 inline-flex size-[26px] shrink-0 items-center justify-center rounded-full", TEINTES[a.kind])}>
                            <Icone className="size-3.5" strokeWidth={2.4} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline gap-1.5">
                              <span className="font-mono text-[12.5px] font-bold text-avisdoc-ink">{heure(a.au)}</span>
                              <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
                                {NOMS[a.kind]}
                                {!a.modifiable && " · fait"}
                              </span>
                            </span>
                            <span className="mt-1 line-clamp-2 [display:-webkit-box] text-[13px] font-semibold leading-snug text-avisdoc-ink">
                              {a.titre}
                            </span>
                            {a.fiche && (
                              <span className="mt-1 line-clamp-2 [display:-webkit-box] text-[12px] font-semibold leading-snug text-avisdoc-teal">
                                {a.fiche}
                              </span>
                            )}
                            {a.detail && (
                              <span className="mt-1 line-clamp-2 [display:-webkit-box] text-[11.5px] leading-snug text-muted-foreground">{a.detail}</span>
                            )}

                          </span>

                          <span
                            className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {a.fiche && (
                              <button
                                type="button"
                                onClick={() => setAVoir(a)}
                                aria-label={`Voir la fiche ${a.fiche}`}
                                title="Voir la fiche"
                                className="rounded-lg p-1 text-muted-foreground hover:text-avisdoc-teal"
                              >
                                <Eye className="size-3.5" />
                              </button>
                            )}
                            {a.modifiable && (
                            <>
                            <button
                              type="button"
                              onClick={() => setAModifier(a)}
                              aria-label={`Modifier ${a.titre}`}
                              title="Modifier ou déplacer"
                              className="rounded-lg p-1 text-muted-foreground hover:text-avisdoc-teal"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void supprimer(a)}
                              aria-label={`Annuler ${a.titre}`}
                              title="Annuler l’action"
                              className="rounded-lg p-1 text-muted-foreground hover:text-rose-700"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                            </>
                            )}
                          </span>
                        </div>
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
          <SectionLabel>{vue === "semaine" ? "Semaine libre" : "Mois libre"}</SectionLabel>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Les appels, rendez-vous et relances que vous notez depuis l’onglet Action d’une fiche apparaissent ici, au
            jour et à l’heure prévus. « Ajouter une action » en pose une directement, avec ou sans entreprise.
          </p>
        </div>
      )}
      {aVoir && affaireVue && (
        <ProjectView client={affaireVue} onClose={() => setAVoir(null)} />
      )}

      {aVoir && clientVu && <FicheClient fiche={clientVu} mode="lecture" onClose={() => setAVoir(null)} />}

      {aVoir && !affaireVue && !clientVu && (
        <ApercuFiche
          origine={aVoir.origine}
          id={aVoir.ficheId}
          nom={aVoir.fiche}
          onClose={() => setAVoir(null)}
          onOuvrirVraiment={() => navigate(chemin[aVoir.origine](aVoir.ficheId))}
        />
      )}

      {ajout && <NouvelleAction jour={vue === "semaine" ? (cetteSemaine ? new Date() : debut) : ceMois ? new Date() : mois} onClose={() => setAjout(false)} onFait={charger} />}

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
          onFait={apresSuppression}
        />
      )}
    </div>
  );
}
