// Veille › CPR — le coût par recherche de Vigile.
//
// Rien n'est estimé : chaque montant est celui que Vigile a mesuré à chaque appel (jetons lus et écrits
// pour Claude, coût rendu par Perplexity), en dollars comme les factures. Trois vues : par jour et par IA,
// par tournée ou rapport, et les recherches Linkup du mois (gratuites sous le plafond).

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, PageHeader, SectionLabel } from "../components/ui";
import { useAuth } from "../auth/AuthContext";
import { lireBudget, lireCpr, momentEnClair, reglerBudget, type Cpr } from "../lib/veille";
import { cn } from "@/lib/utils";

/** Le plafond mensuel des recherches Linkup, le même que celui de la fonction (VEILLE_LINKUP_PAR_MOIS). */
const PLAFOND_LINKUP = 3500;

const POSTES = [
  { cle: "tri", label: "Tri (Sonnet)", detail: "Claude Sonnet lit et range chaque publication trouvée, aux tournées comme au rapport" },
  { cle: "rapport", label: "Synthèse (Opus)", detail: "Claude Opus écrit les points à retenir et les idées de posts du rapport" },
  { cle: "perplexity", label: "Perplexity", detail: "Recherche sur le web pour le rapport" },
  { cle: "questions", label: "Questions (Sonnet)", detail: "Claude Sonnet répond à vos conversations avec Vigile" },
] as const;

const dollars = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const total = (j: Cpr["jours"][number]) => j.tri + j.rapport + j.perplexity + j.questions;
const jourEnClair = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const NATURE: Record<string, string> = { rapport: "Rapport", quotidienne: "Tournée de 7 h", legere: "Tournée légère" };

