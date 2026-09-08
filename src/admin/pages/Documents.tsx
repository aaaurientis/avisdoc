import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { ArrowUp, Download, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { DOC_EXT } from "../lib/ui-tokens";
import { useAdminData } from "../data/AdminDataContext";
import { Card, PageHeader } from "../components/ui";
import { cn } from "@/lib/utils";

const COLS = "minmax(180px,2.4fr) 100px 60px 84px minmax(64px,0.8fr) 150px";

export default function Documents() {
  const { docs, docTypes, deleteDoc, importDoc, newDocVersion, downloadDoc } = useAdminData();
  const [cat, setCat] = useState("Tous");
  const [busy, setBusy] = useState(false);

  const importInputRef = useRef<HTMLInputElement>(null);
  const versionInputRef = useRef<HTMLInputElement>(null);
  const versionTargetId = useRef<string | null>(null);

  const tabs = useMemo(() => ["Tous", ...docTypes], [docTypes]);
  const rows = docs.filter((d) => cat === "Tous" || d.cat === cat);

  // Catégorie d'affectation à l'import : l'onglet actif, sinon le 1er type.
  const targetCat = cat !== "Tous" ? cat : docTypes[0] ?? "Autre";

  const onPickImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permet de réimporter le même fichier
    if (!file) return;
    setBusy(true);
    try {
      await importDoc(file, targetCat);
      toast.success(`« ${file.name} » importé dans « ${targetCat} ».`);
    } catch {
      /* toast d'erreur géré dans le contexte */
    } finally {
      setBusy(false);
    }
  };

  const onPickVersion = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const id = versionTargetId.current;
    e.target.value = "";
    versionTargetId.current = null;
    if (!file || !id) return;
    setBusy(true);
    try {
      await newDocVersion(id, file);
      toast.success("Nouvelle version enregistrée.");
    } catch {
      /* toast d'erreur géré dans le contexte */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle={`${docs.length} fichiers · conventions, comptes-rendus, juridique`}
        action={
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={busy}
            className="ad-btn-navy inline-flex items-center gap-1.5 rounded-full bg-avisdoc-ink px-5 py-2.5 text-sm font-bold text-white transition-colors disabled:opacity-60"
          >
            <Upload className="size-4" /> {busy ? "Import…" : "Importer un document"}
          </button>
        }
      />

      {/* Inputs fichiers masqués */}
      <input ref={importInputRef} type="file" hidden onChange={onPickImport} />
      <input ref={versionInputRef} type="file" hidden onChange={onPickVersion} />

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const on = cat === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setCat(t)}
              className={cn(
                "rounded-full border px-4.5 py-2 text-[13px] font-semibold transition-colors",
                on
                  ? "border-avisdoc-ink bg-avisdoc-ink text-white"
                  : "border-border bg-card text-muted-foreground hover:text-avisdoc-ink",
              )}
              style={{ paddingLeft: 18, paddingRight: 18 }}
            >
              {t}
            </button>
          );
        })}
      </div>

      <Card className="overflow-x-auto">
        <div style={{ minWidth: 720 }}>
          <div
            className="grid gap-2.5 whitespace-nowrap border-b border-border/60 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground"
            style={{ gridTemplateColumns: COLS }}
          >
            <div className="truncate">Nom du fichier</div>
            <div>Catégorie</div>
            <div>Taille</div>
            <div>Ajouté le</div>
            <div>Par</div>
            <div className="text-right">Actions</div>
          </div>

          {rows.map((d) => (
            <div
              key={d.id}
              className="ad-row grid items-center gap-2.5 border-b border-border/60 px-5 py-3 transition-colors last:border-b-0"
              style={{ gridTemplateColumns: COLS }}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    "inline-flex size-9 shrink-0 items-center justify-center rounded-[9px] text-[10px] font-bold tracking-wide text-white",
                    DOC_EXT[d.ext],
                  )}
                >
                  {d.ext}
                </span>
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadDoc(d.id)}
                    title="Télécharger"
                    className="truncate text-left text-[13.5px] font-semibold text-avisdoc-ink hover:text-avisdoc-teal hover:underline"
                  >
                    {d.name}
                  </button>
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                    v{d.version}
                  </span>
                </div>
              </div>
              <div className="text-[12.5px] text-muted-foreground">{d.cat}</div>
              <div className="text-[12.5px] text-muted-foreground">{d.size}</div>
              <div className="text-[12.5px] text-muted-foreground">{d.date}</div>
              <div className="min-w-0 truncate text-[12.5px] text-muted-foreground">{d.owner}</div>
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => downloadDoc(d.id)}
                  title="Télécharger le document"
                  className="ad-chip inline-flex items-center rounded-full bg-muted px-2 py-1.5 text-muted-foreground transition-[filter] hover:text-avisdoc-ink"
                >
                  <Download className="size-3.5" />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    versionTargetId.current = d.id;
                    versionInputRef.current?.click();
                  }}
                  title="Importer une nouvelle version"
                  className="ad-chip inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sky-100 px-2.5 py-1.5 text-[11px] font-bold text-sky-700 transition-[filter] disabled:opacity-60"
                >
                  <ArrowUp className="size-3" /> Version
                </button>
                <button
                  type="button"
                  onClick={() => deleteDoc(d.id)}
                  title="Supprimer le document"
                  className="ad-chip inline-flex items-center rounded-full bg-rose-100 px-2 py-1.5 text-[12px] font-bold text-rose-700 transition-[filter]"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          ))}

          {rows.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Aucun document dans cette catégorie.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
