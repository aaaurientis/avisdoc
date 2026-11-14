// Suivi en direct d'une recherche IA : barre de progression, étape en cours,
// journal (recherches web lancées, sources vérifiées ou écartées).

import { useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import type { RechercheIa } from "../../reseau/reseauRepo";
import { cn } from "@/lib/utils";

const heure = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

function duree(debut: string, fin: string | null): string {
  const s = Math.max(0, Math.round(((fin ? new Date(fin) : new Date()).getTime() - new Date(debut).getTime()) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

export default function AvancementIa({ recherche: r, ouvertParDefaut = true, lignesVisibles = 8 }: { recherche: RechercheIa; ouvertParDefaut?: boolean; lignesVisibles?: number }) {
  const [tout, setTout] = useState(false);
  const [ouvert, setOuvert] = useState(ouvertParDefaut);
  const enCours = r.statut === "en_cours";
  const pct = r.statut === "termine" ? 100 : r.progression;
  const lignes = tout ? r.journal : r.journal.slice(-lignesVisibles);

  return (
    <div className="mt-1.5 rounded-xl border border-border/70 bg-card px-3 py-2.5 text-[12px]">
      <div className="flex items-center justify-between gap-3">
        <span className={cn("font-semibold", r.statut === "echec" ? "text-rose-700" : "text-avisdoc-ink")}>
          {enCours && <Loader2 className="mr-1 inline size-3.5 animate-spin align-[-2px]" />}
          {r.statut === "echec" ? `Échec : ${r.erreur ?? "erreur inconnue"}` : r.etape ?? (enCours ? "Démarrage…" : "Terminé")}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{pct} % · {duree(r.debut, r.fin)}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn("h-full rounded-full transition-[width] duration-700", r.statut === "echec" ? "bg-rose-500" : "bg-avisdoc-teal")} style={{ width: `${pct}%` }} />
      </div>
      {r.journal.length > 0 && (
        <>
          {!enCours && (
            <button type="button" onClick={() => setOuvert(!ouvert)} className="mt-1.5 font-semibold text-muted-foreground underline-offset-2 hover:underline">
              {ouvert ? "Masquer le journal" : `Voir le journal (${r.journal.length} lignes)`}
            </button>
          )}
          {(enCours || ouvert) && (
            <ol className="mt-1.5 space-y-0.5">
              {!tout && r.journal.length > lignes.length && (
                <li>
                  <button type="button" onClick={() => setTout(true)} className="text-muted-foreground underline-offset-2 hover:underline">
                    … {r.journal.length - lignes.length} lignes plus tôt
                  </button>
                </li>
              )}
              {lignes.map((l, i) => (
                <li key={`${l.le}-${i}`} className="flex items-start gap-1.5">
                  {l.niveau === "ok" ? <Check className="mt-0.5 size-3 shrink-0 text-emerald-600" />
                    : l.niveau === "ecarte" ? <X className="mt-0.5 size-3 shrink-0 text-rose-600" />
                    : <Search className="mt-0.5 size-3 shrink-0 text-muted-foreground" />}
                  <span className="shrink-0 tabular-nums text-muted-foreground">{heure(l.le)}</span>
                  <span className={cn(l.niveau === "ecarte" ? "text-rose-800" : "text-avisdoc-ink")}>{l.texte}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