export default function VeilleCpr() {
  const { isSuperAdmin } = useAuth();
  const [cpr, setCpr] = useState<Cpr | null>(null);
  const [budget, setBudget] = useState<number | null>(null);

  useEffect(() => {
    lireBudget().then((b) => setBudget(b ? Number(b.montant_usd) : null), () => setBudget(null));
    lireCpr(31).then(setCpr, (err) => {
      toast.error(err instanceof Error ? err.message : "Les coûts n'ont pas pu être lus.");
      setCpr({ jours: [], tournees: [], linkup_mois: 0 });
    });
  }, []);

  if (!cpr) {
    return (
      <div className="flex items-center justify-center gap-2 p-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-avisdoc-teal" /> Chargement…
      </div>
    );
  }

  const aujourdhui = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const mois = aujourdhui.slice(0, 7);
  const ilYa30 = new Date(Date.now() - 29 * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const ilYa7 = new Date(Date.now() - 6 * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const somme = (f: (j: Cpr["jours"][number]) => boolean) => cpr.jours.filter(f).reduce((s, j) => s + total(j), 0);
  const duMois = cpr.jours.filter((j) => j.jour.startsWith(mois));
  const parPoste = POSTES.map((p) => ({ ...p, montant: duMois.reduce((s, j) => s + j[p.cle], 0) }));
  // Ce qui a coûté quelque chose, seulement : une tournée à 0 $ n'apprend rien.
  const tournees = cpr.tournees.filter((t) => Number(t.cout) > 0);
  const jours = cpr.jours.filter((j) => total(j) > 0);
  // Un rapport réunit trois postes : sa recherche Perplexity, le tri de ce qu'elle trouve, la synthèse d'Opus.
  const rapportsDuMois = tournees.filter((t) => t.nature === "rapport" && new Date(t.fin).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }).startsWith(mois));
  const coutRapports = rapportsDuMois.reduce((s, t) => s + Number(t.cout), 0);
  const tuiles = [
    { label: "Aujourd'hui", valeur: somme((j) => j.jour === aujourdhui) },
    { label: "7 derniers jours", valeur: somme((j) => j.jour >= ilYa7) },
    { label: "Ce mois-ci", valeur: somme((j) => j.jour.startsWith(mois)) },
    { label: "Moyenne par jour (30 j)", valeur: somme((j) => j.jour >= ilYa30) / 30 },
  ];

  return (
    <div>
      <PageHeader
        title="CPR"
        subtitle="Le coût par recherche de Vigile, en dollars comme les factures : ce que chaque IA a réellement coûté, par jour et par tournée."
      />

      <Budget depense={somme((j) => j.jour.startsWith(mois))} budget={budget} modifiable={isSuperAdmin} onRegle={setBudget} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tuiles.map((t) => (
          <Card key={t.label} className="px-5 py-4">
            <p className="text-[12px] font-bold text-muted-foreground">{t.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold text-avisdoc-ink">{dollars(t.valeur)}</p>
          </Card>
        ))}
      </div>

      <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="px-5 py-4">
          <SectionLabel>Ce mois-ci, par IA</SectionLabel>
          <ul className="mt-2 divide-y divide-border">
            {parPoste.map((p) => (
              <li key={p.cle} className="flex items-baseline gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold text-avisdoc-ink">{p.label}</span>
                  <span className="block text-[12px] text-muted-foreground">{p.detail}</span>
                </span>
                <span className="text-[14px] font-bold tabular-nums text-avisdoc-ink">{dollars(p.montant)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t border-border pt-2 text-[12px] text-muted-foreground">
            Les {rapportsDuMois.length} rapport{rapportsDuMois.length > 1 ? "s" : ""} du mois ont coûté <b className="text-avisdoc-ink">{dollars(coutRapports)}</b> en tout : chacun réunit sa recherche Perplexity, le tri de ce qu'elle trouve (Sonnet) et la synthèse (Opus). Le détail de chaque rapport est dans le tableau « Par tournée et par rapport ».
          </p>
          <p className="mt-2 rounded-xl bg-avisdoc-teal/10 px-3 py-2 text-[12px] text-avisdoc-ink">
            <b>Depuis le 30 octobre, un seul rapport par semaine, le vendredi</b>, au lieu de trois (lundi, mercredi, vendredi). Un rapport coûte environ 1 $ : la dépense des rapports devrait donc être à peu près trois fois moindre, autour de 4 à 5 $ par mois. Le rapport du vendredi couvre toute la semaine, sa recherche Perplexity peut donc coûter un peu plus que celle d'un rapport de deux jours.
          </p>
        </Card>
        <Card className="px-5 py-4">
          <SectionLabel>Recherches Linkup prévues ce mois-ci</SectionLabel>
          <p className="mt-2 font-display text-2xl font-semibold text-avisdoc-ink">
            {cpr.linkup_mois.toLocaleString("fr-FR")} <span className="text-[14px] font-bold text-muted-foreground">/ {PLAFOND_LINKUP.toLocaleString("fr-FR")}</span>
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", cpr.linkup_mois > PLAFOND_LINKUP * 0.85 ? "bg-red-600" : "bg-avisdoc-teal")} style={{ width: `${Math.min(100, (cpr.linkup_mois / PLAFOND_LINKUP) * 100)}%` }} />
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">Presse et web, sites sans flux, réseaux sociaux. Gratuites sous ce plafond, donc 0 $ ; au-delà, la tournée de 7 h s'en passe jusqu'au mois suivant.</p>
        </Card>
      </div>

      <Card className="mb-5 overflow-x-auto">
        <div className="px-5 pt-4"><SectionLabel>Par jour, les 30 derniers jours</SectionLabel></div>
        {!jours.length ? <p className="p-6 text-center text-sm text-muted-foreground">Aucune dépense sur la période.</p> : (
          <table className="mt-2 w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                <th className="px-5 py-2">Jour</th>
                {POSTES.map((p) => <th key={p.cle} className="px-3 py-2 text-right">{p.label}</th>)}
                <th className="px-5 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jours.map((j) => (
                <tr key={j.jour}>
                  <td className="px-5 py-2 font-bold text-avisdoc-ink">{jourEnClair(j.jour)}</td>
                  {POSTES.map((p) => <td key={p.cle} className="px-3 py-2 text-right tabular-nums text-muted-foreground">{j[p.cle] ? dollars(j[p.cle]) : "—"}</td>)}
                  <td className="px-5 py-2 text-right font-bold tabular-nums text-avisdoc-ink">{dollars(total(j))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="overflow-x-auto">
        <div className="px-5 pt-4"><SectionLabel>Par tournée et par rapport</SectionLabel></div>
        {!tournees.length ? <p className="p-6 text-center text-sm text-muted-foreground">Aucune dépense sur la période.</p> : (
          <table className="mt-2 w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                <th className="px-5 py-2">Quand</th>
                <th className="px-3 py-2">Quoi</th>
                <th className="px-3 py-2 text-right">Trouvées</th>
                <th className="px-3 py-2 text-right">Gardées</th>
                <th className="px-3 py-2 text-right">Coût</th>
                <th className="px-5 py-2 text-right">Par publication gardée</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tournees.map((t) => (
                <tr key={t.id}>
                  <td className="px-5 py-2 text-avisdoc-ink">{momentEnClair(t.fin)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{NATURE[t.nature] ?? t.nature}{["envoye", "termine"].includes(t.statut) ? "" : t.statut === "echec" ? " · en échec" : " · en cours"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{t.trouves}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{t.gardes}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-avisdoc-ink">{dollars(Number(t.cout))}</td>
                  <td className="px-5 py-2 text-right tabular-nums text-muted-foreground">{t.gardes ? dollars(Number(t.cout) / t.gardes) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/** Le budget du mois : la barre de ce qui est dépensé, et le curseur (administrateurs) pour fixer le montant. */
function Budget({ depense, budget, modifiable, onRegle }: { depense: number; budget: number | null; modifiable: boolean; onRegle: (n: number) => void }) {
  const [choix, setChoix] = useState<number | null>(null);
  const [envoi, setEnvoi] = useState(false);
  if (budget === null) return null;
  const vise = choix ?? budget;
  const part = vise > 0 ? depense / vise : 0;
  const enregistrer = async () => {
    if (choix === null || envoi) return;
    setEnvoi(true);
    try {
      await reglerBudget(choix);
      onRegle(choix);
      setChoix(null);
      toast.success(choix ? `Budget du mois : ${dollars(choix)}. Vous serez prévenu par mail à 80 % puis à 100 %.` : "Budget retiré : plus d'alerte de dépense.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Le budget n'a pas pu être enregistré.");
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <Card className="mb-5 px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <SectionLabel>Budget du mois</SectionLabel>
        <span className="font-display text-xl font-semibold text-avisdoc-ink">{dollars(depense)}</span>
        <span className="text-[13px] font-bold text-muted-foreground">{vise > 0 ? `sur ${dollars(vise)} · ${Math.round(part * 100)} %` : "aucun budget fixé"}</span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", part >= 1 ? "bg-red-600" : part >= 0.8 ? "bg-avisdoc-orange" : "bg-avisdoc-teal")}
          style={{ width: `${Math.min(100, part * 100)}%` }}
        />
      </div>
      {modifiable ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="range"
            min={0}
            max={500}
            step={5}
            value={vise}
            onChange={(e) => setChoix(Number(e.target.value))}
            aria-label="Budget du mois en dollars"
            className="min-w-0 flex-1 accent-avisdoc-teal"
          />
          <span className="w-20 text-right text-[14px] font-bold tabular-nums text-avisdoc-ink">{dollars(vise)}</span>
          <button
            type="button"
            onClick={enregistrer}
            disabled={choix === null || choix === budget || envoi}
            className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-4 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
          >
            {envoi && <Loader2 className="size-3.5 animate-spin" />} Enregistrer
          </button>
        </div>
      ) : null}
      <p className="mt-2 text-[12px] text-muted-foreground">
        Un mail prévient à 80 % puis à 100 % du budget. Vigile continue normalement : rien n'est coupé.{modifiable ? " Faites glisser le curseur (0 à 500 $), puis Enregistrer ; 0 $ retire le budget." : " Seul un administrateur règle le montant."}
      </p>
    </Card>
  );
}
