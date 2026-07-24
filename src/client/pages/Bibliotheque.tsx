import { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { supabase } from "../lib/supabase";
import { PHASES, type GeneratedDoc, type PhaseCampagne } from "../lib/types";
import { Badge, Card, PageHeader } from "../../admin/components/ui";

const selectCls =
  "rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-avisdoc-teal";

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
      <PageHeader
        title="Vos documents"
        subtitle={`${docs.length} document${docs.length > 1 ? "s" : ""} de campagne à votre disposition`}
        action={
          <div className="flex gap-2">
            <select value={phase} onChange={(e) => setPhase(e.target.value as PhaseCampagne | "")} className={selectCls}>
              <option value="">Toutes les phases</option>
              {PHASES.map((p) => <option key={p.valeur} value={p.valeur}>{p.libelle}</option>)}
            </select>
            <select value={format} onChange={(e) => setFormat(e.target.value)} className={selectCls}>
              <option value="">Tous les formats</option>
              {formats.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        }
      />

      {err && (
        <p className="mb-4 rounded-xl border border-orange-400/40 bg-orange-50 px-3.5 py-2 text-sm text-orange-700">{err}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {visibles.map((d) => (
          <Card key={d.id} className="flex flex-col justify-between p-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-avisdoc-teal/12 text-avisdoc-teal">
                <FileText className="size-[18px]" strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-avisdoc-ink">{d.titre}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Badge className="bg-muted text-muted-foreground">
                    {PHASES.find((p) => p.valeur === d.phase)?.libelle ?? d.phase}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{d.format} · v{d.version}</span>
                </p>
              </div>
            </div>
            <button
              onClick={() => ouvrir(d)}
              className="mt-4 self-start rounded-xl bg-avisdoc-ink px-3.5 py-2 text-[13px] font-medium text-white hover:opacity-90"
            >
              Aperçu / Télécharger
            </button>
          </Card>
        ))}
        {visibles.length === 0 && (
          <Card className="col-span-full px-4 py-10 text-center text-muted-foreground">
            Aucun document pour ces filtres.
          </Card>
        )}
      </div>
    </div>
  );
}
