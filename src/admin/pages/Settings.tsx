import { useState } from "react";
import { X } from "lucide-react";
import { useAdminData } from "../data/AdminDataContext";
import { Card, PageHeader } from "../components/ui";

export default function Settings() {
  const { docTypes, docs, addDocType, removeDocType } = useAdminData();
  const [value, setValue] = useState("");

  const submit = () => {
    if (!value.trim()) return;
    addDocType(value);
    setValue("");
  };

  return (
    <div>
      <PageHeader title="Réglages" subtitle="Administration de l'application" />

      <Card className="max-w-[560px] p-6">
        <h2 className="font-display text-lg font-semibold text-avisdoc-ink">
          Types de documents
        </h2>
        <p className="mb-3 mt-1 text-[13px] text-muted-foreground">
          Catégories proposées au classement des documents.
        </p>

        <div className="flex flex-col">
          {docTypes.map((t) => {
            const n = docs.filter((d) => d.cat === t).length;
            return (
              <div
                key={t}
                className="flex items-center gap-3 border-b border-border/60 px-1 py-2.5 last:border-b-0"
              >
                <span className="size-2 shrink-0 rounded-[2px] bg-muted-foreground/40" />
                <div className="flex-1 text-sm font-semibold text-avisdoc-ink">{t}</div>
                <div className="text-[12px] text-muted-foreground">
                  {n} document{n > 1 ? "s" : ""}
                </div>
                <button
                  type="button"
                  onClick={() => removeDocType(t)}
                  title="Supprimer ce type"
                  className="ad-x px-1 text-muted-foreground transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            className="ad-input flex-1 rounded-full border border-border bg-muted/50 px-4 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal"
            placeholder="Nouveau type de document…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button
            type="button"
            onClick={submit}
            className="ad-btn-accent rounded-full bg-avisdoc-teal px-5 py-2.5 text-[13px] font-bold text-white"
          >
            Ajouter
          </button>
        </div>
      </Card>
    </div>
  );
}
