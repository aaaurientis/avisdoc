// La note d’un prospect, telle qu’elle a été gagnée : le total en grand, puis chaque catégorie
// avec sa barre, et chaque critère avec ses points, sa justification et la page qui l’atteste.
// Rien n’est arrondi ni deviné : un critère sans information affiche « non évalué » et vaut zéro.

import { CATEGORIES, CRITERES, tonFiabilite, type CritereId, type NoteCritere } from "../../lib/merx";
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
  fiabilite = null,
  detailFiabilite = null,
}: {
  total: number | null;
  score: Partial<Record<CritereId, NoteCritere>>;
  /** Sur dix : la confiance qu'on peut faire à ce que la fiche avance. Absente
      pour un client ou une affaire, qui ne portent pas encore cette note. */
  fiabilite?: number | null;
  detailFiabilite?: { quoi: string; dit: string; sur: number }[] | null;
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
              <div className="rounded-t-2xl border-b border-border px-3.5 py-2.5">
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

      {/* Deux notes qui répondent à deux questions sans rapport : « est-ce un bon
          client ? » et « est-ce que ce que je lis est vrai ? ». BB GR valait
          cinquante sur cent sur une adresse fermée depuis 2000. */}
      {(fiabilite ?? null) !== null && (
        <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-baseline gap-2">
            <span className={cn("rounded-full px-2.5 py-1 font-mono text-sm font-bold", tonFiabilite(fiabilite))}>
              {fiabilite} / 10
            </span>
            <span className="text-[13px] font-semibold text-avisdoc-ink">Fiabilité des informations</span>
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            Cette note ne juge pas l’entreprise : elle dit d’où vient chaque ligne de la fiche. Une fiche courte
            tenue par le registre vaut dix ; ce qu’aucune source n’appuie fait baisser la note.
          </p>
          {detailFiabilite?.length ? (
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {detailFiabilite.map((d) => (
                <li key={d.quoi} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span className="font-semibold text-avisdoc-ink">{d.quoi}</span>
                  <span className={cn("text-right", d.sur === 2 ? "text-muted-foreground" : d.sur === 1 ? "text-amber-700" : "text-rose-700")}>
                    {d.dit}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
