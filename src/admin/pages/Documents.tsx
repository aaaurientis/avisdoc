import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowDownWideNarrow, ArrowUp, ArrowUpDown, ArrowUpNarrowWide, ChevronDown, Download, Loader2, Search, Tag, Upload, X } from "lucide-react";
import { toast } from "sonner";
import type { DocItem } from "../types";
import { DOC_EXT, catPalette } from "../lib/ui-tokens";
import { humanSize } from "../lib/format";
import { suggestTags } from "../lib/autotag";
import { useAdminData } from "../data/AdminDataContext";
import { useAuth } from "../auth/AuthContext";
import { deckRepo, FORMATS_CHARTE, type DeckJob } from "../data/deckRepo";
import { Card, PageHeader } from "../components/ui";
import { cn } from "@/lib/utils";

// Brouillon d'import : destination + tags (pré-suggérés), ajustables avant envoi.
interface ImportDraft {
  file: File;
  parent: string;
  sub: string;
  tags: string[];
}

const COLS = "minmax(180px,2.4fr) 210px 92px minmax(64px,0.8fr) 150px";

type CleTri = "nom" | "categorie" | "date" | "par";
type Tri = { cle: CleTri; sens: 1 | -1 };

function Compteur({ n, on }: { n: number; on: boolean }) {
  return (
    <span className={cn("rounded-full px-1.5 text-[10.5px] font-bold leading-[18px]", on ? "bg-white/25 text-white" : "bg-muted text-muted-foreground")}>{n}</span>
  );
}

function EnTete({ cle, tri, trier, children }: { cle: CleTri; tri: Tri; trier: (c: CleTri) => void; children: React.ReactNode }) {
  const actif = tri.cle === cle;
  return (
    <button type="button" onClick={() => trier(cle)} className={cn("inline-flex items-center gap-1 truncate text-left uppercase hover:text-avisdoc-ink", actif && "text-avisdoc-ink")}>
      {children}
      {actif ? (tri.sens === 1 ? <ArrowUpNarrowWide className="size-3" /> : <ArrowDownWideNarrow className="size-3" />) : <ArrowUpDown className="size-3 opacity-40" />}
    </button>
  );
}

