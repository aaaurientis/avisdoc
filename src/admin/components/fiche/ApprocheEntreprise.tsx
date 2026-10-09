// L'onglet Approche, le même sur les trois fiches : ce que Merx a trouvé pour aborder
// l'entreprise. Le dossier commercial d'abord, puis pourquoi c'est une cible, puis la
// note critère par critère.

import type { ReactNode } from "react";
import { Loader2, Search } from "lucide-react";
import { SectionLabel } from "../ui";
import DossierCommercial, { dossierRempli } from "../DossierCommercial";
import NoteDetaillee from "../../pages/prospects/NoteDetaillee";
import { CATEGORIES, CRITERES, type Prospect } from "../../lib/merx";

export default function ApprocheEntreprise({
  origine,
  onApprofondir,
  enCours = false,
  erreur = null,
  sansOrigine,
  apres,
}: {
  origine: Prospect | null;
  /** Le bouton « Approfondir », quand l'écran le propose. */
  onApprofondir?: () => void;
  enCours?: boolean;
  erreur?: string | null;
  /** Ce qu'on montre quand l'entreprise n'est jamais passée par Merx. */
  sansOrigine?: ReactNode;
  /** Ce qui suit : les brouillons d'e-mail, par exemple. */
  apres?: ReactNode;
}) {
  if (!origine) {
    return (
      <div className="py-2">
        {sansOrigine ?? (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Cette entreprise n’est pas passée par Merx : elle n’a ni note ni angle d’approche.
          </p>
        )}
        {apres}
      </div>
    );
  }

  const constats = CATEGORIES.flatMap((cat) =>
    cat.criteres
      .map((id) => ({ label: CRITERES[id].label, justification: origine.score?.[id]?.justification ?? "", points: origine.score?.[id]?.points ?? null }))
      .filter((c) => c.points !== null && c.justification),
  );

  return (
    <div>
      {onApprofondir && (
        <div className="mb-4">
          <button
            type="button"
            onClick={onApprofondir}
            disabled={enCours}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[12.5px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal disabled:opacity-60"
          >
            {enCours ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            {origine.enriched_at ? "Approfondir à nouveau" : "Approfondir"}
          </button>
        </div>
      )}
      {erreur && <p className="mb-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{erreur}</p>}

      {dossierRempli(origine.dossier) && <DossierCommercial dossier={origine.dossier} />}

      {(origine.rationale || constats.length > 0 || origine.approach) && (
        <div className="mb-5 rounded-2xl border border-l-4 border-border border-l-avisdoc-teal p-4">
          <SectionLabel>Pourquoi c’est un bon prospect</SectionLabel>
          {origine.rationale && <p className="mt-1.5 text-[13.5px] leading-relaxed text-avisdoc-ink">{origine.rationale}</p>}
          {constats.length > 0 && (
            <ul className="mt-2 space-y-1">
              {constats.map((c) => (
                <li key={c.label} className="flex gap-2 text-[13px] leading-snug text-avisdoc-ink">
                  <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-avisdoc-teal" />
                  <span>
                    <span className="font-semibold">{c.label}</span> : {c.justification}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {origine.approach && (
            <p className="mt-3 text-[13.5px] leading-relaxed text-avisdoc-ink">
              <span className="font-semibold">Angle d’approche : </span>
              {origine.approach}
            </p>
          )}
        </div>
      )}

      <div className="mb-5">
        <SectionLabel>La note, critère par critère</SectionLabel>
        <div className="mt-2">
          <NoteDetaillee total={origine.score_total} score={origine.score ?? {}} />
        </div>
      </div>
      {apres}
    </div>
  );
}
