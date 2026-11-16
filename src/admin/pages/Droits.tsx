// Droits d'accès par module (réservé aux comptes ayant le module Admin).
// Chaque utilisateur @avisdoc.fr non listé a les modules par défaut (MODULES_DEFAUT :
// ni Admin, ni Journée, ni les trois nouveaux CRM, ni la Synthèse) ; une ligne ici remplace ces défauts. Les super-admins (table
// admin_superadmins, gérée au SQL Editor) ont toujours tous les modules.
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { supabaseAdmin as sb } from "../data/supabaseAdmin";
import { useAuth } from "../auth/AuthContext";
import { MODULES, MODULES_DEFAUT, type Module } from "../lib/modules";
import { Card, PageHeader } from "../components/ui";
import { cn } from "@/lib/utils";

/** Intitulés courts pour tenir sur une page ; le nom complet reste au survol. */
const COURT: Partial<Record<Module, string>> = {
  commercial: "Entrep.", crm_collectivites: "Collect.", crm_mutuelles: "Mutuel.", crm_intermediaires: "Interméd.",
  crm_synthese: "Synthèse", veille: "Veille", sante: "Santé", journee: "Stats", finance: "Finance", documents: "Docs", admin: "Admin",
};
const ESTCRM = (m: Module) => m === "commercial" || m.startsWith("crm_");
/** Ordre d'affichage : les CRM ensemble, puis le reste. */
const COLONNES = [...MODULES.filter((m) => ESTCRM(m.key)), ...MODULES.filter((m) => !ESTCRM(m.key))];

interface Ligne {
  email: string;
  modules: Module[];
}

export default function Droits() {
  const { peut, user } = useAuth();
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [nouvelEmail, setNouvelEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function charger() {
    const { data, error } = await sb.from("admin_droits")
      .select("email, modules").order("email");
    if (error) { setErr(error.message + " (migration 0021 appliquée ?)"); return; }
    setErr(null);
    setLignes((data as Ligne[]) ?? []);
  }
  useEffect(() => { if (peut("admin")) charger(); }, [peut]);

  async function agir(fn: () => Promise<unknown>) {
    setBusy(true); setErr(null);
    try { await fn(); await charger(); }
    catch (e: any) { setErr(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  const ajouter = () => {
    const email = nouvelEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    agir(async () => {
      const { error } = await sb.from("admin_droits")
        .upsert({ email, modules: MODULES_DEFAUT });
      if (error) throw new Error(error.message);
      setNouvelEmail("");
    });
  };

  const basculer = (l: Ligne, m: Module) => {
    const modules = l.modules.includes(m)
      ? l.modules.filter((x) => x !== m)
      : [...l.modules, m];
    agir(async () => {
      const { error } = await sb.from("admin_droits")
        .update({ modules, updated_at: new Date().toISOString() })
        .eq("email", l.email);
      if (error) throw new Error(error.message);
    });
  };

  const retirer = (email: string) =>
    agir(async () => {
      const { error } = await sb.from("admin_droits").delete().eq("email", email);
      if (error) throw new Error(error.message);
    });

  if (!peut("admin")) {
    return (
      <div>
        <PageHeader title="Droits d'accès" subtitle="Réservé au module Admin" />
        <Card className="p-6 text-sm text-muted-foreground">
          Cette page est réservée aux comptes disposant du module Admin.
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Droits d'accès"
        subtitle="Modules du menu autorisés par utilisateur"
      />

      <p className="mb-3 text-[12px] text-muted-foreground" title={`Non listé : CRM Entreprise, Veille, Santé, Finance, Documents. Super-admins (dont ${user?.email ?? "vous"}) : tous les modules, gérés au SQL Editor (admin_superadmins).`}>
        Non listé = droits par défaut ; une ligne ici les remplace. Super-admins : tous les modules.
      </p>

      {err && (
        <p className="mb-4 break-words rounded-xl border border-orange-400/40 bg-orange-50 px-3.5 py-2 text-[12.5px] text-orange-700">
          {err}
        </p>
      )}

      {/* Ajout d'un utilisateur */}
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          className="ad-input w-full max-w-[280px] rounded-full border border-border bg-card px-4 py-1.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal"
          placeholder="email@avisdoc.fr"
          value={nouvelEmail}
          onChange={(e) => setNouvelEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ajouter()}
        />
        <button
          type="button"
          onClick={ajouter}
          disabled={busy || !nouvelEmail.includes("@")}
          className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-4 py-1.5 text-[13px] font-bold text-white disabled:opacity-40"
        >
          <Plus className="size-4" /> Ajouter
        </button>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full table-fixed text-left text-[13px]">
          <colgroup>
            <col className="w-[22%]" />
            {COLONNES.map((m) => <col key={m.key} />)}
            <col className="w-8" />
          </colgroup>
          <thead>
            <tr className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
              <th />
              {COLONNES.map((m, i) => {
                // « CRM » coiffe les colonnes CRM consécutives.
                if (!ESTCRM(m.key)) return <th key={m.key} />;
                if (i > 0 && ESTCRM(COLONNES[i - 1].key)) return null;
                let n = 0;
                while (i + n < COLONNES.length && ESTCRM(COLONNES[i + n].key)) n++;
                return <th key={m.key} colSpan={n} className="border-b border-border/60 px-1 pt-2 text-center">CRM</th>;
              })}
              <th />
            </tr>
            <tr className="border-b border-border text-[11px] font-semibold text-muted-foreground">
              <th className="px-4 py-2">Utilisateur</th>
              {COLONNES.map((m) => (
                <th key={m.key} className="truncate px-1 py-2 text-center" title={m.label}>{COURT[m.key] ?? m.label}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.email} className="border-b border-border/60 last:border-b-0">
                <td className="truncate px-4 py-2 font-semibold text-avisdoc-ink" title={l.email}>{l.email.replace(/@avisdoc\.fr$/i, "")}</td>
                {COLONNES.map((m) => {
                  const on = l.modules.includes(m.key);
                  return (
                    <td key={m.key} className="px-1 py-2 text-center">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => basculer(l, m.key)}
                        title={`${m.label} : ${on ? "autorisé" : "refusé"}`}
                        className={cn(
                          "size-5 rounded-full border-2 text-[10px] font-bold leading-none transition-colors",
                          on
                            ? "border-avisdoc-teal bg-avisdoc-teal text-white"
                            : "border-border bg-card text-transparent hover:border-avisdoc-ink",
                        )}
                      >
                        ✓
                      </button>
                    </td>
                  );
                })}
                <td className="px-1 py-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => retirer(l.email)}
                    title="Retirer (retour aux droits par défaut)"
                    className="ad-x p-1 text-muted-foreground/60 transition-colors hover:text-orange-600"
                  >
                    <X className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
            {lignes.length === 0 && (
              <tr>
                <td colSpan={COLONNES.length + 2} className="px-5 py-8 text-center text-muted-foreground">
                  Aucun utilisateur listé — tout le monde a les droits par défaut.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
