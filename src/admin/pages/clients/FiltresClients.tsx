// Les filtres du fichier client, bâtis comme ceux de la prospection et du Pipeline :
// mêmes pastilles, même « Tout afficher ».
//
// Ils portent sur ce qu'une fiche a de commun à toutes : son secteur, sa date d'entrée,
// et le fait qu'elle vienne de Merx ou qu'on l'ait saisie.

import type { Account } from "../../types";

export interface FiltresCompte {
  secteur: string;
  entree: string;
  origine: string;
}

export const FILTRES_COMPTE_VIDES: FiltresCompte = { secteur: "", entree: "", origine: "" };

const ENTREE: { valeur: string; label: string; jours: number }[] = [
  { valeur: "30", label: "30 derniers jours", jours: 30 },
  { valeur: "90", label: "3 derniers mois", jours: 90 },
  { valeur: "365", label: "12 derniers mois", jours: 365 },
];

/** Applique les filtres et la recherche à une fiche. */
export function retenueCompte(a: Account, f: FiltresCompte, recherche: string, vientDeMerx: boolean): boolean {
  if (f.secteur && (a.sector ?? "").trim() !== f.secteur) return false;

  if (f.entree) {
    const jours = ENTREE.find((e) => e.valeur === f.entree)?.jours ?? 0;
    if (!a.signedOn) return false;
    if (new Date(a.signedOn).getTime() < Date.now() - jours * 24 * 3600 * 1000) return false;
  }

  if (f.origine === "merx" && !vientDeMerx) return false;
  if (f.origine === "saisie" && vientDeMerx) return false;

  const q = recherche.trim().toLowerCase();
  if (q) {
    const champs = [a.name, a.sector ?? "", ...Object.values(a.data)];
    if (!champs.some((v) => v.toLowerCase().includes(q))) return false;
  }
  return true;
}

const selectCls =
  "ad-input rounded-full border border-border bg-card px-4 py-2 text-[13px] font-semibold text-avisdoc-ink outline-none transition-colors focus:border-avisdoc-teal";

export default function FiltresClients({
  filtres,
  onChange,
  secteurs,
}: {
  filtres: FiltresCompte;
  onChange: (f: FiltresCompte) => void;
  /** Les secteurs réellement présents : on ne propose pas un filtre qui ne rendrait rien. */
  secteurs: string[];
}) {
  const set = (cle: keyof FiltresCompte) => (e: React.ChangeEvent<HTMLSelectElement>) => onChange({ ...filtres, [cle]: e.target.value });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={filtres.secteur} onChange={set("secteur")} className={selectCls} aria-label="Secteur">
        <option value="">Secteur</option>
        {secteurs.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <select value={filtres.entree} onChange={set("entree")} className={selectCls} aria-label="Date d’entrée">
        <option value="">Date d’entrée</option>
        {ENTREE.map((e) => (
          <option key={e.valeur} value={e.valeur}>
            {e.label}
          </option>
        ))}
      </select>

      <select value={filtres.origine} onChange={set("origine")} className={selectCls} aria-label="Origine">
        <option value="">Origine</option>
        <option value="merx">Trouvé par Merx</option>
        <option value="saisie">Saisi ou importé</option>
      </select>

      {JSON.stringify(filtres) !== JSON.stringify(FILTRES_COMPTE_VIDES) && (
        <button
          type="button"
          onClick={() => onChange(FILTRES_COMPTE_VIDES)}
          className="text-[13px] font-semibold text-muted-foreground underline-offset-2 hover:text-avisdoc-ink hover:underline"
        >
          Tout afficher
        </button>
      )}
    </div>
  );
}
