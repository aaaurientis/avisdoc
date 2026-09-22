// L'onglet « Historique » des fiches : ce qu'on a fait, et ce qui s'est fait tout seul.
//
// En haut, quatre boutons pour noter un appel, un e-mail, un rendez-vous ou une note.
// En dessous, un seul fil daté qui mélange ces échanges et les jalons de la fiche
// (trouvée par Merx, approfondie, passée au Pipeline…). Les jalons ne se suppriment
// pas : ce sont des faits, pas des saisies.

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, NotebookPen, Phone, Trash2, CalendarClock } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { SectionLabel } from "./ui";
import {
  ajouterEchange,
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

const GENRES_BOUTONS: GenreEchange[] = ["appel", "email", "rdv", "note"];

const leJour = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** Aujourd'hui au format attendu par un champ date. */
const aujourdhui = () => new Date().toISOString().slice(0, 10);

export default function FilEchanges({
  cles,
  jalons,
  onCompte,
}: {
  cles: ClesFiche;
  jalons: Jalon[];
  /** Le nombre d’échanges notés, pour la pastille de l’onglet. */
  onCompte?: (n: number) => void;
}) {
  const { user } = useAuth();
  const [echanges, setEchanges] = useState<Echange[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [saisie, setSaisie] = useState<GenreEchange | null>(null);
  const [titre, setTitre] = useState("");
  const [detail, setDetail] = useState("");
  const [au, setAu] = useState(aujourdhui);
  const [envoi, setEnvoi] = useState(false);

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
  }, [charger]);

  const ouvrir = (genre: GenreEchange) => {
    setSaisie(genre);
    setTitre("");
    setDetail("");
    setAu(aujourdhui());
    setErreur(null);
  };

  const enregistrer = async () => {
    if (!saisie || !titre.trim() || envoi) return;
    setEnvoi(true);
    try {
      await ajouterEchange(cles, {
        kind: saisie,
        titre,
        detail,
        // La date saisie est un jour ; on la garde telle quelle, à midi, pour éviter
        // qu'un fuseau ne la fasse basculer la veille.
        au: new Date(`${au}T12:00:00`).toISOString(),
        par: user?.email ?? "",
      });
      setSaisie(null);
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setEnvoi(false);
    }
  };

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
      <div className="flex flex-wrap gap-2">
        {GENRES_BOUTONS.map((g) => {
          const Icone = ICONES[g];
          return (
            <button
              key={g}
              type="button"
              onClick={() => ouvrir(g)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-bold transition-colors",
                saisie === g
                  ? "border-avisdoc-teal bg-avisdoc-teal text-white"
                  : "border-border text-avisdoc-ink hover:border-avisdoc-teal",
              )}
            >
              <Icone className="size-3.5" /> {libelleGenre(g)}
            </button>
          );
        })}
      </div>

      {saisie && (
        <div className="mt-3 rounded-2xl border border-border p-4">
          <SectionLabel>Noter un {libelleGenre(saisie).toLowerCase()}</SectionLabel>
          <input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            placeholder="Ce qu’il faut retenir en une ligne"
            className="ad-input mt-2 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[13px] outline-none focus:border-avisdoc-teal"
          />
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
            placeholder="Le détail, si besoin"
            className="ad-input mt-2 w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-[13px] outline-none focus:border-avisdoc-teal"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={au}
              onChange={(e) => setAu(e.target.value)}
              aria-label="Date de l’échange"
              className="ad-input rounded-xl border border-border bg-background px-3.5 py-2 text-[13px] outline-none focus:border-avisdoc-teal"
            />
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
              onClick={() => setSaisie(null)}
              className="rounded-full border border-border px-5 py-2 text-[13px] font-bold text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

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
                    {leJour(ligne.echange.au)}
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
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">{leJour(ligne.au)}</p>
              </div>
            ),
          )
        )}
      </div>
    </div>
  );
}
