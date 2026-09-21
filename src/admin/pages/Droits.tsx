// Droits d'accès par module (réservé aux super-admins).
// Chaque utilisateur @avisdoc.fr non listé a les modules par défaut (tout sauf
// Admin) ; une ligne ici remplace ces défauts. Les super-admins (table
// admin_superadmins, gérée au SQL Editor) ont toujours tous les modules.
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { supabaseAdmin as sb } from "../data/supabaseAdmin";
import { useAuth } from "../auth/AuthContext";
import { MODULES, MODULES_DEFAUT, type Module } from "../lib/modules";
import { Card, PageHeader } from "../components/ui";
import { cn } from "@/lib/utils";

interface Ligne {
  email: string;
  modules: Module[];
}

export default function Droits() {
  const { isSuperAdmin, user } = useAuth();
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
  useEffect(() => { if (isSuperAdmin) charger(); }, [isSuperAdmin]);

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

  if (!isSuperAdmin) {
    return (
      <div>
        <PageHeader title="Droits d'accès" subtitle="Réservé aux super-admins" />
        <Card className="p-6 text-sm text-muted-foreground">
          Cette page est réservée aux super-admins du Hub.
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

      <Card className="mb-4 p-5 text-[13px] leading-relaxed text-muted-foreground">
        <p>
          <strong className="text-avisdoc-ink">Règles :</strong> un utilisateur
          @avisdoc.fr <em>non listé</em> a accès à tout <em>sauf</em> Admin ; une
          ligne ci-dessous remplace ces défauts ; les <strong>super-admins</strong>
          {" "}(dont {user?.email}) ont toujours tous les modules — leur liste se
          gère au SQL Editor (table <code>admin_superadmins</code>).
        </p>
      </Card>

      {err && (
        <p className="mb-4 break-words rounded-xl border border-orange-400/40 bg-orange-50 px-3.5 py-2 text-[12.5px] text-orange-700">
          {err}
        </p>
      )}

      {/* Ajout d'un utilisateur */}
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          className="ad-input w-full max-w-[320px] rounded-full border border-border bg-card px-4 py-2.5 text-[13.5px] outline-none transition-colors focus:border-avisdoc-teal"
          placeholder="email@avisdoc.fr"
          value={nouvelEmail}
          onChange={(e) => setNouvelEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ajouter()}
        />
        <button
          type="button"
          onClick={ajouter}
          disabled={busy || !nouvelEmail.includes("@")}
          className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"
        >
          <Plus className="size-4" /> Ajouter
        </button>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-border text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
              <th className="px-5 py-3">Utilisateur</th>
              {MODULES.map((m) => (
                <th key={m.key} className="px-3 py-3 text-center">{m.label}</th>
              ))}
              <th className="w-10 px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.email} className="border-b border-border/60 last:border-b-0">
                <td className="px-5 py-3 font-semibold text-avisdoc-ink">{l.email}</td>
                {MODULES.map((m) => {
                  const on = l.modules.includes(m.key);
                  return (
                    <td key={m.key} className="px-3 py-3 text-center">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => basculer(l, m.key)}
                        title={`${m.label} : ${on ? "autorisé" : "refusé"}`}
                        className={cn(
                          "size-6 rounded-full border-2 text-[12px] font-bold leading-none transition-colors",
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
                <td className="px-3 py-3">
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
                <td colSpan={MODULES.length + 2} className="px-5 py-8 text-center text-muted-foreground">
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
