// La pastille ✨ des fiches que Merx a approfondies (Olivier, 20/10) : elle suit la
// fiche partout — Prospection, Pipeline, Clients, et la fiche elle-même.

import { Sparkles } from "lucide-react";

export default function PastilleApprofondie({ le, className = "" }: { le: string | null | undefined; className?: string }) {
  if (!le) return null;
  const date = new Date(le).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  const texte = `Fiche approfondie par Merx le ${date}`;
  return (
    <span
      title={texte}
      aria-label={texte}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-yellow-300 p-1 align-middle text-yellow-900 ${className}`}
    >
      <Sparkles className="size-3" />
    </span>
  );
}
