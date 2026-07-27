// Clients (Qonto) — source de vérité : Qonto. Tous les clients, montant
// facturé par année et montant des devis en cours.
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { devisRepo } from "../espace/devisRepo";
import { euro } from "../lib/format";
import { Card } from "../components/ui";
import { cn } from "@/lib/utils";

interface ClientQonto {
  id: string;
  name: string;
  tax_id: string | null;
  email: string | null;
  facture_par_annee: Record<string, number>;
  devis_en_cours: number;
}

export default function Clients() {
  const [clients, setClients] = useState<ClientQonto[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function charger() {
    setBusy(true); setErr(null);
    try {
      const r = await devisRepo.apercuClients();
      setClients(r?.clients ?? []);
    } catch (e: any) { setErr(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { charger(); }, []);

  // Années présentes dans les factures (ordre décroissant), pour les colonnes.
  const annees = useMemo(() => {
    const s = new Set<string>();
    for (const c of clients ?? []) for (const a of Object.keys(c.facture_par_annee)) if (a !== "?") s.add(a);
    return [...s].sort().reverse();
  }, [clients]);

  const totalAnnee = (a: string) => (clients ?? []).reduce((t, c) => t + (c.facture_par_annee[a] ?? 0), 0);
  const totalDevis = (clients ?? []).reduce((t, c) => t + c.devis_en_cours, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[22px] font-bold text-avisdoc-ink">Clients</h1>
          <p className="text-[12.5px] text-muted-foreground">
            Données Qonto — facturation par année et devis en cours.
          </p>
        </div>
        <button
          type="button"
          onClick={charger}
          disabled={busy}
          className="ad-btn-outline inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-border px-4 py-2 text-[12.5px] font-bold text-avisdoc-ink transition-colors disabled:opacity-40"
        >
          <RefreshCw className={cn("size-3.5", busy && "animate-spin")} /> Actualiser
        </button>
      </div>

      {err && (
        <p className="break-words rounded-xl border border-orange-400/40 bg-orange-50 px-3.5 py-2 text-[12px] text-orange-700">
          Qonto indisponible : {err}
        </p>
      )}

      {/* Totaux */}
      {clients && clients.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {annees.slice(0, 3).map((a) => (
            <Card key={a} className="min-w-[150px] flex-1 p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Facturé {a}</div>
              <div className="mt-1 font-display text-[24px] font-bold text-avisdoc-ink">{euro(Math.round(totalAnnee(a)))}</div>
            </Card>
          ))}
          <Card className="min-w-[150px] flex-1 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Devis en cours</div>
            <div className="mt-1 font-display text-[24px] font-bold text-avisdoc-coral">{euro(Math.round(totalDevis))}</div>
          </Card>
        </div>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-border text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
              <th className="px-5 py-3">Client</th>
              <th className="px-4 py-3">SIREN / SIRET</th>
              {annees.map((a) => (
                <th key={a} className="px-4 py-3 text-right">Facturé {a}</th>
              ))}
              <th className="px-5 py-3 text-right">Devis en cours</th>
            </tr>
          </thead>
          <tbody>
            {(clients ?? []).map((c) => (
              <tr key={c.id} className="border-b border-border/60 last:border-b-0">
                <td className="px-5 py-3">
                  <div className="font-semibold text-avisdoc-ink">{c.name || "—"}</div>
                  {c.email && <div className="text-[11.5px] text-muted-foreground">{c.email}</div>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.tax_id ?? "—"}</td>
                {annees.map((a) => {
                  const v = c.facture_par_annee[a] ?? 0;
                  return (
                    <td key={a} className={cn("px-4 py-3 text-right", v ? "font-semibold text-avisdoc-ink" : "text-muted-foreground/50")}>
                      {v ? euro(Math.round(v)) : "—"}
                    </td>
                  );
                })}
                <td className={cn("px-5 py-3 text-right", c.devis_en_cours ? "font-semibold text-avisdoc-coral" : "text-muted-foreground/50")}>
                  {c.devis_en_cours ? euro(Math.round(c.devis_en_cours)) : "—"}
                </td>
              </tr>
            ))}
            {clients && clients.length === 0 && (
              <tr>
                <td colSpan={3 + annees.length} className="px-5 py-8 text-center text-muted-foreground">
                  Aucun client dans Qonto.
                </td>
              </tr>
            )}
            {!clients && !err && (
              <tr>
                <td colSpan={3 + annees.length} className="px-5 py-8 text-center text-muted-foreground">
                  Chargement des données Qonto…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
