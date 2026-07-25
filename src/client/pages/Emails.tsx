import { useMemo, useState } from "react";
import emailsData from "../data/emails.json";
import { PageHeader } from "../../admin/components/ui";

interface EmailOption { id: string; angle: string; objet: string; corps: string[] }
interface Sequence { id: string; libelle: string; envoi: string; options: EmailOption[] }
interface EmailsData { variables: Record<string, string>; sequences: Sequence[]; signature_defaut: string }

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
  const [seqId, setSeqId] = useState(DATA.sequences[0]?.id ?? "");
  const [optId, setOptId] = useState(DATA.sequences[0]?.options[0]?.id ?? "");
  const [copie, setCopie] = useState<string | null>(null);

  const sequence = DATA.sequences.find((s) => s.id === seqId) ?? DATA.sequences[0];
  const option = sequence?.options.find((o) => o.id === optId) ?? sequence?.options[0];

  function substituer(t: string): string {
    let out = t;
    for (const [token, val] of Object.entries(valeurs)) out = out.split(token).join(val || token);
    return out;
  }
  const objet = useMemo(() => (option ? substituer(option.objet) : ""), [option, valeurs]);
  const corps = useMemo(() => (option ? option.corps.map(substituer) : []), [option, valeurs]);
  const messageTexte = corps.join("\n\n");

  async function copier(cle: string, texte: string) {
    await navigator.clipboard.writeText(texte);
    setCopie(cle);
    setTimeout(() => setCopie((c) => (c === cle ? null : c)), 1800);
  }

  return (
    <div>
      <PageHeader
        title="E-mails de campagne"
        subtitle="Renseignez les champs, choisissez la séquence et l'angle, puis copiez le message."
      />
      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
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
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <label className="block text-sm">
              <span className="text-muted-foreground">Séquence</span>
              <select value={seqId} onChange={(e) => { setSeqId(e.target.value);
                  const s = DATA.sequences.find((x) => x.id === e.target.value); setOptId(s?.options[0]?.id ?? ""); }}
                className="mt-1 w-full rounded-xl border border-border bg-card px-2 py-1.5">
                {DATA.sequences.map((s) => <option key={s.id} value={s.id}>{s.libelle}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Angle</span>
              <select value={optId} onChange={(e) => setOptId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-card px-2 py-1.5">
                {sequence?.options.map((o) => <option key={o.id} value={o.id}>{o.angle}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="space-y-4">
          {/* Objet — bloc copiable */}
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

          {/* Message — bloc copiable */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Message</span>
              <button onClick={() => copier("corps", messageTexte)}
                className="rounded-lg bg-avisdoc-teal px-2.5 py-1 text-xs font-medium text-white hover:opacity-90">
                {copie === "corps" ? "Copié ✓" : "Copier"}
              </button>
            </div>
            <div className="space-y-3 whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed">
              {corps.map((p, i) => <p key={i}>{p}</p>)}
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
