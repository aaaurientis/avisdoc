// « Ce qu'on sait d'elle » : tout ce qui est connu de l'entreprise, sur les trois fiches.
//
// La fiche de prospection porte ce que Merx a trouvé (registre, site, finances). Une
// affaire ou un client y ajoute ce qu'ils savent en plus : `enPlus`, en tête. Tout ce
// qui est connu s'affiche ; ce qui manque est dit à la fin, sans masquer le reste.

import { useMemo, type ReactNode } from "react";
import { SectionLabel } from "../ui";
import { effectifLabel, type Prospect } from "../../lib/merx";

function Ligne({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-2">
      <div className="w-40 shrink-0 text-[12.5px] text-muted-foreground">{label}</div>
      <div className="min-w-0 flex-1 text-[13px] text-avisdoc-ink">{children}</div>
    </div>
  );
}

/** Un montant en euros, lisible : « 4,7 Md € », « 167 M € », « 850 k € ». */
const euros = (n: number): string =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1).replace(".", ",")} Md €`
  : n >= 1e6 ? `${Math.round(n / 1e6)} M €`
  : n >= 1e3 ? `${Math.round(n / 1e3)} k €`
  : `${n} €`;

const BORNES: Record<string, number> = {
  "11": 15, "12": 35, "21": 75, "22": 150, "31": 225, "32": 375,
  "41": 750, "42": 1500, "51": 3500, "52": 7500, "53": 15000,
};

export default function CeQuOnSait({
  prospect,
  enPlus = [],
  demandeOrigine = null,
}: {
  /** La fiche de prospection de l'entreprise, si elle en a une. */
  prospect: Prospect | null;
  /** Ce que l'affaire ou le client savent en plus, affiché en tête. */
  enPlus?: { label: string; valeur: ReactNode }[];
  demandeOrigine?: string | null;
}) {
  const p = prospect;
  const siege = p?.head_office ?? null;
  // Toutes les adresses et tous les numéros connus, d'où qu'ils viennent.
  const adressesConnues = useMemo(
    () => (p ? ([...new Set([p.contact_email, ...(p.site_contacts?.emails ?? []), ...(p.personnes ?? []).map((q) => q.email)].filter(Boolean))] as string[]) : []),
    [p],
  );
  const numerosConnus = useMemo(
    () =>
      p
        ? ([...new Set([p.contact_phone, ...(p.site_contacts?.phones ?? []), ...(p.personnes ?? []).flatMap((q) => [q.telephone, q.mobile])].filter(Boolean))] as string[])
        : [],
    [p],
  );
  // Un chiffre d'affaires par salarié invraisemblable trahit un effectif de groupe.
  const caParSalarie = useMemo(() => {
    const n = p?.headcount_band ? BORNES[p.headcount_band] : undefined;
    const f = p?.registre?.finances;
    if (!n || !f) return null;
    const annee = Object.keys(f).sort().at(-1);
    const ca = annee ? f[annee]?.ca : undefined;
    return typeof ca === "number" && ca > 0 ? ca / n : null;
  }, [p]);
  const dernierExercice = useMemo(() => {
    const f = p?.registre?.finances;
    if (!f) return null;
    const annee = Object.keys(f).sort().at(-1);
    const ca = annee ? f[annee]?.ca : undefined;
    return annee && typeof ca === "number" ? { annee, ca, resultat: f[annee]?.resultat_net ?? null } : null;
  }, [p]);
  const effectif = p ? effectifLabel(p.headcount_band) : null;

  return (
    <>
      <div className="mb-5 rounded-2xl border border-border">
        <div className="border-b border-border px-4 py-2.5">
          <SectionLabel>Ce qu’on sait d’elle</SectionLabel>
        </div>
        <div className="divide-y divide-border px-4 py-1">
          {enPlus.map((l) => (
            <Ligne key={l.label} label={l.label}>
              {l.valeur}
            </Ligne>
          ))}
          {p && (
            <>
          {p.legal_name && <Ligne label="Raison sociale">{p.legal_name}</Ligne>}
          {p.siren && <Ligne label="SIREN">{p.siren}</Ligne>}
          {p.registre?.siret && <Ligne label="SIRET du siège">{p.registre.siret}</Ligne>}
          {effectif && (
            <Ligne label="Effectif">
              {effectif}
              {p.headcount_year ? <span className="text-muted-foreground"> (donnée {p.headcount_year})</span> : null}
            </Ligne>
          )}
          {p.open_establishments !== null && <Ligne label="Établissements ouverts">{p.open_establishments}</Ligne>}
          {siege && (siege.address || siege.city) && (
            <Ligne label="Siège">{[siege.address, siege.city].filter(Boolean).join(", ")}</Ligne>
          )}
          {p.leaders && p.leaders.length > 0 && (
            <Ligne label="Dirigeants">
              {p.leaders.map((l) => (l.role ? `${l.name} (${l.role})` : l.name)).join(", ")}
            </Ligne>
          )}
          {/* Un chiffre d'affaires par salarié invraisemblable trahit un effectif
              de groupe collé sur un établissement qui n'emploie personne. On le
              dit plutôt que de laisser le commercial le découvrir au téléphone. */}
          {caParSalarie !== null && caParSalarie < 25000 && (
            <Ligne label="Attention">
              <span className="text-amber-700">
                {Math.round(caParSalarie / 1000)} k€ de chiffre d’affaires par salarié : l’effectif affiché est
                probablement celui du groupe, pas celui de cet établissement.
              </span>
            </Ligne>
          )}
          {dernierExercice && (
            <Ligne label={`Chiffre d’affaires ${dernierExercice.annee}`}>
              {euros(dernierExercice.ca)}
              {dernierExercice.resultat !== null ? (
                <span className="text-muted-foreground"> · résultat net {euros(dernierExercice.resultat)}</span>
              ) : null}
            </Ligne>
          )}
          {p.registre?.categorie && (
            <Ligne label="Catégorie">
              {({ GE: "Grande entreprise", ETI: "Entreprise de taille intermédiaire", PME: "PME" } as Record<string, string>)[
                p.registre.categorie
              ] ?? p.registre.categorie}
            </Ligne>
          )}
          {p.registre?.dateCreation && (
            <Ligne label="Créée le">
              {new Date(p.registre.dateCreation).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
            </Ligne>
          )}
          {p.registre?.tva && <Ligne label="Numéro de TVA">{p.registre.tva}</Ligne>}
          {p.approach && <Ligne label="Angle d’approche">{p.approach}</Ligne>}
          {demandeOrigine && <Ligne label="Demande">« {demandeOrigine} »</Ligne>}
          {/* Toutes les adresses et tous les numéros connus, d'où qu'ils
              viennent : la fiche, le site officiel, les personnes trouvées. Le
              commercial ne doit pas avoir à les chercher ailleurs dans l'écran. */}
          {adressesConnues.length > 0 && (
            <Ligne label={adressesConnues.length > 1 ? "Adresses e-mail" : "E-mail"}>
              {adressesConnues.map((a) => (
                <a key={a} href={`mailto:${a}`} className="block text-avisdoc-teal underline-offset-2 hover:underline">
                  {a}
                </a>
              ))}
            </Ligne>
          )}
          {numerosConnus.length > 0 && (
            <Ligne label={numerosConnus.length > 1 ? "Téléphones" : "Téléphone"}>
              {numerosConnus.map((n) => (
                <a key={n} href={`tel:${n.replace(/\s/g, "")}`} className="block text-avisdoc-teal underline-offset-2 hover:underline">
                  {n}
                </a>
              ))}
            </Ligne>
          )}
          {p.website && (
            <Ligne label="Site">
              <a href={p.website} target="_blank" rel="noreferrer" className="text-avisdoc-teal underline-offset-2 hover:underline">
                {p.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            </Ligne>
          )}
          {p.reliability !== null && p.reliability_detail?.length ? (
            <Ligne label={`Fiabilité ${p.reliability}/10`}>
              <span className="block space-y-0.5">
                {p.reliability_detail.map((d) => (
                  <span key={d.quoi} className="flex items-baseline justify-between gap-3">
                    <span className={d.sur === 0 ? "text-muted-foreground" : ""}>{d.quoi}</span>
                    <span
                      className={
                        d.sur === 2 ? "text-right text-emerald-700" : d.sur === 1 ? "text-right text-amber-700" : "text-right text-muted-foreground"
                      }
                    >
                      {d.dit}
                    </span>
                  </span>
                ))}
              </span>
            </Ligne>
          ) : null}
          {!p.enriched_at && (
            <div className="py-3 text-[13px] text-muted-foreground">
              Ce qui manque encore — l’interlocuteur du service concerné, son e-mail, la politique santé-sécurité —
              se trouve sur le site de l’entreprise. « Approfondir » va l’y chercher.
            </div>
          )}
            </>
          )}
          {!p && enPlus.length === 0 && <div className="py-3 text-[13px] text-muted-foreground">Rien de connu pour l’instant.</div>}
        </div>
      </div>
      {/* Pages consultées */}
      {p && p.sources?.length > 0 && (
        <div className="mb-6">
          <SectionLabel>Pages consultées</SectionLabel>
          <ul className="mt-1.5 space-y-1">
            {p.sources.slice(0, 8).map((s) => (
              <li key={s}>
                <a href={s} target="_blank" rel="noreferrer" className="text-[12.5px] text-avisdoc-teal underline-offset-2 hover:underline">
                  {(() => {
                    try {
                      return new URL(s).hostname.replace(/^www\./, "");
                    } catch {
                      return s;
                    }
                  })()}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
