// Clients (Qonto) — source de vérité : Qonto. Tableau triable et filtrable :
// montant facturé par année (FY ou YTD), devis en cours, évolution N vs N-1,
// et détail dépliable (factures + devis) par client.
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { devisRepo } from "../espace/devisRepo";
import { euro, frDate } from "../lib/format";
import { Card } from "../components/ui";
import { cn } from "@/lib/utils";

interface Ligne {
  id: string;
  numero: string | null;
  date: string | null;
  statut: string;
  montant: number;
}
interface ClientQonto {
  id: string;
  name: string;
  tax_id: string | null;
  email: string | null;
  ville: string | null;
  factures: Ligne[];
  devis: Ligne[];
}

// Facture comptée dans le CA : ni brouillon ni annulée.
const factureComptee = (l: Ligne) => !["draft", "canceled", "cancelled"].includes(l.statut);
// Devis « en cours » : en attente d'issue.
const devisEnCours = (l: Ligne) =>
  !["canceled", "cancelled", "declined", "expired", "invoiced", "converted"].includes(l.statut);

const STATUT_FACTURE: Record<string, { label: string; cls: string }> = {
  paid: { label: "Payée", cls: "bg-emerald-100 text-emerald-700" },
  unpaid: { label: "À encaisser", cls: "bg-amber-100 text-amber-700" },
  overdue: { label: "En retard", cls: "bg-rose-100 text-rose-700" },
  draft: { label: "Brouillon", cls: "bg-muted text-muted-foreground" },
  canceled: { label: "Annulée", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "Annulée", cls: "bg-muted text-muted-foreground" },
};
const STATUT_DEVIS: Record<string, { label: string; cls: string }> = {
  pending_approval: { label: "En attente", cls: "bg-amber-100 text-amber-700" },
  draft: { label: "Brouillon", cls: "bg-muted text-muted-foreground" },
  approved: { label: "Accepté", cls: "bg-avisdoc-teal/15 text-avisdoc-teal" },
  declined: { label: "Refusé", cls: "bg-rose-100 text-rose-700" },
  expired: { label: "Expiré", cls: "bg-muted text-muted-foreground" },
  canceled: { label: "Annulé", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "Annulé", cls: "bg-muted text-muted-foreground" },
  invoiced: { label: "Facturé", cls: "bg-sky-100 text-sky-700" },
  converted: { label: "Facturé", cls: "bg-sky-100 text-sky-700" },
};
const badge = (map: Record<string, { label: string; cls: string }>, st: string) =>
  map[st] ?? { label: st || "—", cls: "bg-muted text-muted-foreground" };

type Mode = "FY" | "YTD";
type TriCle = "name" | "devis" | `annee:${string}`;

