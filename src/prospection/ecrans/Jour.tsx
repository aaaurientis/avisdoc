// Écran du jour, écran par défaut : relances échues, réponses non traitées,
// contacts à qualifier, compteur d'invitations restantes. Aucun envoi.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "@/components/ui/sonner";
import { chargerJour, marquerTraitee, synchroniserGmail } from "../data/repo";
import { calculerScore } from "../domaine/signaux";
import { PLAFOND_INVITATIONS_JOUR, pr51InvitationsRestantes } from "../domaine/relances";
import { L, t } from "../i18n/libelles";
import { dateFr, dateHeureFr, nomComplet } from "../lib/format";
import { Bouton, Carte, Cercle, Chargement, EnTete, Erreur, Kpi, Score, Statut, Vide, CIBLE } from "../composants/ui";
import { cn } from "@/lib/utils";

export default function Jour() {
  const qc = useQueryClient();
  const jour = useQuery({ queryKey: ["jour"], queryFn: chargerJour });
  const traiter = useMutation({
    mutationFn: marquerTraitee,
    onSuccess: () => { toast.success(L.jour.traitee); void qc.invalidateQueries({ queryKey: ["jour"] }); },
  });
  const gmail = useMutation({
    mutationFn: synchroniserGmail,
    onSuccess: (r) => { toast.success(t(L.jour.gmailFait, { n: r.emails, c: r.contacts })); void qc.invalidateQueries(); },
  });

  if (jour.isPending) return <Chargement />;
  if (jour.isError) return <><EnTete titre={L.jour.titre} /><Erreur erreur={jour.error} /></>;

  const { relances, reponses, aQualifier, invitationsDuJour } = jour.data;
  const restantes = pr51InvitationsRestantes(invitationsDuJour);
  const retardMax = relances.reduce((m, r) => Math.max(m, r.retard_jours ?? 0), 0);

  return (
    <div>
      <EnTete
        titre={L.jour.titre}
        sousTitre={L.jour.sousTitre}
        action={
          <div className="flex flex-col items-end gap-1">
            <Bouton libelle={L.jour.gmail} onClick={() => gmail.mutate()} chargement={gmail.isPending} />
            <span className="text-[11px] text-muted-foreground">{L.jour.gmailNote}</span>
          </div>
        }
      />
      <Erreur erreur={gmail.error} className="mb-4" />
      <Erreur erreur={traiter.error} className="mb-4" />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi libelle={L.jour.kpiInvitations} valeur={String(restantes)} pied={t(L.jour.kpiInvitationsPied, { n: invitationsDuJour, max: PLAFOND_INVITATIONS_JOUR })} accent />
        <Kpi libelle={L.jour.kpiRelances} valeur={String(relances.length)} inverse
          pied={relances.length ? t(L.jour.kpiRelancesPied, { n: retardMax }) : L.jour.kpiRelancesPiedVide} />
        <Kpi libelle={L.jour.kpiReponses} valeur={String(reponses.length)} pied={L.jour.kpiReponsesPied} />
        <Kpi libelle={L.jour.kpiAQualifier} valeur={String(aQualifier.length)} pied={L.jour.kpiAQualifierPied} />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <Carte className="p-[22px]">
          <h2 className="mb-4 font-display text-lg font-semibold text-avisdoc-ink">{L.jour.relancesTitre}</h2>
          {relances.length === 0 ? <Vide texte={L.jour.relancesVide} /> : (
            <ul className="flex flex-col divide-y divide-border">
              {relances.map((r) => (
                <li key={r.id ?? ""} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Link to={`/contacts/${r.contact_id}`} className="text-[13.5px] font-semibold text-avisdoc-ink hover:underline">
                      {nomComplet(r.prenom, r.nom) || L.commun.sansNom}
                    </Link>
                    <div className="text-[11.5px] text-muted-foreground">{[r.fonction, r.compte_nom].filter(Boolean).join(" · ")}</div>
                    <div className="mt-1 text-[12px] text-avisdoc-ink">{r.echeance ? L.echeances[r.echeance] : ""}</div>
                  </div>
                  <Cercle cercle={r.cercle} />
                  <span className={cn("text-[12px] font-semibold", (r.retard_jours ?? 0) > 0 ? "text-avisdoc-coral-ink" : "text-muted-foreground")}>
                    {(r.retard_jours ?? 0) > 0 ? t(L.jour.retard, { n: r.retard_jours }) : L.jour.retardAujourdhui}
                  </span>
                  <Link to={`/contacts/${r.contact_id}`} className={cn(CIBLE, "inline-flex items-center rounded-full border border-border px-4 text-[12.5px] font-semibold text-avisdoc-ink hover:border-avisdoc-teal")}>
                    {L.jour.preparer}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Carte>

        <Carte className="p-[22px]">
          <h2 className="mb-4 font-display text-lg font-semibold text-avisdoc-ink">{L.jour.reponsesTitre}</h2>
          {reponses.length === 0 ? <Vide texte={L.jour.reponsesVide} /> : (
            <ul className="flex flex-col divide-y divide-border">
              {reponses.map((r) => (
                <li key={r.id ?? ""} className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Link to={`/contacts/${r.contact_id}`} className="text-[13.5px] font-semibold text-avisdoc-ink hover:underline">
                      {nomComplet(r.prenom, r.nom) || L.commun.sansNom}
                    </Link>
                    <div className="text-[11.5px] text-muted-foreground">
                      {[r.canal ? L.canaux[r.canal] : "", dateHeureFr(r.survenu_le), r.compte_nom].filter(Boolean).join(" · ")}
                    </div>
                    {(r.objet || r.contenu) && <div className="mt-1 text-[12.5px] text-avisdoc-ink">{r.objet ?? r.contenu}</div>}
                  </div>
                  {r.statut && <Statut statut={r.statut} />}
                  <Bouton libelle={L.jour.marquerTraitee} onClick={() => r.id && traiter.mutate(r.id)} chargement={traiter.isPending && traiter.variables === r.id} />
                </li>
              ))}
            </ul>
          )}
        </Carte>

        <Carte className="p-[22px] xl:col-span-2">
          <h2 className="mb-4 font-display text-lg font-semibold text-avisdoc-ink">{L.jour.aQualifierTitre}</h2>
          {aQualifier.length === 0 ? <Vide texte={L.jour.aQualifierVide} /> : (
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {aQualifier.map((c) => (
                <li key={c.id}>
                  <Link to={`/contacts/${c.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-accent">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold text-avisdoc-ink">{nomComplet(c.prenom, c.nom)}</div>
                      <div className="truncate text-[11.5px] text-muted-foreground">
                        {[c.fonction, c.compte?.nom ?? L.fiche.sansCompte, dateFr(c.cree_le)].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <Cercle cercle={c.compte?.cercle} />
                    <Score total={calculerScore(c, c.compte).total} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Carte>
      </div>
    </div>
  );
}
