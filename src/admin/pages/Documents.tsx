import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ArrowUp, Download, Upload, X } from "lucide-react";
import { toast } from "sonner";
import type { DocItem } from "../types";
import { DOC_EXT } from "../lib/ui-tokens";
import { useAdminData } from "../data/AdminDataContext";
import { Card, PageHeader } from "../components/ui";
import { cn } from "@/lib/utils";

const COLS = "minmax(180px,2.4fr) 150px 60px 84px minmax(64px,0.8fr) 150px";

interface Preview {
  id: string;
  name: string;
  ext: DocItem["ext"];
  url: string | null;
  loading: boolean;
}

export default function Documents() {
  const {
    docs, docTypes, deleteDoc, importDoc, newDocVersion,
    downloadDoc, documentUrl, setDocCategory,
  } = useAdminData();
  const [cat, setCat] = useState("Tous");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [renderError, setRenderError] = useState(false);

  const importInputRef = useRef<HTMLInputElement>(null);
  const versionInputRef = useRef<HTMLInputElement>(null);
  const versionTargetId = useRef<string | null>(null);
  const officeRef = useRef<HTMLDivElement>(null);

  // Formats prévisualisables dans le navigateur (aucun service externe).
  const canRenderInline = (ext: DocItem["ext"]) =>
    ext === "PDF" || ext === "DOC" || ext === "XLS" || ext === "PPT";

  // Rendus dans un conteneur local (≠ PDF affiché en iframe).
  const isOfficeRender = (ext: DocItem["ext"]) =>
    ext === "DOC" || ext === "XLS" || ext === "PPT";

  const tabs = useMemo(() => ["Tous", ...docTypes], [docTypes]);
  const rows = docs.filter((d) => cat === "Tous" || d.cat === cat);
  const targetCat = cat !== "Tous" ? cat : docTypes[0] ?? "Autre";

  const onPickImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      await importDoc(file, targetCat);
      toast.success(`« ${file.name} » importé dans « ${targetCat} ».`);
    } catch { /* toast géré dans le contexte */ } finally { setBusy(false); }
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
    } catch { /* toast géré dans le contexte */ } finally { setBusy(false); }
  };

  // Ouvre l'aperçu intégré. PDF → iframe ; Word/Excel/PowerPoint → rendu local ;
  // autres formats → repli (téléchargement).
  const openPreview = async (d: DocItem) => {
    setRenderError(false);
    if (!canRenderInline(d.ext)) {
      setPreview({ id: d.id, name: d.name, ext: d.ext, url: null, loading: false });
      return;
    }
    setPreview({ id: d.id, name: d.name, ext: d.ext, url: null, loading: true });
    const url = await documentUrl(d.id, false);
    setPreview((p) => (p && p.id === d.id ? { ...p, url, loading: false } : p));
  };

  // Rendu Word (.docx) / Excel (.xlsx) / PowerPoint (.pptx) directement dans le
  // navigateur — les bibliothèques sont chargées à la demande, aucun fichier
  // n'est envoyé à un service externe.
  useEffect(() => {
    if (!preview || preview.loading || !preview.url) return;
    if (!isOfficeRender(preview.ext)) return;
    const el = officeRef.current;
    if (!el) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(preview.url as string);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        el.innerHTML = "";
        if (preview.ext === "XLS") {
          const XLSX = await import("xlsx");
          const wb = XLSX.read(buf, { type: "array" });
          if (cancelled) return;
          el.innerHTML = wb.SheetNames
            .map((n) => `<div class="ad-sheet">${n}</div>` + XLSX.utils.sheet_to_html(wb.Sheets[n]))
            .join("");
        } else if (preview.ext === "PPT") {
          const { init } = await import("pptx-preview");
          if (cancelled) return;
          const width = Math.min(el.clientWidth || 900, 960);
          const previewer = init(el, { width, mode: "list" });
          await previewer.preview(buf);
        } else {
          const { renderAsync } = await import("docx-preview");
          await renderAsync(buf, el, undefined, { inWrapper: true });
        }
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          setRenderError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preview]);

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
        <div style={{ minWidth: 760 }}>
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

          {rows.map((d) => {
            // La catégorie courante est toujours proposée, même si retirée des Réglages.
            const options = Array.from(new Set([...docTypes, d.cat])).filter(Boolean);
            return (
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
                      onClick={() => openPreview(d)}
                      title="Aperçu du document"
                      className="truncate text-left text-[13.5px] font-semibold text-avisdoc-ink hover:text-avisdoc-teal hover:underline"
                    >
                      {d.name}
                    </button>
                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                      v{d.version}
                    </span>
                  </div>
                </div>
                <div>
                  <select
                    value={d.cat}
                    onChange={(e) => setDocCategory(d.id, e.target.value)}
                    title="Changer la catégorie"
                    className="ad-input w-full rounded-lg border border-border bg-card px-2 py-1.5 text-[12.5px] text-muted-foreground outline-none transition-colors hover:border-avisdoc-teal focus:border-avisdoc-teal"
                  >
                    {options.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
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
            );
          })}

          {rows.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Aucun document dans cette catégorie.
            </div>
          )}
        </div>
      </Card>

      {/* Visionneuse intégrée */}
      {preview && (
        <div
          onClick={() => setPreview(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-avisdoc-ink/50 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-[85vh] w-[min(1000px,92vw)] flex-col overflow-hidden rounded-2xl bg-card shadow-floating"
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <span
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[9.5px] font-bold text-white",
                  DOC_EXT[preview.ext],
                )}
              >
                {preview.ext}
              </span>
              <div className="min-w-0 flex-1 truncate text-[14px] font-semibold text-avisdoc-ink">
                {preview.name}
              </div>
              <button
                type="button"
                onClick={() => downloadDoc(preview.id)}
                title="Télécharger"
                className="ad-btn-outline inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-border px-3.5 py-1.5 text-[12.5px] font-bold text-avisdoc-ink transition-colors"
              >
                <Download className="size-3.5" /> Télécharger
              </button>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-lg p-1 text-muted-foreground transition-colors hover:text-avisdoc-ink"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 bg-muted/30">
              {preview.ext === "PDF" && preview.url ? (
                <iframe title={preview.name} src={preview.url} className="size-full border-0" />
              ) : isOfficeRender(preview.ext) && preview.url && !renderError ? (
                <div className="h-full overflow-auto p-4">
                  <div
                    ref={officeRef}
                    className={cn(
                      preview.ext === "PPT"
                        ? "mx-auto w-full max-w-[960px]"
                        : "mx-auto max-w-[900px] rounded-lg bg-white p-6 text-[13px] text-avisdoc-ink shadow-sm [&_.ad-sheet:first-child]:mt-0 [&_.ad-sheet]:mb-2 [&_.ad-sheet]:mt-5 [&_.ad-sheet]:text-[13px] [&_.ad-sheet]:font-bold [&_.ad-sheet]:uppercase [&_.ad-sheet]:tracking-wide [&_.ad-sheet]:text-muted-foreground [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1",
                    )}
                  />
                </div>
              ) : preview.loading ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Chargement de l'aperçu…
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    {preview.ext === "PDF"
                      ? "Le document n'a pas pu être chargé pour l'aperçu."
                      : "Impossible d'afficher l'aperçu de ce document. Téléchargez-le pour le consulter."}
                  </p>
                  <button
                    type="button"
                    onClick={() => downloadDoc(preview.id)}
                    className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white"
                  >
                    <Download className="size-4" /> Télécharger le document
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