export default function Clients() {
  const [clients, setClients] = useState<ClientQonto[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("FY");
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<"tous" | "devis" | "factures" | "inactifs">("tous");
  const [tri, setTri] = useState<{ cle: TriCle; desc: boolean }>({ cle: "name", desc: false });
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());

  async function charger() {
    setBusy(true); setErr(null);
    try {
      const r = await devisRepo.apercuClients();
      setClients(r?.clients ?? []);
    } catch (e: any) { setErr(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { charger(); }, []);

  // Borne YTD : jour/mois du jour, appliqué à chaque année (ex. 27/07).
  const jourMois = new Date().toISOString().slice(4, 10); // "-MM-DD"

  // Montant facturé d'un client pour une année, selon le mode FY / YTD.
  const facture = (c: ClientQonto, annee: string): number =>
    c.factures.reduce((t, f) => {
      if (!factureComptee(f) || !f.date || !f.date.startsWith(annee)) return t;
      if (mode === "YTD" && f.date.slice(4, 10) > jourMois) return t;
      return t + f.montant;
    }, 0);

  const devisTotal = (c: ClientQonto): number =>
    c.devis.reduce((t, d) => (devisEnCours(d) ? t + d.montant : t), 0);

  // Années présentes dans les factures comptées (ordre décroissant).
  const annees = useMemo(() => {
    const s = new Set<string>();
    for (const c of clients ?? [])
      for (const f of c.factures)
        if (factureComptee(f) && f.date) s.add(f.date.slice(0, 4));
    return [...s].sort().reverse();
  }, [clients]);
  const anneeN = annees[0]; // plus récente
  const anneeN1 = annees[1]; // précédente

  // Filtres + tri.
  const lignes = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    let out = (clients ?? []).filter((c) => {
      if (q && !`${c.name} ${c.tax_id ?? ""} ${c.email ?? ""}`.toLowerCase().includes(q)) return false;
      const factN = anneeN ? facture(c, anneeN) : 0;
      const dev = devisTotal(c);
      if (filtre === "devis") return dev > 0;
      if (filtre === "factures") return factN > 0;
      if (filtre === "inactifs") return factN === 0 && dev === 0;
      return true;
    });
    const val = (c: ClientQonto): number | string =>
      tri.cle === "name" ? (c.name ?? "").toLowerCase()
        : tri.cle === "devis" ? devisTotal(c)
          : facture(c, tri.cle.slice(6));
    out = out.sort((a, b) => {
      const va = val(a), vb = val(b);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string, "fr") : (va as number) - (vb as number);
      return tri.desc ? -cmp : cmp;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, recherche, filtre, tri, mode, anneeN]);

  const totalAnnee = (a: string) => lignes.reduce((t, c) => t + facture(c, a), 0);
  const totalDevis = lignes.reduce((t, c) => t + devisTotal(c), 0);

  // Évolution N vs N-1 (selon le mode) — pour les cartes du haut.
  const evolution = useMemo(() => {
    if (!anneeN || !anneeN1) return null;
    const n = totalAnnee(anneeN), n1 = totalAnnee(anneeN1);
    if (!n1) return null;
    return ((n - n1) / n1) * 100;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lignes, mode, anneeN, anneeN1]);

  const basculer = (cle: TriCle) =>
    setTri((t) => (t.cle === cle ? { cle, desc: !t.desc } : { cle, desc: cle !== "name" }));

  const deplier = (id: string) =>
    setOuverts((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const Th = ({ cle, children, right }: { cle: TriCle; children: React.ReactNode; right?: boolean }) => (
    <th className={cn("px-4 py-3", right && "text-right")}>
      <button type="button" onClick={() => basculer(cle)}
        className={cn("inline-flex items-center gap-1 uppercase tracking-[0.05em] transition-colors hover:text-avisdoc-ink", right && "flex-row-reverse")}>
        {children}
        {tri.cle === cle && (tri.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </th>
  );

  const filtres: { key: typeof filtre; label: string }[] = [
    { key: "tous", label: "Tous" },
    { key: "devis", label: "Devis en cours" },
    { key: "factures", label: anneeN ? `Facturés ${anneeN}` : "Facturés" },
    { key: "inactifs", label: "Inactifs" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-bold text-avisdoc-ink">Clients</h1>
          <p className="text-[12.5px] text-muted-foreground">
            Données Qonto — facturation par année et devis en cours.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Bascule FY / YTD */}
          <div className="flex overflow-hidden rounded-full border border-border">
            {(["FY", "YTD"] as Mode[]).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                title={m === "FY" ? "Année complète" : `Cumul au ${frDate(new Date().toISOString().slice(0, 10))} de chaque année`}
                className={cn(
                  "px-3.5 py-2 text-[12px] font-bold transition-colors",
                  mode === m ? "bg-avisdoc-ink text-white" : "bg-card text-muted-foreground hover:text-avisdoc-ink",
                )}>
                {m}
              </button>
            ))}
          </div>
          <button type="button" onClick={charger} disabled={busy}
            className="ad-btn-outline inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-border px-4 py-2 text-[12.5px] font-bold text-avisdoc-ink transition-colors disabled:opacity-40">
            <RefreshCw className={cn("size-3.5", busy && "animate-spin")} /> Actualiser
          </button>
        </div>
      </div>

      {err && (
        <p className="break-words rounded-xl border border-orange-400/40 bg-orange-50 px-3.5 py-2 text-[12px] text-orange-700">
          Qonto indisponible : {err}
        </p>
      )}

      {/* Totaux (sur la sélection filtrée) */}
      {clients && clients.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {annees.slice(0, 2).map((a) => (
            <Card key={a} className="min-w-[170px] flex-1 p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                Facturé {a}{mode === "YTD" ? " · YTD" : ""}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-[24px] font-bold text-avisdoc-ink">{euro(Math.round(totalAnnee(a)))}</span>
                {a === anneeN && evolution != null && (
                  <span className={cn(
                    "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold",
                    evolution >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700",
                  )}>
                    {evolution >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                    {evolution >= 0 ? "+" : ""}{evolution.toFixed(0)} % vs {anneeN1}
                  </span>
                )}
              </div>
            </Card>
          ))}
          <Card className="min-w-[170px] flex-1 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Devis en cours</div>
            <div className="mt-1 font-display text-[24px] font-bold text-avisdoc-coral">{euro(Math.round(totalDevis))}</div>
          </Card>
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="ad-input w-full max-w-[280px] rounded-full border border-border bg-card px-4 py-2 text-[13px] outline-none transition-colors focus:border-avisdoc-teal"
          placeholder="Rechercher (nom, SIREN, e-mail)…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        {filtres.map((f) => (
          <button key={f.key} type="button" onClick={() => setFiltre(f.key)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[12px] font-bold transition-colors",
              filtre === f.key
                ? "border-transparent bg-avisdoc-ink text-white"
                : "border-border bg-card text-muted-foreground hover:border-avisdoc-ink",
            )}>
            {f.label}
          </button>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-border text-[11px] font-bold text-muted-foreground">
              <th className="w-8 px-3 py-3" />
              <Th cle="name">Client</Th>
              {annees.map((a) => (
                <Th key={a} cle={`annee:${a}`} right>Facturé {a}{mode === "YTD" ? " · YTD" : ""}</Th>
              ))}
              <Th cle="devis" right>Devis en cours</Th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((c) => {
              const ouvert = ouverts.has(c.id);
              const dev = devisTotal(c);
              return (
                <FragmentRow key={c.id}>
                  <tr
                    className={cn("cursor-pointer border-b border-border/60 transition-colors hover:bg-sky-50/50", ouvert && "bg-sky-50/40")}
                    onClick={() => deplier(c.id)}
                  >
                    <td className="px-3 py-3">
                      <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", ouvert && "rotate-180")} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-avisdoc-ink">{c.name || "—"}</div>
                      <div className="text-[11.5px] text-muted-foreground">
                        {[c.tax_id, c.ville].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </td>
                    {annees.map((a) => {
                      const v = facture(c, a);
                      return (
                        <td key={a} className={cn("px-4 py-3 text-right", v ? "font-semibold text-avisdoc-ink" : "text-muted-foreground/50")}>
                          {v ? euro(Math.round(v)) : "—"}
                        </td>
                      );
                    })}
                    <td className={cn("px-4 py-3 text-right", dev ? "font-semibold text-avisdoc-coral" : "text-muted-foreground/50")}>
                      {dev ? euro(Math.round(dev)) : "—"}
                    </td>
                  </tr>

                  {/* Détail déplié : factures + devis */}
                  {ouvert && (
                    <tr className="border-b border-border/60 bg-muted/20">
                      <td />
                      <td colSpan={annees.length + 2} className="px-4 pb-4 pt-1">
                        <div className="grid gap-4 md:grid-cols-2">
                          <Detail titre={`Factures (${c.factures.length})`} lignes={c.factures} map={STATUT_FACTURE} vide="Aucune facture." />
                          <Detail titre={`Devis (${c.devis.length})`} lignes={c.devis} map={STATUT_DEVIS} vide="Aucun devis." />
                        </div>
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              );
            })}
            {clients && lignes.length === 0 && (
              <tr>
                <td colSpan={annees.length + 3} className="px-5 py-8 text-center text-muted-foreground">
                  {clients.length === 0 ? "Aucun client dans Qonto." : "Aucun client ne correspond aux filtres."}
                </td>
              </tr>
            )}
            {!clients && !err && (
              <tr>
                <td colSpan={annees.length + 3} className="px-5 py-8 text-center text-muted-foreground">
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

// React exige un unique parent par élément de liste ; <tbody> n'accepte que des
// <tr>, on passe donc par un Fragment nommé (deux <tr> par client).
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Detail({
  titre, lignes, map, vide,
}: {
  titre: string;
  lignes: Ligne[];
  map: Record<string, { label: string; cls: string }>;
  vide: string;
}) {
  const triees = [...lignes].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">{titre}</div>
      {triees.length === 0 && <p className="text-[12.5px] italic text-muted-foreground">{vide}</p>}
      <div className="flex flex-col">
        {triees.map((l) => {
          const b = badge(map, l.statut);
          return (
            <div key={l.id} className="flex items-center gap-2.5 border-b border-border/50 py-2 text-[12.5px] last:border-b-0">
              <span className="min-w-0 flex-1 truncate font-semibold text-avisdoc-ink">{l.numero ?? "—"}</span>
              <span className="shrink-0 text-muted-foreground">{l.date ? frDate(l.date) : "—"}</span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold", b.cls)}>{b.label}</span>
              <span className="w-[84px] shrink-0 text-right font-semibold text-avisdoc-ink">{euro(Math.round(l.montant))}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
