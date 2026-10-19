// Le formulaire d'une fiche d'entreprise : tout ce que le commercial sait, en une fois.
//
// Le même pour « Ajouter un prospect », « Nouveau client » et « Modifier » : on ne
// remplit pas une fiche de trois façons différentes. Seul le nom est obligatoire.

import { Plus, X } from "lucide-react";
import { SECTEURS, TRANCHES } from "../../lib/merx";
import { nomLisible } from "../../lib/membres";
import { departementDuCodePostal, PERSONNE_VIDE, type FicheSaisie, type PersonneSaisie } from "../../lib/fiche-saisie";
import { SectionLabel } from "../ui";
import { cn } from "@/lib/utils";

const champ =
  "ad-input w-full min-w-0 rounded-xl border border-border bg-background px-3.5 py-2.5 text-[13px] text-avisdoc-ink outline-none transition-colors focus:border-avisdoc-teal";

function Champ({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1 block text-[11.5px] font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <SectionLabel className="mb-2.5">{titre}</SectionLabel>
      {children}
    </section>
  );
}

export default function FormulaireFiche({
  valeur,
  onChange,
  membres,
}: {
  valeur: FicheSaisie;
  onChange: (v: FicheSaisie) => void;
  /** Les e-mails de l'équipe, pour « Suivi par ». */
  membres: string[];
}) {
  const v = valeur;
  const maj = (champs: Partial<FicheSaisie>) => onChange({ ...v, ...champs });
  const majPersonne = (i: number, champs: Partial<PersonneSaisie>) =>
    maj({ interlocuteurs: v.interlocuteurs.map((q, j) => (j === i ? { ...q, ...champs } : q)) });

  return (
    <div className="flex flex-col gap-4">
      <Section titre="L’entreprise">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Champ label="Nom de l’entreprise *" className="sm:col-span-2">
            <input autoFocus value={v.nom} onChange={(e) => maj({ nom: e.target.value })} placeholder="Raison sociale ou nom d’usage" className={cn(champ, "font-semibold")} />
          </Champ>
          <Champ label="SIREN (facultatif)">
            <input value={v.siren} onChange={(e) => maj({ siren: e.target.value })} inputMode="numeric" placeholder="9 chiffres" className={champ} />
          </Champ>
          <Champ label="Secteur">
            <select value={v.secteur} onChange={(e) => maj({ secteur: e.target.value as FicheSaisie["secteur"] })} className={champ}>
              <option value="">Non précisé</option>
              {SECTEURS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Champ>
          <Champ label="Activité">
            <input value={v.activite} onChange={(e) => maj({ activite: e.target.value })} placeholder="Travaux routiers, mairie, viticulture…" className={champ} />
          </Champ>
          <Champ label="Effectif">
            <select value={v.effectif} onChange={(e) => maj({ effectif: e.target.value })} className={champ}>
              <option value="">Non précisé</option>
              {Object.entries(TRANCHES).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </Champ>
          <Champ label="Adresse" className="sm:col-span-2">
            <input value={v.adresse} onChange={(e) => maj({ adresse: e.target.value })} placeholder="N° et voie" className={champ} />
          </Champ>
          <div className="grid grid-cols-[110px_1fr_80px] gap-2.5 sm:col-span-2">
            <Champ label="Code postal">
              <input
                value={v.codePostal}
                inputMode="numeric"
                onChange={(e) => {
                  const cp = e.target.value;
                  // Le département se déduit du code postal, tant qu'on ne l'a pas écrit soi-même.
                  const deduit = departementDuCodePostal(cp);
                  maj({ codePostal: cp, ...(deduit && (!v.departement || v.departement === departementDuCodePostal(v.codePostal)) ? { departement: deduit } : {}) });
                }}
                className={champ}
              />
            </Champ>
            <Champ label="Ville">
              <input value={v.ville} onChange={(e) => maj({ ville: e.target.value })} className={champ} />
            </Champ>
            <Champ label="Dép.">
              <input value={v.departement} onChange={(e) => maj({ departement: e.target.value })} className={champ} />
            </Champ>
          </div>
          <Champ label="Téléphone (standard)">
            <input value={v.telephone} onChange={(e) => maj({ telephone: e.target.value })} inputMode="tel" className={champ} />
          </Champ>
          <Champ label="E-mail général">
            <input value={v.email} onChange={(e) => maj({ email: e.target.value })} inputMode="email" placeholder="contact@…" className={champ} />
          </Champ>
          <Champ label="Site internet" className="sm:col-span-2">
            <input value={v.site} onChange={(e) => maj({ site: e.target.value })} placeholder="www.…" className={champ} />
          </Champ>
        </div>
      </Section>

      <Section titre="Le dirigeant">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Champ label="Nom">
            <input value={v.dirigeant} onChange={(e) => maj({ dirigeant: e.target.value })} placeholder="Prénom Nom" className={champ} />
          </Champ>
          <Champ label="Qualité">
            <input value={v.dirigeantQualite} onChange={(e) => maj({ dirigeantQualite: e.target.value })} placeholder="Président, gérant, maire…" className={champ} />
          </Champ>
        </div>
      </Section>

      <Section titre="Les interlocuteurs">
        {v.interlocuteurs.length === 0 && <p className="mb-2 text-[12.5px] text-muted-foreground">Personne pour l’instant. Le premier de la liste est le contact principal.</p>}
        <div className="flex flex-col gap-2.5">
          {v.interlocuteurs.map((q, i) => (
            <div key={i} className="rounded-xl border border-border p-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[11.5px] font-bold text-muted-foreground">{i === 0 ? "Contact principal" : `Interlocuteur ${i + 1}`}</span>
                <button
                  type="button"
                  onClick={() => maj({ interlocuteurs: v.interlocuteurs.filter((_, j) => j !== i) })}
                  aria-label="Retirer cet interlocuteur"
                  className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:text-rose-700"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input value={q.nom} onChange={(e) => majPersonne(i, { nom: e.target.value })} placeholder="Prénom Nom" aria-label="Nom" className={champ} />
                <input value={q.fonction} onChange={(e) => majPersonne(i, { fonction: e.target.value })} placeholder="Poste : DRH, responsable QSE…" aria-label="Poste" className={champ} />
                <input value={q.telephone} onChange={(e) => majPersonne(i, { telephone: e.target.value })} inputMode="tel" placeholder="Téléphone" aria-label="Téléphone" className={champ} />
                <input value={q.email} onChange={(e) => majPersonne(i, { email: e.target.value })} inputMode="email" placeholder="E-mail" aria-label="E-mail" className={champ} />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => maj({ interlocuteurs: [...v.interlocuteurs, { ...PERSONNE_VIDE }] })}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[12.5px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal"
        >
          <Plus className="size-3.5" /> Ajouter un interlocuteur
        </button>
      </Section>

      <Section titre="Le suivi">
        <div className="grid gap-2.5">
          <Champ label="Suivi par">
            <select value={v.referent} onChange={(e) => maj({ referent: e.target.value })} className={champ}>
              <option value="">— à attribuer —</option>
              {[...new Set([...membres, ...(v.referent ? [v.referent] : [])])].map((m) => (
                <option key={m} value={m}>
                  {nomLisible(m)}
                </option>
              ))}
            </select>
          </Champ>
          <Champ label="Pourquoi c’est une cible, ce qu’on sait d’elle">
            <textarea value={v.pourquoi} onChange={(e) => maj({ pourquoi: e.target.value })} rows={3} className={cn(champ, "resize-y leading-relaxed")} />
          </Champ>
        </div>
      </Section>
    </div>
  );
}
