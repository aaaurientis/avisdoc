// Les interlocuteurs d'une entreprise, présentés de la même façon sur les trois fiches.
//
// Ceux que Merx a trouvés et ceux qu'on a saisis à la main se lisent pareil : nom,
// fonction, coordonnées. Une piste dont la source ne fait pas foi reste « à confirmer ».

import { useState } from "react";
import { Mail, Phone, Plus, X } from "lucide-react";
import { SectionLabel } from "../ui";
import { confirmer } from "../Confirmation";
import { cn } from "@/lib/utils";

import type { PersonneFiche } from "../../lib/fiche";

const champCls =
  "ad-input min-w-0 rounded-full border border-border bg-muted/50 px-3.5 py-2 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";

const hote = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export default function Interlocuteurs({
  personnes,
  onAjouter,
  onRetirer,
}: {
  personnes: PersonneFiche[];
  onAjouter?: (p: { prenom: string; nom: string; role: string; email: string }) => void;
  onRetirer?: (id: string) => void;
}) {
  const [saisie, setSaisie] = useState({ prenom: "", nom: "", role: "", email: "" });
  const [ouvert, setOuvert] = useState(false);

  const ajouter = () => {
    if (!onAjouter || (!saisie.prenom.trim() && !saisie.nom.trim())) return;
    onAjouter(saisie);
    setSaisie({ prenom: "", nom: "", role: "", email: "" });
    setOuvert(false);
  };

  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <SectionLabel>Interlocuteurs</SectionLabel>
        {onAjouter && !ouvert && (
          <button type="button" onClick={() => setOuvert(true)} className="inline-flex items-center gap-1 text-[12.5px] font-bold text-avisdoc-teal">
            <Plus className="size-3.5" /> Ajouter
          </button>
        )}
      </div>

      {personnes.length === 0 && !ouvert && <p className="text-[13px] text-muted-foreground">Aucun interlocuteur connu pour l’instant.</p>}

      <div className="space-y-2">
        {personnes.map((q) => (
          <div key={q.id ?? `${q.nom}-${q.fonction ?? ""}`} className="group flex items-start gap-3 rounded-xl border border-border px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] text-avisdoc-ink">
                <span className="font-semibold">{q.nom}</span>
                {q.fonction && <span className="text-muted-foreground"> · {q.fonction}</span>}
                {q.aConfirmer && <span className="ml-2 text-[11.5px] text-amber-700">à confirmer</span>}
              </div>
              {(q.email || q.telephone) && (
                <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px]">
                  {q.email && (
                    <a href={`mailto:${q.email}`} className="inline-flex items-center gap-1 text-avisdoc-teal underline-offset-2 hover:underline">
                      <Mail className="size-3.5" /> {q.email}
                    </a>
                  )}
                  {q.telephone && (
                    <a href={`tel:${q.telephone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-avisdoc-teal underline-offset-2 hover:underline">
                      <Phone className="size-3.5" /> {q.telephone}
                    </a>
                  )}
                </div>
              )}
              {q.source && (
                <a href={q.source} target="_blank" rel="noreferrer" className="mt-0.5 block text-[11.5px] text-muted-foreground underline-offset-2 hover:underline">
                  trouvé sur {hote(q.source)}
                </a>
              )}
            </div>
            {q.id && onRetirer && (
              <button
                type="button"
                aria-label={`Retirer ${q.nom}`}
                onClick={async () => {
                  if (await confirmer({ titre: `Retirer ${q.nom} ?`, message: "La personne ne sera plus listée sur cette fiche." })) onRetirer(q.id!);
                }}
                className="rounded-lg p-1 text-muted-foreground opacity-0 transition-opacity hover:text-rose-700 group-hover:opacity-100"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {ouvert && onAjouter && (
        <div className="mt-2 flex flex-wrap gap-2 rounded-xl border border-border p-2.5">
          <input className={cn(champCls, "flex-1")} placeholder="Prénom" value={saisie.prenom} onChange={(e) => setSaisie({ ...saisie, prenom: e.target.value })} autoFocus />
          <input className={cn(champCls, "flex-1")} placeholder="Nom" value={saisie.nom} onChange={(e) => setSaisie({ ...saisie, nom: e.target.value })} />
          <input className={cn(champCls, "flex-1")} placeholder="Fonction" value={saisie.role} onChange={(e) => setSaisie({ ...saisie, role: e.target.value })} />
          <input className={cn(champCls, "flex-[1.3]")} placeholder="E-mail" value={saisie.email} onChange={(e) => setSaisie({ ...saisie, email: e.target.value })} />
          <button type="button" onClick={ajouter} className="ad-btn-accent rounded-full bg-avisdoc-teal px-4 py-2 text-[12.5px] font-bold text-white">
            Ajouter
          </button>
          <button type="button" onClick={() => setOuvert(false)} className="rounded-full px-3 py-2 text-[12.5px] font-bold text-muted-foreground">
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}
