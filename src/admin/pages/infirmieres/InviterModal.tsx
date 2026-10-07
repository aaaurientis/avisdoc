// Invitation d'une infirmière requérante : commence par une recherche dans
// l'Annuaire Santé (base officielle RPPS), préremplit identité + RPPS, puis
// l'admin complète e-mail et téléphone avant d'envoyer l'invitation.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { reqRepo } from "../../req/reqRepo";
import { supabaseAdmin } from "../../data/supabaseAdmin";
import { Modal } from "../../components/ui";
import { cn } from "@/lib/utils";

const inputCls =
  "ad-input w-full rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm outline-none transition-colors focus:border-avisdoc-teal";

// Sous-ensemble de la fiche renvoyée par l'Edge Function annuaire-sante.
interface FichePro {
  id: string;
  nom: string; // libellé complet (préfixe + prénom + nom)
  prenom?: string;
  famille?: string; // nom de famille seul
  rpps: string | null;
  profession: string;
  ville?: string;
  telephone?: string;
  email_pro?: string;
}

export default function InviterModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [query, setQuery] = useState("");
  const [resultats, setResultats] = useState<FichePro[] | null>(null);
  const [chargement, setChargement] = useState(false);
  const [errSearch, setErrSearch] = useState<string | null>(null);

  const [choisie, setChoisie] = useState(false); // une fiche a été retenue, ou saisie manuelle
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [rpps, setRpps] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [busy, setBusy] = useState(false);
  // Mode « déjà validé » : ajout direct en « active », sans lancer le parcours.
  const [dejaValide, setDejaValide] = useState(false);
  const [rcpFin, setRcpFin] = useState("");
  const [urssafFin, setUrssafFin] = useState("");

  const chercher = async () => {
    if (!query.trim() || chargement) return;
    setChargement(true);
    setErrSearch(null);
    setResultats(null);
    try {
      const { data, error } = await supabaseAdmin.functions.invoke("annuaire-sante", {
        body: { query: query.trim() },
      });
      if (error) {
        let msg = error.message;
        try {
          const b = await (error as any).context?.json?.();
          if (b?.error) msg = b.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      setResultats((data?.resultats as FichePro[]) ?? []);
    } catch (e: any) {
      setErrSearch(e?.message ?? String(e));
    } finally {
      setChargement(false);
    }
  };

  const choisir = async (f: FichePro) => {
    setPrenom(f.prenom ?? "");
    setNom(f.famille ?? f.nom ?? "");
    setRpps(f.rpps ?? "");
    setChoisie(true);
    setResultats(null);
    setQuery("");
    // Enrichissement best-effort : téléphone / e-mail de la structure d'exercice.
    try {
      const { data } = await supabaseAdmin.functions.invoke("annuaire-sante", {
        body: { practitioner_id: f.id },
      });
      const st = (data as any)?.structures?.[0];
      if (st?.telephone) setTelephone((t) => t || st.telephone);
      if (st?.email) setEmail((e) => e || st.email);
    } catch { /* best-effort */ }
  };

  const soumettre = async () => {
    if (!nom.trim() || !prenom.trim() || !email.includes("@")) {
      toast.error("Nom, prénom et e-mail valides requis.");
      return;
    }
    setBusy(true);
    try {
      const base = {
        nom: nom.trim(),
        prenom: prenom.trim(),
        email: email.trim(),
        rpps: rpps.trim() || null,
        telephone: telephone.trim() || null,
      };
      if (dejaValide) {
        await reqRepo.ajouterValide({ ...base, rcpDateFin: rcpFin || null, urssafDateFin: urssafFin || null });
        toast.success("Requérant ajouté (actif).");
      } else {
        const r = await reqRepo.inviter(base);
        toast.success(r.emailEnvoye ? "Invitation envoyée." : "Inscription créée (e-mail non envoyé — à configurer).");
      }
      onDone();
    } catch (e) {
      console.error(e);
      toast.error(dejaValide ? "L'ajout a échoué." : "L'invitation a échoué.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} width={480}>
      <h2 className="mb-1 font-display text-[22px] font-semibold text-avisdoc-ink">Inviter une infirmière</h2>
      <p className="mb-5 text-[13px] text-muted-foreground">
        Recherchez l'infirmière dans l'Annuaire Santé (base officielle RPPS), puis complétez son e-mail et son téléphone.
      </p>

      {/* Recherche Annuaire Santé */}
      <div className="mb-4 rounded-2xl border border-border bg-muted/30 p-3.5">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
          Annuaire Santé (RPPS)
        </div>
        <div className="flex gap-2">
          <input
            className={cn(inputCls, "flex-1 py-2.5")}
            placeholder="Nom, « prénom nom » ou n° RPPS…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && chercher()}
          />
          <button
            type="button"
            onClick={() => void chercher()}
            disabled={chargement || !query.trim()}
            className="ad-btn-accent inline-flex items-center gap-1.5 rounded-xl bg-avisdoc-teal px-4 text-[13px] font-bold text-white disabled:opacity-40"
          >
            <Search className="size-4" /> {chargement ? "…" : "Chercher"}
          </button>
        </div>

        {errSearch && (
          <p className="mt-2 break-words rounded-xl border border-orange-400/40 bg-orange-50 px-3 py-2 text-[12px] text-orange-700">
            {errSearch}
          </p>
        )}
        {resultats && resultats.length === 0 && !errSearch && (
          <p className="mt-2 text-[12.5px] italic text-muted-foreground">Aucun professionnel trouvé.</p>
        )}
        {resultats && resultats.length > 0 && (
          <div className="mt-2 flex max-h-48 flex-col overflow-y-auto rounded-xl border border-border bg-card">
            {resultats.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => void choisir(f)}
                className="border-b border-border/60 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-accent"
              >
                <div className="text-[13.5px] font-semibold text-avisdoc-ink">{f.nom}</div>
                <div className="text-[11.5px] text-muted-foreground">
                  {[f.profession, f.ville].filter(Boolean).join(" · ")}
                  {f.rpps ? ` · RPPS ${f.rpps}` : ""}
                </div>
              </button>
            ))}
          </div>
        )}

        {!choisie && (
          <button
            type="button"
            onClick={() => setChoisie(true)}
            className="mt-2 text-[12px] font-semibold text-avisdoc-teal underline"
          >
            Saisir manuellement
          </button>
        )}
      </div>

      {/* Identité + coordonnées (après sélection ou saisie manuelle) */}
      {choisie && (
        <div className="flex flex-col gap-2.5">
          <div className="flex gap-2.5">
            <input className={cn(inputCls, "flex-1")} placeholder="Prénom" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
            <input className={cn(inputCls, "flex-1")} placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} />
          </div>
          <input className={inputCls} placeholder="N° RPPS" inputMode="numeric" value={rpps} onChange={(e) => setRpps(e.target.value)} />
          <input className={inputCls} placeholder="E-mail (pour le lien de connexion)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={inputCls} placeholder="Téléphone" type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} />

          {/* Mode « déjà validé » : ajout direct sans lancer le parcours. */}
          <label className="mt-1 flex cursor-pointer items-start gap-2 rounded-xl border border-border bg-muted/30 p-3 text-[13px] text-avisdoc-ink">
            <input type="checkbox" checked={dejaValide} onChange={(e) => setDejaValide(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="font-semibold">Déjà validé</span> — ajouter directement comme actif, sans lancer le parcours d'inscription.
            </span>
          </label>

          {dejaValide && (
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
              <p className="text-[12px] text-muted-foreground">
                Dates de fin des attestations (facultatif, recommandé) — pour l'éligibilité et les rappels d'échéance.
              </p>
              <label className="text-[12px] font-semibold text-muted-foreground">
                Fin RCP
                <input type="date" className={cn(inputCls, "mt-0.5")} value={rcpFin} onChange={(e) => setRcpFin(e.target.value)} />
              </label>
              <label className="text-[12px] font-semibold text-muted-foreground">
                Fin URSSAF
                <input type="date" className={cn(inputCls, "mt-0.5")} value={urssafFin} onChange={(e) => setUrssafFin(e.target.value)} />
              </label>
            </div>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="ad-btn-outline rounded-full border-[1.5px] border-border px-4 py-2 text-[13px] font-bold text-avisdoc-ink">
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void soumettre()}
              disabled={busy}
              className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2 text-[13px] font-bold text-white disabled:opacity-60"
            >
              <UserPlus className="size-4" /> {busy ? "Envoi…" : dejaValide ? "Ajouter" : "Inviter"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
