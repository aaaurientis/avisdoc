// La colonne de gauche d'une fiche, reprise du hub Onetip (12/10) : le nom, la
// notation, la place dans le Pipeline, qui la suit, les interlocuteurs, puis
// l'établissement. Les cases vides restent connues mais repliées.

import { useState, type ReactNode } from "react";
import { Notation, TitreColonne } from "../FicheEntreprise";
import type { NotesFiche } from "../../lib/fiche";
import type { Prospect } from "../../lib/merx";
import { effectifLabel } from "../../lib/merx";

export interface LigneEtablissement {
  label: string;
  valeur: ReactNode;
}

/** « 4,7 Md € », « 167 M € », « 850 k € ». */
const euros = (n: number): string =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1).replace(".", ",")} Md €` : n >= 1e6 ? `${Math.round(n / 1e6)} M €` : n >= 1e3 ? `${Math.round(n / 1e3)} k €` : `${n} €`;

/** L'essentiel de l'établissement, tiré de la fiche de prospection. Le détail complet est dans Dossier. */
export function etablissementDe(p: Prospect | null): { lignes: LigneEtablissement[]; manquants: string[] } {
  if (!p) return { lignes: [], manquants: [] };
  const f = p.registre?.finances;
  const annee = f ? Object.keys(f).sort().at(-1) : undefined;
  const ca = annee ? f?.[annee]?.ca : undefined;
  const effectif = effectifLabel(p.headcount_band);
  const lien = (href: string, texte: string) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-avisdoc-teal underline-offset-2 hover:underline">
      {texte}
    </a>
  );
  const candidates: { label: string; valeur: ReactNode | null | undefined }[] = [
    { label: "Activité", valeur: p.activity },
    { label: "Effectif", valeur: effectif },
    { label: "Établissements", valeur: p.open_establishments ?? null },
    { label: typeof ca === "number" ? `Chiffre d’affaires ${annee}` : "Chiffre d’affaires", valeur: typeof ca === "number" ? euros(ca) : null },
    { label: "Site", valeur: p.website ? lien(p.website, p.website.replace(/^https?:\/\//, "").replace(/\/$/, "")) : null },
    { label: "Téléphone", valeur: p.contact_phone ? <a href={`tel:${p.contact_phone.replace(/\s/g, "")}`} className="text-avisdoc-teal">{p.contact_phone}</a> : null },
    { label: "E-mail", valeur: p.contact_email ? <a href={`mailto:${p.contact_email}`} className="break-all text-avisdoc-teal">{p.contact_email}</a> : null },
  ];
  const vide = (v: ReactNode | null | undefined) => v === null || v === undefined || v === "";
  return {
    lignes: candidates.filter((c) => !vide(c.valeur)).map((c) => ({ label: c.label, valeur: c.valeur })),
    manquants: [
      ...candidates.filter((c) => vide(c.valeur)).map((c) => c.label),
      ...(p.contact_name ? [] : ["Interlocuteur"]),
      ...(p.siren ? [] : ["SIREN"]),
    ],
  };
}

export default function ColonneEntreprise({
  titre,
  sousTitre,
  identite,
  notes,
  place,
  referent,
  inscrite,
  interlocuteurs,
  etablissement,
  manquants = [],
  onCompleter,
}: {
  titre: string;
  sousTitre?: ReactNode;
  /** SIREN, raison sociale, siège. */
  identite?: ReactNode;
  notes: NotesFiche | null;
  /** « Place dans le Pipeline » : le menu des colonnes, ou ce qui en tient lieu. */
  place?: ReactNode;
  referent?: ReactNode;
  /** « Trouvée le 3 oct. par Merx ». */
  inscrite?: string | null;
  interlocuteurs: ReactNode;
  etablissement: LigneEtablissement[];
  manquants?: string[];
  onCompleter?: () => void;
}) {
  const [voirManquants, setVoirManquants] = useState(false);
  return (
    <>
      <h2 className="pr-10 font-display text-[22px] font-semibold leading-tight text-avisdoc-ink md:pr-0">{titre}</h2>
      {sousTitre && <div className="mt-1 text-[13px] text-muted-foreground">{sousTitre}</div>}
      {identite && <div className="mt-1.5">{identite}</div>}

      <TitreColonne className="mt-4">Notation</TitreColonne>
      <Notation notes={notes} />

      {place && (
        <>
          <TitreColonne>Place dans le Pipeline</TitreColonne>
          {place}
        </>
      )}

      {referent && <div className="mt-4">{referent}</div>}
      {inscrite && <div className="mt-1.5 text-[12px] text-muted-foreground">{inscrite}</div>}

      <div className="mt-5">{interlocuteurs}</div>

      {etablissement.length > 0 && (
        <>
          <TitreColonne className="mt-0">Établissement</TitreColonne>
          <div className="divide-y divide-border/70">
            {etablissement.map((l) => (
              <div key={l.label} className="flex gap-3 py-1.5">
                <div className="w-[110px] shrink-0 text-[12.5px] text-muted-foreground">{l.label}</div>
                <div className="min-w-0 flex-1 break-words text-[13px] text-avisdoc-ink">{l.valeur}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {manquants.length > 0 && (
        <div className="mt-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
          <button type="button" onClick={() => setVoirManquants(!voirManquants)} className="underline underline-offset-2">
            {manquants.length} information{manquants.length > 1 ? "s" : ""} à renseigner {voirManquants ? "▴" : "▾"}
          </button>
          {onCompleter && (
            <>
              {" · "}
              <button type="button" onClick={onCompleter} className="underline underline-offset-2">
                Compléter
              </button>
            </>
          )}
          {voirManquants && <div className="mt-1.5">{manquants.join(" · ")}</div>}
        </div>
      )}
    </>
  );
}
