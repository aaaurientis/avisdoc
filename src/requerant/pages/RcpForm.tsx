// Formulaire « Assurance RCP » : le requérant saisit assureur, n° de police et
// date de fin de validité — requis pour pouvoir soumettre le dossier.

import { useState } from "react";
import { Check, Save } from "lucide-react";
import { toast } from "sonner";
import { portalRepo } from "../lib/repo";
import type { ReqInscription } from "../../admin/req/types";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-avisdoc-teal";

export default function RcpForm({ i, onSaved }: { i: ReqInscription; onSaved: () => void }) {
  const [assureur, setAssureur] = useState(i.rcpAssureur ?? "");
  const [police, setPolice] = useState(i.rcpPolice ?? "");
  const [dateFin, setDateFin] = useState(i.rcpDateFin ?? "");
  const [busy, setBusy] = useState(false);
  const complet = !!(i.rcpAssureur && i.rcpPolice && i.rcpDateFin);
  const [ouvert, setOuvert] = useState(!complet);

  const manque = !assureur.trim() || !police.trim() || !dateFin;

  const enregistrer = async () => {
    setBusy(true);
    try {
      await portalRepo.enregistrerRcp({ assureur: assureur.trim(), police: police.trim(), dateFin });
      toast.success("Assurance RCP enregistrée.");
      onSaved();
    } catch (e) {
      console.error(e);
      toast.error("L'enregistrement a échoué.");
    } finally {
      setBusy(false);
    }
  };

  if (complet && !ouvert) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <span className="flex items-center gap-2 text-[13.5px] font-semibold text-emerald-700">
          <Check className="size-4" /> Assurance RCP renseignée
        </span>
        <button type="button" onClick={() => setOuvert(true)} className="text-[12.5px] font-semibold text-avisdoc-teal underline">
          Modifier
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Assurance responsabilité civile (RCP)</div>
      <p className="mt-1 text-[13px] text-muted-foreground">Les informations figurant sur votre attestation.</p>
      <div className="mt-4 flex flex-col gap-2.5">
        <input className={inputCls} placeholder="Assureur" value={assureur} onChange={(e) => setAssureur(e.target.value)} />
        <input className={inputCls} placeholder="N° de police d'assurance" value={police} onChange={(e) => setPolice(e.target.value)} />
        <label className="text-[12px] font-semibold text-muted-foreground">
          Date de fin de validité
          <input type="date" className={cn(inputCls, "mt-0.5")} value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
        </label>
        <button
          type="button"
          onClick={() => void enregistrer()}
          disabled={busy || manque}
          className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-[14px] font-bold text-white transition-colors disabled:opacity-50"
        >
          <Save className="size-4" /> {busy ? "Enregistrement…" : "Enregistrer l'assurance"}
        </button>
      </div>
    </div>
  );
}
