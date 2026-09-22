// Voir une fiche sans quitter l'écran où l'on est.
//
// Depuis le planning, ouvrir la fiche d'une entreprise ne doit pas renvoyer au
// Pipeline : on regarde, on referme, on reste dans sa semaine.

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";
import { Modal } from "./ui";
import { chargerDetail, LIBELLE, type Champ, type Origine } from "../lib/corbeille";

export default function ApercuFiche({
  origine,
  id,
  nom,
  onClose,
  onOuvrirVraiment,
}: {
  origine: Origine;
  id: string;
  nom: string;
  onClose: () => void;
  /** Pour aller vraiment sur la fiche, quand on veut y travailler. */
  onOuvrirVraiment?: () => void;
}) {
  const [champs, setChamps] = useState<Champ[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    chargerDetail(origine, id)
      .then((c) => vivant && setChamps(c))
      .catch((e) => vivant && setErreur(e instanceof Error ? e.message : "Lecture impossible."));
    return () => {
      vivant = false;
    };
  }, [id, origine]);

  return (
    <Modal onClose={onClose} width={620}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold text-avisdoc-ink">{nom}</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">{LIBELLE[origine]}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink">
          <X className="size-5" />
        </button>
      </div>

      {erreur && <p className="mb-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{erreur}</p>}

      {champs === null ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Lecture de la fiche…
        </div>
      ) : champs.length === 0 ? (
        <p className="py-6 text-[13px] text-muted-foreground">Cette fiche ne porte aucune information.</p>
      ) : (
        <div className="max-h-[52vh] divide-y divide-border overflow-y-auto rounded-2xl border border-border">
          {champs.map((c) => (
            <div key={`${c.label}-${c.valeur}`} className="flex gap-3 px-4 py-2.5">
              <div className="w-44 shrink-0 text-[12.5px] text-muted-foreground">{c.label}</div>
              <div className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[13px] text-avisdoc-ink">{c.valeur}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
        {onOuvrirVraiment && (
          <button
            type="button"
            onClick={onOuvrirVraiment}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal"
          >
            <ExternalLink className="size-4" /> Travailler sur cette fiche
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
        >
          Fermer
        </button>
      </div>
    </Modal>
  );
}