const sansAccents = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
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
  const { user } = useAuth();
  // Mise à la charte d'un fichier (PowerPoint, Word, PDF) sans l'enregistrer : on dépose, on télécharge.
  const charteInputRef = useRef<HTMLInputElement>(null);
  const [charte, setCharte] = useState<DeckJob | null>(null);
  const [charteNom, setCharteNom] = useState("");
  const [charteLien, setCharteLien] = useState<string | null>(null);
  const charteEnCours = !!charte && (charte.statut === "en_attente" || charte.statut === "en_cours");
  useEffect(() => {
    if (!charte || !charteEnCours) return;
    const t = window.setInterval(async () => {
      const j = await deckRepo.job(charte.id).catch(() => null);
      if (!j) return;
      setCharte(j);
      if (j.statut === "termine") setCharteLien(await deckRepo.lienResultat(j));
    }, 3000);
    return () => window.clearInterval(t);
  }, [charte, charteEnCours]);
  const onPickCharte = async (e: ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier) return;
    if (!/\.(pptx|docx|pdf)$/i.test(fichier.name)) {
      toast.error("Formats pris en charge : PowerPoint (.pptx), Word (.docx) et PDF.");
      return;
    }
    setCharteNom(fichier.name);
    setCharteLien(null);
    setCharte({ id: "", statut: "en_attente", mode: null, resultatPath: null, sourceNom: fichier.name, erreurs: null, avertissements: null, rapport: null, erreur: null });
    try {
      const id = await deckRepo.lancer(fichier, user?.name ?? "—");
      const j = await deckRepo.job(id);
      setCharte(j);
      if (j?.statut === "termine") setCharteLien(await deckRepo.lienResultat(j));
    } catch (err) {
      setCharte(null);
      toast.error(`Mise à la charte impossible : ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const fermerCharte = () => {
    if (charte && charte.statut === "termine") void deckRepo.effacer(charte); // rien n'est conservé
    setCharte(null);
    setCharteLien(null);
  };
  const [cat, setCat] = useState(""); // catégorie (niveau 1) sélectionnée
  const [sub, setSub] = useState<string | null>(null); // sous-catégorie ou toutes
  const [searchParams, setSearchParams] = useSearchParams();
  const urlCat = searchParams.get("cat"); // catégorie demandée via le menu latéral
  const prevUrlCat = useRef<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string[]>([]); // filtre par tags (OU)
  const [recherche, setRecherche] = useState("");
  const [tagsOuverts, setTagsOuverts] = useState(false);
  const tagsRef = useRef<HTMLDivElement>(null);
  // « date » croissant = du plus récent au plus ancien.
  const [tri, setTri] = useState<Tri>({ cle: "date", sens: 1 });
  const trier = (cle: CleTri) => setTri((t) => (t.cle === cle ? { cle, sens: t.sens === 1 ? -1 : 1 } : { cle, sens: 1 }));

  // Le menu des tags se ferme au clic ailleurs.
  useEffect(() => {
    if (!tagsOuverts) return;
    const fermer = (e: MouseEvent) => { if (!tagsRef.current?.contains(e.target as Node)) setTagsOuverts(false); };
    document.addEventListener("mousedown", fermer);
    return () => document.removeEventListener("mousedown", fermer);
  }, [tagsOuverts]);
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

  // Une recherche porte sur tous les documents, quelle que soit la catégorie choisie.
  const mots = sansAccents(recherche.trim()).split(/\s+/).filter(Boolean);
  const correspond = (d: DocItem) => {
    if (!mots.length) return true;
    const texte = sansAccents([d.name, d.catParent, d.cat, d.owner, ...d.tags].join(" "));
    return mots.every((m) => texte.includes(m));
  };
  const dansPortee = (d: DocItem) => (mots.length ? correspond(d) : d.catParent === cat && (sub == null || d.cat === sub));
  const avecTags = (d: DocItem) => !tagFilter.length || tagFilter.some((t) => d.tags.includes(t));

  // Compteurs : catégories et sous-catégories (avec les tags choisis), tags (dans la portée courante).
  const nbParCat = new Map<string, number>();
  const nbParSub = new Map<string, number>();
  for (const d of docs) {
    if (!avecTags(d)) continue;
    nbParCat.set(d.catParent, (nbParCat.get(d.catParent) ?? 0) + 1);
    if (d.catParent === cat) nbParSub.set(d.cat, (nbParSub.get(d.cat) ?? 0) + 1);
  }
  const nbParTag = new Map<string, number>();
  for (const d of docs) if (dansPortee(d)) for (const t of d.tags) nbParTag.set(t, (nbParTag.get(t) ?? 0) + 1);

  const ordre = new Map(docs.map((d, i) => [d.id, i])); // chargés du plus récent au plus ancien
  const cleDe = (d: DocItem): string | number =>
    tri.cle === "nom" ? sansAccents(d.name)
    : tri.cle === "categorie" ? sansAccents(`${d.catParent} ${d.cat}`)
    : tri.cle === "par" ? sansAccents(d.owner)
    : d.createdAt ? -Date.parse(d.createdAt) : (ordre.get(d.id) ?? 0);
  const rows = docs
    .filter((d) => dansPortee(d) && avecTags(d))
    .sort((a, b) => {
      const x = cleDe(a), y = cleDe(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "fr");
      return c * tri.sens;
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
            .map((n) => `<div class="hub-sheet">${n}</div>` + XLSX.utils.sheet_to_html(wb.Sheets[n]))
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
          <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => charteInputRef.current?.click()}
            disabled={charteEnCours}
            title="Remettre un PowerPoint, un Word ou un PDF à la charte AvisDoc, puis le télécharger (rien n'est enregistré)"
            className="hub-btn-outline inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-border bg-card px-5 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors disabled:opacity-60"
          >
            Mettre à la charte
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={busy}
            className="hub-btn-navy inline-flex items-center gap-1.5 rounded-full bg-avisdoc-ink px-5 py-2.5 text-sm font-bold text-white transition-colors disabled:opacity-60"
          >
            <Upload className="size-4" /> {busy ? "Import…" : "Importer un document"}
          </button>
          </div>
        }
      />

      <input ref={importInputRef} type="file" hidden onChange={onPickImport} />
      <input ref={charteInputRef} type="file" hidden accept={FORMATS_CHARTE} onChange={(e) => void onPickCharte(e)} />
      <input ref={versionInputRef} type="file" hidden onChange={onPickVersion} />

      {/* Filtres : catégorie, sous-catégorie, puis recherche et tags sur une ligne. Chacun avec son nombre de documents. */}
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap gap-1.5">
          {docTree.map((c, i) => {
            const on = cat === c.name && !recherche;
            const pal = catPalette(i);
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => { selectCat(c.name); setRecherche(""); }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                  on ? pal.active : "border-border bg-card text-muted-foreground hover:text-avisdoc-ink",
                )}
              >
                {!on && <span className={cn("size-2 shrink-0 rounded-full", pal.dot)} />}
                {c.name}
                <Compteur n={nbParCat.get(c.name) ?? 0} on={on} />
              </button>
            );
          })}
        </div>

        {currentCat && currentCat.subs.length > 0 && !recherche && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
            <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">Sous-catégorie</span>
            {[null, ...currentCat.subs].map((s) => {
              const on = sub === s;
              const n = s === null ? (nbParCat.get(cat) ?? 0) : (nbParSub.get(s) ?? 0);
              return (
                <button
                  key={s ?? "__toutes"}
                  type="button"
                  onClick={() => setSub(s)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors",
                    on ? "bg-avisdoc-teal text-white" : "bg-muted text-muted-foreground hover:text-avisdoc-ink",
                    n === 0 && !on && "opacity-55",
                  )}
                >
                  {s ?? "Toutes"}
                  <Compteur n={n} on={on} />
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
          <label className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher dans tous les documents (nom, tag, catégorie, auteur)…"
              className="hub-input w-full rounded-full border border-border bg-card py-1.5 pl-8 pr-3 text-[12.5px] text-avisdoc-ink outline-none focus:border-avisdoc-teal"
            />
          </label>
          {docTags.length > 0 && (
            <div className="relative" ref={tagsRef}>
              <button
                type="button"
                onClick={() => setTagsOuverts((o) => !o)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                  tagFilter.length ? "border-avisdoc-ink bg-avisdoc-ink text-white" : "border-border bg-card text-muted-foreground hover:text-avisdoc-ink",
                )}
              >
                <Tag className="size-3.5" /> Tags{tagFilter.length ? ` · ${tagFilter.length}` : ""}
                <ChevronDown className="size-3.5" />
              </button>
              {tagsOuverts && (
                <div className="absolute right-0 z-20 mt-1.5 max-h-80 w-64 overflow-auto rounded-xl border border-border bg-card p-1.5 shadow-floating">
                  {docTags.map((t) => {
                    const on = tagFilter.includes(t);
                    const n = nbParTag.get(t) ?? 0;
                    return (
                      <label key={t} className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] hover:bg-accent", n === 0 && !on && "opacity-55")}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => setTagFilter((f) => (on ? f.filter((x) => x !== t) : [...f, t]))}
                          className="size-3.5 accent-avisdoc-ink"
                        />
                        <span className="min-w-0 flex-1 truncate text-avisdoc-ink">{t}</span>
                        <span className="text-[11px] font-semibold text-muted-foreground">{n}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {tagFilter.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTagFilter((f) => f.filter((x) => x !== t))}
              className="inline-flex items-center gap-1 rounded-full bg-avisdoc-teal/12 px-2.5 py-1 text-[11.5px] font-semibold text-avisdoc-teal"
              title="Retirer ce filtre"
            >
              {t} <X className="size-3" />
            </button>
          ))}
          {(tagFilter.length > 0 || recherche) && (
            <button
              type="button"
              onClick={() => { setTagFilter([]); setRecherche(""); }}
              className="text-[12px] text-muted-foreground underline underline-offset-2 hover:text-avisdoc-ink"
            >
              réinitialiser
            </button>
          )}
          <span className="ml-auto text-[12px] font-semibold text-muted-foreground">
            {rows.length} document{rows.length > 1 ? "s" : ""}{recherche ? " trouvé" + (rows.length > 1 ? "s" : "") + " (toutes catégories)" : ""}
          </span>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <div style={{ minWidth: 700 }}>
          <div
            className="grid gap-2.5 whitespace-nowrap border-b border-border/60 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground"
            style={{ gridTemplateColumns: COLS }}
          >
            <EnTete cle="nom" tri={tri} trier={trier}>Nom du fichier</EnTete>
            <EnTete cle="categorie" tri={tri} trier={trier}>Catégorie</EnTete>
            <EnTete cle="date" tri={tri} trier={trier}>Ajouté le</EnTete>
            <EnTete cle="par" tri={tri} trier={trier}>Par</EnTete>
            <div className="text-right">Actions</div>
          </div>

          {rows.map((d) => {
            // La (sous-)catégorie courante reste proposée même si retirée des Réglages.
            const inTree = docTree.some((c) => c.name === d.catParent && c.subs.includes(d.cat));
            return (
              <div
                key={d.id}
                className="hub-row grid items-center gap-2.5 border-b border-border/60 px-5 py-3 transition-colors last:border-b-0"
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
                    className="hub-input w-full rounded-lg border border-border bg-card px-2 py-1.5 text-[12px] text-muted-foreground outline-none transition-colors hover:border-avisdoc-teal focus:border-avisdoc-teal"
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
                <div className="text-[12.5px] text-muted-foreground">{d.date}</div>
                <div className="min-w-0 truncate text-[12.5px] text-muted-foreground">{d.owner}</div>
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => downloadDoc(d.id)}
                    title="Télécharger le document"
                    className="hub-chip inline-flex items-center rounded-full bg-muted px-2 py-1.5 text-muted-foreground transition-[filter] hover:text-avisdoc-ink"
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
                    className="hub-chip inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sky-100 px-2.5 py-1.5 text-[11px] font-bold text-sky-700 transition-[filter] disabled:opacity-60"
                  >
                    <ArrowUp className="size-3" /> Version
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteDoc(d.id)}
                    title="Supprimer le document"
                    className="hub-chip inline-flex items-center rounded-full bg-rose-100 px-2 py-1.5 text-[12px] font-bold text-rose-700 transition-[filter]"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          {rows.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              {recherche ? "Aucun document ne correspond à la recherche." : "Aucun document dans cette catégorie."}
            </div>
          )}
        </div>
      </Card>

      {/* Mise à la charte d'un fichier, sans l'enregistrer */}
      {charte && (
        <div onClick={charteEnCours ? undefined : fermerCharte} className="fixed inset-0 z-50 flex items-center justify-center bg-avisdoc-ink/50 p-4">
          <div onClick={(e) => e.stopPropagation()} className="flex max-h-[88vh] w-[min(820px,94vw)] flex-col overflow-hidden rounded-2xl bg-card shadow-floating">
            <div className="flex items-center gap-3 border-b border-border px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-avisdoc-ink">Mise à la charte AvisDoc</div>
                <div className="truncate text-[12px] text-muted-foreground">{charteNom}</div>
              </div>
              {charte.statut === "termine" && charteLien && (
                <a href={charteLien} className="hub-btn-navy inline-flex items-center gap-1.5 rounded-full bg-avisdoc-ink px-4 py-2 text-[12.5px] font-bold text-white">
                  <Download className="size-4" /> Télécharger
                </a>
              )}
              {!charteEnCours && (
                <button type="button" onClick={fermerCharte} className="rounded-lg p-1 text-muted-foreground hover:text-avisdoc-ink"><X className="size-5" /></button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-5 py-4 text-[13px] text-avisdoc-ink">
              {charteEnCours && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Mise à la charte en cours : en général moins d'une minute, davantage pour une présentation longue.
                </p>
              )}
              {charte.statut === "echec" && <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">Échec : {charte.erreur}</p>}
              {charte.statut === "termine" && (
                <>
                  {(charte.avertissements ?? 0) > 0 && (
                    <p className="mb-3 flex items-start gap-2 rounded-lg bg-avisdoc-coral-soft px-3 py-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      {charte.avertissements} point(s) à vérifier avant diffusion : voir le rapport ci-dessous.
                    </p>
                  )}
                  <p className="mb-3 text-[12px] text-muted-foreground">
                    Le fichier n'est pas enregistré dans Documents : il est effacé à la fermeture de cette fenêtre. Téléchargez-le d'abord.
                  </p>
                  <RapportMarkdown texte={charte.rapport ?? ""} />
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
                className="hub-btn-outline inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-border px-3.5 py-1.5 text-[12.5px] font-bold text-avisdoc-ink transition-colors"
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
                        : "mx-auto max-w-[900px] rounded-lg bg-white p-6 text-[13px] text-avisdoc-ink shadow-sm [&_.hub-sheet:first-child]:mt-0 [&_.hub-sheet]:mb-2 [&_.hub-sheet]:mt-5 [&_.hub-sheet]:text-[13px] [&_.hub-sheet]:font-bold [&_.hub-sheet]:uppercase [&_.hub-sheet]:tracking-wide [&_.hub-sheet]:text-muted-foreground [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1",
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
                    className="hub-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white"
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
                  className="hub-input mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-2 text-[13px] text-avisdoc-ink outline-none focus:border-avisdoc-teal"
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
                  className="hub-input mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-2 text-[13px] text-avisdoc-ink outline-none focus:border-avisdoc-teal"
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
                className="hub-btn-outline rounded-full border-[1.5px] border-border px-4 py-2 text-[13px] font-bold text-avisdoc-ink"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void confirmImport()}
                disabled={!importDraft.sub}
                className="hub-btn-navy inline-flex items-center gap-1.5 rounded-full bg-avisdoc-ink px-5 py-2 text-[13px] font-bold text-white disabled:opacity-60"
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

/** Rendu simple du rapport (titres, listes, gras, code) : aucun HTML injecté. */
function RapportMarkdown({ texte }: { texte: string }) {
  const enLigne = (t: string) =>
    t.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((m, i) =>
      m.startsWith("**") ? <strong key={i}>{m.slice(2, -2)}</strong>
      : m.startsWith("`") ? <code key={i} className="rounded bg-muted px-1 text-[12px]">{m.slice(1, -1)}</code>
      : <span key={i}>{m}</span>);
  return (
    <div className="space-y-1.5">
      {texte.split("\n").map((l, i) =>
        l.startsWith("# ") ? <h2 key={i} className="font-display text-[17px] font-semibold">{enLigne(l.slice(2))}</h2>
        : l.startsWith("## ") ? <h3 key={i} className="pt-3 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">{enLigne(l.slice(3))}</h3>
        : l.startsWith("- ") ? <p key={i} className="pl-3">· {enLigne(l.slice(2))}</p>
        : l.trim() ? <p key={i}>{enLigne(l)}</p> : null,
      )}
    </div>
  );
}
