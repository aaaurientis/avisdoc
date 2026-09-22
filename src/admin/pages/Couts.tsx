// Coûts — ce que Merx dépense, demande par demande.
// Rien n'est estimé : chaque ligne vient de la consommation réellement mesurée par la fonction
// (jetons d'entrée, jetons de sortie, recherches web), multipliée par les tarifs relevés.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { supabaseAdmin } from "../data/supabaseAdmin";
import { Card, PageHeader, SectionLabel } from "../components/ui";
import { coutDe, euroDollar, MODELE_PAR_DEFAUT, TARIFS_MODELE, TARIF_RECHERCHE_WEB, type Consommation } from "../lib/couts";

interface Demande {
  id: string;
  kind: "recherche" | "approfondissement" | "email";
  request: string;
  requested_by: string;
  status: string;
  found_count: number | null;
  usage: Consommation | null;
  /** Le modèle qui a travaillé ; absent pour les demandes d'avant le 22/09/2026. */
  model: string | null;
  created_at: string;
  finished_at: string | null;
}

function messageErreur(brut: string): string {
  // Uniquement la table absente : une colonne manquante est un vrai défaut, qu'il faut voir.
  return /Could not find the table .* in the schema cache/i.test(brut)
    ? "Cet écran attend sa migration : le SQL n’a pas encore été exécuté sur la base."
    : brut;
}

