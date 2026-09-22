// Ajouter un prospect à la main : une entreprise signalée de vive voix entre dans la
// prospection sans attendre que Merx la trouve.
//
// On ne demande que ce qu'on peut savoir de tête — le nom suffit. Le reste, Merx ira
// le chercher : « Approfondir » depuis la fiche remplit le registre, les coordonnées
// et l'angle d'approche.

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { supabaseAdmin } from "../../data/supabaseAdmin";
import { Modal, SectionLabel } from "../../components/ui";
import { SECTEURS } from "../../lib/merx";
import { cn } from "@/lib/utils";

const champCls =
  "ad-input w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";

export default function NouveauProspect({ onClose, onCree }: { onClose: () => void; onCree: () => Promise<void> }) {
  const { user } = useAuth();
  const [nom, setNom] = useState("");
  const [ville, setVille] = useState("");
  const [activite, setActivite] = useState("");
  const [site, setSite] = useState("");
  const [secteur, setSecteur] = useState("");
  const [pourquoi, setPourquoi] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const enregistrer = async () => {
    if (!nom.trim() || envoi) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const { error } = await supabaseAdmin.from("admin_prospects").insert({
        owner_email: user?.email ?? "",
        name: nom.trim(),
        city: ville.trim() || null,
        activity: activite.trim() || null,
        website: site.trim() || null,
        sector: secteur || null,
        rationale: pourquoi.trim() || null,
        contact_name: contact.trim() || null,
        contact_email: email.trim() || null,
        contact_phone: telephone.trim() || null,
        contact_source: contact.trim() || email.trim() || telephone.trim() ? "saisi à la main" : null,
      });
      if (error) throw new Error(error.message);
      await onCree();
      onClose();
    } catch (e) {
      const m = e instanceof Error ? e.message : "L’enregistrement a échoué.";
      setErreur(
        /duplicate key|unique/i.test(m)
          ? "Une entreprise de ce nom existe déjà dans cette ville : cherchez-la dans la liste."
          : m,
      );
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal onClose={onClose} width={560}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-avisdoc-ink">Ajouter un prospect</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Seul le nom est nécessaire. Merx complétera le reste depuis la fiche, avec « Approfondir ».
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink">
          <X className="size-5" />
        </button>
      </div>

      <label className="block">
        <SectionLabel>Entreprise *</SectionLabel>
        <input
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void enregistrer()}
          autoFocus
          placeholder="Terrassements Girondins"
          className={cn(champCls, "mt-1")}
        />
      </label>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <SectionLabel>Ville</SectionLabel>
          <input value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Mérignac" className={cn(champCls, "mt-1")} />
        </label>
        <label className="block">
          <SectionLabel>Secteur</SectionLabel>
          <select value={secteur} onChange={(e) => setSecteur(e.target.value)} className={cn(champCls, "mt-1")}>
            <option value="">À déterminer</option>
            {SECTEURS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <SectionLabel>Activité</SectionLabel>
          <input value={activite} onChange={(e) => setActivite(e.target.value)} placeholder="Travaux de terrassement" className={cn(champCls, "mt-1")} />
        </label>
        <label className="block">
          <SectionLabel>Site</SectionLabel>
          <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://…" className={cn(champCls, "mt-1")} />
        </label>
      </div>

      <label className="mt-3 block">
        <SectionLabel>Pourquoi c’est une cible</SectionLabel>
        <textarea
          value={pourquoi}
          onChange={(e) => setPourquoi(e.target.value)}
          rows={2}
          placeholder="Qui vous l’a signalée, et ce qu’on en sait."
          className={cn(champCls, "mt-1 resize-none")}
        />
      </label>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <SectionLabel>Interlocuteur</SectionLabel>
          <input value={contact} onChange={(e) => setContact(e.target.value)} className={cn(champCls, "mt-1")} />
        </label>
        <label className="block">
          <SectionLabel>E-mail</SectionLabel>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={cn(champCls, "mt-1")} />
        </label>
        <label className="block">
          <SectionLabel>Téléphone</SectionLabel>
          <input value={telephone} onChange={(e) => setTelephone(e.target.value)} type="tel" className={cn(champCls, "mt-1")} />
        </label>
      </div>

      {erreur && <p className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{erreur}</p>}

      <div className="mt-5 flex gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => void enregistrer()}
          disabled={!nom.trim() || envoi}
          className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {envoi && <Loader2 className="size-4 animate-spin" />} Ajouter le prospect
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
        >
          Annuler
        </button>
      </div>
    </Modal>
  );
}
