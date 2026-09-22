// Le brouillon de premier contact écrit par Merx, à partir de la seule fiche.
// RIEN N'EST ENVOYÉ PAR LE HUB : on relit, on corrige, puis on ouvre sa propre messagerie.

import { useState } from "react";
import { ArrowRightCircle, Check, Copy, Loader2, Mail, X } from "lucide-react";
import type { PipelineStage } from "../../types";
import { Modal, SectionLabel } from "../../components/ui";
import { cn } from "@/lib/utils";

const champCls =
  "ad-input w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";

export default function BrouillonEmail({
  nom,
  objet: objetInitial,
  corps: corpsInitial,
  destinataire,
  onClose,
  stages,
  onMettreAuPipeline,
}: {
  nom: string;
  objet: string;
  corps: string;
  destinataire: string | null;
  onClose: () => void;
  /** Les colonnes du Pipeline, pour choisir où l'affaire entre. */
  stages?: PipelineStage[];
  /** Absent quand l'affaire est déjà au Pipeline : on ne repropose rien. */
  onMettreAuPipeline?: (etape: string) => Promise<void>;
}) {
  const [objet, setObjet] = useState(objetInitial);
  const [corps, setCorps] = useState(corpsInitial);
  const [copie, setCopie] = useState(false);
  const [proposer, setProposer] = useState(false);
  const [envoiPipeline, setEnvoiPipeline] = useState(false);

  const copier = async () => {
    await navigator.clipboard.writeText(`${objet}\n\n${corps}`);
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  };

  const ouvrirMessagerie = () => {
    const lien = `mailto:${destinataire ?? ""}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`;
    window.location.href = lien;
    // Écrire n'est pas contacter ; envoyer, si. C'est le moment de demander.
    if (onMettreAuPipeline) setProposer(true);
  };

  const versLePipeline = async (etape: string) => {
    if (!onMettreAuPipeline || envoiPipeline) return;
    setEnvoiPipeline(true);
    try {
      await onMettreAuPipeline(etape);
      onClose();
    } finally {
      setEnvoiPipeline(false);
    }
  };

  return (
    <Modal onClose={onClose} width={620}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-avisdoc-ink">Premier contact — {nom}</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Merx a écrit ce brouillon à partir de la fiche. Relisez, corrigez, puis envoyez depuis votre messagerie.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink">
          <X className="size-5" />
        </button>
      </div>

      <label className="block">
        <SectionLabel>Destinataire</SectionLabel>
        <div className="mt-1 text-[13px] text-avisdoc-ink">
          {destinataire ?? <span className="text-muted-foreground">Aucune adresse sur la fiche — vous la saisirez dans votre messagerie.</span>}
        </div>
      </label>

      <label className="mt-4 block">
        <SectionLabel>Objet</SectionLabel>
        <input value={objet} onChange={(e) => setObjet(e.target.value)} className={cn(champCls, "mt-1")} />
      </label>

      <label className="mt-3 block">
        <SectionLabel>Message</SectionLabel>
        <textarea
          value={corps}
          onChange={(e) => setCorps(e.target.value)}
          rows={12}
          className={cn(champCls, "mt-1 resize-none leading-relaxed")}
        />
      </label>

      {proposer && (
        <div className="mt-5 rounded-2xl border border-l-4 border-border border-l-avisdoc-teal p-4">
          <div className="flex items-start gap-2">
            <ArrowRightCircle className="mt-0.5 size-4 shrink-0 text-avisdoc-teal" />
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-avisdoc-ink">Mettre le prospect dans le Pipeline ?</p>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                Vous venez de le contacter : l’affaire se suit désormais dans le Pipeline, et la fiche quitte la
                prospection.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(stages ?? []).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => void versLePipeline(st.label)}
                disabled={envoiPipeline}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-[12.5px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal disabled:opacity-50"
              >
                {envoiPipeline && <Loader2 className="size-3.5 animate-spin" />}
                {st.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setProposer(false)}
              className="text-[12.5px] font-semibold text-muted-foreground underline-offset-2 hover:text-avisdoc-ink hover:underline"
            >
              Pas maintenant
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={ouvrirMessagerie}
          className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white"
        >
          <Mail className="size-4" /> Ouvrir dans ma messagerie
        </button>
        <button
          type="button"
          onClick={() => void copier()}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal"
        >
          {copie ? <Check className="size-4" /> : <Copy className="size-4" />} {copie ? "Copié" : "Copier"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
        >
          Fermer
        </button>
      </div>

      <p className="mt-3 text-[11.5px] text-muted-foreground">
        Le Hub n’envoie aucun message : rien ne part tant que vous n’avez pas cliqué « Envoyer » dans votre messagerie.
      </p>
    </Modal>
  );
}
