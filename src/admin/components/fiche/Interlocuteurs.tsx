// Les interlocuteurs d'une entreprise, présentés de la même façon sur les trois fiches.
//
// Ceux que Merx a trouvés et ceux qu'on a saisis à la main se lisent pareil : nom,
// fonction, coordonnées. Une piste dont la source ne fait pas foi reste « à confirmer ».

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, Phone, Plus, Smartphone, Sparkles, X } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { COUT_FE, demanderFE, demandesFE, enCoursFE, type DemandeFE } from "../../lib/fullenrich";
import BarreProgression, { ETAPES_FULLENRICH } from "../BarreProgression";
import { SectionLabel } from "../ui";
import { confirmer } from "../Confirmation";
import { cn } from "@/lib/utils";

import type { PersonneFiche } from "../../lib/fiche";

const champCls =
  "ad-input min-w-0 rounded-full border border-border bg-muted/50 px-3.5 py-2 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";

const hote = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export default function Interlocuteurs({
  personnes,
  onAjouter,
  onRetirer,
  fullenrich,
}: {
  personnes: PersonneFiche[];
  onAjouter?: (p: { prenom: string; nom: string; role: string; email: string }) => void;
  onRetirer?: (id: string) => void;
  /** FullEnrich sur cette fiche : sa fiche d'entreprise, si le mobile est permis (vrai client), et que relire quand un résultat arrive. */
  fullenrich?: { prospectId: string; mobile: boolean; onResultat: () => void };
}) {
  const [saisie, setSaisie] = useState({ prenom: "", nom: "", role: "", email: "" });
  const [ouvert, setOuvert] = useState(false);
  const { user } = useAuth();
  const [demandes, setDemandes] = useState<DemandeFE[]>([]);
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [souci, setSouci] = useState<string | null>(null);
  const prospectId = fullenrich?.prospectId;
  const onResultat = fullenrich?.onResultat;

  const relire = useCallback(async () => {
    if (!prospectId) return;
    const avant = demandes.filter(enCoursFE).length;
    const d = await demandesFE(prospectId);
    setDemandes(d);
    // Un résultat vient d'arriver : la fiche se relit pour montrer les e-mails trouvés.
    if (avant > d.filter(enCoursFE).length) onResultat?.();
  }, [prospectId, demandes, onResultat]);

  useEffect(() => {
    void relire();
    // Seulement au changement de fiche ; le suivi se fait ci-dessous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospectId]);

  // Tant qu'une demande est en cours, on regarde toutes les 20 secondes.
  useEffect(() => {
    if (!demandes.some(enCoursFE)) return;
    const t = setInterval(() => void relire(), 20_000);
    return () => clearInterval(t);
  }, [demandes, relire]);

  const demander = async (kind: "contacts" | "contacts_plus" | "mobile", personne?: string) => {
    if (!prospectId || envoi) return;
    const cout = kind === "mobile" ? COUT_FE.mobile : COUT_FE.plus;
    const titre = kind === "mobile" ? `Chercher le mobile de ${personne} ?` : kind === "contacts" ? "Chercher 2 contacts ?" : "Chercher 2 autres contacts ?";
    if (!(await confirmer({ titre, message: `FullEnrich, ${cout}. Le résultat arrive en une à deux minutes.`, action: "Chercher" }))) return;
    setEnvoi(kind === "mobile" ? `mobile:${personne}` : kind);
    setSouci(null);
    try {
      await demanderFE(prospectId, kind, user?.email ?? "", personne);
      await relire();
    } catch (e) {
      setSouci(e instanceof Error ? e.message : "La demande n’a pas pu partir.");
    } finally {
      setEnvoi(null);
    }
  };

  const premiere = demandes.find((d) => d.kind === "contacts");
  const plus = demandes.find((d) => d.kind === "contacts_plus");
  const mobileDe = (nom: string) => demandes.find((d) => d.kind === "mobile" && d.personne?.trim().toLowerCase() === nom.trim().toLowerCase());
  const etat = [premiere, plus].filter((d): d is DemandeFE => Boolean(d));

  const ajouter = () => {
    if (!onAjouter || (!saisie.prenom.trim() && !saisie.nom.trim())) return;
    onAjouter(saisie);
    setSaisie({ prenom: "", nom: "", role: "", email: "" });
    setOuvert(false);
  };

  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <SectionLabel>Interlocuteurs</SectionLabel>
        {onAjouter && !ouvert && (
          <button type="button" onClick={() => setOuvert(true)} className="inline-flex items-center gap-1 text-[12.5px] font-bold text-avisdoc-teal">
            <Plus className="size-3.5" /> Ajouter
          </button>
        )}
      </div>

      {personnes.length === 0 && !ouvert && <p className="text-[13px] text-muted-foreground">Aucun interlocuteur connu pour l’instant.</p>}

      {/* Ce que FullEnrich fait, ou a dit, sur cette fiche. */}
      {etat.map((d) =>
        enCoursFE(d) ? (
          <BarreProgression key={d.id} className="mb-2.5" dureeEstimeeS={120} etapes={ETAPES_FULLENRICH} />
        ) : d.message ? (
          <p key={d.id} className={cn("mb-2 text-[12.5px]", d.statut === "bloque" ? "font-semibold text-amber-700" : "text-muted-foreground")}>
            {d.message}
          </p>
        ) : null,
      )}

      <div className="space-y-2">
        {personnes.map((q) => (
          <div key={q.id ?? `${q.nom}-${q.fonction ?? ""}`} className="group flex items-start gap-3 rounded-xl border border-border px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] text-avisdoc-ink">
                <span className="font-semibold">{q.nom}</span>
                {q.fonction && <span className="text-muted-foreground"> · {q.fonction}</span>}
                {q.aConfirmer && <span className="ml-2 text-[11.5px] text-amber-700">à confirmer</span>}
              </div>
              {(q.email || q.emailDeduit || q.telephone) && (
                <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px]">
                  {q.email && (
                    <a href={`mailto:${q.email}`} className="inline-flex items-center gap-1 text-avisdoc-teal underline-offset-2 hover:underline">
                      <Mail className="size-3.5" /> {q.email}
                    </a>
                  )}
                  {!q.email && q.emailDeduit && (
                    <a
                      href={`mailto:${q.emailDeduit}`}
                      title="Adresse composée d’après le format maison de l’entreprise : à confirmer"
                      className="inline-flex items-center gap-1 text-avisdoc-teal underline-offset-2 hover:underline"
                    >
                      <Mail className="size-3.5" /> {q.emailDeduit}
                      <span className="text-[11px] text-amber-700">déduite, à confirmer</span>
                    </a>
                  )}
                  {q.telephone && (
                    <a href={`tel:${q.telephone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-avisdoc-teal underline-offset-2 hover:underline">
                      <Phone className="size-3.5" /> {q.telephone}
                    </a>
                  )}
                </div>
              )}
              {/* Le mobile : vrai client seulement, à la demande. */}
              {fullenrich?.mobile && !q.telephone && (() => {
                const m = mobileDe(q.nom);
                if (m && enCoursFE(m))
                  return (
                    <span className="mt-1 inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" /> Mobile en cours de recherche…
                    </span>
                  );
                if (m) return m.message ? <span className="mt-1 block text-[12px] text-muted-foreground">{m.message}</span> : null;
                return (
                  <button
                    type="button"
                    onClick={() => void demander("mobile", q.nom)}
                    disabled={envoi !== null}
                    className="mt-1 inline-flex items-center gap-1 text-[12px] font-bold text-avisdoc-teal disabled:opacity-50"
                  >
                    {envoi === `mobile:${q.nom}` ? <Loader2 className="size-3 animate-spin" /> : <Smartphone className="size-3.5" />} Chercher son mobile
                  </button>
                );
              })()}
              {q.source && (
                <a href={q.source} target="_blank" rel="noreferrer" className="mt-0.5 block text-[11.5px] text-muted-foreground underline-offset-2 hover:underline">
                  trouvé sur {hote(q.source)}
                </a>
              )}
            </div>
            {q.id && onRetirer && (
              <button
                type="button"
                aria-label={`Retirer ${q.nom}`}
                onClick={async () => {
                  if (await confirmer({ titre: `Retirer ${q.nom} ?`, message: "La personne ne sera plus listée sur cette fiche." })) onRetirer(q.id!);
                }}
                className="rounded-lg p-1 text-muted-foreground opacity-0 transition-opacity hover:text-rose-700 group-hover:opacity-100"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* La première recherche se fait à l'approfondissement (20/10) ; ensuite, une fois, « 2 autres ». */}
      {fullenrich && premiere && !enCoursFE(premiere) && !plus && (
        <button
          type="button"
          onClick={() => void demander("contacts_plus")}
          disabled={envoi !== null}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[12.5px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal disabled:opacity-50"
        >
          {envoi === "contacts_plus" || envoi === "contacts" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}{" "}
          Chercher 2 autres contacts
        </button>
      )}
      {souci && <p className="mt-2 text-[12.5px] font-semibold text-rose-700">{souci}</p>}

      {ouvert && onAjouter && (
        <div className="mt-2 flex flex-wrap gap-2 rounded-xl border border-border p-2.5">
          <input className={cn(champCls, "flex-1")} placeholder="Prénom" value={saisie.prenom} onChange={(e) => setSaisie({ ...saisie, prenom: e.target.value })} autoFocus />
          <input className={cn(champCls, "flex-1")} placeholder="Nom" value={saisie.nom} onChange={(e) => setSaisie({ ...saisie, nom: e.target.value })} />
          <input className={cn(champCls, "flex-1")} placeholder="Fonction" value={saisie.role} onChange={(e) => setSaisie({ ...saisie, role: e.target.value })} />
          <input className={cn(champCls, "flex-[1.3]")} placeholder="E-mail" value={saisie.email} onChange={(e) => setSaisie({ ...saisie, email: e.target.value })} />
          <button type="button" onClick={ajouter} className="ad-btn-accent rounded-full bg-avisdoc-teal px-4 py-2 text-[12.5px] font-bold text-white">
            Ajouter
          </button>
          <button type="button" onClick={() => setOuvert(false)} className="rounded-full px-3 py-2 text-[12.5px] font-bold text-muted-foreground">
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}
