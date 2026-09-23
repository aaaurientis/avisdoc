// Ce qu'on FAIT sur une fiche : appeler, écrire, prendre rendez-vous, noter.
//
// Chaque action a son formulaire, parce qu'on ne prépare pas un appel comme on note
// une remarque : un appel et un rendez-vous se placent dans l'agenda — jour ET heure —,
// un e-mail se rédige, une note s'écrit et c'est tout.
//
// Ce qui est fait part dans l'historique, qui ne se modifie pas.

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, ListTodo, Loader2, Mail, NotebookPen, PenLine, Phone } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { SectionLabel } from "./ui";
import { actionsAVenir, ajouterEchange, libelleGenre, type ClesFiche, type Echange, type GenreEchange } from "../lib/echanges";
import ModifierAction from "./ModifierAction";
import { cn } from "@/lib/utils";

const ICONES: Record<GenreEchange, typeof Phone> = { appel: Phone, email: Mail, rdv: CalendarClock, tache: ListTodo, note: NotebookPen };

const GENRES: { valeur: GenreEchange; label: string; icone: typeof Phone; quand: boolean; aide: string }[] = [
  { valeur: "appel", label: "Appel", icone: Phone, quand: true, aide: "Quand appelez-vous, et pourquoi ?" },
  { valeur: "email", label: "E-mail", icone: Mail, quand: false, aide: "Ce que vous écrivez, ou ce que Merx a rédigé." },
  { valeur: "rdv", label: "Rendez-vous", icone: CalendarClock, quand: true, aide: "Le jour, l’heure, et ce qui s’y joue." },
  { valeur: "tache", label: "À faire", icone: ListTodo, quand: true, aide: "Ce qu’il reste à faire pour eux, et pour quand." },
  { valeur: "note", label: "Note", icone: NotebookPen, quand: false, aide: "Ce qu’il faut se rappeler." },
];

const champCls =
  "ad-input w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";

const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** « mar. 29 sept. à 19:00 » : assez pour se situer, assez court pour une ligne. */
const quandCourt = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
};
/** L'heure ronde qui vient : on propose, on ne fait pas saisir. */
const prochaineHeure = () => {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.toTimeString().slice(0, 5);
};

