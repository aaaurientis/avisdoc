// Composer une recherche sans la rédiger.
//
// Les « pistes à explorer » proposaient des croisements que personne n'avait demandés :
// on les lisait, on ne les lançait jamais. Ce panneau fait l'inverse — c'est le
// commercial qui dit ce qu'il cherche, en quatre clics, sans formuler de phrase.
//
// Deux natures d'éléments, et la distinction est le cœur du sujet :
//
//   • les MENUS restreignent : un métier, une zone, une taille. Ils partent au
//     registre officiel et décident qui entre dans la liste.
//
//   • les MARQUEURS ne restreignent RIEN. Une entreprise qui ne publie pas de
//     démarche RSE mais remplit tout le reste doit apparaître : le marqueur dit
//     seulement ce qu'on préfère, pour l'ordre et pour l'approfondissement. Une
//     préférence qui exclut n'est plus une préférence, c'est un filtre déguisé.

import { useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { SectionLabel } from "../../components/ui";
import { cn } from "@/lib/utils";

/** Les métiers demandés couramment. « Autre » ouvre un champ libre : rien n'est fermé. */
const METIERS: { groupe: string; valeurs: string[] }[] = [
  {
    groupe: "Travail en extérieur",
    valeurs: [
      "Travaux publics et BTP",
      "Terrassement et gros œuvre",
      "Couverture et étanchéité",
      "Espaces verts et paysagistes",
      "Agriculture et grandes cultures",
      "Viticulture et arboriculture",
      "Exploitation forestière",
      "Collectivités et services techniques",
    ],
  },
  {
    groupe: "Santé et beauté",
    valeurs: [
      "Instituts de beauté et spas",
      "Coiffure",
      "Pharmacies et parapharmacies",
      "Cabinets médicaux et dermatologie",
      "Fabrication de matériel médical",
      "Industrie pharmaceutique et cosmétique",
      "Salles de sport et bien-être",
    ],
  },
  {
    groupe: "Autres secteurs",
    valeurs: [
      "Industrie et fabrication",
      "Transport et logistique",
      "Commerce et distribution",
      "Hôtellerie et restauration",
      "Banque et assurance",
    ],
  },
];

/** Les tailles, dites comme un commercial les dit — l'effectif suit entre parenthèses. */
const TAILLES: { valeur: string; label: string; phrase: string }[] = [
  { valeur: "", label: "Toutes tailles", phrase: "" },
  { valeur: "tpe", label: "TPE — moins de 10 salariés", phrase: "de moins de 10 salariés" },
  { valeur: "pme50", label: "PME — 10 à 49 salariés", phrase: "de 10 à 49 salariés" },
  { valeur: "pme", label: "PME — 50 à 249 salariés", phrase: "de plus de 50 salariés" },
  { valeur: "eti", label: "ETI — 250 à 4 999 salariés", phrase: "de plus de 250 salariés" },
  { valeur: "ge", label: "Grande entreprise — 5 000 et plus", phrase: "de plus de 5 000 salariés" },
];

/**
 * Les marqueurs. Ils ne filtrent jamais : ils s'ajoutent à la demande comme une
 * préférence, et servent surtout à l'approfondissement — c'est là qu'on lit le site
 * et qu'on peut savoir si une démarche existe.
 */
const MARQUEURS: { id: string; label: string; phrase: string }[] = [
  { id: "plein_air", label: "Salariés en extérieur", phrase: "dont les salariés travaillent dehors" },
  { id: "peau", label: "Métier de la peau", phrase: "dont le métier touche la peau ou la prévention" },
  { id: "rse", label: "Démarche RSE", phrase: "en privilégiant celles qui publient une démarche RSE" },
  { id: "sse", label: "Politique santé-sécurité", phrase: "en privilégiant celles qui ont une politique santé-sécurité affichée" },
  { id: "multi_sites", label: "Plusieurs sites", phrase: "en privilégiant celles qui ont plusieurs établissements" },
];

/** Qui viser : n'entre pas dans la recherche, oriente le dossier commercial. */
const POSTES: { valeur: string; label: string }[] = [
  { valeur: "", label: "Peu importe" },
  { valeur: "drh", label: "Ressources humaines" },
  { valeur: "qse", label: "QSE / HSE / prévention" },
  { valeur: "rse", label: "RSE / développement durable" },
  { valeur: "dg", label: "Direction générale" },
];

const champCls =
  "ad-input w-full rounded-xl border border-border bg-background px-3 py-2 text-[12.5px] outline-none transition-colors focus:border-avisdoc-teal";

export default function PanneauRecherche({
  occupe,
  onChercher,
}: {
  occupe: boolean;
  /** Reçoit la demande rédigée : le reste du chemin ne change pas. */
  onChercher: (demande: string) => void;
}) {
  const [metier, setMetier] = useState("");
  const [metierLibre, setMetierLibre] = useState("");
  const [ou, setOu] = useState("");
  const [taille, setTaille] = useState("");
  const [poste, setPoste] = useState("");
  const [marqueurs, setMarqueurs] = useState<Set<string>>(new Set());

  const basculer = (id: string) =>
    setMarqueurs((avant) => {
      const apres = new Set(avant);
      if (apres.has(id)) apres.delete(id);
      else apres.add(id);
      return apres;
    });

  const quoi = (metier === "autre" ? metierLibre : metier).trim();
  const pret = quoi.length > 1 && !occupe;

  /** La demande, écrite comme le commercial l'aurait dite. */
  const rediger = (): string => {
    const morceaux = [`Entreprises du secteur ${quoi}`];
    if (ou.trim()) morceaux.push(`en ${ou.trim()}`);
    else morceaux.push("dans toute la France");
    const t = TAILLES.find((x) => x.valeur === taille)?.phrase;
    if (t) morceaux.push(t);
    for (const m of MARQUEURS) if (marqueurs.has(m.id)) morceaux.push(m.phrase);
    const p = POSTES.find((x) => x.valeur === poste);
    if (p?.valeur) morceaux.push(`— interlocuteur à viser : ${p.label.toLowerCase()}`);
    return morceaux.join(" ") + ".";
  };

  const vider = () => {
    setMetier("");
    setMetierLibre("");
    setOu("");
    setTaille("");
    setPoste("");
    setMarqueurs(new Set());
  };

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div>
        <SectionLabel>Ce que vous cherchez</SectionLabel>
        <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
          Les menus décident qui entre dans la liste. Les boutons font seulement remonter ce que
          vous préférez — ils n’écartent personne.
        </p>
      </div>

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Métier</span>
        <select value={metier} onChange={(e) => setMetier(e.target.value)} className={cn(champCls, "mt-1")}>
          <option value="">Choisissez un métier…</option>
          {METIERS.map((g) => (
            <optgroup key={g.groupe} label={g.groupe}>
              {g.valeurs.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </optgroup>
          ))}
          <option value="autre">Autre — je précise</option>
        </select>
      </label>

      {metier === "autre" && (
        <input
          value={metierLibre}
          onChange={(e) => setMetierLibre(e.target.value)}
          autoFocus
          placeholder="Fabricants de feux d’artifice, scieries, garages…"
          className={champCls}
        />
      )}

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Où</span>
        <input
          value={ou}
          onChange={(e) => setOu(e.target.value)}
          placeholder="Bas-Rhin, Alsace, Gironde… vide = toute la France"
          className={cn(champCls, "mt-1")}
        />
      </label>

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Taille</span>
        <select value={taille} onChange={(e) => setTaille(e.target.value)} className={cn(champCls, "mt-1")}>
          {TAILLES.map((t) => (
            <option key={t.valeur} value={t.valeur}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
          Interlocuteur à viser
        </span>
        <select value={poste} onChange={(e) => setPoste(e.target.value)} className={cn(champCls, "mt-1")}>
          {POSTES.map((p) => (
            <option key={p.valeur} value={p.valeur}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <div>
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
          Ce qu’on préfère
        </span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {MARQUEURS.map((m) => {
            const actif = marqueurs.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => basculer(m.id)}
                aria-pressed={actif}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[11.5px] font-bold transition-colors",
                  actif
                    ? "border-avisdoc-teal bg-avisdoc-teal text-white"
                    : "border-border text-muted-foreground hover:border-avisdoc-teal hover:text-avisdoc-ink",
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={() => pret && onChercher(rediger())}
          disabled={!pret}
          className="ad-btn-accent inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-avisdoc-teal px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {occupe ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Chercher
        </button>
        {(quoi || ou || taille || poste || marqueurs.size > 0) && (
          <button
            type="button"
            onClick={vider}
            title="Tout effacer"
            className="rounded-full border border-border p-2 text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {quoi && (
        <p className="rounded-xl bg-muted/60 px-3 py-2 text-[11.5px] leading-snug text-muted-foreground">
          {rediger()}
        </p>
      )}
    </div>
  );
}
