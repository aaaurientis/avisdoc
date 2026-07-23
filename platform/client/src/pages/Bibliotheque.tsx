import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { PHASES, type DocumentGenere, type PhaseCampagne } from "../lib/types";

export function Bibliotheque({ clientId }: { clientId: string }) {
  const [docs, setDocs] = useState<DocumentGenere[]>([]);
  const [phase, setPhase] = useState<PhaseCampagne | "">("");
  const [format, setFormat] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // On borne explicitement à SON client (la RLS autorise aussi les documents
    // publics d'autres clients ; ici on ne veut que l'espace de l'utilisateur).
    supabase
      .from("documents")
      .select("*")
      .eq("client_id", clientId)
      .order("phase")
      .then(({ data, error }) => {
        if (error) setErr(error.message);
        else setDocs((data ?? []) as DocumentGenere[]);
      });
  }, [clientId]);

  const formats = useMemo(
    () => Array.from(new Set(docs.map((d) => d.format))).sort(),
    [docs]
  );

  const visibles = docs.filter(
    (d) => (!phase || d.phase === phase) && (!format || d.format === format)
  );

  async function ouvrir(d: DocumentGenere) {
    setErr(null);
    if (d.storage_bucket === "documents-public") {
      const { data } = supabase.storage.from(d.storage_bucket).getPublicUrl(d.storage_path);
      window.open(data.publicUrl, "_blank", "noopener");
      return;
    }
    const { data, error } = await supabase.storage
      .from(d.storage_bucket)
      .createSignedUrl(d.storage_path, 3600);
    if (error) setErr(error.message);
    else window.open(data.signedUrl, "_blank", "noopener");
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl">Vos documents</h1>
        <div className="flex gap-2">
          <select
            value={phase}
            onChange={(e) => setPhase(e.target.value as PhaseCampagne | "")}
            className="rounded border border-filet bg-white px-3 py-1.5 text-sm"
          >
            <option value="">Toutes les phases</option>
            {PHASES.map((p) => (
              <option key={p.valeur} value={p.valeur}>{p.libelle}</option>
            ))}
          </select>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="rounded border border-filet bg-white px-3 py-1.5 text-sm"
          >
            <option value="">Tous les formats</option>
            {formats.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
      </div>

      {err && <p className="mt-4 text-sm text-orange">{err}</p>}

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {visibles.map((d) => (
          <li key={d.id} className="flex flex-col justify-between rounded-lg border border-filet bg-white p-4">
            <div>
              <p className="font-medium">{d.titre}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ardoise">
                <span className="rounded bg-filet px-2 py-0.5">
                  {PHASES.find((p) => p.valeur === d.phase)?.libelle}
                </span>
                <span>{d.format}</span>
                <span>v{d.version}</span>
              </p>
            </div>
            <button
              onClick={() => ouvrir(d)}
              className="mt-4 self-start rounded bg-marine px-3 py-1.5 text-sm text-creme"
            >
              Aperçu / Télécharger
            </button>
          </li>
        ))}
        {visibles.length === 0 && (
          <li className="col-span-full rounded-lg border border-filet bg-white px-4 py-8 text-center text-ardoise">
            Aucun document pour ces filtres.
          </li>
        )}
      </ul>
    </div>
  );
}
