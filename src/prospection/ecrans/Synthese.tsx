// Synthèses : hebdomadaire (générée le lundi, ou à la demande), cumul comparé à
// la référence de campagne, vue par cercle, export CSV.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";
import { genererSynthese, listerSyntheses, vueParCercle } from "../data/repo";
import { ORDRE_STATUTS } from "../domaine/machineEtats";
import { pr80ComparerReference, pr81ExporterCsv, pr82CumulerSyntheses, pr83MatriceParCercle, REFERENCE_CAMPAGNE } from "../domaine/synthese";
import { L } from "../i18n/libelles";
import { dateFr } from "../lib/format";
import { telecharger } from "../lib/navigateur";
import { Bouton, Carte, Chargement, EnTete, Erreur, Etiquette, Tableau, Vide } from "../composants/ui";
import { cn } from "@/lib/utils";

export default function Synthese() {
  const qc = useQueryClient();
  const syntheses = useQuery({ queryKey: ["syntheses"], queryFn: listerSyntheses });
  const cercles = useQuery({ queryKey: ["cercles"], queryFn: vueParCercle });
  const generer = useMutation({
    mutationFn: () => genererSynthese(),
    onSuccess: () => { toast.success(L.synthese.generee); void qc.invalidateQueries({ queryKey: ["syntheses"] }); },
  });

  const liste = syntheses.data ?? [];
  const cumul = pr82CumulerSyntheses(liste);
  const matrice = pr83MatriceParCercle(cercles.data ?? []);
  const colonnes = [L.synthese.semaine, L.synthese.invitations, L.synthese.acceptations, L.synthese.taux, L.synthese.conversations, L.synthese.partenariats, L.synthese.relancesOubliees];

  const exporterSyntheses = () => telecharger(L.synthese.fichierExport, pr81ExporterCsv(colonnes,
    liste.map((s) => [s.semaine, s.invitations, s.acceptations, s.taux_acceptation, s.conversations_ouvertes, s.partenariats, s.relances_oubliees])));
  const exporterCercles = () => telecharger(L.synthese.fichierExportCercles, pr81ExporterCsv(
    [L.contacts.colCercle, ...ORDRE_STATUTS.map((s) => L.statuts[s]), L.commun.total],
    ([1, 2, 3, 0] as const).map((c) => [L.cercles[c], ...ORDRE_STATUTS.map((s) => matrice[c]?.[s] ?? 0), matrice[c]?.total ?? 0])));

  const ecart = (v: number | null, cible: number) => {
    const e = pr80ComparerReference(v, cible);
    return e ? L.synthese.ecarts[e] : "";
  };

  return (
    <div>
      <EnTete titre={L.synthese.titre} sousTitre={L.synthese.sousTitre}
        action={<Bouton principal libelle={L.synthese.generer} onClick={() => generer.mutate()} chargement={generer.isPending} />} />
      <Erreur erreur={generer.error ?? syntheses.error ?? cercles.error} className="mb-4" />

      <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
        <Carte className="p-[22px]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-avisdoc-ink">{L.synthese.titre}</h2>
            <Bouton libelle={L.synthese.exporter} onClick={exporterSyntheses} motifInactif={liste.length === 0 ? { texte: L.synthese.vide, action: () => generer.mutate() } : null} />
          </div>
          {syntheses.isPending ? <Chargement /> : liste.length === 0 ? <Vide texte={L.synthese.vide} /> : (
            <Tableau entetes={colonnes}>
              {liste.map((s) => (
                <tr key={s.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2.5 font-semibold text-avisdoc-ink">{dateFr(s.semaine)}</td>
                  <td className="px-3 py-2.5">{s.invitations}</td>
                  <td className="px-3 py-2.5">{s.acceptations}</td>
                  <td className="px-3 py-2.5">{s.taux_acceptation === null ? "" : `${s.taux_acceptation} ${L.synthese.pourcent}`}</td>
                  <td className="px-3 py-2.5">{s.conversations_ouvertes}</td>
                  <td className="px-3 py-2.5">{s.partenariats}</td>
                  <td className={cn("px-3 py-2.5", s.relances_oubliees > 0 && "font-semibold text-avisdoc-coral-ink")}>{s.relances_oubliees}</td>
                </tr>
              ))}
            </Tableau>
          )}
        </Carte>

        <Carte className="p-[22px]">
          <Etiquette>{L.synthese.reference}</Etiquette>
          <p className="mt-1 mb-4 text-[12.5px] text-muted-foreground">{L.synthese.referenceTexte}</p>
          <Etiquette>{L.synthese.cumul}</Etiquette>
          <dl className="mt-2 flex flex-col gap-2 text-[13px]">
            <Ligne libelle={L.synthese.invitations} valeur={String(cumul.invitations)} note={ecart(cumul.invitations, REFERENCE_CAMPAGNE.courtiersTravailles)} />
            <Ligne libelle={L.synthese.taux} valeur={cumul.tauxAcceptationPct === null ? "" : `${cumul.tauxAcceptationPct} ${L.synthese.pourcent}`} note={ecart(cumul.tauxAcceptationPct, REFERENCE_CAMPAGNE.tauxAcceptationPct)} />
            <Ligne libelle={L.synthese.conversations} valeur={String(cumul.conversations)} note={ecart(cumul.conversations, REFERENCE_CAMPAGNE.conversations)} />
            <Ligne libelle={L.synthese.partenariats} valeur={String(cumul.partenariats)} note={ecart(cumul.partenariats, (REFERENCE_CAMPAGNE.partenariatsMin + REFERENCE_CAMPAGNE.partenariatsMax) / 2)} />
          </dl>
        </Carte>
      </div>

      <Carte className="p-[22px]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-avisdoc-ink">{L.synthese.parCercle}</h2>
          <Bouton libelle={L.synthese.exporter} onClick={exporterCercles} />
        </div>
        {cercles.isPending ? <Chargement /> : (
          <Tableau entetes={[L.contacts.colCercle, ...ORDRE_STATUTS.map((s) => L.statuts[s]), L.commun.total]}>
            {([1, 2, 3, 0] as const).map((c) => (
              <tr key={c} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2.5 font-semibold text-avisdoc-ink">{L.cercles[c]}</td>
                {ORDRE_STATUTS.map((s) => <td key={s} className="px-3 py-2.5">{matrice[c]?.[s] ?? 0}</td>)}
                <td className="px-3 py-2.5 font-semibold">{matrice[c]?.total ?? 0}</td>
              </tr>
            ))}
          </Tableau>
        )}
      </Carte>
    </div>
  );
}

function Ligne({ libelle, valeur, note }: { libelle: string; valeur: string; note: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{libelle}</dt>
      <dd className="text-right">
        <span className="font-display text-lg font-bold text-avisdoc-ink">{valeur}</span>
        {note && <span className="ml-2 text-[11px] text-muted-foreground">{note}</span>}
      </dd>
    </div>
  );
}
