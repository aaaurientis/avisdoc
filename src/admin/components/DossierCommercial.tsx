// Le dossier que Merx monte sur une entreprise : de quoi décrocher son téléphone
// sans rien chercher de plus.
//
// L'ordre suit celui de l'appel, pas celui de la base : d'abord la phrase qu'on dit,
// ensuite à qui on la dit, puis de quoi on la nourrit. Ce qui manque est annoncé en
// dernier, parce que savoir ce qu'on ignore fait partie du travail.

import { AlertCircle, Check, MessageSquareQuote, Phone, ShieldQuestion, Target, User } from "lucide-react";
import { SectionLabel } from "./ui";
import type { Dossier } from "../lib/merx";

/** Un dossier vide ne vaut pas la peine d'être montré. */
export function dossierRempli(d: Dossier | null | undefined): d is Dossier {
  if (!d) return false;
  return Boolean(
    d.accroche?.trim() ||
      d.qui_aborder?.trim() ||
      d.offre?.trim() ||
      d.a_retenir?.length ||
      d.arguments?.length ||
      d.objections?.length,
  );
}

function Bloc({
  titre,
  icone: Icone,
  children,
}: {
  titre: string;
  icone: typeof Phone;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <div className="flex items-center gap-1.5">
        <Icone className="size-3.5 text-avisdoc-teal" />
        <SectionLabel>{titre}</SectionLabel>
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export default function DossierCommercial({ dossier }: { dossier: Dossier }) {
  const { accroche, qui_aborder, a_retenir, arguments: args, objections, offre, a_verifier } = dossier;

  return (
    <div className="mb-5 rounded-2xl border border-l-4 border-border border-l-avisdoc-coral p-4">
      <SectionLabel className="text-avisdoc-coral">Ce qu’il faut savoir avant d’appeler</SectionLabel>

      {/* La première phrase : celle qui fait qu'on ne raccroche pas. Elle se lit avant tout le reste. */}
      {accroche?.trim() && (
        <div className="mt-2 rounded-xl bg-avisdoc-coral/5 px-4 py-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-avisdoc-coral">
            <Phone className="size-3.5" /> La première phrase
          </div>
          <p className="mt-1.5 font-display text-[17px] leading-snug text-avisdoc-ink">« {accroche} »</p>
        </div>
      )}

      {qui_aborder?.trim() && (
        <Bloc titre="Qui aborder, et pourquoi" icone={User}>
          <p className="text-[13.5px] leading-relaxed text-avisdoc-ink">{qui_aborder}</p>
        </Bloc>
      )}

      {a_retenir && a_retenir.length > 0 && (
        <Bloc titre="Ce qu’on sait d’eux" icone={Target}>
          <ul className="space-y-1">
            {a_retenir.map((f) => (
              <li key={f} className="flex gap-2 text-[13px] leading-snug text-avisdoc-ink">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-avisdoc-teal" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </Bloc>
      )}

      {args && args.length > 0 && (
        <Bloc titre={args.length === 1 ? "L’argument" : `Les ${args.length} arguments`} icone={MessageSquareQuote}>
          <div className="space-y-2">
            {args.map((a) => (
              <div key={a.argument} className="rounded-xl border border-border px-3.5 py-2.5">
                <p className="text-[13.5px] font-semibold leading-snug text-avisdoc-ink">{a.argument}</p>
                {a.parce_que && (
                  <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
                    <span className="font-semibold">Parce que </span>
                    {a.parce_que}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Bloc>
      )}

      {objections && objections.length > 0 && (
        <Bloc titre="S’ils objectent" icone={ShieldQuestion}>
          <div className="space-y-2">
            {objections.map((o) => (
              <div key={o.objection} className="rounded-xl bg-muted/50 px-3.5 py-2.5">
                <p className="text-[13px] font-semibold italic leading-snug text-avisdoc-ink">« {o.objection} »</p>
                {o.reponse && (
                  <p className="mt-1.5 flex gap-1.5 text-[13px] leading-snug text-avisdoc-ink">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-avisdoc-teal" />
                    <span>{o.reponse}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </Bloc>
      )}

      {offre?.trim() && (
        <Bloc titre="Ce qu’on peut leur proposer" icone={Target}>
          <p className="text-[13.5px] leading-relaxed text-avisdoc-ink">{offre}</p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            Merx raisonne en journées de présence, jamais en prix : le tarif reste le vôtre.
          </p>
        </Bloc>
      )}

      {a_verifier && a_verifier.length > 0 && (
        <Bloc titre="À leur demander" icone={AlertCircle}>
          <ul className="space-y-1">
            {a_verifier.map((q) => (
              <li key={q} className="flex gap-2 text-[13px] leading-snug text-muted-foreground">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </Bloc>
      )}
    </div>
  );
}
