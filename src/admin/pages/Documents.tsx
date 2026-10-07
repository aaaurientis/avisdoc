import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowUp, Download, Upload, X } from "lucide-react";
import { toast } from "sonner";
import type { DocItem } from "../types";
import { DOC_EXT, catPalette } from "../lib/ui-tokens";
import { humanSize } from "../lib/format";
import { suggestTags } from "../lib/autotag";
import { useAdminData } from "../data/AdminDataContext";
import { Card, PageHeader } from "../components/ui";
import { cn } from "@/lib/utils";

// Brouillon d'import : destination + tags (pré-suggérés), ajustables avant envoi.
interface ImportDraft {
  file: File;
  parent: string;
  sub: string;
  tags: string[];
}

const COLS = "minmax(180px,2.2fr) 210px 60px 84px minmax(64px,0.8fr) 150px";
// Séparateur interne (caractère de contrôle « unit separator ») pour encoder
// « catégorie ␟ sous-catégorie » dans la valeur d'un <option>.
const SEP = "␟";

interface Preview {
  id: string;
  name: string;
  ext: DocItem["ext"];
  url: string | null;
  loading: boolean;
}

export default function Documents() {
  const {
    docs, docTree, docTags, deleteDoc, importDoc, newDocVersion,
    downloadDoc, documentUrl, setDocCategory, setDocTags,
  } = useAdminData();
  const [cat, setCat] = useState(""); // catégorie (niveau 1) sélectionnée
  const [sub, setSub] = useState<string | null>(null); // sous-catégorie ou toutes
  const [searchParams, setSearchParams] = useSearchParams();
  const urlCat = searchParams.get("cat"); // catégorie demandée via le menu latéral
  const prevUrlCat = useRef<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string[]>([]); // filtre par tags (OU)
  const [importDraft, setImportDraft] = useState<ImportDraft | null>(null);
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

  const currentCat = useMemo(() => docTree.find((c) => c.name === cat), [docTree, cat]);

  // Une catégorie est toujours sélectionnée. Priorité à la catégorie demandée
  // via l'URL (menu latéral) quand elle change ; sinon on garantit une
  // catégorie valide (la première par défaut).
  useEffect(() => {
    if (!docTree.length) return;
    if (urlCat !== prevUrlCat.current) {
      prevUrlCat.current = urlCat;
      if (urlCat && docTree.some((c) => c.name === urlCat)) {
        setCat(urlCat);
        setSub(null);
        return;
      }
    }
    if (!docTree.some((c) => c.name === cat)) {
      setCat(docTree[0].name);
      setSub(null);
    }
  }, [docTree, urlCat, cat]);

  const rows = docs.filter((d) => {
    if (d.catParent !== cat) return false;
    if (sub != null && d.cat !== sub) return false;
    // Filtre par tags : le document doit porter au moins un des tags cochés.
    if (tagFilter.length && !tagFilter.some((t) => d.tags.includes(t))) return false;
    return true;
  });

  // Sous-catégorie cible d'un import : la catégorie courante + la sous-catégorie
  // sélectionnée (ou la première de la catégorie).
  const target = useMemo(
    () => ({ parent: cat, sub: sub ?? currentCat?.subs[0] ?? "" }),
    [cat, sub, currentCat],
  );
  const canImport = Boolean(target.parent && target.sub);

  const selectCat = (name: string) => {
    setCat(name);
    setSub(null);
    // Reflète la catégorie dans l'URL pour que le menu latéral suive.
    setSearchParams(name ? { cat: name } : {}, { replace: true });
  };

  // À la sélection d'un fichier : on n'importe pas directement, on ouvre la
  // fenêtre d'import avec la destination pré-remplie et les tags pré-suggérés.
  const onPickImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!canImport) {
      toast.error("Créez d'abord une catégorie et une sous-catégorie (Réglages).");
      return;
    }
    setImportDraft({
      file,
      parent: target.parent,
      sub: target.sub,
      tags: suggestTags(file.name, target.parent, target.sub, docTags),
    });
  };

  const confirmImport = async () => {
    if (!importDraft) return;
    const { file, parent, sub, tags } = importDraft;
    setImportDraft(null);
    setBusy(true);
    try {
      await importDoc(file, parent, sub, tags);
      toast.success(`« ${file.name} » importé dans « ${parent} › ${sub} ».`);
    } catch { /* toast géré dans le contexte */ } finally { setBusy(false); }
  };

  // Catégorie choisie dans la fenêtre d'import (pour lister ses sous-catégories).
  const draftCat = importDraft && docTree.find((c) => c.name === importDraft.parent);

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
        subtitle={`${docs.length} fichiers · ${docTree.length} catégories`}
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

      {/* Niveau 1 : catégories */}
      <div className="mb-3 flex flex-wrap gap-2">
        {docTree.map((c, i) => {
          const on = cat === c.name;
          const pal = catPalette(i);
          return (
            <button
              key={c.name}
              type="button"
              onClick={() => selectCat(c.name)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors",
                on ? pal.active : "border-border bg-card text-muted-foreground hover:text-avisdoc-ink",
              )}
            >
              {!on && <span className={cn("size-2 shrink-0 rounded-full", pal.dot)} />}
              {c.name}
            </button>
          );
        })}
      </div>

      {/* Niveau 2 : sous-catégories de la catégorie sélectionnée */}
      {currentCat && currentCat.subs.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 border-l-2 border-border pl-3">
          <button
            type="button"
            onClick={() => setSub(null)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
              sub === null
                ? "bg-avisdoc-teal text-white"
                : "bg-muted text-muted-foreground hover:text-avisdoc-ink",
            )}
          >
            Toutes
          </button>
          {currentCat.subs.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSub(s)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                sub === s
                  ? "bg-avisdoc-teal text-white"
                  : "bg-muted text-muted-foreground hover:text-avisdoc-ink",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Filtre par tags standardisés (OU) */}
      {docTags.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
            Tags
          </span>
          {docTags.map((t) => {
            const on = tagFilter.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTagFilter((f) => (on ? f.filter((x) => x !== t) : [...f, t]))}
                className={cn(
                  "rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
                  on ? "bg-avisdoc-ink text-white" : "bg-muted text-muted-foreground hover:text-avisdoc-ink",
                )}
              >
                {t}
              </button>
            );
          })}
          {tagFilter.length > 0 && (
            <button
              type="button"
              onClick={() => setTagFilter([])}
              className="text-[12px] text-muted-foreground underline underline-offset-2 hover:text-avisdoc-ink"
            >
              réinitialiser
            </button>
          )}
        </div>
      )}

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
            // La (sous-)catégorie courante reste proposée même si retirée des Réglages.
            const inTree = docTree.some((c) => c.name === d.catParent && c.subs.includes(d.cat));
            return (
              <div
                key={d.id}
                className="ad-row grid items-center gap-2.5 border-b border-border/60 px-5 py-3 transition-colors last:border-b-0"
                style={{ gridTemplateColumns: COLS }}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[9px] text-[10px] font-bold tracking-wide text-white",
                      DOC_EXT[d.ext],
                    )}
                  >
                    {d.ext}
                  </span>
                  <div className="min-w-0 flex-1">
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
                    {/* Tags du document */}
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {d.tags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 rounded-full bg-avisdoc-teal/12 px-2 py-0.5 text-[10.5px] font-semibold text-avisdoc-teal"
                        >
                          {t}
                          <button
                            type="button"
                            onClick={() => setDocTags(d.id, d.tags.filter((x) => x !== t))}
                            title="Retirer le tag"
                            className="transition-colors hover:text-avisdoc-coral"
                          >
                            <X className="size-2.5" />
                          </button>
                        </span>
                      ))}
                      {docTags.some((t) => !d.tags.includes(t)) && (
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) setDocTags(d.id, [...d.tags, e.target.value]);
                          }}
                          title="Ajouter un tag"
                          className="rounded-full border border-dashed border-border bg-transparent px-1.5 py-0.5 text-[10.5px] text-muted-foreground outline-none transition-colors hover:border-avisdoc-teal"
                        >
                          <option value="">＋ tag</option>
                          {docTags
                            .filter((t) => !d.tags.includes(t))
                            .map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <select
                    value={`${d.catParent}${SEP}${d.cat}`}
                    onChange={(e) => {
                      const [p, s] = e.target.value.split(SEP);
                      setDocCategory(d.id, p, s);
                    }}
                    title="Changer la catégorie"
                    className="ad-input w-full rounded-lg border border-border bg-card px-2 py-1.5 text-[12px] text-muted-foreground outline-none transition-colors hover:border-avisdoc-teal focus:border-avisdoc-teal"
                  >
                    {!inTree && (
                      <option value={`${d.catParent}${SEP}${d.cat}`}>
                        {d.catParent ? `${d.catParent} › ` : ""}{d.cat || "—"}
                      </option>
                    )}
                    {docTree.map((c) => (
                      <optgroup key={c.name} label={c.name}>
                        {c.subs.map((s) => (
                          <option key={`${c.name}${SEP}${s}`} value={`${c.name}${SEP}${s}`}>
                            {s}
                          </option>
                        ))}
                      </optgroup>
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

      {/* Fenêtre d'import : destination + tags pré-suggérés */}
      {importDraft && (
        <div
          onClick={() => setImportDraft(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-avisdoc-ink/50 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-[min(520px,94vw)] flex-col gap-4 rounded-2xl bg-card p-6 shadow-floating"
          >
            <div>
              <h2 className="font-display text-lg font-semibold text-avisdoc-ink">
                Importer un document
              </h2>
              <p className="mt-1 truncate text-[13px] text-muted-foreground">
                {importDraft.file.name} · {humanSize(importDraft.file.size)}
              </p>
            </div>

            {/* Destination */}
            <div className="flex gap-2">
              <label className="flex-1 text-[12px] font-semibold text-muted-foreground">
                Catégorie
                <select
                  value={importDraft.parent}
                  onChange={(e) => {
                    const parent = e.target.value;
                    const firstSub = docTree.find((c) => c.name === parent)?.subs[0] ?? "";
                    setImportDraft((d) =>
                      d
                        ? { ...d, parent, sub: firstSub, tags: suggestTags(d.file.name, parent, firstSub, docTags) }
                        : d,
                    );
                  }}
                  className="ad-input mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-2 text-[13px] text-avisdoc-ink outline-none focus:border-avisdoc-teal"
                >
                  {docTree.map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex-1 text-[12px] font-semibold text-muted-foreground">
                Sous-catégorie
                <select
                  value={importDraft.sub}
                  onChange={(e) => {
                    const s = e.target.value;
                    setImportDraft((d) =>
                      d ? { ...d, sub: s, tags: suggestTags(d.file.name, d.parent, s, docTags) } : d,
                    );
                  }}
                  className="ad-input mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-2 text-[13px] text-avisdoc-ink outline-none focus:border-avisdoc-teal"
                >
                  {(draftCat?.subs ?? []).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>

            {/* Tags pré-suggérés (modifiables) */}
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold text-muted-foreground">
                Tags
                <span className="rounded-full bg-avisdoc-teal/12 px-2 py-0.5 text-[10.5px] font-bold text-avisdoc-teal">
                  pré-suggérés automatiquement
                </span>
              </div>
              {docTags.length === 0 ? (
                <p className="text-[12.5px] italic text-muted-foreground">
                  Aucun tag défini (Réglages).
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {docTags.map((t) => {
                    const on = importDraft.tags.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() =>
                          setImportDraft((d) =>
                            d
                              ? { ...d, tags: on ? d.tags.filter((x) => x !== t) : [...d.tags, t] }
                              : d,
                          )
                        }
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors",
                          on
                            ? "bg-avisdoc-teal text-white"
                            : "bg-muted text-muted-foreground hover:text-avisdoc-ink",
                        )}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-1 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImportDraft(null)}
                className="ad-btn-outline rounded-full border-[1.5px] border-border px-4 py-2 text-[13px] font-bold text-avisdoc-ink"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void confirmImport()}
                disabled={!importDraft.sub}
                className="ad-btn-navy inline-flex items-center gap-1.5 rounded-full bg-avisdoc-ink px-5 py-2 text-[13px] font-bold text-white disabled:opacity-60"
              >
                <Upload className="size-4" /> Importer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
