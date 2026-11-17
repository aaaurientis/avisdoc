// Nom d'un professionnel de santé dans le module Statistiques, selon Admin › Réglages ›
// Statistiques : en clair, flouté, ou réduit à l'initiale du nom de famille.
import { affichageStats, initialeNom } from "../lib/masquage";

export function nomPro(nom: string | null | undefined): string {
  const n = (nom ?? "").trim();
  if (!n) return "";
  return affichageStats().noms === "initiale" ? initialeNom(n) : n;
}

export default function NomPro({ nom, vide = "—" }: { nom: string | null | undefined; vide?: string }) {
  const n = (nom ?? "").trim();
  if (!n) return <>{vide}</>;
  const mode = affichageStats().noms;
  if (mode === "flou") return <span className="select-none blur-[5px]" aria-label="Nom masqué" title="Nom masqué (réglages Statistiques)">{n}</span>;
  return <>{mode === "initiale" ? initialeNom(n) : n}</>;
}
