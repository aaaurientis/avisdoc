// La corbeille du Commercial : ce qui a été supprimé dans la prospection, le Pipeline
// et le fichier client. Chaque ligne dit d'où elle vient, quand elle a été jetée, et
// combien de jours il reste pour se raviser.
//
// La purge se fait à l'ouverture : ce qui a plus de quinze jours part pour de bon.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { PageHeader, SectionLabel } from "../components/ui";
import CaseFiche from "../components/CaseFiche";
import {
  chargerCorbeille,
  detruire,
  joursRestants,
  JOURS_DE_GARDE,
  LIBELLE,
  purger,
  restaurer,
  type Jetee,
  type Origine,
} from "../lib/corbeille";
import FicheJetee from "./corbeille/FicheJetee";
import { cn } from "@/lib/utils";
import { confirmer } from "../components/Confirmation";

const leJour = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

export default function Corbeille() {
  const [lignes, setLignes] = useState<Jetee[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [ouverte, setOuverte] = useState<Jetee | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      // On vide d'abord ce qui a fait son temps : la liste montre alors ce qui reste vraiment.
      const purgees = await purger();
      setLignes(await chargerCorbeille());
      setMessage(purgees > 0 ? `${purgees} fiche${purgees > 1 ? "s" : ""} de plus de ${JOURS_DE_GARDE} jours ${purgees > 1 ? "ont été vidées" : "a été vidée"}.` : null);
      setErreur(null);
    } catch (e) {
      const m = e instanceof Error ? e.message : "Chargement impossible.";
      setErreur(
        /Could not find the table .* in the schema cache|column .* does not exist/i.test(m)
          ? "La corbeille attend sa migration (0032) : collez-la dans le SQL Editor."
          : m,
      );
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const cocher = (id: string) =>
    setCoches((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });

  const selection = useMemo(() => lignes.filter((l) => coches.has(l.id)), [coches, lignes]);

  /** Grouper par origine : chaque table se traite d'un seul appel. */
  const parOrigine = (liste: Jetee[]) => {
    const m = new Map<Origine, string[]>();
    for (const l of liste) m.set(l.origine, [...(m.get(l.origine) ?? []), l.id]);
    return m;
  };

  const agir = async (quoi: "restaurer" | "detruire") => {
    if (selection.length === 0 || enCours) return;
    const n = selection.length;
    if (quoi === "detruire" && !(await confirmer({ titre: `Supprimer définitivement ${n} fiche${n > 1 ? "s" : ""} ?`, message: "Cette fois, rien ne se récupère.", action: "Supprimer définitivement", definitif: true })))
      return;
    setEnCours(true);
    try {
      for (const [origine, ids] of parOrigine(selection)) {
        if (quoi === "restaurer") await restaurer(origine, ids);
        else await detruire(origine, ids);
      }
      setCoches(new Set());
      await charger();
      const ou = [...new Set(selection.map((l) => LIBELLE[l.origine]))].join(" et ");
      setMessage(
        quoi === "restaurer"
          ? `${n} fiche${n > 1 ? "s sont reparties" : " est repartie"} dans ${ou}.`
          : `${n} fiche${n > 1 ? "s supprimées" : " supprimée"} définitivement.`,
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L’opération a échoué.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Corbeille"
        subtitle={
          chargement
            ? "Chargement…"
            : `${lignes.length} fiche${lignes.length > 1 ? "s" : ""} — vidée${lignes.length > 1 ? "s" : ""} automatiquement au bout de ${JOURS_DE_GARDE} jours`
        }
      />

      {erreur && <div className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">{erreur}</div>}
      {message && <div className="mb-4 rounded-2xl bg-sky-100 px-4 py-3 text-[13px] font-semibold text-sky-700">{message}</div>}

      {chargement ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Chargement…
        </div>
      ) : lignes.length === 0 ? (
        <div className="rounded-2xl bg-muted/60 p-8 text-center">
          <SectionLabel>Corbeille vide</SectionLabel>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Ce que vous supprimez dans la prospection, le Pipeline ou le fichier client atterrit ici. Vous avez{" "}
            {JOURS_DE_GARDE} jours pour vous raviser.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void agir("restaurer")}
              disabled={selection.length === 0 || enCours}
              className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {enCours ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              Restaurer{selection.length > 0 ? ` (${selection.length})` : ""}
            </button>
            <button
              type="button"
              onClick={() => void agir("detruire")}
              disabled={selection.length === 0 || enCours}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
            >
              <Trash2 className="size-4" /> Supprimer définitivement
            </button>
            {coches.size > 0 ? (
              <button
                type="button"
                onClick={() => setCoches(new Set())}
                className="text-[13px] font-semibold text-muted-foreground underline-offset-2 hover:text-avisdoc-ink hover:underline"
              >
                Tout décocher
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCoches(new Set(lignes.map((l) => l.id)))}
                className="text-[13px] font-semibold text-muted-foreground underline-offset-2 hover:text-avisdoc-ink hover:underline"
              >
                Tout cocher ({lignes.length})
              </button>
            )}
          </div>

          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {lignes.map((l) => {
              const reste = joursRestants(l.supprimeLe);
              return (
                <div
                  key={`${l.origine}-${l.id}`}
                  className={cn(
                    "group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40",
                    coches.has(l.id) && "bg-avisdoc-teal/5",
                  )}
                  onClick={() => setOuverte(l)}
                >
                  <CaseFiche cochee={coches.has(l.id)} onBascule={() => cocher(l.id)} libelle={l.nom} visible={coches.size > 0} />

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold text-avisdoc-ink">{l.nom}</div>
                    <div className="truncate text-[12px] text-muted-foreground">
                      {LIBELLE[l.origine]}
                      {l.detail ? ` · ${l.detail}` : ""}
                    </div>
                    <div className="text-[11px] text-avisdoc-teal opacity-0 transition-opacity group-hover:opacity-100">
                      Cliquez pour voir la fiche
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-[12px] text-muted-foreground">supprimée le {leJour(l.supprimeLe)}</div>
                    <div className={cn("text-[11.5px] font-semibold", reste <= 3 ? "text-rose-700" : "text-muted-foreground")}>
                      {reste === 0 ? "vidée au prochain passage" : `encore ${reste} jour${reste > 1 ? "s" : ""}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {ouverte && (
        <FicheJetee
          jetee={ouverte}
          onFermer={() => setOuverte(null)}
          onRestaurer={async () => {
            await restaurer(ouverte.origine, [ouverte.id]);
            await charger();
            setMessage(`${ouverte.nom} est de retour dans ${LIBELLE[ouverte.origine]}.`);
          }}
          onDetruire={async () => {
            await detruire(ouverte.origine, [ouverte.id]);
            await charger();
            setMessage(`${ouverte.nom} a été supprimée définitivement.`);
          }}
        />
      )}
    </div>
  );
}