const quand = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const duree = (d: Demande) => {
  if (!d.finished_at) return "—";
  const s = Math.round((new Date(d.finished_at).getTime() - new Date(d.created_at).getTime()) / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
};

function Chiffre({ titre, valeur, precision }: { titre: string; valeur: string; precision?: string }) {
  return (
    <Card className="p-4">
      <SectionLabel>{titre}</SectionLabel>
      <div className="mt-1 font-display text-2xl font-semibold text-avisdoc-ink">{valeur}</div>
      {precision && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{precision}</div>}
    </Card>
  );
}

export default function Couts() {
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setErreur(null);
    const { data, error } = await supabaseAdmin
      .from("admin_merx_demandes")
      .select("id, kind, request, requested_by, status, found_count, usage, model, created_at, finished_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) setErreur(messageErreur(error.message));
    else setDemandes((data ?? []) as Demande[]);
    setChargement(false);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const bilan = useMemo(() => {
    const debutDuMois = new Date();
    debutDuMois.setDate(1);
    debutDuMois.setHours(0, 0, 0, 0);

    let total = 0;
    let mois = 0;
    let recherches = 0;
    let coutRecherches = 0;
    let approfondissements = 0;
    let coutApprofondissements = 0;
    let fiches = 0;

    for (const d of demandes) {
      const c = coutDe(d.usage, d.model ?? undefined).total;
      total += c;
      if (new Date(d.created_at) >= debutDuMois) mois += c;
      if (d.kind === "recherche") {
        recherches++;
        coutRecherches += c;
        fiches += d.found_count ?? 0;
      } else {
        approfondissements++;
        coutApprofondissements += c;
      }
    }
    return {
      total,
      mois,
      recherches,
      approfondissements,
      fiches,
      moyenneRecherche: recherches ? coutRecherches / recherches : 0,
      moyenneApprofondissement: approfondissements ? coutApprofondissements / approfondissements : 0,
      parFiche: fiches ? coutRecherches / fiches : 0,
    };
  }, [demandes]);

  const tarif = TARIFS_MODELE[MODELE_PAR_DEFAUT];

  return (
    <div>
      <PageHeader
        title="Coûts"
        subtitle="Ce que Merx a réellement consommé, demande par demande"
        action={
          <button
            type="button"
            onClick={() => void charger()}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal"
          >
            <RefreshCw className="size-4" /> Actualiser
          </button>
        }
      />

      {erreur && <div className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">{erreur}</div>}

      {chargement ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Chargement…
        </div>
      ) : (
        <>
          {/* Les chiffres qui comptent */}
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Chiffre titre="Ce mois-ci" valeur={euroDollar(bilan.mois)} precision="depuis le 1er du mois" />
            <Chiffre titre="Depuis le début" valeur={euroDollar(bilan.total)} precision={`${demandes.length} demande${demandes.length > 1 ? "s" : ""}`} />
            <Chiffre
              titre="Une recherche"
              valeur={euroDollar(bilan.moyenneRecherche)}
              precision={bilan.recherches ? `moyenne sur ${bilan.recherches} recherche${bilan.recherches > 1 ? "s" : ""}` : "aucune recherche"}
            />
            <Chiffre
              titre="Un prospect trouvé"
              valeur={euroDollar(bilan.parFiche)}
              precision={bilan.fiches ? `${bilan.fiches} fiche${bilan.fiches > 1 ? "s" : ""} trouvées` : "aucune fiche"}
            />
          </div>

          {/* Les tarifs, en clair */}
          <Card className="mb-4 p-4">
            <SectionLabel>Les tarifs appliqués</SectionLabel>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              Modèle <span className="font-semibold text-avisdoc-ink">{MODELE_PAR_DEFAUT}</span> :{" "}
              <span className="font-semibold text-avisdoc-ink">{tarif.entree} $</span> par million de jetons lus,{" "}
              <span className="font-semibold text-avisdoc-ink">{tarif.sortie} $</span> par million de jetons écrits.
              Recherche web : <span className="font-semibold text-avisdoc-ink">{(TARIF_RECHERCHE_WEB * 1000).toFixed(0)} $ pour 1 000 recherches</span>,
              en plus des jetons — une recherche en erreur n’est pas facturée.
              L’annuaire des entreprises de l’État, lui, est gratuit : il ne coûte rien, quel que soit le nombre d’appels.
            </p>
            <p className="mt-2 text-[11.5px] text-muted-foreground/80">
              Tarifs relevés le 22/09/2026 sur la documentation d’Anthropic. Les coûts sont recalculés à chaque
              affichage : si un tarif change, corrigez-le dans <code className="font-mono">src/admin/lib/couts.ts</code>.
            </p>
          </Card>

          {/* Le détail */}
          {demandes.length === 0 ? (
            <div className="rounded-2xl bg-muted/60 p-8 text-center">
              <SectionLabel>Aucune demande</SectionLabel>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                Dès que Merx cherchera, chaque demande apparaîtra ici avec ce qu’elle a coûté.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-border bg-card">
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                    <th className="px-4 py-2.5 text-left">Quand</th>
                    <th className="px-4 py-2.5 text-left">Demande</th>
                    <th className="px-4 py-2.5 text-right">Durée</th>
                    <th className="px-4 py-2.5 text-right">Jetons lus</th>
                    <th className="px-4 py-2.5 text-right">Jetons écrits</th>
                    <th className="px-4 py-2.5 text-right">Recherches</th>
                    <th className="px-4 py-2.5 text-right">Coût</th>
                  </tr>
                </thead>
                <tbody>
                  {demandes.map((d) => {
                    const c = coutDe(d.usage, d.model ?? undefined);
                    return (
                      <tr key={d.id} className="border-b border-border text-[13px] last:border-0 hover:bg-muted/30">
                        <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{quand(d.created_at)}</td>
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-avisdoc-ink">{d.request}</div>
                          <div className="text-[11.5px] text-muted-foreground">
                            {d.kind === "recherche" ? "Recherche" : "Approfondissement"}
                            {d.found_count != null && d.kind === "recherche" && ` · ${d.found_count} trouvée${d.found_count > 1 ? "s" : ""}`}
                            {d.status === "echec" && " · échec"}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right text-muted-foreground">{duree(d)}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">
                          {(d.usage?.inputTokens ?? 0).toLocaleString("fr-FR")}
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">
                          {(d.usage?.outputTokens ?? 0).toLocaleString("fr-FR")}
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{d.usage?.webSearches ?? 0}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right font-bold text-avisdoc-ink">
                          {euroDollar(c.total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
