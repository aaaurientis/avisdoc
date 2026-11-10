// Les suggestions des commerciaux (Olivier, 09/11, piste de Gemini) : le Paramétrage de la veille est dans Admin.
// Sur les pages de la veille, « Suggérer un mot ou une cible » envoie la demande ; elle arrive en tête du Paramétrage,
// où un admin la marque « Fait » (il l'a ajoutée) ou « Refusé ».

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Lightbulb, Loader2, X } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { Card, Modal } from "../../components/ui";
import { ESPACES_SUGGESTION, listerSuggestionsATraiter, suggerer, traiterSuggestion, type EspaceSuggestion, type Suggestion } from "../../lib/veille";

const champCls =
  "ad-input w-full min-w-0 rounded-xl border border-border bg-background px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";
const libelleCls = "mb-1.5 block text-[12px] font-bold text-avisdoc-ink";
const labelEspace = (e: EspaceSuggestion) => ESPACES_SUGGESTION.find((x) => x.espace === e)?.label ?? e;

/** Le petit bouton des pages de la veille, et sa fenêtre : le CRM de la page est déjà choisi. */
export function BoutonSuggerer({ espace }: { espace: EspaceSuggestion }) {
  const { user } = useAuth();
  const [ouvert, setOuvert] = useState(false);
  const [pour, setPour] = useState<EspaceSuggestion>(espace);
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const ouvrir = () => {
    setPour(espace);
    setTexte("");
    setOuvert(true);
  };
  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (texte.trim().length < 2 || envoi) return;
    setEnvoi(true);
    try {
      await suggerer(pour, texte, user?.email ?? "");
      toast.success("Suggestion envoyée : elle arrive dans le Paramétrage de la veille.");
      setOuvert(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "La suggestion n'a pas pu partir.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <>
      <button type="button" onClick={ouvrir} className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[12px] font-semibold text-muted-foreground hover:border-avisdoc-ink hover:text-avisdoc-ink">
        <Lightbulb className="size-3.5" strokeWidth={2} /> Suggérer un mot ou une cible
      </button>
      {ouvert && (
        <Modal onClose={() => !envoi && setOuvert(false)} width={480}>
          <form onSubmit={envoyer}>
            <h2 className="font-display text-xl font-semibold text-avisdoc-ink">Suggérer un mot ou une cible</h2>
            <p className="mb-4 mt-1 text-[13px] text-muted-foreground">Un mot à guetter, un concurrent, une entreprise, un site ou une page à suivre. La demande arrive dans le Paramétrage de la veille, que règlent les admins.</p>
            <div className="space-y-3.5">
              <label className="block min-w-0">
                <span className={libelleCls}>Pour</span>
                <select value={pour} onChange={(e) => setPour(e.target.value as EspaceSuggestion)} className={champCls}>
                  {ESPACES_SUGGESTION.map((x) => <option key={x.espace} value={x.espace}>{x.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={libelleCls}>Votre suggestion *</span>
                <textarea autoFocus value={texte} onChange={(e) => setTexte(e.target.value)} rows={3} maxLength={1000} className={champCls} placeholder="Par exemple : « qualité de vie au travail », ou le concurrent Skin Analytics" />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" disabled={envoi} onClick={() => setOuvert(false)} className="rounded-full px-5 py-2.5 text-sm font-bold text-muted-foreground hover:bg-muted">Annuler</button>
              <button type="submit" disabled={texte.trim().length < 2 || envoi} className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                {envoi && <Loader2 className="size-4 animate-spin" />}
                Envoyer
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

/** En tête du Paramétrage : les suggestions à traiter. */
export function SuggestionsATraiter() {
  const { user } = useAuth();
  const [liste, setListe] = useState<Suggestion[] | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const recharger = useCallback(() => {
    listerSuggestionsATraiter().then(setListe, (err) => {
      toast.error(err instanceof Error ? err.message : "Les suggestions n'ont pas pu être lues.");
      setListe([]);
    });
  }, []);
  useEffect(recharger, [recharger]);

  const traiter = async (s: Suggestion, statut: "fait" | "refuse") => {
    if (enCours) return;
    setEnCours(s.id);
    try {
      await traiterSuggestion(s.id, statut, user?.email ?? "");
      toast.success(statut === "fait" ? "Marquée « Fait »." : "Marquée « Refusé ».");
      recharger();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Le changement a échoué.");
    } finally {
      setEnCours(null);
    }
  };

  return (
    <Card className="mb-5 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <Lightbulb className="size-4 text-avisdoc-teal" />
        <h2 className="text-sm font-bold text-avisdoc-ink">Suggestions des commerciaux</h2>
        {liste !== null && <span className="text-[12px] text-muted-foreground">· {liste.length ? `${liste.length} à traiter` : "aucune à traiter"}</span>}
      </div>
      {liste === null ? (
        <div className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin text-avisdoc-teal" /> Chargement…</div>
      ) : !liste.length ? (
        <p className="px-5 py-3 text-[13px] text-muted-foreground">Les commerciaux suggèrent depuis les pages de la veille, avec « Suggérer un mot ou une cible ». Ajoutez ce qui convient dans l'onglet voulu ci-dessous, puis marquez la suggestion « Fait ».</p>
      ) : (
        <ul className="divide-y divide-border">
          {liste.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-line text-[14px] font-semibold text-avisdoc-ink">{s.texte}</p>
                <p className="text-[12px] text-muted-foreground">{labelEspace(s.espace)} · {s.email} · {new Date(s.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button type="button" disabled={enCours === s.id} onClick={() => traiter(s, "fait")} className="inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-3.5 py-1.5 text-[12px] font-bold text-white disabled:opacity-50">
                  {enCours === s.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Fait
                </button>
                <button type="button" disabled={enCours === s.id} onClick={() => traiter(s, "refuse")} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[12px] font-bold text-muted-foreground hover:border-avisdoc-ink hover:text-avisdoc-ink disabled:opacity-50">
                  <X className="size-3.5" /> Refusé
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
