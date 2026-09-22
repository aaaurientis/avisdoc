// Ce qui va entrer, avant que ça entre.
//
// Chaque colonne du fichier est montrée avec ses premières valeurs et l'endroit où
// elle va : une colonne existante, une nouvelle colonne, ou rien. Tout se corrige.
// On n'importe jamais un fichier entier en aveugle.

import { useState } from "react";
import { ArrowRight, Upload, X } from "lucide-react";
import type { AccountField } from "../../types";
import { Modal } from "../../components/ui";
import type { Correspondance } from "../../lib/import-colonnes";

const IGNORER = "__ignorer";
const NOUVELLE = "__nouvelle";

export default function ApercuImport({
  fichier,
  lignes,
  correspondances,
  champs,
  onAnnuler,
  onValider,
}: {
  fichier: string;
  lignes: number;
  correspondances: Correspondance[];
  champs: AccountField[];
  onAnnuler: () => void;
  onValider: (choisies: Correspondance[]) => void;
}) {
  const [etat, setEtat] = useState<Correspondance[]>(correspondances);

  const valeurDe = (c: Correspondance) => {
    if (c.destination.sorte === "nom") return "nom";
    if (c.destination.sorte === "existante") return c.destination.champ.id;
    if (c.destination.sorte === "ignorer") return IGNORER;
    return NOUVELLE;
  };

  const changer = (entete: string, valeur: string) => {
    setEtat((prev) =>
      prev.map((c) => {
        if (c.entete !== entete) return c;
        if (valeur === "nom") return { ...c, destination: { sorte: "nom" } };
        if (valeur === IGNORER) return { ...c, destination: { sorte: "ignorer" } };
        if (valeur === NOUVELLE) {
          const type = c.destination.sorte === "nouvelle" ? c.destination.type : "texte";
          return { ...c, destination: { sorte: "nouvelle", type } };
        }
        const champ = champs.find((f) => f.id === valeur);
        return champ ? { ...c, destination: { sorte: "existante", champ } } : c;
      }),
    );
  };

  // Une seule colonne porte le nom : en désigner une autre libère la précédente.
  const surChoix = (entete: string, valeur: string) => {
    if (valeur === "nom") {
      setEtat((prev) =>
        prev.map((c) =>
          c.entete === entete
            ? { ...c, destination: { sorte: "nom" } }
            : c.destination.sorte === "nom"
              ? { ...c, destination: { sorte: "nouvelle", type: "texte" } }
              : c,
        ),
      );
      return;
    }
    changer(entete, valeur);
  };

  const colonneNom = etat.find((c) => c.destination.sorte === "nom");
  const nouvelles = etat.filter((c) => c.destination.sorte === "nouvelle").length;

  return (
    <Modal onClose={onAnnuler} width={720}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold text-avisdoc-ink">Avant d’importer</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {fichier} · {lignes} ligne{lignes > 1 ? "s" : ""} · voici où va chaque colonne. Corrigez ce qui ne va pas.
          </p>
        </div>
        <button type="button" onClick={onAnnuler} aria-label="Fermer" className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink">
          <X className="size-5" />
        </button>
      </div>

      <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
        {etat.map((c) => (
          <div key={c.entete} className="grid items-center gap-3 rounded-xl border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-avisdoc-ink">{c.entete}</div>
              <div className="truncate text-[11.5px] text-muted-foreground">{c.apercu.join(" · ") || "aucune valeur"}</div>
            </div>

            <ArrowRight className="hidden size-4 shrink-0 text-muted-foreground sm:block" />

            <select
              value={valeurDe(c)}
              onChange={(e) => surChoix(c.entete, e.target.value)}
              aria-label={`Destination de la colonne ${c.entete}`}
              className="ad-input w-full rounded-xl border border-border bg-card px-3 py-2 text-[12.5px] font-semibold text-avisdoc-ink outline-none focus:border-avisdoc-teal"
            >
              <option value="nom">Nom de l’entreprise</option>
              {champs
                .filter((f) => f.key !== "etablissement")
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              <option value={NOUVELLE}>
                Nouvelle colonne « {c.entete} »
              </option>
              <option value={IGNORER}>Ne pas importer</option>
            </select>
          </div>
        ))}
      </div>

      {!colonneNom && (
        <p className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">
          Désignez la colonne qui porte le nom de l’entreprise : sans elle, aucune fiche ne peut être créée.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => onValider(etat)}
          disabled={!colonneNom}
          className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          <Upload className="size-4" /> Importer {lignes} ligne{lignes > 1 ? "s" : ""}
        </button>
        <button
          type="button"
          onClick={onAnnuler}
          className="rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
        >
          Annuler
        </button>
        {nouvelles > 0 && (
          <span className="text-[12px] text-muted-foreground">
            {nouvelles} colonne{nouvelles > 1 ? "s seront ajoutées" : " sera ajoutée"} au fichier client.
          </span>
        )}
      </div>
    </Modal>
  );
}
