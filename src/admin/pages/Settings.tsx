import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useAdminData } from "../data/AdminDataContext";
import { catPalette } from "../lib/ui-tokens";
import { Card, PageHeader } from "../components/ui";
import { cn } from "@/lib/utils";

export default function Settings() {
  const {
    docTree, docs, docTags,
    addCategory, removeCategory, addSubType, removeSubType, addTag, removeTag,
  } = useAdminData();
  const [newCat, setNewCat] = useState("");
  // Saisie de nouvelle sous-catégorie, une par catégorie.
  const [subDraft, setSubDraft] = useState<Record<string, string>>({});
  const [newTag, setNewTag] = useState("");

  const submitCat = () => {
    if (!newCat.trim()) return;
    addCategory(newCat);
    setNewCat("");
  };
  const submitSub = (parent: string) => {
    const v = (subDraft[parent] ?? "").trim();
    if (!v) return;
    addSubType(parent, v);
    setSubDraft((d) => ({ ...d, [parent]: "" }));
  };
  const submitTag = () => {
    if (!newTag.trim()) return;
    addTag(newTag);
    setNewTag("");
  };

  return (
    <div>
      <PageHeader
        title="Réglages"
        subtitle="Arborescence documentaire — catégories et sous-catégories"
      />

      <Card className="max-w-[680px] p-6">
        <h2 className="font-display text-lg font-semibold text-avisdoc-ink">
          Arborescence des documents
        </h2>
        <p className="mb-4 mt-1 text-[13px] text-muted-foreground">
          Les documents se classent dans une <strong>sous-catégorie</strong>. Vous
          pouvez ajouter, renommer (supprimer + recréer) ou retirer catégories et
          sous-catégories.
        </p>

        <div className="flex flex-col gap-5">
          {docTree.map((c, i) => {
            const pal = catPalette(i);
            const nCat = docs.filter((d) => d.catParent === c.name).length;
            const draft = subDraft[c.name] ?? "";
            return (
              <div key={c.name} className="rounded-xl border border-border/70 p-3.5">
                {/* En-tête de catégorie */}
                <div className="flex items-center gap-2.5">
                  <span className={cn("size-2.5 shrink-0 rounded-full", pal.dot)} />
                  <div className="flex-1 text-[14px] font-bold text-avisdoc-ink">{c.name}</div>
                  <span className="text-[12px] text-muted-foreground">
                    {nCat} doc{nCat > 1 ? "s" : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeCategory(c.name)}
                    title="Supprimer la catégorie (et ses sous-catégories)"
                    className="ad-x px-1 text-muted-foreground transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* Sous-catégories */}
                <div className="mt-2 flex flex-col pl-5">
                  {c.subs.map((s) => {
                    const n = docs.filter((d) => d.catParent === c.name && d.cat === s).length;
                    return (
                      <div
                        key={s}
                        className="flex items-center gap-3 border-b border-border/50 py-2 last:border-b-0"
                      >
                        <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                        <div className="flex-1 text-[13px] font-semibold text-avisdoc-ink">{s}</div>
                        <div className="text-[12px] text-muted-foreground">
                          {n} doc{n > 1 ? "s" : ""}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeSubType(c.name, s)}
                          title="Supprimer la sous-catégorie"
                          className="ad-x px-1 text-muted-foreground transition-colors"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                  {c.subs.length === 0 && (
                    <div className="py-1 text-[12px] italic text-muted-foreground">
                      Aucune sous-catégorie.
                    </div>
                  )}

                  {/* Ajout d'une sous-catégorie */}
                  <div className="mt-2 flex gap-2">
                    <input
                      className="ad-input flex-1 rounded-full border border-border bg-muted/50 px-3.5 py-2 text-[12.5px] outline-none transition-colors focus:border-avisdoc-teal"
                      placeholder="Nouvelle sous-catégorie…"
                      value={draft}
                      onChange={(e) => setSubDraft((d) => ({ ...d, [c.name]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && submitSub(c.name)}
                    />
                    <button
                      type="button"
                      onClick={() => submitSub(c.name)}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-3.5 py-2 text-[12.5px] font-bold text-avisdoc-ink transition-[filter] hover:brightness-95"
                    >
                      <Plus className="size-3.5" /> Ajouter
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {docTree.length === 0 && (
            <div className="text-sm text-muted-foreground">Aucune catégorie pour l'instant.</div>
          )}
        </div>

        {/* Ajout d'une catégorie */}
        <div className="mt-5 flex gap-2 border-t border-border pt-5">
          <input
            className="ad-input flex-1 rounded-full border border-border bg-muted/50 px-4 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal"
            placeholder="Nouvelle catégorie…"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitCat()}
          />
          <button
            type="button"
            onClick={submitCat}
            className="ad-btn-accent rounded-full bg-avisdoc-teal px-5 py-2.5 text-[13px] font-bold text-white"
          >
            Ajouter une catégorie
          </button>
        </div>
      </Card>

      {/* Tags standardisés */}
      <Card className="mt-6 max-w-[680px] p-6">
        <h2 className="font-display text-lg font-semibold text-avisdoc-ink">Tags standardisés</h2>
        <p className="mb-4 mt-1 text-[13px] text-muted-foreground">
          Étiquettes transversales applicables à un document (en plus de sa
          catégorie). Un document peut en porter plusieurs.
        </p>

        <div className="flex flex-wrap gap-2">
          {docTags.map((t) => {
            const n = docs.filter((d) => d.tags.includes(t)).length;
            return (
              <span
                key={t}
                className="inline-flex items-center gap-2 rounded-full bg-avisdoc-teal/12 px-3 py-1.5 text-[12.5px] font-semibold text-avisdoc-teal"
              >
                {t}
                <span className="text-[11px] font-normal text-avisdoc-teal/70">{n}</span>
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  title="Supprimer le tag (il sera retiré des documents)"
                  className="transition-colors hover:text-avisdoc-coral"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            );
          })}
          {docTags.length === 0 && (
            <div className="text-[13px] italic text-muted-foreground">Aucun tag pour l'instant.</div>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            className="ad-input flex-1 rounded-full border border-border bg-muted/50 px-4 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal"
            placeholder="Nouveau tag…"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitTag()}
          />
          <button
            type="button"
            onClick={submitTag}
            className="inline-flex items-center gap-1 rounded-full bg-avisdoc-teal px-5 py-2.5 text-[13px] font-bold text-white"
          >
            <Plus className="size-3.5" /> Ajouter un tag
          </button>
        </div>
      </Card>
    </div>
  );
}
