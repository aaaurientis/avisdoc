// Le brouillon de premier contact écrit par Merx, à partir de la seule fiche.
// RIEN N'EST ENVOYÉ PAR LE HUB : on relit, on corrige, puis on ouvre sa propre messagerie.

import { useState } from "react";
import { Check, Copy, Mail, X } from "lucide-react";
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
}: {
  nom: string;
  objet: string;
  corps: string;
  destinataire: string | null;
  onClose: () => void;
}) {
  const [objet, setObjet] = useState(objetInitial);
  const [corps, setCorps] = useState(corpsInitial);
  const [copie, setCopie] = useState(false);

  const copier = async () => {
    await navigator.clipboard.writeText(`${objet}\n\n${corps}`);
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  };

  const ouvrirMessagerie = () => {
    const lien = `mailto:${destinataire ?? ""}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`;
    window.location.href = lien;
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
