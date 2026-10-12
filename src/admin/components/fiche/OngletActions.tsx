// L'onglet Actions de la fiche, repris du hub Onetip (12/10). De haut en bas :
// les boutons, le résumé « Où on en est », les actions à venir (dans un cadre à
// part, pour ne jamais les confondre avec le passé), puis l'historique.
//
// L'historique ne se modifie pas et ne s'efface pas : on rouvre une ligne pour y
// ajouter une précision ou programmer la suite.

import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { chargerEchanges, libelleGenre, type ClesFiche, type Echange, type GenreEchange, type Jalon } from "../../lib/echanges";
import { AUTRES_ACTIONS, BOUTONS_ACTION, LIBELLE_BOUTON, heureISO, prenomDe, quandCourt, resultatNegatif } from "../../lib/actions-fiche";
import CompteRendu, { type EtapeFiche } from "./CompteRendu";
import ResumeActivite from "./ResumeActivite";
import { cn } from "@/lib/utils";

/** « Appel prévu », « Rendez-vous prévu »… ou, pour une action faite, son nom. */
const libelleLigne = (a: Echange) => (a.prevu && !a.traite_le ? `${libelleGenre(a.kind)} prévu` : libelleGenre(a.kind));

/** Le titre ne dit quelque chose que s'il n'est pas le nom du genre (les anciennes actions en ont un vrai). */
const titreParlant = (a: Echange) => a.titre && ![libelleGenre(a.kind), `${libelleGenre(a.kind)} prévu`, "Note"].includes(a.titre);

/** L'heure d'une action programmée est-elle arrivée ? Avant, on la déplace ; après, on en fait le compte rendu. */
const estArrivee = (a: Echange) => new Date(a.au).getTime() <= Date.now();

type Ouvert =
  | { quoi: "nouvelle"; genre: GenreEchange; intitule?: string }
  | { quoi: "rouvrir"; action: Echange }
  | { quoi: "compte-rendu"; action: Echange };

export function BoutonsAction({ onChoisir }: { onChoisir: (g: GenreEchange) => void }) {
  const [autres, setAutres] = useState(false);
  const bouton = "h-[34px] whitespace-nowrap rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-avisdoc-ink transition-colors hover:border-avisdoc-teal";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-[12.5px] font-semibold text-muted-foreground">Noter :</span>
        {BOUTONS_ACTION.map((g) => (
          <button key={g} type="button" onClick={() => onChoisir(g)} className={bouton}>
            + {LIBELLE_BOUTON[g]}
          </button>
        ))}
        <button type="button" onClick={() => setAutres(!autres)} className={cn(bouton, "border-dashed text-muted-foreground")}>
          Autre…
        </button>
      </div>
      {autres && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {AUTRES_ACTIONS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => {
                setAutres(false);
                onChoisir(g);
              }}
              className="h-8 rounded-full border border-border px-3.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:border-avisdoc-teal hover:text-avisdoc-ink"
            >
              {libelleGenre(g)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Une ligne de l'historique : la date et l'heure, puis l'action, le résultat, qui, avec qui, et ce qui s'est dit. */
function Ligne({ a, onOuvrir }: { a: Echange; onOuvrir: () => void }) {
  const note = a.kind === "note";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOuvrir}
      onKeyDown={(e) => e.key === "Enter" && onOuvrir()}
      title="Ouvrir : ajouter une précision, programmer la suite"
      className={cn("flex cursor-pointer items-start gap-3 border-t border-border px-3.5 py-3 transition-colors hover:bg-muted/40", note && "bg-amber-50")}
    >
      <div className="w-[84px] shrink-0 pt-0.5 font-mono text-[11px] leading-snug text-muted-foreground">
        {quandCourt(a.au)}
        <br />
        {heureISO(new Date(a.au))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("text-[13.5px] font-bold", note ? "text-amber-800" : "text-avisdoc-ink")}>{libelleLigne(a)}</span>
          {a.resultat && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide",
                resultatNegatif(a.resultat) ? "bg-rose-50 text-rose-700" : "bg-muted text-avisdoc-ink",
              )}
            >
              {a.resultat}
            </span>
          )}
          <span className="text-[12px] text-muted-foreground">
            {[prenomDe(a.par), a.avec ? `avec ${a.avec}` : null].filter(Boolean).join(" · ")}
          </span>
        </div>
        {titreParlant(a) && <div className="mt-0.5 text-[13.5px] font-semibold text-avisdoc-ink">{a.titre}</div>}
        {a.detail && <div className={cn("mt-0.5 whitespace-pre-wrap text-[13.5px] leading-relaxed", note ? "text-amber-800" : "text-muted-foreground")}>{a.detail}</div>}
      </div>
      <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
    </div>
  );
}

