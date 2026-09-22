// Les filtres du Pipeline, bâtis comme ceux de la prospection : mêmes pastilles,
// même « Tout afficher », pour qu'on ne se réapprenne rien en changeant d'écran.
//
// Ils portent sur ce qu'une affaire a de propre : sa taille, son montant, son
// département, et le fait qu'on ait ou non un interlocuteur.

import type { Client } from "../../types";

export interface FiltresCrm {
  journees: string;
  montant: string;
  contact: string;
  departement: string;
}

export const FILTRES_CRM_VIDES: FiltresCrm = { journees: "", montant: "", contact: "", departement: "" };

const JOURNEES: { valeur: string; label: string; min: number; max: number }[] = [
  { valeur: "5", label: "5 journées et plus", min: 5, max: Infinity },
  { valeur: "2", label: "2 à 4 journées", min: 2, max: 4 },
  { valeur: "1", label: "1 journée", min: 1, max: 1 },
];

const MONTANTS: { valeur: string; label: string; min: number }[] = [
  { valeur: "5000", label: "5 000 € et plus", min: 5000 },
  { valeur: "2500", label: "2 500 € et plus", min: 2500 },
  { valeur: "1000", label: "1 000 € et plus", min: 1000 },
];

/** Le département se lit dans le code postal, ou à défaut dans l'adresse. */
export function departementDe(c: Client): string | null {
  const cp = (c.codePostal ?? "").trim() || (c.adresse.match(/\b(\d{5})\b/)?.[1] ?? "");
  return cp.length >= 2 ? cp.slice(0, 2) : null;
}

/** Applique les filtres et la recherche à une affaire. */
export function retenueCrm(c: Client, f: FiltresCrm, recherche: string): boolean {
  if (f.journees) {
    const palier = JOURNEES.find((j) => j.valeur === f.journees);
    if (palier && (c.jours < palier.min || c.jours > palier.max)) return false;
  }

  if (f.montant) {
    const palier = MONTANTS.find((m) => m.valeur === f.montant);
    if (palier && c.tarif < palier.min) return false;
  }

  if (f.contact === "avec" && c.contacts.length === 0) return false;
  if (f.contact === "sans" && c.contacts.length > 0) return false;

  if (f.departement && departementDe(c) !== f.departement) return false;

  const q = recherche.trim().toLowerCase();
  if (q) {
    const champs = [
      c.company,
      c.siren,
      c.ville,
      c.adresse,
      c.naf,
      ...c.contacts.flatMap((p) => [p.prenom, p.nom, p.email]),
    ];
    if (!champs.some((v) => (v ?? "").toLowerCase().includes(q))) return false;
  }
  return true;
}

const selectCls =
  "ad-input rounded-full border border-border bg-card px-4 py-2 text-[13px] font-semibold text-avisdoc-ink outline-none transition-colors focus:border-avisdoc-teal";

export default function FiltresPipeline({
  filtres,
  onChange,
  departements,
}: {
  filtres: FiltresCrm;
  onChange: (f: FiltresCrm) => void;
  /** Les départements réellement présents : on ne propose pas un filtre qui ne rendrait rien. */
  departements: string[];
}) {
  const set = (cle: keyof FiltresCrm) => (e: React.ChangeEvent<HTMLSelectElement>) => onChange({ ...filtres, [cle]: e.target.value });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={filtres.journees} onChange={set("journees")} className={selectCls} aria-label="Nombre de journées">
        <option value="">Journées</option>
        {JOURNEES.map((j) => (
          <option key={j.valeur} value={j.valeur}>
            {j.label}
          </option>
        ))}
      </select>

      <select value={filtres.montant} onChange={set("montant")} className={selectCls} aria-label="Montant">
        <option value="">Montant</option>
        {MONTANTS.map((m) => (
          <option key={m.valeur} value={m.valeur}>
            {m.label}
          </option>
        ))}
      </select>

      <select value={filtres.contact} onChange={set("contact")} className={selectCls} aria-label="Interlocuteur">
        <option value="">Interlocuteur</option>
        <option value="avec">Avec contact</option>
        <option value="sans">Sans contact</option>
      </select>

      <select value={filtres.departement} onChange={set("departement")} className={selectCls} aria-label="Département">
        <option value="">Département</option>
        {departements.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      {JSON.stringify(filtres) !== JSON.stringify(FILTRES_CRM_VIDES) && (
        <button
          type="button"
          onClick={() => onChange(FILTRES_CRM_VIDES)}
          className="text-[13px] font-semibold text-muted-foreground underline-offset-2 hover:text-avisdoc-ink hover:underline"
        >
          Tout afficher
        </button>
      )}
    </div>
  );
}
