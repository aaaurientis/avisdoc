// Journal du client (bare) : fil de commentaires horodatés + auteur.
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { journalRepo, type LogEntry } from "./journalRepo";
import { useAuth } from "../auth/AuthContext";
import { initials } from "../lib/format";
import { Avatar } from "../components/ui";

const inputCls =
  "ad-input w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";
const btnAccent = "ad-btn-accent rounded-full bg-avisdoc-teal text-[12.5px] font-bold text-white";

function horodatage(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function JournalCard({ clientId }: { clientId: string }) {
  const { user } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [texte, setTexte] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function recharger() {
    try { setLogs(await journalRepo.liste(clientId)); setErr(null); }
    catch (e: any) { setErr(e?.message ?? String(e)); }
  }
  useEffect(() => { recharger(); /* eslint-disable-next-line */ }, [clientId]);

  async function ajouter() {
    if (!texte.trim() || busy) return;
    setBusy(true); setErr(null);
    try {
      await journalRepo.ajouter(clientId, texte, user?.name || user?.email || "—");
      setTexte("");
      await recharger();
    } catch (e: any) { setErr(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function supprimer(id: string) {
    setBusy(true);
    try { await journalRepo.supprimer(id); await recharger(); }
    catch (e: any) { setErr(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <textarea
          className={`${inputCls} min-h-[44px] min-w-[200px] flex-1 resize-y`}
          placeholder="Ajouter un commentaire au journal…"
          value={texte}
          rows={1}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ajouter(); }}
        />
        <button type="button" onClick={ajouter} disabled={busy || !texte.trim()}
          className={btnAccent} style={{ padding: "10px 18px" }}>
          {busy ? "…" : "Ajouter"}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground/70">⌘/Ctrl + Entrée pour envoyer.</p>

      {err && <p className="mt-2 break-words rounded-xl border border-orange-400/40 bg-orange-50 px-3.5 py-2 text-[12px] text-orange-700">{err}</p>}

      <div className="mt-4 flex flex-col">
        {logs.map((l) => (
          <div key={l.id} className="flex gap-3 border-b border-border/60 py-3 last:border-b-0">
            <Avatar initials={initials(l.auteur || "?")} className="bg-avisdoc-teal/15 text-avisdoc-teal" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-semibold text-avisdoc-ink">{l.auteur || "—"}</span>
                <span className="text-[11px] text-muted-foreground/70">{horodatage(l.created_at)}</span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground/85">{l.message}</p>
            </div>
            <button type="button" onClick={() => supprimer(l.id)} disabled={busy}
              className="ad-x h-fit shrink-0 px-1 text-muted-foreground/50 transition-colors">
              <X className="size-4" />
            </button>
          </div>
        ))}
        {logs.length === 0 && (
          <p className="py-2 text-[13px] italic text-muted-foreground">Aucune entrée pour le moment.</p>
        )}
      </div>
    </div>
  );
}
