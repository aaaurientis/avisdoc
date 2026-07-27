// Tag compact de statut Qonto, affiché dans l'en-tête de la fiche client.
// Lié / à associer / à créer. N'affiche rien si Qonto n'est pas configuré.
import { useEffect, useState } from "react";
import { devisRepo } from "./devisRepo";

export default function QontoTag({ clientId }: { clientId: string }) {
  const [s, setS] = useState<{ lie: boolean; trouve?: unknown } | null>(null);

  useEffect(() => {
    let actif = true;
    devisRepo.statutClient(clientId)
      .then((r) => { if (actif) setS(r); })
      .catch(() => { if (actif) setS(null); }); // Qonto non configuré → pas de tag
    return () => { actif = false; };
  }, [clientId]);

  if (!s) return null;
  const base = "rounded-full px-2.5 py-0.5 text-[11px] font-medium";
  if (s.lie) return <span className={`${base} bg-avisdoc-teal/15 text-avisdoc-teal`}>Qonto ✓</span>;
  if (s.trouve) return <span className={`${base} bg-amber-100 text-amber-700`}>Qonto : à associer</span>;
  return <span className={`${base} bg-muted text-muted-foreground`}>Qonto : à créer</span>;
}
