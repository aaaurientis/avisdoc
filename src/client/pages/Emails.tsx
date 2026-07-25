import { useMemo, useState } from "react";
import emailsData from "../data/emails.json";
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

export function Emails({ entreprise }: { entreprise: string }) {
  const tokens = Object.keys(DATA.variables);
  const [valeurs, setValeurs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const t of tokens) init[t] = "";
    if ("{{entreprise}}" in init) init["{{entreprise}}"] = entreprise;
    if ("{{signature}}" in init) init["{{signature}}"] = DATA.signature_defaut ?? "";
    return init;
  });
  const [optId, setOptId] = useState(DATA.sequences[0]?.options[0]?.id ?? "");
  const [copie, setCopie] = useState<string | null>(null);

  const sequence = DATA.sequences.find((s) => s.options.some((o) => o.id === optId)) ?? DATA.sequences[0];
  const option = sequence?.options.find((o) => o.id === optId) ?? sequence?.options[0];

  function substituer(t: string): string {
    let out = t;
    for (const [token, val] of Object.entries(valeurs)) out = out.split(token).join(val || token);
    return out;
  }
  const tableau = useMemo(
    () => DATA.tableau_pratique.map(([k, v]) => [substituer(k), substituer(v)] as [string, string]),
    [valeurs],
  );
  const objet = useMemo(() => (option ? substituer(option.objet) : ""), [option, valeurs]);
  // Corps en « blocs » : le marqueur TABLEAU devient le tableau pratique.
  const corps = useMemo(() => (option ? option.corps.map(substituer) : []), [option, valeurs]);
  const messageTexte = useMemo(
    () => corps
      .map((l) => (l === "TABLEAU" ? tableau.map(([k, v]) => `${k} : ${v}`).join("\n") : l))
      .join("\n\n"),
    [corps, tableau],
  );

  async function copier(cle: string, texte: string) {
    await navigator.clipboard.writeText(texte);
    setCopie(cle);
    setTimeout(() => setCopie((c) => (c === cle ? null : c)), 1800);
  }

  const itemCls = (actif: boolean) =>
    `w-full rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
      actif ? "bg-avisdoc-ink text-white" : "hover:bg-accent hover:text-avisdoc-ink"
    }`;

  return (
    <div>
      <PageHeader
        title="E-mails de campagne"
        subtitle="Choisissez un e-mail, renseignez les champs, puis copiez-le tel quel."
      />
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* Colonne gauche : champs + liste des e-mails disponibles */}
        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            {tokens.map((t) => (
              <label key={t} className="block text-sm">
                <span className="text-muted-foreground">{LIBELLES[t] ?? t}</span>
                <input value={valeurs[t]} onChange={(e) => setValeurs({ ...valeurs, [t]: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-border bg-muted/50 px-2 py-1.5" />
              </label>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            {DATA.sequences.map((s) => (
              <div key={s.id} className="mb-3 last:mb-0">
                <div className="mb-1 flex items-baseline justify-between px-1">
                  <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                    {s.libelle}
                  </span>
                  <span className="text-[11px] text-muted-foreground/80">{s.envoi}</span>
                </div>
                <div className="space-y-0.5">
                  {s.options.map((o) => (
                    <button key={o.id} onClick={() => setOptId(o.id)} className={itemCls(o.id === optId)}>
                      {o.angle}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Colonne droite : l'e-mail sélectionné, en blocs copiables */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <span className="rounded-full bg-muted px-2.5 py-0.5">{sequence?.libelle}</span>
            <span>· {sequence?.envoi}</span>
            <span>· angle « {option?.angle} »</span>
          </div>

          {/* Objet */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Objet</span>
              <button onClick={() => copier("objet", objet)}
                className="rounded-lg bg-avisdoc-teal px-2.5 py-1 text-xs font-medium text-white hover:opacity-90">
                {copie === "objet" ? "Copié ✓" : "Copier"}
              </button>
            </div>
            <p className="px-4 py-3 text-sm">{objet}</p>
          </div>

          {/* Message */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Message</span>
              <button onClick={() => copier("corps", messageTexte)}
                className="rounded-lg bg-avisdoc-teal px-2.5 py-1 text-xs font-medium text-white hover:opacity-90">
                {copie === "corps" ? "Copié ✓" : "Copier"}
              </button>
            </div>
            <div className="space-y-3 px-4 py-3 text-sm leading-relaxed">
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
          </div>

          <button onClick={() => copier("tout", `Objet : ${objet}\n\n${messageTexte}`)}
            className="w-full rounded-xl bg-avisdoc-ink px-4 py-2.5 text-sm font-medium text-white hover:opacity-90">
            {copie === "tout" ? "E-mail complet copié ✓" : "Copier l'e-mail complet"}
          </button>
        </div>
      </div>
    </div>
  );
}
