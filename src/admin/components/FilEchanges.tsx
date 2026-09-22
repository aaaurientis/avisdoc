// L'onglet « Historique » : ce qui s'est passé. RIEN NE S'Y MODIFIE.
//
// Un historique qu'on retouche ne vaut rien. On y lit, dans l'ordre, ce qu'on a fait
// — appels, e-mails, rendez-vous, notes, saisis depuis l'onglet Action — et ce qui
// s'est fait tout seul : trouvée par Merx, approfondie, passée au Pipeline.
//
// Seule exception : une ligne saisie par erreur se retire, parce qu'une faute de
// frappe n'est pas un fait.

import { useCallback, useEffect, useState } from "react";
import { Mail, NotebookPen, Phone, Trash2, CalendarClock } from "lucide-react";
import {
  chargerEchanges,
  supprimerEchange,
  type ClesFiche,
  type Echange,
  type GenreEchange,
  type Jalon,
  libelleGenre,
} from "../lib/echanges";
import { cn } from "@/lib/utils";

const ICONES: Record<GenreEchange, typeof Phone> = {
  appel: Phone,
  email: Mail,
  rdv: CalendarClock,
  note: NotebookPen,
};

/** Un appel ou un rendez-vous porte son heure ; le reste se contente du jour. */
const quand = (iso: string, avecHeure: boolean) => {
  const d = new Date(iso);
  const jour = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  return avecHeure ? `${jour} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : jour;
};

export default function FilEchanges({
  cles,
  jalons,
  onCompte,
  rafraichir,
}: {
  cles: ClesFiche;
  jalons: Jalon[];
  /** Le nombre d’échanges notés, pour la pastille de l’onglet. */
  onCompte?: (n: number) => void;
  /** Change de valeur pour demander une relecture : après une action, par exemple. */
  rafraichir?: number;
}) {
  const [echanges, setEchanges] = useState<Echange[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const trouves = await chargerEchanges(cles);
      setEchanges(trouves);
      onCompte?.(trouves.length);
      setErreur(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Chargement impossible.";
      setErreur(
        /Could not find the table .* in the schema cache/i.test(message)
          ? "L’historique attend sa migration (0028) : collez-la dans le SQL Editor."
          : // Une erreur technique reste lisible : on dit d’abord ce qui n’a pas marché.
            `L’historique n’a pas pu être chargé. ${message}`,
      );
    } finally {
      setChargement(false);
    }
  }, [cles, onCompte]);

  useEffect(() => {
    void charger();
  }, [charger, rafraichir]);

  const retirer = async (id: string) => {
    if (!window.confirm("Supprimer cette ligne de l’historique ?")) return;
    try {
      await supprimerEchange(id);
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Suppression impossible.");
    }
  };

  // Un seul fil : les échanges saisis et les jalons de la fiche, du plus récent au plus ancien.
  const fil = [
    ...echanges.map((e) => ({ type: "echange" as const, au: e.au, echange: e })),
    ...jalons.map((j) => ({ type: "jalon" as const, au: j.au, jalon: j })),
  ].sort((a, b) => new Date(b.au).getTime() - new Date(a.au).getTime());

  return (
    <div>
      {erreur && <p className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{erreur}</p>}

      <div className="mt-4 border-l-2 border-border pl-4">
        {chargement ? (
          <p className="text-[13px] text-muted-foreground">Chargement…</p>
        ) : fil.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Rien à afficher pour l’instant.</p>
        ) : (
          fil.map((ligne) =>
            ligne.type === "echange" ? (
              <div key={ligne.echange.id} className="group mb-4 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-avisdoc-ink">
                    {libelleGenre(ligne.echange.kind)} — {ligne.echange.titre}
                  </p>
                  {ligne.echange.detail && (
                    <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-snug text-muted-foreground">
                      {ligne.echange.detail}
                    </p>
                  )}
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {quand(ligne.echange.au, ligne.echange.kind === "appel" || ligne.echange.kind === "rdv")}
                    {ligne.echange.par ? ` · ${ligne.echange.par}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void retirer(ligne.echange.id)}
                  aria-label="Supprimer cette ligne"
                  className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-rose-700 group-hover:opacity-100"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ) : (
              <div key={`${ligne.jalon.libelle}-${ligne.au}`} className="mb-4">
                <p className="text-[13px] text-muted-foreground">{ligne.jalon.libelle}</p>
                {ligne.jalon.detail && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{ligne.jalon.detail}</p>}
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">{quand(ligne.au, false)}</p>
              </div>
            ),
          )
        )}
      </div>
    </div>
  );
}
