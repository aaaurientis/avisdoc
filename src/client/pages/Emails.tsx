import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import emailsData from "../data/emails.json";
import { supabase } from "../lib/supabase";
import { PageHeader } from "../../admin/components/ui";

interface EmailOption { id: string; angle: string; objet: string; corps: string[] }
interface Sequence { id: string; libelle: string; envoi: string; options: EmailOption[] }
interface EmailsData {
  variables: Record<string, string>;
  sequences: Sequence[];
  tableau_pratique: [string, string][];
  signature_defaut: string;
}

const DATA = emailsData as unknown as EmailsData;
const LIBELLES: Record<string, string> = {
  "{{date}}": "Date", "{{lieu}}": "Lieu", "{{lien}}": "Lien d'inscription",
  "{{entreprise}}": "Entreprise", "{{signature}}": "Signature",
};
const CLIENT_APP_URL = "https://client.avisdoc.fr";
const dateFr = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

interface JourneeLite { id: string; date: string; lieu: string; token: string; actif: boolean }

export function Emails({ entreprise }: { entreprise: string }) {
  const tokens = Object.keys(DATA.variables);
  const [valeurs, setValeurs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const t of tokens) init[t] = "";
    if ("{{entreprise}}" in init) init["{{entreprise}}"] = entreprise;
    if ("{{signature}}" in init) init["{{signature}}"] = DATA.signature_defaut ?? "";
    return init;
  });
  const [copie, setCopie] = useState<string | null>(null);
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [journees, setJournees] = useState<JourneeLite[]>([]);
  const [journeeId, setJourneeId] = useState("");

  useEffect(() => {
    supabase.from("admin_journees").select("id, date, lieu, token, actif").order("date", { ascending: false })
      .then(({ data }) => setJournees((data ?? []) as JourneeLite[]));
  }, []);

  const lien = valeurs["{{lien}}"] || "";

  // Choisir une journée renseigne le lien de réservation (+ date et lieu).
  function choisirJournee(id: string) {
    setJourneeId(id);
    const j = journees.find((x) => x.id === id);
    setValeurs((v) => ({
      ...v,
      "{{lien}}": j ? `${CLIENT_APP_URL}/rdv/${j.token}` : "",
      ...(j && "{{date}}" in v ? { "{{date}}": dateFr(j.date) } : {}),
      ...(j && "{{lieu}}" in v ? { "{{lieu}}": j.lieu } : {}),
    }));
  }

  function substituer(t: string): string {
    let out = t;
    for (const [token, val] of Object.entries(valeurs)) {
      // {{lien}} vide → jeton retiré (jamais de « {{lien}} » brut dans l'e-mail).
      const remplacement = val || (token === "{{lien}}" ? "" : token);
      out = out.split(token).join(remplacement);
    }
    return out;
  }
  const tableau = useMemo(
    () => DATA.tableau_pratique.map(([k, v]) => [substituer(k), substituer(v)] as [string, string]),
    [valeurs],
  );

  // Rendu d'un e-mail : objet, lignes de corps (avec marqueur TABLEAU) et texte de copie.
  function calc(option: EmailOption) {
    // Sans lien, on retire les lignes qui le contiennent (pas de phrase orpheline).
    const lignes = lien ? option.corps : option.corps.filter((l) => !l.includes("{{lien}}"));
    const objet = substituer(option.objet);
    const corps = lignes.map(substituer);
    const messageTexte = corps
      .map((l) => (l === "TABLEAU" ? tableau.map(([k, v]) => `${k} : ${v}`).join("\n") : l))
      .join("\n\n");
    return { objet, corps, messageTexte };
  }

  async function copier(cle: string, texte: string) {
    await navigator.clipboard.writeText(texte);
    setCopie(cle);
    setTimeout(() => setCopie((c) => (c === cle ? null : c)), 1800);
  }
  function toggle(id: string) {
    setOuverts((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  return (
    <div>
      <PageHeader
        title="E-mails de campagne"
        subtitle="Renseignez les champs, puis dépliez et copiez l'e-mail voulu."
      />

      {/* Champs à substituer (partagés par tous les e-mails) */}
      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Le lien d'inscription vient de la journée choisie */}
          <label className="block text-sm">
            <span className="text-muted-foreground">Journée (lien d'inscription)</span>
            <select value={journeeId} onChange={(e) => choisirJournee(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-card px-2.5 py-1.5 text-sm outline-none focus:border-avisdoc-teal">
              <option value="">Aucune — sans lien d'inscription</option>
              {journees.map((j) => (
                <option key={j.id} value={j.id}>
                  {dateFr(j.date)}{j.lieu ? ` · ${j.lieu}` : ""}{!j.actif ? " (fermée)" : ""}
                </option>
              ))}
            </select>
          </label>
          {tokens.filter((t) => t !== "{{lien}}").map((t) => (
            <label key={t} className="block text-sm">
              <span className="text-muted-foreground">{LIBELLES[t] ?? t}</span>
              <input value={valeurs[t]} onChange={(e) => setValeurs({ ...valeurs, [t]: e.target.value })}
                className="mt-1 w-full rounded-xl border border-border bg-muted/50 px-2.5 py-1.5 text-sm outline-none focus:border-avisdoc-teal" />
            </label>
          ))}
        </div>
        {journees.length === 0 && (
          <p className="mt-2 text-[11.5px] text-muted-foreground">
            Aucune journée programmée : les e-mails s'afficheront sans lien d'inscription.
            Créez une journée dans l'onglet « Rendez-vous » (avec votre référent AvisDoc).
          </p>
        )}
      </div>

      {/* Tous les e-mails, à la suite, message dépliable */}
      <div className="space-y-6">
        {DATA.sequences.map((s) => (
          <section key={s.id}>
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="font-display text-lg font-semibold text-avisdoc-ink">{s.libelle}</h2>
              <span className="text-xs text-muted-foreground">{s.envoi}</span>
            </div>

            <div className="space-y-2">
              {s.options.map((o) => {
                const { objet, corps, messageTexte } = calc(o);
                const ouvert = ouverts.has(o.id);
                return (
                  <div key={o.id} className="rounded-xl border border-border bg-card">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <button onClick={() => toggle(o.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <ChevronDown
                          className={`size-4 shrink-0 text-muted-foreground transition-transform ${ouvert ? "rotate-180" : ""}`}
                        />
                        <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {o.angle}
                        </span>
                        <span className="truncate text-sm font-medium text-avisdoc-ink">{objet}</span>
                      </button>
                      <button onClick={() => copier(`${o.id}-objet`, objet)}
                        className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-avisdoc-ink">
                        {copie === `${o.id}-objet` ? "Objet copié ✓" : "Copier l'objet"}
                      </button>
                    </div>

                    {ouvert && (
                      <div className="border-t border-border px-4 py-3">
                        <div className="space-y-3 text-sm leading-relaxed">
                          {corps.map((ligne, i) =>
                            ligne === "TABLEAU" ? (
                              <table key={i} className="w-full overflow-hidden rounded-lg border border-border text-[13px]">
                                <tbody>
                                  {tableau.map(([k, v]) => (
                                    <tr key={k} className="border-b border-border last:border-0">
                                      <td className="bg-muted/50 px-3 py-1.5 font-medium">{k}</td>
                                      <td className="px-3 py-1.5">{v}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p key={i} className="whitespace-pre-wrap">{ligne}</p>
                            ),
                          )}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button onClick={() => copier(`${o.id}-corps`, messageTexte)}
                            className="rounded-lg bg-avisdoc-teal px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                            {copie === `${o.id}-corps` ? "Message copié ✓" : "Copier le message"}
                          </button>
                          <button onClick={() => copier(`${o.id}-tout`, `Objet : ${objet}\n\n${messageTexte}`)}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-avisdoc-ink">
                            {copie === `${o.id}-tout` ? "Tout copié ✓" : "Copier l'e-mail complet"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