/** Une ligne de l'historique qui s'est faite toute seule : trouvée, approfondie, passée au Pipeline. */
function LigneJalon({ j }: { j: Jalon }) {
  return (
    <div className="flex items-start gap-3 border-t border-border px-3.5 py-2.5">
      <div className="w-[84px] shrink-0 font-mono text-[11px] text-muted-foreground">{quandCourt(j.au)}</div>
      <div className="min-w-0 flex-1 text-[13px] text-muted-foreground">
        {j.libelle}
        {j.detail && <span> — {j.detail}</span>}
      </div>
    </div>
  );
}

export default function OngletActions({
  cles,
  personnes,
  etape,
  jalons,
  entrer,
  avancer,
  onEcrireAvecMerx,
  suggestions,
  onCompte,
  ouvrirGenre,
}: {
  cles: ClesFiche;
  /** Les noms des interlocuteurs, le principal d'abord. */
  personnes: string[];
  etape: EtapeFiche | null;
  jalons: Jalon[];
  entrer?: (colonne: string) => Promise<ClesFiche>;
  avancer?: (colonne: string) => Promise<void>;
  onEcrireAvecMerx?: (intention: string) => Promise<void> | void;
  /** Ce qu'on propose couramment à un client : un clic ouvre l'action, l'intitulé écrit. */
  suggestions?: { titre: string; genre: GenreEchange }[];
  /** Le nombre d'actions à venir, pour l'onglet. */
  onCompte?: (n: number) => void;
  /** Ouvrir directement une action de ce genre (le bouton « Écrire » de la colonne). */
  ouvrirGenre?: { genre: GenreEchange; n: number } | null;
}) {
  const [actions, setActions] = useState<Echange[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<Ouvert | null>(null);

  const charger = useCallback(async () => {
    try {
      setActions(await chargerEchanges(cles));
      setErreur(null);
    } catch (e) {
      const m = e instanceof Error ? e.message : "Chargement impossible.";
      setErreur(/column .* does not exist|prevu/i.test(m) ? "Les actions attendent leur migration (0069) : collez-la dans le SQL Editor." : `Les actions n’ont pas pu être chargées. ${m}`);
    }
  }, [cles]);

  useEffect(() => {
    void charger();
  }, [charger]);

  useEffect(() => {
    if (ouvrirGenre) setOuvert({ quoi: "nouvelle", genre: ouvrirGenre.genre });
  }, [ouvrirGenre]);

  const aVenir = actions.filter((a) => a.prevu && !a.traite_le).sort((a, b) => a.au.localeCompare(b.au));
  // Une action programmée puis faite n'encombre pas l'historique : son compte rendu y est déjà.
  const faites = actions.filter((a) => !a.prevu);
  const historique = [
    ...faites.map((a) => ({ au: a.au, action: a as Echange | null, jalon: null as Jalon | null })),
    ...jalons.map((j) => ({ au: j.au, action: null, jalon: j })),
  ].sort((a, b) => new Date(b.au).getTime() - new Date(a.au).getTime());

  useEffect(() => {
    onCompte?.(aVenir.length);
  }, [aVenir.length, onCompte]);

  const apres = async () => {
    setOuvert(null);
    await charger();
  };

  const aujourdhui = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

  return (
    <div className="max-w-[860px]">
      <div className="mb-5">
        <BoutonsAction onChoisir={(g) => setOuvert({ quoi: "nouvelle", genre: g })} />
      </div>

      {suggestions && suggestions.length > 0 && (
        <div className="-mt-2 mb-5 flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[12.5px] font-semibold text-muted-foreground">Leur proposer :</span>
          {suggestions.map((s) => (
            <button
              key={s.titre}
              type="button"
              onClick={() => setOuvert({ quoi: "nouvelle", genre: s.genre, intitule: s.titre })}
              className="h-8 rounded-full border border-border px-3 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:border-avisdoc-teal hover:text-avisdoc-ink"
            >
              {s.titre}
            </button>
          ))}
        </div>
      )}

      {erreur && <p className="mb-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{erreur}</p>}

      <ResumeActivite cles={cles} actions={actions} />

      {/* Les actions à venir : une autre couleur que tout le reste. */}
      <section className="mb-6 rounded-2xl border-2 border-avisdoc-teal bg-avisdoc-teal/5 px-4 py-3.5">
        <div className="mb-2.5 text-[15px] font-bold text-avisdoc-teal">Actions à venir{aVenir.length ? ` · ${aVenir.length}` : ""}</div>
        {aVenir.length === 0 ? (
          <p className="text-[13px] leading-snug text-muted-foreground">
            Rien de prévu. « + Appel », « + Rendez-vous »… puis « À programmer » pour poser la suite ici.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {aVenir.map((a) => {
              const jour = new Date(a.au).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
              const retard = jour < aujourdhui;
              return (
                <div
                  key={a.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOuvert({ quoi: "rouvrir", action: a })}
                  onKeyDown={(e) => e.key === "Enter" && setOuvert({ quoi: "rouvrir", action: a })}
                  title="Ouvrir : changer le jour, l’heure, la note…"
                  className={cn("flex cursor-pointer flex-wrap items-center gap-2.5 rounded-xl px-3 py-2.5", retard ? "bg-rose-50" : "bg-card")}
                >
                  <div className={cn("w-[92px] shrink-0 text-[13px] font-bold leading-snug", retard ? "text-rose-700" : "text-avisdoc-ink")}>
                    {quandCourt(a.au)}
                    <span className="font-semibold"> · {heureISO(new Date(a.au))}</span>
                    {retard && <div className="text-[11px] font-semibold">en retard</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold text-avisdoc-ink">
                      {libelleLigne(a)}
                      {a.rdv_mode && <span className="font-semibold"> {a.rdv_mode === "visio" ? "en visio" : "sur place"}</span>}
                      {a.avec && <span className="font-normal text-muted-foreground"> · avec {a.avec}</span>}
                    </div>
                    {titreParlant(a) && <div className="mt-0.5 text-[13px] font-semibold text-avisdoc-ink">{a.titre}</div>}
                    {a.rdv_lien && (
                      <a
                        href={a.rdv_lien}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[13px] text-avisdoc-teal underline"
                      >
                        Rejoindre la visio
                      </a>
                    )}
                    {a.detail && <div className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{a.detail}</div>}
                    {a.par && <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">programmé par {prenomDe(a.par)}</div>}
                  </div>
                  {estArrivee(a) ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOuvert({ quoi: "compte-rendu", action: a });
                      }}
                      className="ad-btn-accent h-8 shrink-0 rounded-full bg-avisdoc-teal px-3.5 text-[12.5px] font-bold text-white"
                    >
                      Faire le compte rendu
                    </button>
                  ) : (
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="px-3.5 pb-2.5 pt-3 text-[15px] font-bold text-avisdoc-ink">Historique{faites.length ? ` · ${faites.length}` : ""}</div>
        {historique.length === 0 ? (
          <p className="px-3.5 pb-3.5 text-[13px] text-muted-foreground">Rien de noté pour l’instant. Le premier contact reste à faire.</p>
        ) : (
          historique.map((l) =>
            l.action ? (
              <Ligne key={l.action.id} a={l.action} onOuvrir={() => setOuvert({ quoi: "rouvrir", action: l.action! })} />
            ) : (
              <LigneJalon key={`${l.jalon!.libelle}-${l.au}`} j={l.jalon!} />
            ),
          )
        )}
      </section>

      {ouvert && (
        <CompteRendu
          key={ouvert.quoi === "nouvelle" ? `n-${ouvert.genre}-${ouvert.intitule ?? ""}` : `${ouvert.quoi}-${ouvert.action.id}`}
          genre={ouvert.quoi === "nouvelle" ? ouvert.genre : ouvert.action.kind}
          intitule={ouvert.quoi === "nouvelle" ? ouvert.intitule : undefined}
          cles={cles}
          personnes={personnes}
          cible={personnes[0] ?? ""}
          etape={etape}
          existante={ouvert.quoi === "rouvrir" ? ouvert.action : null}
          depuisPrevue={ouvert.quoi === "compte-rendu" ? ouvert.action : null}
          entrer={entrer}
          avancer={avancer}
          onEcrireAvecMerx={onEcrireAvecMerx}
          onFermer={() => setOuvert(null)}
          onEnregistre={() => void apres()}
        />
      )}
    </div>
  );
}
