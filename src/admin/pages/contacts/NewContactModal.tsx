import { useState } from "react";
import { Search } from "lucide-react";
import type { ContactType } from "../../types";
import { TYPE_BADGE } from "../../lib/ui-tokens";
import { useAdminData } from "../../data/AdminDataContext";
import { supabaseAdmin } from "../../data/supabaseAdmin";
import { Modal } from "../../components/ui";
import { cn } from "@/lib/utils";

const inputCls =
  "ad-input w-full rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm outline-none transition-colors focus:border-avisdoc-teal";

const TYPES: ContactType[] = ["Requérant", "Expert", "Réseau d'Aval"];

// Fiche renvoyée par l'Edge Function annuaire-sante (base officielle RPPS).
interface FichePro {
  id: string;
  nom: string;
  rpps: string | null;
  profession: string;
  adresse: string;
  code_postal: string;
  ville: string;
}

export default function NewContactModal({ onClose }: { onClose: () => void }) {
  const { addContact } = useAdminData();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState<ContactType>("Requérant");
  // Fiche pré-remplie depuis l'Annuaire Santé (facultatif).
  const [fiche, setFiche] = useState<FichePro | null>(null);

  // Recherche Annuaire Santé.
  const [query, setQuery] = useState("");
  const [resultats, setResultats] = useState<FichePro[] | null>(null);
  const [chargement, setChargement] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const chercher = async () => {
    if (!query.trim() || chargement) return;
    setChargement(true); setErr(null); setResultats(null);
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
    } catch (e: any) { setErr(e?.message ?? String(e)); }
    finally { setChargement(false); }
  };

  const choisir = (f: FichePro) => {
    setFiche(f);
    setName(f.nom);
    setResultats(null);
    setQuery("");
  };

  const save = () => {
    if (!name.trim()) return;
    addContact({
      name,
      email,
      type,
      role: fiche?.profession,
      ville: fiche?.ville,
      adresse: [fiche?.adresse, [fiche?.code_postal, fiche?.ville].filter(Boolean).join(" ")]
        .filter(Boolean).join(", "),
      notes: fiche?.rpps ? `RPPS ${fiche.rpps} — fiche générée depuis l'Annuaire Santé.` : undefined,
    });
    onClose();
  };

  return (
    <Modal onClose={onClose} width={480}>
      <h2 className="mb-1 font-display text-[22px] font-semibold text-avisdoc-ink">
        Nouveau contact
      </h2>
      <p className="mb-5 text-[13px] text-muted-foreground">
        Chercher dans l'Annuaire Santé (base officielle RPPS) ou saisir à la main.
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
            onClick={chercher}
            disabled={chargement || !query.trim()}
            className="ad-btn-accent inline-flex items-center gap-1.5 rounded-xl bg-avisdoc-teal px-4 text-[13px] font-bold text-white disabled:opacity-40"
          >
            <Search className="size-4" /> {chargement ? "…" : "Chercher"}
          </button>
        </div>

        {err && (
          <p className="mt-2 break-words rounded-xl border border-orange-400/40 bg-orange-50 px-3 py-2 text-[12px] text-orange-700">
            {err}
          </p>
        )}
        {resultats && resultats.length === 0 && !err && (
          <p className="mt-2 text-[12.5px] italic text-muted-foreground">Aucun professionnel trouvé.</p>
        )}
        {resultats && resultats.length > 0 && (
          <div className="mt-2 flex max-h-48 flex-col overflow-y-auto rounded-xl border border-border bg-card">
            {resultats.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => choisir(f)}
                className="border-b border-border/60 px-3.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-sky-50/70"
              >
                <div className="text-[13px] font-semibold text-avisdoc-ink">{f.nom}</div>
                <div className="text-[11.5px] text-muted-foreground">
                  {[f.profession, f.ville, f.rpps ? `RPPS ${f.rpps}` : null].filter(Boolean).join(" · ") || "—"}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3.5">
        <input
          className={inputCls}
          placeholder="Nom complet"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {/* Récap de la fiche officielle sélectionnée */}
        {fiche && (
          <div className="rounded-xl border border-avisdoc-teal/30 bg-avisdoc-teal/5 px-3.5 py-2.5 text-[12.5px] text-muted-foreground">
            <span className="font-semibold text-avisdoc-teal">Fiche Annuaire Santé ✓</span>{" "}
            {[fiche.profession, [fiche.adresse, fiche.code_postal, fiche.ville].filter(Boolean).join(" "),
              fiche.rpps ? `RPPS ${fiche.rpps}` : null].filter(Boolean).join(" · ")}
          </div>
        )}
        <input
          className={inputCls}
          placeholder="Email professionnel"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="flex gap-2">
          {TYPES.map((t) => {
            const on = type === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "flex-1 rounded-full py-2.5 text-center text-[12.5px] font-bold transition-colors",
                  on ? TYPE_BADGE[t] : "bg-muted/50 text-muted-foreground",
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="ad-btn-outline flex-1 rounded-full border-[1.5px] border-border py-3 text-sm font-bold text-muted-foreground transition-colors"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={save}
          className="ad-btn-accent flex-1 rounded-full bg-avisdoc-teal py-3 text-sm font-bold text-white"
        >
          Enregistrer
        </button>
      </div>
    </Modal>
  );
}
