// Le commercial qui suit la fiche.
//
// Un prospect devient une affaire, puis un client : c'est la même entreprise, et
// c'est la même personne qui la suit. Le référent se choisit ici et se reporte tout
// seul aux étapes suivantes.
//
// Le choix s'enregistre au changement, sans bouton : une liste déroulante qu'il
// faudrait valider ne serait pas remplie.

import { useEffect, useState } from "react";
import { Loader2, UserRound } from "lucide-react";
import { supabaseAdmin } from "../data/supabaseAdmin";
import { chargerMembres, nomLisible } from "../lib/membres";
import { cn } from "@/lib/utils";

const TABLE = {
  prospect: "admin_prospects",
  affaire: "admin_clients",
  client: "admin_accounts",
} as const;

export default function ChoixReferent({
  quoi,
  id,
  referent,
  onChange,
  className,
}: {
  quoi: keyof typeof TABLE;
  id: string;
  /** Omis, le champ va lire la valeur lui-même : les écrans n'ont pas à porter
      une colonne de plus dans leurs types pour l'afficher. */
  referent?: string | null;
  /** Rappelé avec la nouvelle valeur, pour que la fiche affichée suive. */
  onChange?: (referent: string | null) => void;
  className?: string;
}) {
  const [membres, setMembres] = useState<string[]>([]);
  const [valeur, setValeur] = useState(referent ?? "");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    void chargerMembres().then(setMembres);
  }, []);

  useEffect(() => {
    if (referent !== undefined) setValeur(referent ?? "");
  }, [referent]);

  // Personne ne nous l'a donné : on va le chercher.
  useEffect(() => {
    if (referent !== undefined) return;
    let vivant = true;
    void supabaseAdmin
      .from(TABLE[quoi])
      .select("referent")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (vivant && data) setValeur((data.referent as string | null) ?? "");
      });
    return () => {
      vivant = false;
    };
  }, [quoi, id, referent]);

  // Le référent déjà posé peut ne plus être dans la liste (compte fermé) : on
  // l'ajoute pour ne pas l'effacer en silence à la première ouverture.
  const choix = valeur && !membres.includes(valeur) ? [valeur, ...membres] : membres;

  const enregistrer = async (nouveau: string) => {
    const avant = valeur;
    setValeur(nouveau);
    setEnvoi(true);
    setErreur(false);
    const { error } = await supabaseAdmin
      .from(TABLE[quoi])
      .update({ referent: nouveau || null })
      .eq("id", id);
    setEnvoi(false);
    if (error) {
      setValeur(avant);
      setErreur(true);
      return;
    }
    onChange?.(nouveau || null);
  };

  return (
    <label className={cn("inline-flex items-center gap-2", className)}>
      <UserRound className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
        Référent
      </span>
      <select
        value={valeur}
        disabled={envoi}
        onChange={(e) => void enregistrer(e.target.value)}
        className={cn(
          "ad-input min-w-0 rounded-full border bg-background px-3 py-1.5 text-[12.5px] font-semibold outline-none transition-colors",
          erreur ? "border-rose-300 text-rose-700" : "border-border text-avisdoc-ink focus:border-avisdoc-teal",
        )}
      >
        <option value="">Personne</option>
        {choix.map((m) => (
          <option key={m} value={m}>
            {nomLisible(m)}
          </option>
        ))}
      </select>
      {envoi && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
      {erreur && <span className="text-[11.5px] font-semibold text-rose-700">non enregistré</span>}
    </label>
  );
}
