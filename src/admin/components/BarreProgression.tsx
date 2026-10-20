// Une barre qui avance, avec l'étape en cours, à la place d'un rond qui tourne
// (Olivier, 20/10 : « qu'on sache à peu près où on en est »).
//
// Le serveur ne dit pas où il en est : la barre avance au temps écoulé, d'après la durée
// habituelle de l'opération, et s'arrête à 95 % tant que ce n'est pas fini — elle ne
// prétend jamais avoir terminé avant la fin réelle.

import { useEffect, useState } from "react";

export interface EtapeProgression {
  /** Part de la durée totale (0 à 1) à partir de laquelle cette étape s'affiche. */
  des: number;
  libelle: string;
}

export default function BarreProgression({
  dureeEstimeeS,
  etapes,
  className,
}: {
  /** La durée habituelle de l'opération, en secondes. */
  dureeEstimeeS: number;
  etapes: EtapeProgression[];
  className?: string;
}) {
  const [debut] = useState(() => Date.now());
  const [ecoule, setEcoule] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setEcoule((Date.now() - debut) / 1000), 500);
    return () => clearInterval(t);
  }, [debut]);

  // Rapide au début, plus lent ensuite, jamais au-delà de 95 % avant la fin réelle.
  const part = Math.min(0.95, 1 - Math.exp((-2.2 * ecoule) / dureeEstimeeS));
  const etape = [...etapes].reverse().find((e) => part >= e.des) ?? etapes[0];
  const reste = Math.max(0, Math.round(dureeEstimeeS - ecoule));

  return (
    <div className={className} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(part * 100)}>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-[12.5px]">
        <span className="font-semibold text-avisdoc-ink">{etape?.libelle}</span>
        <span className="shrink-0 text-muted-foreground">
          {Math.round(part * 100)} %{reste > 0 ? ` · encore ${reste > 60 ? `${Math.ceil(reste / 60)} min` : `${reste} s`} environ` : " · presque fini"}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-avisdoc-teal transition-[width] duration-500 ease-out" style={{ width: `${part * 100}%` }} />
      </div>
    </div>
  );
}

/** Les étapes d'un approfondissement Merx, puis de FullEnrich. */
export const ETAPES_APPROFONDIR: EtapeProgression[] = [
  { des: 0, libelle: "Merx lit le registre officiel…" },
  { des: 0.15, libelle: "Merx lit le site de l’entreprise…" },
  { des: 0.4, libelle: "Merx cherche les interlocuteurs et l’actualité…" },
  { des: 0.7, libelle: "Merx rédige le dossier commercial…" },
  { des: 0.9, libelle: "Merx termine — encore quelques instants…" },
];

export const ETAPES_FULLENRICH: EtapeProgression[] = [
  { des: 0, libelle: "FullEnrich cherche 2 interlocuteurs…" },
  { des: 0.35, libelle: "FullEnrich cherche leurs e-mails…" },
  { des: 0.85, libelle: "FullEnrich termine — encore quelques instants…" },
];
