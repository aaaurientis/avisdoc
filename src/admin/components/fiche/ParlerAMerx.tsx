// « Parler à Merx » depuis une fiche (Olivier, 21/10) : une erreur constatée, une fiche à
// améliorer — on en discute avec Merx, qui vérifie et PROPOSE des corrections, chacune avec
// sa source. Rien ne change sans le clic du commercial ; chaque correction appliquée laisse
// une note dans l'historique (qui, quoi, ancienne et nouvelle valeur, source).

import { useState } from "react";
import { Check, Loader2, Send, Sparkles, X } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { Modal } from "../ui";
import { supabaseAdmin } from "../../data/supabaseAdmin";
import { ajouterEchange, type ClesFiche } from "../../lib/echanges";
import { discuterFiche, type CorrectionFiche } from "../../lib/merx-appels";
import type { Prospect } from "../../lib/merx";
import { cn } from "@/lib/utils";

type Personne = NonNullable<Prospect["personnes"]>[number];

const IDEES = [
  "Le numéro de téléphone est faux : vérifie-le.",
  "Trouve le responsable QSE ou prévention.",
  "Vérifie toutes les coordonnées de cette fiche.",
];

const LIBELLES: Record<CorrectionFiche["champ"], string> = {
  telephone: "Téléphone",
  email: "E-mail",
  site: "Site",
  interlocuteur: "Interlocuteur",
  retirer_interlocuteur: "Retirer l’interlocuteur",
};

