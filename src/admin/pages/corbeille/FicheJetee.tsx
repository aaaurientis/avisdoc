// Ce que porte une fiche jetée, avant de décider de son sort.
//
// On ne restaure pas un nom : on restaure une entreprise, ses coordonnées, sa note,
// ce qu'on savait d'elle. Tout est montré, puis la restauration dit où la fiche va
// retourner — et attend qu'on le confirme.

import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Trash2, X } from "lucide-react";
import { Modal, SectionLabel } from "../../components/ui";
import { confirmer } from "../../components/Confirmation";
import {
  chargerDetail,
  DESTINATIONS,
  etapeDeLAffaire,
  joursRestants,
  LIBELLE,
  type Champ,
  type Jetee,
} from "../../lib/corbeille";

export default function FicheJetee({
  jetee,
  onFermer,
  onRestaurer,
  onDetruire,
}: {
  jetee: Jetee;
  onFermer: () => void;
  onRestaurer: () => Promise<void>;
  onDetruire: () => Promise<void>;
}) {
  const [champs, setChamps] = useState<Champ[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [etape, setEtape] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    let vivant = true;
    chargerDetail(jetee.origine, jetee.id)
      .then((c) => vivant && setChamps(c))
      .catch((e) => vivant && setErreur(e instanceof Error ? e.message : "Lecture impossible."));
    return () => {
      vivant = false;
    };
  }, [jetee.id, jetee.origine]);

  // Pour une affaire, on annonce aussi la colonne : « dans le Pipeline, colonne Qualifié ».
  useEffect(() => {
    if (jetee.origine !== "affaire") return;
    let vivant = true;
    void etapeDeLAffaire(jetee.id).then((e) => vivant && setEtape(e));
    return () => {
      vivant = false;
    };
  }, [jetee.id, jetee.origine]);

  const destination = DESTINATIONS[jetee.origine][0];
  const reste = joursRestants(jetee.supprimeLe);

  const agir = async (quoi: "restaurer" | "detruire") => {
    if (enCours) return;
    setEnCours(true);
    try {
      if (quoi === "restaurer") await onRestaurer();
      else await onDetruire();
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L’opération a échoué.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Modal onClose={onFermer} width={640}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold text-avisdoc-ink">{jetee.nom}</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Supprimée de {LIBELLE[jetee.origine]} ·{" "}
            {reste === 0 ? "vidée au prochain passage" : `encore ${reste} jour${reste > 1 ? "s" : ""} dans la corbeille`}
          </p>
        </div>
        <button type="button" onClick={onFermer} aria-label="Fermer" className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink">
          <X className="size-5" />
        </button>
      </div>

      {erreur && <p className="mb-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{erreur}</p>}

      {champs === null ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Lecture de la fiche…
        </div>
      ) : champs.length === 0 ? (
        <p className="py-6 text-[13px] text-muted-foreground">Cette fiche ne portait aucune information.</p>
      ) : (
        <div className="max-h-[48vh] divide-y divide-border overflow-y-auto rounded-2xl border border-border">
          {champs.map((c) => (
            <div key={`${c.label}-${c.valeur}`} className="flex gap-3 px-4 py-2.5">
              <div className="w-44 shrink-0 text-[12.5px] text-muted-foreground">{c.label}</div>
              <div className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[13px] text-avisdoc-ink">{c.valeur}</div>
            </div>
          ))}
        </div>
      )}

      {confirmation ? (
        <div className="mt-4 rounded-2xl border-2 border-avisdoc-teal bg-avisdoc-teal/5 p-4">
          <SectionLabel>Elle retourne ici</SectionLabel>
          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            <span className="font-display text-2xl font-semibold text-avisdoc-teal">{destination.label}</span>
            {etape && (
              <span className="rounded-full bg-avisdoc-teal px-3 py-1 text-[12.5px] font-bold text-white">colonne {etape}</span>
            )}
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-avisdoc-ink">{destination.ou}</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Une fiche retourne là d’où elle vient. Pour la faire avancer ensuite — au Pipeline, puis au fichier
            client — passez par son tableau, comme d’habitude.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void agir("restaurer")}
              disabled={enCours}
              className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {enCours ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
              Remettre dans {destination.label}{etape ? `, ${etape}` : ""}
            </button>
            <button
              type="button"
              onClick={() => setConfirmation(false)}
              className="rounded-full border border-border px-5 py-2 text-[13px] font-bold text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setConfirmation(true)}
            className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white"
          >
            <RotateCcw className="size-4" /> Restaurer
          </button>
          <button
            type="button"
            onClick={() => {
              void confirmer({ titre: `Supprimer définitivement ${jetee.nom} ?`, message: "Cette fois, rien ne se récupère.", action: "Supprimer définitivement", definitif: true }).then((ok) => ok && agir("detruire"));
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-rose-300 hover:text-rose-700"
          >
            <Trash2 className="size-4" /> Supprimer définitivement
          </button>
          <button
            type="button"
            onClick={onFermer}
            className="rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
          >
            Fermer
          </button>
        </div>
      )}
    </Modal>
  );
}
