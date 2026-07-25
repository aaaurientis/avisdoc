import { useEffect, useMemo, useState } from "react";
import { Briefcase, FileText, Megaphone, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  CATEGORIES, categorieDe, DOCS_EXCLUS,
  type CategorieId, type GeneratedDoc,
} from "../lib/types";
import { Card, PageHeader } from "../../admin/components/ui";

const ICONES: Record<CategorieId, LucideIcon> = {
  affiches: Megaphone,
  collaborateurs: Users,
  rh: Briefcase,
  consentement: ShieldCheck,
  autres: FileText,
};

export function Bibliotheque({ clientId }: { clientId: string }) {
  const [docs, setDocs] = useState<GeneratedDoc[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    supabase.from("admin_generated_docs").select("*").eq("client_id", clientId).order("titre")
      .then(async ({ data, error }) => {
        if (error) { if (actif) setErr(error.message); return; }
        const list = (data ?? []) as GeneratedDoc[];
        if (actif) setDocs(list);
        // Pré-résolution des URLs pour des liens <a> directs (pas de window.open
        // après await → plus de blocage par le bloqueur de pop-up).
        const map: Record<string, string> = {};
        await Promise.all(list.map(async (d) => {
          if (d.storage_bucket === "espace-docs-public") {
            map[d.id] = supabase.storage.from(d.storage_bucket).getPublicUrl(d.storage_path).data.publicUrl;
          } else {
            const { data: s } = await supabase.storage.from(d.storage_bucket).createSignedUrl(d.storage_path, 3600);
            if (s?.signedUrl) map[d.id] = s.signedUrl;
          }
        }));
        if (actif) setUrls(map);
      });
    return () => { actif = false; };
  }, [clientId]);

  // Regroupe les documents (hors exclus) par catégorie, dans l'ordre de CATEGORIES.
  const sections = useMemo(() => {
    const visibles = docs.filter((d) => !DOCS_EXCLUS.has(d.doc_catalogue_id));
    return CATEGORIES
      .map((cat) => ({ cat, items: visibles.filter((d) => categorieDe(d.doc_catalogue_id) === cat.id) }))
      .filter((s) => s.items.length > 0);
  }, [docs]);

  const total = useMemo(() => docs.filter((d) => !DOCS_EXCLUS.has(d.doc_catalogue_id)).length, [docs]);

  return (
    <div>
      <PageHeader
        title="Vos documents"
        subtitle={`${total} document${total > 1 ? "s" : ""} de campagne, classés par usage`}
      />

      {err && (
        <p className="mb-4 rounded-xl border border-orange-400/40 bg-orange-50 px-3.5 py-2 text-sm text-orange-700">{err}</p>
      )}

      {sections.length === 0 && !err && (
        <Card className="px-4 py-10 text-center text-muted-foreground">
          Vos documents apparaîtront ici une fois la campagne préparée.
        </Card>
      )}

      <div className="space-y-8">
        {sections.map(({ cat, items }) => {
          const Icone = ICONES[cat.id];
          return (
            <section key={cat.id}>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-xl bg-avisdoc-teal/12 text-avisdoc-teal">
                  <Icone className="size-[17px]" strokeWidth={2.2} />
                </span>
                <div>
                  <h2 className="font-display text-lg font-semibold text-avisdoc-ink">{cat.libelle}</h2>
                  {cat.description && (
                    <p className="text-[12.5px] text-muted-foreground">{cat.description}</p>
                  )}
                </div>
                <span className="ml-auto text-xs text-muted-foreground">{items.length}</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {items.map((d) => (
                  <Card key={d.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-avisdoc-ink">{d.titre}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{d.format} · v{d.version}</p>
                    </div>
                    <a
                      href={urls[d.id] ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-disabled={!urls[d.id]}
                      className={
                        "shrink-0 rounded-xl bg-avisdoc-ink px-3.5 py-2 text-[13px] font-medium text-white hover:opacity-90" +
                        (urls[d.id] ? "" : " pointer-events-none opacity-50")
                      }
                    >
                      Ouvrir
                    </a>
                  </Card>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