const cleNom = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export default function ParlerAMerx({
  prospect,
  cles,
  onModifiee,
  onFermer,
}: {
  prospect: Prospect;
  /** Où ranger la note de chaque correction appliquée. */
  cles: ClesFiche;
  /** La fiche a changé : la relire. */
  onModifiee: () => Promise<void> | void;
  onFermer: () => void;
}) {
  const { user } = useAuth();
  const par = user?.email ?? "";
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string; corrections?: CorrectionFiche[] }[]>([]);
  const [saisie, setSaisie] = useState("");
  const [attente, setAttente] = useState(false);
  const [application, setApplication] = useState<string | null>(null);
  const [faites, setFaites] = useState<Set<string>>(new Set());
  const [ignorees, setIgnorees] = useState<Set<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);

  const envoyer = async (texte: string) => {
    const t = texte.trim();
    if (!t || attente) return;
    const suite = [...messages, { role: "user" as const, content: t }];
    setMessages(suite);
    setSaisie("");
    setAttente(true);
    setErreur(null);
    try {
      const r = await discuterFiche(prospect.id, suite.map(({ role, content }) => ({ role, content })));
      setMessages([...suite, { role: "assistant", content: r.reponse || "Je n’ai rien trouvé de sûr.", corrections: r.corrections }]);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Merx n’a pas pu répondre. Réessayez.");
    } finally {
      setAttente(false);
    }
  };

  /** Applique une correction sur la fiche, et la note dans l'historique. */
  const appliquer = async (c: CorrectionFiche, id: string) => {
    if (application) return;
    setApplication(id);
    setErreur(null);
    try {
      const { data: actuelle, error: lecture } = await supabaseAdmin
        .from("admin_prospects")
        .select("contact_phone, contact_email, website, contact_name, personnes")
        .eq("id", prospect.id)
        .single();
      if (lecture) throw new Error(lecture.message);
      const a = actuelle as Pick<Prospect, "contact_phone" | "contact_email" | "website" | "contact_name" | "personnes">;
      const personnes = [...((a.personnes ?? []) as Personne[])];
      let patch: Record<string, unknown> = {};
      let avant = "";
      let apres = "";
      if (c.champ === "telephone" || c.champ === "email" || c.champ === "site") {
        const valeur = (c.valeur ?? "").trim();
        if (!valeur) throw new Error("La correction n’a pas de valeur.");
        const col = c.champ === "telephone" ? "contact_phone" : c.champ === "email" ? "contact_email" : "website";
        avant = String(a[col] ?? "vide");
        apres = valeur;
        patch = { [col]: valeur };
      } else {
        const nom = (c.nom ?? "").trim();
        if (!nom) throw new Error("La correction ne nomme personne.");
        const i = personnes.findIndex((q) => cleNom(q.nom) === cleNom(nom));
        if (c.champ === "retirer_interlocuteur") {
          if (i >= 0) personnes.splice(i, 1);
          avant = nom;
          apres = "retiré";
          patch = { personnes, ...(a.contact_name && cleNom(a.contact_name) === cleNom(nom) ? { contact_name: null, contact_role: null } : {}) };
        } else {
          const ancienne = i >= 0 ? personnes[i] : null;
          const nouvelle: Personne = {
            nom,
            fonction: c.fonction?.trim() || ancienne?.fonction || null,
            email: c.email?.trim() || ancienne?.email || null,
            telephone: c.telephone?.trim() || ancienne?.telephone || null,
            mobile: ancienne?.mobile ?? null,
            source: c.source || ancienne?.source || null,
            sur: true,
          };
          if (i >= 0) personnes[i] = nouvelle;
          else personnes.push(nouvelle);
          avant = ancienne ? [ancienne.nom, ancienne.fonction, ancienne.email, ancienne.telephone].filter(Boolean).join(", ") : "absent";
          apres = [nouvelle.nom, nouvelle.fonction, nouvelle.email, nouvelle.telephone].filter(Boolean).join(", ");
          patch = { personnes };
        }
      }
      const { error } = await supabaseAdmin.from("admin_prospects").update(patch).eq("id", prospect.id);
      if (error) throw new Error(error.message);
      await ajouterEchange(cles, {
        kind: "note",
        titre: "Note",
        detail: `Fiche corrigée avec Merx — ${LIBELLES[c.champ]} : « ${avant} » → « ${apres} ». ${c.pourquoi} Source : ${c.source}`,
        au: new Date().toISOString(),
        par,
        prevu: false,
      });
      setFaites((s) => new Set(s).add(id));
      await onModifiee();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La correction n’a pas pu être appliquée.");
    } finally {
      setApplication(null);
    }
  };

  return (
    <Modal onClose={onFermer} width={680}>
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <h2 className="flex-1 font-display text-xl font-semibold text-avisdoc-ink">
          <Sparkles className="mr-1.5 inline size-5 text-avisdoc-teal" />
          Parler à Merx — {prospect.name}
        </h2>
        <button type="button" onClick={onFermer} aria-label="Fermer" className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink">
          <X className="size-5" />
        </button>
      </div>

      <div className="mt-4 max-h-[52vh] space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="text-[13px] text-muted-foreground">
            <p>Une information fausse, une fiche à compléter ? Dites-le à Merx : il vérifie, puis vous propose des corrections. Rien ne change sans votre clic.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {IDEES.map((t) => (
                <button key={t} type="button" onClick={() => void envoyer(t)} className="rounded-full border border-border px-3 py-1 text-[12.5px] font-semibold text-avisdoc-ink hover:border-avisdoc-teal">
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={cn(
                "max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed",
                m.role === "user" ? "bg-avisdoc-teal text-white" : "bg-muted/60 text-avisdoc-ink",
              )}
            >
              {m.content}
            </div>
            {m.corrections?.map((c, j) => {
              const id = `${i}-${j}`;
              if (ignorees.has(id)) return null;
              const fait = faites.has(id);
              return (
                <div key={id} className="mt-2 rounded-xl border border-border p-3 text-[13px]">
                  <div className="font-semibold text-avisdoc-ink">
                    {LIBELLES[c.champ]} :{" "}
                    {c.champ === "interlocuteur" || c.champ === "retirer_interlocuteur"
                      ? [c.nom, c.fonction, c.email, c.telephone].filter(Boolean).join(" · ")
                      : c.valeur}
                  </div>
                  <div className="mt-0.5 text-muted-foreground">{c.pourquoi}</div>
                  <div className="mt-0.5 break-all text-[12px] text-muted-foreground">Source : {c.source}</div>
                  <div className="mt-2 flex gap-2">
                    {fait ? (
                      <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-emerald-700">
                        <Check className="size-4" /> Appliqué — noté dans l’historique
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => void appliquer(c, id)}
                          disabled={application !== null}
                          className="inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-3.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-60"
                        >
                          {application === id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Appliquer
                        </button>
                        <button
                          type="button"
                          onClick={() => setIgnorees((s) => new Set(s).add(id))}
                          className="rounded-full border border-border px-3.5 py-1.5 text-[12.5px] font-bold text-muted-foreground"
                        >
                          Ignorer
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {attente && (
          <div className="inline-flex items-center gap-2 rounded-2xl bg-muted/60 px-3.5 py-2.5 text-[13px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Merx vérifie… (jusqu’à une minute s’il cherche sur le web)
          </div>
        )}
      </div>

      {erreur && <p className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{erreur}</p>}

      <form
        className="mt-4 flex gap-2 border-t border-border pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void envoyer(saisie);
        }}
      >
        <input
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder="Le numéro est faux, le bon est le 03 85 43 07 51…"
          className="ad-input w-full min-w-0 rounded-full border border-border bg-background px-4 py-2.5 text-[13px] outline-none focus:border-avisdoc-teal"
          aria-label="Votre message à Merx"
        />
        <button
          type="submit"
          disabled={attente || !saisie.trim()}
          className="ad-btn-accent inline-flex shrink-0 items-center gap-1.5 rounded-full bg-avisdoc-teal px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60"
        >
          {attente ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Envoyer
        </button>
      </form>
    </Modal>
  );
}
