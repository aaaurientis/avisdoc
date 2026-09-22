// Les filtres de la prospection, ceux arrêtés sur la vitrine : note, salariés, date d'arrivée,
// e-mail, département. Ils se combinent, et « Tout » remet chacun à zéro.
//
// L'effectif n'est connu que des fiches approfondies : le palier « Non renseigné » sert à les retrouver.

import type { Prospect } from "../../lib/merx";

export interface Filtres {
  noteMin: string;
  salaries: string;
  arrivee: string;
  email: string;
  departement: string;
}

export const FILTRES_VIDES: Filtres = { noteMin: "", salaries: "", arrivee: "", email: "", departement: "" };

/** Paliers de la grille d'Olivier : ce sont les mêmes qui donnent des points. */
const SALARIES: { valeur: string; label: string; bandes: string[] }[] = [
  { valeur: "250", label: "250 et plus", bandes: ["32", "41", "42", "51", "52", "53"] },
  { valeur: "100", label: "100 à 249", bandes: ["22", "31"] },
  { valeur: "50", label: "50 à 99", bandes: ["21"] },
  { valeur: "10", label: "10 à 49", bandes: ["11", "12"] },
  { valeur: "0", label: "Moins de 10", bandes: ["NN", "00", "01", "02", "03"] },
  { valeur: "inconnu", label: "Non renseigné", bandes: [] },
];

const ARRIVEE: { valeur: string; label: string; jours: number }[] = [
  { valeur: "1", label: "Aujourd’hui", jours: 1 },
  { valeur: "7", label: "7 derniers jours", jours: 7 },
  { valeur: "30", label: "30 derniers jours", jours: 30 },
  { valeur: "90", label: "3 derniers mois", jours: 90 },
];

/** Applique les filtres et la recherche à une fiche. */
export function retenue(p: Prospect, f: Filtres, recherche: string): boolean {
  if (f.noteMin && (p.score_total ?? 0) < Number(f.noteMin)) return false;

  if (f.salaries) {
    const palier = SALARIES.find((s) => s.valeur === f.salaries);
    if (palier) {
      if (palier.valeur === "inconnu") {
        if (p.headcount_band) return false;
      } else if (!p.headcount_band || !palier.bandes.includes(p.headcount_band)) return false;
    }
  }

  if (f.arrivee) {
    const jours = ARRIVEE.find((a) => a.valeur === f.arrivee)?.jours ?? 0;
    const limite = Date.now() - jours * 24 * 3600 * 1000;
    if (new Date(p.created_at).getTime() < limite) return false;
  }

  if (f.email === "avec" && !p.contact_email) return false;
  if (f.email === "sans" && p.contact_email) return false;

  if (f.departement && p.department !== f.departement) return false;

  const q = recherche.trim().toLowerCase();
  if (q) {
    const champs = [p.name, p.legal_name, p.city, p.activity, p.rationale, p.contact_name, p.contact_email];
    if (!champs.some((v) => (v ?? "").toLowerCase().includes(q))) return false;
  }
  return true;
}

const selectCls =
  "ad-input rounded-full border border-border bg-card px-4 py-2 text-[13px] font-semibold text-avisdoc-ink outline-none transition-colors focus:border-avisdoc-teal";

export default function FiltresProspects({
  filtres,
  onChange,
  departements,
}: {
  filtres: Filtres;
  onChange: (f: Filtres) => void;
  /** Les départements réellement présents dans les fiches : pas de liste morte. */
  departements: string[];
}) {
  const set = (cle: keyof Filtres) => (e: React.ChangeEvent<HTMLSelectElement>) => onChange({ ...filtres, [cle]: e.target.value });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={filtres.noteMin} onChange={set("noteMin")} className={selectCls} aria-label="Note minimale">
        <option value="">Note</option>
        <option value="70">70 et plus</option>
        <option value="50">50 et plus</option>
        <option value="30">30 et plus</option>
      </select>

      <select value={filtres.salaries} onChange={set("salaries")} className={selectCls} aria-label="Nombre de salariés">
        <option value="">Salariés</option>
        {SALARIES.map((s) => (
          <option key={s.valeur} value={s.valeur}>
            {s.label}
          </option>
        ))}
      </select>

      <select value={filtres.arrivee} onChange={set("arrivee")} className={selectCls} aria-label="Date d’arrivée de la fiche">
        <option value="">Date d’arrivée</option>
        {ARRIVEE.map((a) => (
          <option key={a.valeur} value={a.valeur}>
            {a.label}
          </option>
        ))}
      </select>

      <select value={filtres.email} onChange={set("email")} className={selectCls} aria-label="Adresse e-mail">
        <option value="">E-mail</option>
        <option value="avec">Avec adresse</option>
        <option value="sans">Sans adresse</option>
      </select>

      <select value={filtres.departement} onChange={set("departement")} className={selectCls} aria-label="Département">
        <option value="">Département</option>
        {departements.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      {JSON.stringify(filtres) !== JSON.stringify(FILTRES_VIDES) && (
        <button
          type="button"
          onClick={() => onChange(FILTRES_VIDES)}
          className="text-[13px] font-semibold text-muted-foreground underline-offset-2 hover:text-avisdoc-ink hover:underline"
        >
          Tout afficher
        </button>
      )}
    </div>
  );
}
