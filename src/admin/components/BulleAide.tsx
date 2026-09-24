// D'où sort une note : une bulle qu'on ouvre d'un clic, à côté du titre de la colonne.
//
// Une note sur cent qu'on ne sait pas expliquer, personne ne la suit : le commercial la
// contourne, ou pire, il la croit. Celle-ci vient de la grille de son collègue
// d'AvisDoc, et la fiabilité de nos propres règles de recoupement — autant que ce soit
// écrit là où la note s'affiche, plutôt que dans un manuel que personne n'ouvre.
//
// Au survol pour l'essayer, au clic pour la garder ouverte et la lire.

import { useEffect, useRef, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function BulleAide({ titre, texte }: { titre: string; texte: string }) {
  const [ouverte, setOuverte] = useState(false);
  const zone = useRef<HTMLSpanElement>(null);

  // Un clic ailleurs referme : sans cela, la bulle reste sur l'écran et gêne la lecture
  // de la colonne qu'elle explique.
  useEffect(() => {
    if (!ouverte) return;
    const ailleurs = (e: MouseEvent) => {
      if (!zone.current?.contains(e.target as Node)) setOuverte(false);
    };
    const echap = (e: KeyboardEvent) => e.key === "Escape" && setOuverte(false);
    document.addEventListener("mousedown", ailleurs);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", ailleurs);
      document.removeEventListener("keydown", echap);
    };
  }, [ouverte]);

  return (
    <span ref={zone} className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation(); // sinon on déclenche le tri de la colonne
          setOuverte((v) => !v);
        }}
        aria-expanded={ouverte}
        aria-label={`D’où vient ${titre.toLowerCase()} ?`}
        title={`D’où vient ${titre.toLowerCase()} ?`}
        className={cn(
          "ml-1 rounded-full p-0.5 text-muted-foreground/70 transition-colors hover:text-avisdoc-teal",
          ouverte && "text-avisdoc-teal",
        )}
      >
        <HelpCircle className="size-3.5" />
      </button>

      {ouverte && (
        <span
          role="dialog"
          // Une largeur fixe, en bloc : « calc(100vw-2rem) » sans espaces autour du
          // moins est invalide en CSS, la règle entière était ignorée et la bulle
          // s'étalait sur toute la table.
          className="absolute right-0 top-6 z-50 block max-h-[70vh] w-[28rem] max-w-[calc(100vw-2rem)] cursor-default overflow-y-auto rounded-xl border border-border bg-card p-4 text-left shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[13px] font-bold text-avisdoc-ink">{titre}</span>
            <button
              type="button"
              onClick={() => setOuverte(false)}
              aria-label="Fermer"
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-avisdoc-ink"
            >
              <X className="size-3.5" />
            </button>
          </span>
          {/* Les paragraphes viennent du texte : une bulle qui explique une note ne peut
              pas être un pavé d'un seul tenant. */}
          {texte.split("\n\n").map((para, i) => (
            // « whitespace-pre-line » garde les retours simples : les listes à puces
            // d'un même bloc se retrouvaient collées en un seul pavé.
            <span key={i} className="mb-2 block whitespace-pre-line text-[12.5px] font-normal leading-relaxed text-muted-foreground last:mb-0">
              {para}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
