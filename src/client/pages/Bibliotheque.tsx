import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { PHASES, type GeneratedDoc, type PhaseCampagne } from "../lib/types";

export function Bibliotheque({ clientId }: { clientId: string }) {
  const [docs, setDocs] = useState<GeneratedDoc[]>([]);
  const [phase, setPhase] = useState<PhaseCampagne | "">("");
  const [format, setFormat] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("admin_generated_docs").select("*").eq("client_id", clientId).order("phase")
      .then(({ data, error }) => {
        if (error) setErr(error.message);
        else setDocs((data ?? []) as GeneratedDoc[]);
      });
  }, [clientId]);

  const formats = useMemo(() => Array.from(new Set(docs.map((d) => d.format))).sort(), [docs]);
  const visibles = docs.filter((d) => (!phase || d.phase === phase) && (!format || d.format === format));

  async function ouvrir(d: GeneratedDoc) {
    setErr(null);
    if (d.storage_bucket === "espace-docs-public") {
      const { data } = supabase.storage.from(d.storage_bucket).getPublicUrl(d.storage_path);
      window.open(data.publicUrl, "_blank", "noopener");
      return;
    }
    const { data, error } = await supabase.storage.from(d.storage_bucket).createSignedUrl(d.storage_path, 3600);
    if (error) setErr(error.message);
    else window.open(data.signedUrl, "_blank", "noopener");
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-avisdoc-ink">Vos documents</h1>
        <div className="flex gap-2">
          <select value={phase} onChange={(e) => setPhase(e.target.value as PhaseCampagne | "")}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
            <option value="">Toutes les phases</option>
            {PHASES.map((p) => <option key={p.valeur} value={p.valeur}>{p.libelle}</option>)}
          </select>
          <select value={format} onChange={(e) => setFormat(e.target.value)}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
            <option value="">Tous les formats</option>
            {formats.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>

      {err && <p className="mt-4 text-sm text-orange-600">{err}</p>}

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {visibles.map((d) => (
          <li key={d.id} className="flex flex-col justify-between rounded-xl border border-border bg-card p-4">
            <div>
              <p className="font-medium">{d.titre}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded bg-muted px-2 py-0.5">{PHASES.find((p) => p.valeur === d.phase)?.libelle}</span>
                <span>{d.format}</span><span>v{d.version}</span>
              </p>
            </div>
            <button onClick={() => ouvrir(d)}
              className="mt-4 self-start rounded-xl bg-avisdoc-ink px-3 py-2 text-sm text-white hover:opacity-90">
              Aperçu / Télécharger
            </button>
          </li>
        ))}
        {visibles.length === 0 && (
          <li className="col-span-full rounded-xl border border-border bg-card px-4 py-8 text-center text-muted-foreground">
            Aucun document pour ces filtres.
          </li>
        )}
      </ul>
    </div>
  );
}
