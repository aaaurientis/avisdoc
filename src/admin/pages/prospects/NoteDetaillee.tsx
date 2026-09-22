// La note d’un prospect, telle qu’elle a été gagnée : le total en grand, puis chaque catégorie
// avec sa barre, et chaque critère avec ses points, sa justification et la page qui l’atteste.
// Rien n’est arrondi ni deviné : un critère sans information affiche « non évalué » et vaut zéro.

import { CATEGORIES, CRITERES, type CritereId, type NoteCritere } from "../../lib/merx";
import { cn } from "@/lib/utils";

const nomDuSite = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export default function NoteDetaillee({
  total,
  score,
}: {
  total: number | null;
  score: Partial<Record<CritereId, NoteCritere>>;
}) {
  return (
    <div>
      <div className="font-mono text-4xl font-bold text-avisdoc-teal">
        {total ?? "—"} <span className="text-2xl text-muted-foreground">/ 100</span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {CATEGORIES.map((cat) => {
          const obtenus = cat.criteres.reduce((s, id) => s + (score?.[id]?.points ?? 0), 0);
          const max = cat.criteres.reduce((s, id) => s + CRITERES[id].max, 0);
          return (
            <div key={cat.id} className="rounded-2xl border border-border">
              {/* En-tête : ce que la catégorie a rapporté sur ce qu’elle pouvait rapporter. */}
              <div className="rounded-t-2xl bg-muted/60 px-3.5 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-avisdoc-ink">{cat.label}</span>
                  <span className="font-mono text-[13px] font-bold text-avisdoc-ink">
                    {obtenus} <span className="text-muted-foreground">/ {max}</span>
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-avisdoc-teal transition-[width]"
                    style={{ width: `${max ? Math.round((obtenus / max) * 100) : 0}%` }}
                  />
                </div>
              </div>

              <div className="space-y-3 p-3.5">
                {cat.criteres.map((id) => {
                  const note = score?.[id];
                  const points = note?.points ?? null;
                  return (
                    <div key={id}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[12.5px] font-semibold text-avisdoc-ink">{CRITERES[id].label}</span>
                        <span className={cn("shrink-0 font-mono text-[12px] font-bold", points === null ? "text-muted-foreground" : "text-avisdoc-ink")}>
                          {points === null ? "non évalué" : `${points} / ${CRITERES[id].max}`}
                        </span>
                      </div>
                      {note?.justification && (
                        <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                          {note.justification}
                          {note.source && (
                            <>
                              {" · "}
                              <a href={note.source} target="_blank" rel="noreferrer" className="text-avisdoc-teal underline-offset-2 hover:underline">
                                {nomDuSite(note.source)}
                              </a>
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
