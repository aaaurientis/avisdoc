// Ce qu'il s'est passé lors d'une journée : les avis rendus, les délais, et ce qu'ils recommandent
// (en agrégé seulement, et seulement au-delà de 20 dossiers : règle de l'AIPD). La liste des dossiers
// ne montre jamais de résultat individuel.
// Affiché dans le détail d'une journée (Calendrier). Lien vers le rapport client au-delà de 20 avis.
import { useMemo } from "react";
import { FileText, Loader2 } from "lucide-react";
import { useExpertisesStats } from "../../data/journeesStore";
import { cleJournee, issueDe, rapportPossible, resultatsVisibles, resumer, SEUIL_AIPD, SEUIL_RAPPORT, type Expertise } from "../../lib/expertises";
import type { JourneeDepistage } from "../../lib/journees";
import NomPro from "../../components/NomPro";
import { pourResultats } from "../../lib/masquage";

// (Pas d'import depuis ./commun : commun affiche ce composant, on évite la boucle d'imports.)
const nombre = (n: number) => n.toLocaleString("fr-FR");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Les expertises d'une journée (vide tant qu'elles ne sont pas chargées). */
export function useAvisDeLaJournee(j: JourneeDepistage): { avis: Expertise[]; pret: boolean } {
  const { index, statut } = useExpertisesStats();
  return { avis: index.get(cleJournee(j)) ?? [], pret: statut === "pret" };
}

/** Adresse du rapport client : un contrat (client + devis) ou une seule journée. Ouvert dans un nouvel onglet. */
/** `devis: null` : tous les contrats du client. */
export function ouvrirRapport(portee: { client: string; devis: string | null } | { journee: JourneeDepistage }) {
  const p = new URLSearchParams();
  if ("journee" in portee) p.set("journee", cleJournee(portee.journee));
  else {
    p.set("client", portee.client);
    if (portee.devis === null) p.set("tous_devis", "1");
    else p.set("devis", portee.devis);
  }
  window.open(`${window.location.pathname}#/journees/rapport?${p}`, "_blank", "noopener");
}

export function BoutonRapport({ nbAvis, onClick, libelle = "Rapport client" }: { nbAvis: number; onClick: () => void; libelle?: string }) {
  const possible = rapportPossible(nbAvis);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!possible}
      title={possible ? "Rapport aux couleurs AvisDoc, à imprimer ou enregistrer en PDF" : `Il faut plus de ${SEUIL_RAPPORT} expertises (ici ${nbAvis}) : en dessous, les chiffres pourraient désigner des personnes.`}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[12.5px] font-semibold text-avisdoc-ink transition-colors hover:border-avisdoc-ink disabled:cursor-not-allowed disabled:opacity-45"
    >
      <FileText className="size-3.5" /> {libelle}
    </button>
  );
}

const heure = (envoi: string) => envoi.slice(11, 16) || "—";

export default function ExpertisesJournee({ j }: { j: JourneeDepistage }) {
  const { avis, pret } = useAvisDeLaJournee(j);
  const r = useMemo(() => resumer(avis), [avis]);

  if (!pret)
    return (
      <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Lecture des expertises…
      </p>
    );
  if (!avis.length) return <p className="text-[12.5px] text-muted-foreground">Aucun avis rattaché à cette journée dans l'extraction des expertises.</p>;

  const n = { non: 0, consult: 0, exerese: 0 };
  const avisResultats = pourResultats(avis); // requis masqués (Admin) retirés des résultats
  for (const e of avisResultats) {
    const i = issueDe(e);
    if (i === "non-indispensable") n.non++;
    else if (i === "consultation") n.consult++;
    else if (i === "exerese") n.exerese++;
  }
  const renseignes = n.non + n.consult + n.exerese;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12.5px]">
          <Chiffre label="Avis rendus" valeur={nombre(r.total)} />
          {resultatsVisibles(avisResultats.length) ? (
            <>
              <Chiffre label="Non indispensable" valeur={`${n.non} · ${pct(n.non, renseignes)} %`} />
              <Chiffre label="Consultation conseillée" valeur={`${n.consult} · ${pct(n.consult, renseignes)} %`} />
              <Chiffre label="Exérèse indispensable" valeur={`${n.exerese} · ${pct(n.exerese, renseignes)} %`} />
              <Chiffre label="Urgents" valeur={String(r.urgentes)} />
            </>
          ) : (
            <Chiffre label="Résultats" valeur={`masqués (${SEUIL_AIPD} dossiers ou moins, AIPD)`} />
          )}
          {r.delais.mediane !== null && <Chiffre label="Délai médian" valeur={`${Math.round(r.delais.mediane)} h`} />}
          <Chiffre label="Requis" valeur={r.requis.map((p) => `${p.cle} (${p.nombre})`).join(", ")} />
        </div>
        <BoutonRapport nbAvis={r.total} onClick={() => ouvrirRapport({ journee: j })} libelle="Rapport de la journée" />
      </div>
      <div className="max-h-64 overflow-auto rounded-xl border border-border">
        <table className="w-full text-left text-[12px]">
          <thead className="sticky top-0 bg-card">
            <tr className="text-muted-foreground">
              <th className="px-3 py-1.5 font-semibold">Dossier</th>
              <th className="px-3 py-1.5 font-semibold">Envoi</th>
              <th className="px-3 py-1.5 font-semibold">Requis</th>
              <th className="px-3 py-1.5 text-right font-semibold">Délai de traitement</th>
            </tr>
          </thead>
          <tbody>
            {[...avis]
              .sort((a, b) => a.envoi.localeCompare(b.envoi))
              .map((e) => (
                <tr key={e.id} className="border-t border-border text-avisdoc-ink">
                  <td className="px-3 py-1.5 text-muted-foreground">{e.id}</td>
                  <td className="px-3 py-1.5">{heure(e.envoi)}</td>
                  <td className="px-3 py-1.5"><NomPro nom={e.requis} /></td>
                  <td className="px-3 py-1.5 text-right">{e.delaiH !== null ? `${e.delaiH} h` : "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Chiffre({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">{label}</div>
      <div className="font-semibold text-avisdoc-ink">{valeur}</div>
    </div>
  );
}
