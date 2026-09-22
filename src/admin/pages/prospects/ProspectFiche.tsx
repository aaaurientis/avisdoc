// Fiche d’un prospect trouvé par Merx : pourquoi c’est une cible, la note détaillée, les coordonnées,
// et les pages réellement consultées. « Approfondir » va chercher le registre officiel et le site.

import { useState } from "react";
import { ArrowRightCircle, Check, ExternalLink, Loader2, Mail, PenLine, Phone, Search, X } from "lucide-react";
import type { Client } from "../../types";
import { useAdminData } from "../../data/AdminDataContext";
import { uid } from "../../lib/format";
import { Badge, SectionLabel } from "../../components/ui";
import { CATEGORIES, CRITERES, effectifLabel, tonNote, type Prospect } from "../../lib/merx";
import { euroDollar } from "../../lib/couts";
import { cn } from "@/lib/utils";

function Ligne({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2">
      <div className="w-40 shrink-0 text-[12.5px] text-muted-foreground">{label}</div>
      <div className="min-w-0 flex-1 text-[13px] text-avisdoc-ink">{children}</div>
    </div>
  );
}

export default function ProspectFiche({
  prospect,
  onClose,
  onApprofondir,
  onEcarter,
  onMettreAuPipeline,
  onRedigerEmail,
  couts,
}: {
  prospect: Prospect;
  onClose: () => void;
  onApprofondir: (p: Prospect) => Promise<void>;
  onEcarter: (p: Prospect) => Promise<void>;
  /** Crée l'affaire dans le Pipeline et garde le lien sur la fiche. */
  onMettreAuPipeline: (p: Prospect, clientId: string) => Promise<void>;
  /** Demande à Merx un brouillon de premier contact. */
  onRedigerEmail: (p: Prospect) => Promise<void>;
  /** Ce que coûte chaque bouton, mesuré ou estimé tant qu'aucune demande n'a eu lieu. */
  couts: { approfondissement: { montant: number; mesure: boolean }; email: { montant: number; mesure: boolean } };
}) {
  const { stages, addClient, addProjectContact } = useAdminData();
  const [enCours, setEnCours] = useState<"approfondir" | "ecarter" | "pipeline" | "email" | null>(null);
  const [choixEtape, setChoixEtape] = useState(false);
  const p = prospect;
  const siege = p.head_office;
  const effectif = effectifLabel(p.headcount_band);

  /** Le prospect devient une affaire : on reprend ce que Merx a trouvé, sans rien réinventer. */
  const versLePipeline = async (etape: string) => {
    if (enCours) return;
    setEnCours("pipeline");
    setChoixEtape(false);
    try {
      const id = uid();
      const client: Client = {
        id,
        company: p.legal_name || p.name,
        siren: p.siren ?? "",
        siret: "",
        naf: "",
        adresse: p.head_office?.address ?? "",
        codePostal: "",
        ville: p.head_office?.city ?? p.city ?? "",
        effectif: effectifLabel(p.headcount_band) ?? "",
        stage: etape,
        jours: 1,
        tarif: 0,
        depistes: 0,
        orientes: 0,
        resultat: null,
        statutPropo: "Brouillon",
        contacts: [],
        docs: [],
        suivis: [],
      };
      addClient(client);
      // L'interlocuteur trouvé par Merx suit l'affaire.
      if (p.contact_name) {
        const [prenom, ...reste] = p.contact_name.trim().split(" ");
        addProjectContact(id, {
          prenom,
          nom: reste.join(" "),
          role: p.contact_role ?? "",
          email: p.contact_email ?? "",
        });
      }
      await onMettreAuPipeline(p, id);
    } finally {
      setEnCours(null);
    }
  };

  const lancer = async (quoi: "approfondir" | "ecarter" | "email") => {
    if (enCours) return;
    setEnCours(quoi);
    try {
      if (quoi === "approfondir") await onApprofondir(p);
      else if (quoi === "ecarter") await onEcarter(p);
      else await onRedigerEmail(p);
    } finally {
      setEnCours(null);
    }
  };

  /** Le prix est annoncé sur le bouton : on sait ce qu'on engage avant de cliquer. */
  const prix = (c: { montant: number; mesure: boolean }) => `${c.mesure ? "" : "~"}${euroDollar(c.montant)}`;

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-avisdoc-ink/45 p-4 sm:p-8">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl rounded-3xl bg-card p-6 shadow-floating sm:p-8">
        {/* Titre */}
        <div className="mb-4 flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-semibold text-avisdoc-ink">{p.name}</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {[p.activity, p.city].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <Badge className={tonNote(p.score_total)}>{p.score_total ?? "—"} / 100</Badge>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink">
            <X className="size-5" />
          </button>
        </div>

        {/* Pourquoi c’est une cible */}
        {p.rationale && (
          <div className="mb-5 rounded-2xl bg-avisdoc-teal/10 p-4">
            <SectionLabel>Pourquoi c’est un bon prospect</SectionLabel>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-avisdoc-ink">{p.rationale}</p>
          </div>
        )}

        {/* Note détaillée */}
        <div className="mb-5">
          <SectionLabel>La note, critère par critère</SectionLabel>
          <div className="mt-2 grid gap-4 sm:grid-cols-3">
            {CATEGORIES.map((cat) => (
              <div key={cat.id} className="rounded-2xl bg-muted/60 p-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">{cat.label}</div>
                <div className="mt-2 space-y-2.5">
                  {cat.criteres.map((id) => {
                    const note = p.score?.[id];
                    const points = note?.points ?? null;
                    return (
                      <div key={id}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[12.5px] font-semibold text-avisdoc-ink">{CRITERES[id].label}</span>
                          <span className="shrink-0 text-[12px] font-bold text-muted-foreground">
                            {points === null ? "non évalué" : `${points}/${CRITERES[id].max}`}
                          </span>
                        </div>
                        {note?.justification && (
                          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{note.justification}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ce que l’approfondissement a trouvé */}
        <div className="mb-5 rounded-2xl border border-border">
          <div className="border-b border-border px-4 py-2.5">
            <SectionLabel>{p.enriched_at ? "Registre officiel et coordonnées" : "Fiche non approfondie"}</SectionLabel>
          </div>
          <div className="divide-y divide-border px-4 py-1">
            {p.enriched_at ? (
              <>
                {p.legal_name && <Ligne label="Raison sociale">{p.legal_name}</Ligne>}
                {p.siren && <Ligne label="SIREN">{p.siren}</Ligne>}
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
                {p.contact_name && (
                  <Ligne label="Interlocuteur">
                    {p.contact_name}
                    {p.contact_role ? <span className="text-muted-foreground"> — {p.contact_role}</span> : null}
                  </Ligne>
                )}
                {p.leaders && p.leaders.length > 0 && (
                  <Ligne label="Dirigeants">
                    {p.leaders.map((l) => (l.role ? `${l.name} (${l.role})` : l.name)).join(", ")}
                  </Ligne>
                )}
                {p.approach && <Ligne label="Angle d’approche">{p.approach}</Ligne>}
              </>
            ) : (
              <div className="py-3 text-[13px] text-muted-foreground">
                La recherche ne rend qu’une fiche légère. « Approfondir » va chercher l’identité officielle, l’effectif,
                les dirigeants et les coordonnées publiées — c’est gratuit, cela prend une trentaine de secondes.
              </div>
            )}
          </div>
        </div>

        {/* Coordonnées */}
        {(p.contact_email || p.contact_phone || p.website) && (
          <div className="mb-5 flex flex-wrap gap-2">
            {p.contact_email && (
              <a
                href={`mailto:${p.contact_email}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[13px] font-semibold text-avisdoc-ink hover:border-avisdoc-teal"
              >
                <Mail className="size-4" /> {p.contact_email}
              </a>
            )}
            {p.contact_phone && (
              <a
                href={`tel:${p.contact_phone.replace(/\s/g, "")}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[13px] font-semibold text-avisdoc-ink hover:border-avisdoc-teal"
              >
                <Phone className="size-4" /> {p.contact_phone}
              </a>
            )}
            {p.website && (
              <a
                href={p.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[13px] font-semibold text-avisdoc-ink hover:border-avisdoc-teal"
              >
                <ExternalLink className="size-4" /> Site officiel
              </a>
            )}
          </div>
        )}

        {/* Pages consultées */}
        {p.sources?.length > 0 && (
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

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {p.converted_client_id ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-4 py-2.5 text-sm font-bold text-emerald-700">
              <Check className="size-4" /> Dans le Pipeline
            </span>
          ) : choixEtape ? (
            <div className="flex w-full flex-wrap items-center gap-2 rounded-2xl bg-muted/60 p-2.5">
              <span className="text-[12.5px] font-semibold text-avisdoc-ink">À quelle étape ?</span>
              {stages.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => void versLePipeline(s.label)}
                  className="rounded-full border border-border bg-card px-3.5 py-1.5 text-[12.5px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal"
                >
                  {s.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setChoixEtape(false)}
                className="text-[12.5px] font-semibold text-muted-foreground hover:text-avisdoc-ink"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setChoixEtape(true)}
              disabled={enCours !== null}
              className={cn(
                "ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60",
              )}
            >
              {enCours === "pipeline" ? <Loader2 className="size-4 animate-spin" /> : <ArrowRightCircle className="size-4" />}
              Mettre dans le Pipeline
            </button>
          )}
          <button
            type="button"
            onClick={() => void lancer("approfondir")}
            disabled={enCours !== null}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal disabled:opacity-60"
          >
            {enCours === "approfondir" ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            {p.enriched_at ? "Approfondir à nouveau" : "Approfondir"}
            <span className="font-mono text-[11.5px] font-normal text-muted-foreground">{prix(couts.approfondissement)}</span>
          </button>
          <button
            type="button"
            onClick={() => void lancer("email")}
            disabled={enCours !== null}
            title="Merx rédige un brouillon à partir de cette fiche. Rien n'est envoyé."
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal disabled:opacity-60"
          >
            {enCours === "email" ? <Loader2 className="size-4 animate-spin" /> : <PenLine className="size-4" />}
            Rédiger un mail
            <span className="font-mono text-[11.5px] font-normal text-muted-foreground">{prix(couts.email)}</span>
          </button>
          <button
            type="button"
            onClick={() => void lancer("ecarter")}
            disabled={enCours !== null}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground hover:border-rose-300 hover:text-rose-700 disabled:opacity-60"
          >
            {enCours === "ecarter" ? <Loader2 className="size-4 animate-spin" /> : null}
            Écarter
          </button>
        </div>
      </div>
    </div>
  );
}