export default function ActionsFiche({
  cles,
  onFait,
  onEcrireAvecMerx,
  relire,
  suggestions,
}: {
  cles: ClesFiche;
  /** Rappelé après l'enregistrement : l'historique se recharge. */
  onFait: () => Promise<void> | void;
  /** Présent quand Merx peut rédiger pour cette fiche ; reçoit l'intitulé, qui dit l'intention. */
  onEcrireAvecMerx?: (intention: string) => Promise<void> | void;
  /** Change de valeur pour relire ce qui est prévu. */
  relire?: number;
  /** Ce qu'on fait couramment sur ce genre de fiche : un clic ouvre le bon formulaire, intitulé compris. */
  suggestions?: { titre: string; genre: GenreEchange }[];
}) {
  const { user } = useAuth();
  const [genre, setGenre] = useState<GenreEchange | null>(null);
  const [titre, setTitre] = useState("");
  const [detail, setDetail] = useState("");
  const [jour, setJour] = useState(aujourdhui);
  const [heure, setHeure] = useState(prochaineHeure);
  const [envoi, setEnvoi] = useState(false);
  const [ecriture, setEcriture] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [prevues, setPrevues] = useState<Echange[]>([]);
  const [aModifier, setAModifier] = useState<Echange | null>(null);

  /** Ce qui est déjà programmé sur cette fiche : on doit le voir, et pouvoir le déplacer. */
  const relireLesPrevues = useCallback(async () => {
    try {
      setPrevues(await actionsAVenir(cles));
    } catch {
      setPrevues([]);
    }
  }, [cles]);

  useEffect(() => {
    void relireLesPrevues();
  }, [relireLesPrevues, relire]);

  const choisi = GENRES.find((g) => g.valeur === genre);

  const ouvrir = (g: GenreEchange, intitule = "") => {
    setGenre(g);
    setTitre(intitule);
    setDetail("");
    setJour(aujourdhui());
    setHeure(prochaineHeure());
    setErreur(null);
  };

  const enregistrer = async () => {
    if (!genre || !titre.trim() || envoi) return;
    setEnvoi(true);
    setErreur(null);
    try {
      // Un appel ou un rendez-vous se place à l'heure dite ; le reste porte l'heure
      // de la saisie, ce qui suffit à le ranger dans le fil.
      const au = choisi?.quand ? new Date(`${jour}T${heure}:00`) : new Date();
      await ajouterEchange(cles, { kind: genre, titre, detail, au: au.toISOString(), par: user?.email ?? "" });
      setGenre(null);
      await relireLesPrevues();
      await onFait();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L’enregistrement a échoué.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div>
      {prevues.length > 0 && (
        <div className="mb-4 rounded-2xl border border-l-4 border-border border-l-avisdoc-coral p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-avisdoc-coral">
            {prevues.length === 1 ? "Prévu" : `${prevues.length} actions prévues`}
          </div>
          <div className="mt-2 space-y-1.5">
            {prevues.map((a) => {
              const Icone = ICONES[a.kind];
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAModifier(a)}
                  title="Modifier, décaler ou supprimer"
                  className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-avisdoc-teal"
                >
                  <Icone className="size-4 shrink-0 text-avisdoc-coral" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-avisdoc-ink">{a.titre}</span>
                    {a.detail && <span className="block truncate text-[11.5px] text-muted-foreground">{a.detail}</span>}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[12px] font-bold text-avisdoc-ink">{quandCourt(a.au)}</span>
                    <span className="block text-[11px] text-muted-foreground">modifier</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {suggestions && suggestions.length > 0 && !choisi && (
        <div className="mb-4 rounded-2xl border border-l-4 border-border border-l-avisdoc-teal p-4">
          <SectionLabel>Ce que vous pouvez leur proposer</SectionLabel>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Un clic ouvre l’action, l’intitulé déjà écrit.</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {suggestions.map((s) => {
              const Icone = ICONES[s.genre];
              return (
                <button
                  key={s.titre}
                  type="button"
                  onClick={() => ouvrir(s.genre, s.titre)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-[12.5px] font-semibold text-avisdoc-ink transition-colors hover:border-avisdoc-teal"
                >
                  <Icone className="size-3.5 text-avisdoc-teal" /> {s.titre}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {GENRES.map((g) => {
          const Icone = g.icone;
          return (
            <button
              key={g.valeur}
              type="button"
              onClick={() => ouvrir(g.valeur)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-bold transition-colors",
                genre === g.valeur
                  ? "border-avisdoc-teal bg-avisdoc-teal text-white"
                  : "border-border text-avisdoc-ink hover:border-avisdoc-teal",
              )}
            >
              <Icone className="size-3.5" /> {g.label}
            </button>
          );
        })}
      </div>

      {choisi && (
        <div className="mt-3 rounded-2xl border border-l-4 border-border border-l-avisdoc-teal p-4">
          <SectionLabel>{libelleGenre(choisi.valeur)}</SectionLabel>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{choisi.aide}</p>

          {choisi.valeur === "email" && onEcrireAvecMerx && (
            <button
              type="button"
              disabled={ecriture}
              onClick={async () => {
                // Un seul appel à la fois : chacun coûte, et rien ne dit à l'écran qu'il
                // est parti tant qu'on n'a pas mis le bouton en attente.
                if (ecriture) return;
                setEcriture(true);
                try {
                  await onEcrireAvecMerx(titre.trim());
                } finally {
                  setEcriture(false);
                }
              }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[12.5px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal disabled:cursor-wait disabled:opacity-60"
            >
              {ecriture ? <Loader2 className="size-3.5 animate-spin" /> : <PenLine className="size-3.5" />}
              {ecriture ? "Merx écrit… une trentaine de secondes" : "Écrire un e-mail personnalisé avec Merx"}
            </button>
          )}

          <input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            placeholder={
              choisi.valeur === "appel"
                ? "Pourquoi cet appel — « relancer sur la proposition »"
                : choisi.valeur === "rdv"
                  ? "L’objet du rendez-vous — « présentation de la campagne »"
                  : choisi.valeur === "email"
                    ? "L’objet du message"
                    : "Ce qu’il faut retenir, en une ligne"
            }
            className={cn(champCls, "mt-3")}
          />

          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={choisi.valeur === "note" || choisi.valeur === "email" ? 4 : 2}
            placeholder={choisi.valeur === "email" ? "Le message, ou ce que vous voulez en retenir" : "Le détail, si besoin"}
            className={cn(champCls, "mt-2 resize-none")}
          />

          {choisi.quand && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-[12.5px] font-semibold text-muted-foreground">
                Le
                <input type="date" value={jour} onChange={(e) => setJour(e.target.value)} className={cn(champCls, "w-auto")} />
              </label>
              <label className="flex items-center gap-2 text-[12.5px] font-semibold text-muted-foreground">
                à
                <input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} className={cn(champCls, "w-auto")} />
              </label>
            </div>
          )}

          {erreur && <p className="mt-2 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{erreur}</p>}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void enregistrer()}
              disabled={!titre.trim() || envoi}
              className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {envoi && <Loader2 className="size-3.5 animate-spin" />} Enregistrer
            </button>
            <button
              type="button"
              onClick={() => setGenre(null)}
              className="rounded-full border border-border px-5 py-2 text-[13px] font-bold text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
      {aModifier && (
        <ModifierAction
          action={aModifier}
          onClose={() => setAModifier(null)}
          onFait={async () => {
            await relireLesPrevues();
            await onFait();
          }}
        />
      )}
    </div>
  );
}
