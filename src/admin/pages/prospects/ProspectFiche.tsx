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
import NoteDetaillee from "./NoteDetaillee";
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
  demandeOrigine,
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
  /** La recherche qui a fait apparaître cette fiche. */
  demandeOrigine: string | null;
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

  // Ce qui a été constaté : les critères qui ont rapporté des points, avec leur justification.
  const constats = CATEGORIES.flatMap((cat) =>
    cat.criteres
      .map((id) => ({ label: CRITERES[id].label, justification: p.score?.[id]?.justification ?? "", points: p.score?.[id]?.points ?? null }))
      .filter((c) => c.points !== null && c.justification),
  );


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

        {/* Pourquoi c’est une cible : la phrase, les faits constatés, puis l’angle d’approche. */}
        {(p.rationale || constats.length > 0 || p.approach) && (
          <div className="mb-5 rounded-2xl border-l-4 border-avisdoc-teal bg-muted/50 p-4">
            <SectionLabel>Pourquoi c’est un bon prospect</SectionLabel>
            {p.rationale && <p className="mt-1.5 text-[13.5px] leading-relaxed text-avisdoc-ink">{p.rationale}</p>}
            {constats.length > 0 && (
              <ul className="mt-2 space-y-1">
                {constats.map((c) => (
                  <li key={c.label} className="flex gap-2 text-[13px] leading-snug text-avisdoc-ink">
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-avisdoc-teal" />
                    <span>
                      <span className="font-semibold">{c.label}</span> : {c.justification}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {p.approach && (
              <p className="mt-3 text-[13.5px] leading-relaxed text-avisdoc-ink">
                <span className="font-semibold">Angle d’approche : </span>
                {p.approach}
              </p>
            )}
          </div>
        )}

        {/* La note, telle qu’elle a été gagnée */}
        <div className="mb-5">
          <SectionLabel>La note, critère par critère</SectionLabel>
          <div className="mt-2">
            <NoteDetaillee total={p.score_total} score={p.score ?? {}} />
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
                {demandeOrigine && <Ligne label="Demande">« {demandeOrigine} »</Ligne>}
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
          </button>
          <span className="text-[12.5px] text-muted-foreground">
            {couts.approfondissement.mesure ? "Coût mesuré" : "Coût estimé"} : environ {euroDollar(couts.approfondissement.montant)} par approfondissement.
          </span>
          <button
            type="button"
            onClick={() => void lancer("email")}
            disabled={enCours !== null}
            title="Merx rédige un brouillon à partir de cette fiche. Rien n'est envoyé."
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal disabled:opacity-60"
          >
            {enCours === "email" ? <Loader2 className="size-4 animate-spin" /> : <PenLine className="size-4" />}
            Écrire un e-mail personnalisé
          </button>
          <span className="text-[12.5px] text-muted-foreground">
            {p.contact_email ? `Environ ${euroDollar(couts.email.montant)}.` : `Pas d’adresse sur la fiche : vous la saisirez dans l’e-mail. Environ ${euroDollar(couts.email.montant)}.`}
          </span>
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
