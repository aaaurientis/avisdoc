import { useEffect, useMemo, useState } from "react";
import { Briefcase, FileText, Megaphone, ShieldCheck, Users, X, type LucideIcon } from "lucide-react";
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
  const [urls, setUrls] = useState<Record<string, string>>({});      // affichage (inline)
  const [dlUrls, setDlUrls] = useState<Record<string, string>>({});  // téléchargement
  const [apercu, setApercu] = useState<GeneratedDoc | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    supabase.from("admin_generated_docs").select("*").eq("client_id", clientId).order("titre")
      .then(async ({ data, error }) => {
        if (error) { if (actif) setErr(error.message); return; }
        const list = (data ?? []) as GeneratedDoc[];
        if (actif) setDocs(list);
        // Pré-résolution des URLs : une pour l'affichage (iframe), une pour le
        // téléchargement. L'utilisateur reste sur avisdoc.fr, ne voit jamais
        // l'URL Supabase.
        const view: Record<string, string> = {};
        const dl: Record<string, string> = {};
        await Promise.all(list.map(async (d) => {
          const st = supabase.storage.from(d.storage_bucket);
          if (d.storage_bucket === "espace-docs-public") {
            view[d.id] = st.getPublicUrl(d.storage_path).data.publicUrl;
            dl[d.id] = st.getPublicUrl(d.storage_path, { download: true }).data.publicUrl;
          } else {
            const [v, t] = await Promise.all([
              st.createSignedUrl(d.storage_path, 3600),
              st.createSignedUrl(d.storage_path, 3600, { download: true }),
            ]);
            if (v.data?.signedUrl) view[d.id] = v.data.signedUrl;
            if (t.data?.signedUrl) dl[d.id] = t.data.signedUrl;
          }
        }));
        if (actif) { setUrls(view); setDlUrls(dl); }
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
                    <button
                      onClick={() => setApercu(d)}
                      disabled={!urls[d.id]}
                      className="shrink-0 rounded-xl bg-avisdoc-ink px-3.5 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      Ouvrir
                    </button>
                  </Card>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Visionneuse intégrée : le document s'affiche sur avisdoc.fr (iframe),
          sans jamais exposer l'URL Supabase à l'utilisateur. */}
      {apercu && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-avisdoc-ink/60 p-3 sm:p-6"
          onClick={() => setApercu(null)}
        >
          <div
            className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-card shadow-floating"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <p className="min-w-0 flex-1 truncate font-semibold text-avisdoc-ink">{apercu.titre}</p>
              {dlUrls[apercu.id] && (
                <a
                  href={dlUrls[apercu.id]}
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted-foreground hover:border-avisdoc-ink"
                >
                  Télécharger
                </a>
              )}
              <button
                onClick={() => setApercu(null)}
                title="Fermer"
                className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-avisdoc-ink"
              >
                <X className="size-5" />
              </button>
            </div>
            <iframe
              title={apercu.titre}
              src={urls[apercu.id]}
              className="min-h-0 w-full flex-1 bg-muted"
            />
          </div>
        </div>
      )}
    </div>
  );
}
