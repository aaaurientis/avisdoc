// CRM Synthèse › Vue d'ensemble : le CRM qui fait la synthèse des quatre autres (Olivier, 09/11).
// Le groupe a les mêmes entrées que chaque CRM, tous marchés ensemble ; cette page compte les affaires.
// Les fiches n'ont pas encore de marché : les chiffres valent pour les quatre CRM ensemble, et la page le dit.
// Pas d'euros tant que les montants ne sont pas saisis, ni de « à signer ce mois-ci » sans date de signature prévue.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, PageHeader, SectionLabel } from "../components/ui";
import { useAdminData } from "../data/AdminDataContext";
import { supabaseAdmin } from "../data/supabaseAdmin";

const nu = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function CrmSynthese() {
  const { clients } = useAdminData();
  const [prospects, setProspects] = useState<number | null>(null);

  useEffect(() => {
    supabaseAdmin.from("admin_prospects").select("id", { count: "exact", head: true }).is("deleted_at", null).is("converted_client_id", null)
      .then(({ count, error }) => setProspects(error ? null : count ?? 0));
  }, []);

  // Chaque affaire comptée une fois, selon l'étape où elle est dans son propre pipeline.
  const { enCours, signees, perdues, parEtape } = useMemo(() => {
    let enCours = 0, signees = 0, perdues = 0;
    const parEtape = new Map<string, number>();
    for (const c of clients) {
      // Même règle que le passage au fichier client (etapeQuiSigne), pour toutes les colonnes qui la vérifient.
      if (/^(signe|gagne|client)/.test(nu(c.stage ?? ""))) signees++;
      else if (/^perdu/.test(nu(c.stage ?? ""))) perdues++;
      else {
        enCours++;
        parEtape.set(c.stage || "Sans étape", (parEtape.get(c.stage || "Sans étape") ?? 0) + 1);
      }
    }
    return { enCours, signees, perdues, parEtape: [...parEtape].sort((a, b) => b[1] - a[1]) };
  }, [clients]);

  const Chiffre = ({ titre, n, sous, vers }: { titre: string; n: number | string; sous: string; vers: string }) => (
    <Link to={vers} className="rounded-2xl border border-border bg-card p-5 hover:border-avisdoc-ink">
      <p className="text-[13px] font-semibold text-muted-foreground">{titre}</p>
      <p className="mt-1 font-display text-3xl font-semibold text-avisdoc-ink">{n}</p>
      <p className="text-[12px] text-muted-foreground">{sous}</p>
    </Link>
  );

  return (
    <div>
      <PageHeader title="CRM Synthèse · Vue d'ensemble" subtitle="La synthèse des quatre CRM : où en sont les affaires et la prospection." />

      <SectionLabel>Les affaires</SectionLabel>
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <Chiffre titre="En cours" n={enCours} sous="affaires au Pipeline" vers="/crm?crm=synthese" />
        <Chiffre titre="Signées" n={signees} sous="affaires signées" vers="/crm?crm=synthese" />
        <Chiffre titre="Perdues" n={perdues} sous="affaires perdues" vers="/crm?crm=synthese" />
      </div>
      {parEtape.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <p className="border-b border-border px-5 py-2.5 text-[12px] font-bold text-muted-foreground">Les affaires en cours, par étape</p>
          <ul className="divide-y divide-border text-sm">
            {parEtape.map(([etape, n]) => (
              <li key={etape} className="flex items-center justify-between px-5 py-2.5">
                <span className="font-semibold text-avisdoc-ink">{etape}</span>
                <span className="tabular-nums text-avisdoc-ink">{n}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <SectionLabel>La prospection</SectionLabel>
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <Chiffre titre="Prospects" n={prospects ?? "—"} sous="fiches pas encore passées au Pipeline" vers="/prospects?crm=synthese" />
      </div>

      <p className="mt-4 text-[12px] text-muted-foreground">
        Les fiches ne sont pas encore rangées par CRM : ces chiffres valent pour les quatre ensemble. Les montants en euros viendront quand ils seront saisis sur les affaires.
      </p>
    </div>
  );
}
