import { useEffect, useState } from "react";
import { Check, LogOut } from "lucide-react";
import { toast } from "sonner";
import { portalRepo, type MonDossier } from "../lib/repo";
import type { ReqEtat } from "../../admin/req/types";
import { PIECE_ETAT_LABEL, PIECE_TYPE_LABEL } from "../../admin/req/types";
import { frDate } from "../../admin/lib/format";
import { cn } from "@/lib/utils";

const ETAPES = ["Identité", "Pièces", "Contrat", "Actif"];

function etapeCourante(etat: ReqEtat): number {
  switch (etat) {
    case "invitee":
    case "identite_a_controler":
      return 0;
    case "identite_verifiee":
    case "pieces_a_valider":
    case "a_completer":
      return 1;
    case "pret_a_signer":
    case "contrat_envoye":
      return 2;
    case "active":
      return 3;
    default:
      return 0;
  }
}

function prochaineAction(etat: ReqEtat): string {
  switch (etat) {
    case "invitee":
    case "identite_a_controler":
      return "Vérifiez votre identité : saisissez votre RPPS et déposez votre pièce d'identité.";
    case "identite_verifiee":
    case "pieces_a_valider":
      return "Déposez vos attestations : responsabilité civile (RCP) et URSSAF.";
    case "a_completer":
      return "Une pièce a été refusée : déposez une nouvelle version de la pièce concernée.";
    case "pret_a_signer":
      return "Votre dossier est complet. La signature du contrat arrive bientôt.";
    case "contrat_envoye":
      return "En attente de votre signature du contrat.";
    case "active":
      return "Votre inscription est active. Merci !";
    case "suspendue":
      return "Votre inscription est suspendue. Mettez à jour la pièce concernée.";
    default:
      return "";
  }
}

export default function Suivi({ onDeconnexion }: { onDeconnexion: () => void }) {
  const [dossier, setDossier] = useState<MonDossier | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let actif = true;
    portalRepo
      .monDossier()
      .then((d) => actif && setDossier(d))
      .catch((e) => {
        console.error(e);
        toast.error("Impossible de charger votre dossier.");
      })
      .finally(() => actif && setLoading(false));
    return () => {
      actif = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-[3px] border-border border-t-avisdoc-teal" />
      </div>
    );
  }

  if (!dossier) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <p className="text-[15px] text-muted-foreground">
          Aucun dossier n'est encore rattaché à votre compte. Ouvrez le lien reçu
          par e-mail, ou contactez l'équipe AvisDoc.
        </p>
        <button
          type="button"
          onClick={onDeconnexion}
          className="mt-6 text-[13px] font-semibold text-avisdoc-teal underline"
        >
          Se déconnecter
        </button>
      </div>
    );
  }

  const { inscription: i, pieces } = dossier;
  const courante = etapeCourante(i.etat);
  const terminal = ["refusee", "resiliee", "abandonnee"].includes(i.etat);

  return (
    <div className="mx-auto w-full max-w-md px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Mon inscription
          </div>
          <h1 className="font-display text-xl font-semibold text-avisdoc-ink">
            {i.prenom} {i.nom}
          </h1>
        </div>
        <button
          type="button"
          onClick={onDeconnexion}
          title="Se déconnecter"
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:text-avisdoc-ink"
        >
          <LogOut className="size-5" />
        </button>
      </div>

      {/* Fil des 4 étapes */}
      <div className="mt-6 flex items-center">
        {ETAPES.map((e, idx) => {
          const fait = idx < courante || i.etat === "active";
          const actif = idx === courante && i.etat !== "active";
          return (
            <div key={e} className="flex flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                <div className={cn("h-0.5 flex-1", idx === 0 ? "opacity-0" : fait || actif ? "bg-avisdoc-teal" : "bg-border")} />
                <div
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    fait ? "bg-avisdoc-teal text-white" : actif ? "border-2 border-avisdoc-teal text-avisdoc-teal" : "border-2 border-border text-muted-foreground",
                  )}
                >
                  {fait ? <Check className="size-3.5" /> : idx + 1}
                </div>
                <div className={cn("h-0.5 flex-1", idx === ETAPES.length - 1 ? "opacity-0" : idx < courante ? "bg-avisdoc-teal" : "bg-border")} />
              </div>
              <span className={cn("mt-1 text-[11px] font-semibold", actif || fait ? "text-avisdoc-ink" : "text-muted-foreground")}>{e}</span>
            </div>
          );
        })}
      </div>

      {/* Bannière état terminal / suspendu */}
      {(terminal || i.etat === "suspendue") && (
        <div
          className={cn(
            "mt-6 rounded-2xl p-4 text-[14px]",
            i.etat === "suspendue" ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-800",
          )}
        >
          {i.etat === "suspendue" ? "Inscription suspendue." : "Inscription clôturée."}
          {i.motif && <div className="mt-1 text-[13px] opacity-80">Motif : {i.motif}</div>}
        </div>
      )}

      {/* Prochaine action */}
      {!terminal && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Prochaine étape
          </div>
          <p className="mt-1 text-[15px] leading-relaxed text-avisdoc-ink">{prochaineAction(i.etat)}</p>
          <p className="mt-3 text-[12.5px] italic text-muted-foreground">
            Le dépôt des pièces depuis ce portail arrive très bientôt.
          </p>
        </div>
      )}

      {/* Pièces */}
      <div className="mt-6">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Mes pièces
        </div>
        {pieces.length === 0 ? (
          <p className="text-[13px] italic text-muted-foreground">Aucune pièce déposée pour l'instant.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {pieces.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-border bg-card px-4 py-3">
                <span className="text-[13.5px] font-semibold text-avisdoc-ink">{PIECE_TYPE_LABEL[p.type]}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-bold",
                    p.etat === "validee" ? "bg-emerald-100 text-emerald-700" : p.etat === "refusee" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600",
                  )}
                >
                  {PIECE_ETAT_LABEL[p.etat]}
                </span>
                {p.dateFin && <span className="text-[12px] text-muted-foreground">échéance {frDate(p.dateFin)}</span>}
                {p.motif && <span className="w-full text-[12px] text-avisdoc-coral">{p.motif}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
