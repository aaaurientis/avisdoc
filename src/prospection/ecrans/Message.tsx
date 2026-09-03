// Rédaction d'une note d'invitation ou d'un message de relance : génération
// assistée (Bedrock eu-west-3), relecture obligatoire, garde-fous vérifiés par
// le code. Action principale « Copier », action de suivi « Marquer comme envoyé »
// (crée l'interaction et arme les relances). L'envoi est manuel, dans LinkedIn.
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "@/components/ui/sonner";
import { genererMessage, invitationsDuJour, lireContact, marquerEnvoye } from "../data/repo";
import type { TypeInteraction } from "../data/types";
import { LONGUEUR_MAX, pr30GardeFousMessage, pr31ObjectionAttendue, pr32NormaliserTypographieLinkedin } from "../domaine/gardeFousMessage";
import { pr52MotifInvitationBloquee, pr56GenreMessage, pr57MotifRelanceBloquee, type MotifBlocage } from "../domaine/relances";
import { calculerScore, estFonctionRhQvctPrevention } from "../domaine/signaux";
import { L, t } from "../i18n/libelles";
import { copier } from "../lib/navigateur";
import { Bouton, Carte, Chargement, EnTete, Erreur, Etiquette, LienRetour, Vide, ZoneTexte, type MotifInactif } from "../composants/ui";
import { cn } from "@/lib/utils";

const TYPES_ENVOI: TypeInteraction[] = ["invitation", "message_valeur", "partage_contenu", "proposition"];

export default function Message() {
  const { id = "", type = "" } = useParams();
  const typeEnvoi: TypeInteraction = (TYPES_ENVOI as string[]).includes(type) ? (type as TypeInteraction) : "invitation";
  const qc = useQueryClient();
  const fiche = useQuery({ queryKey: ["contact", id], queryFn: () => lireContact(id) });
  const invitations = useQuery({ queryKey: ["invitations"], queryFn: invitationsDuJour });
  const [texte, setTexte] = useState("");
  const [envoye, setEnvoye] = useState<{ statut: string; restantes: number } | null>(null);
  const refViolations = useRef<HTMLDivElement>(null);

  const contact = fiche.data?.contact;
  const genre = pr56GenreMessage(typeEnvoi);
  const rh = estFonctionRhQvctPrevention(contact?.fonction);
  const violations = useMemo(() => pr30GardeFousMessage(texte, genre, rh), [texte, genre, rh]);

  const generer = useMutation({
    mutationFn: () => {
      if (!contact) throw new Error("contact");
      const cle = pr31ObjectionAttendue(contact.compte?.type, contact.compte?.cercle);
      const score = calculerScore(contact, contact.compte);
      return genererMessage({
        genre, typeEnvoi,
        typeCompte: contact.compte?.type ?? null,
        cercle: contact.compte?.cercle ?? null,
        fonction: contact.fonction, niveau: contact.niveau,
        destinataireRh: rh,
        objection: cle, objectionTexte: L.objections[cle],
        signaux: score.evaluations.filter((e) => e.actif).map((e) => ({ code: e.code, libelle: L.regles[e.code], constate_le: e.constate_le, detail: e.detail })),
        historique: (fiche.data?.interactions ?? []).slice(0, 6).map((i) => ({ type: i.type, sens: i.sens, survenu_le: i.survenu_le, contenu: i.contenu })),
      });
    },
    onSuccess: (r) => {
      const normalise = pr32NormaliserTypographieLinkedin(r.texte);
      setTexte(normalise);
      if (normalise !== r.texte.trim()) toast.message(L.message.typographieCorrigee);
    },
  });

  const envoyer = useMutation({
    mutationFn: () => marquerEnvoye(id, typeEnvoi, texte.trim()),
    onSuccess: (r) => {
      setEnvoye({ statut: r.statut, restantes: r.invitations_restantes });
      toast.success(typeEnvoi === "invitation" ? L.message.envoye : L.message.envoyeRelance);
      void qc.invalidateQueries();
    },
  });

  if (fiche.isPending) return <Chargement />;
  if (fiche.isError) return <><EnTete titre={L.message.titre} retour={{ to: `/contacts/${id}`, libelle: L.commun.retourFiche }} /><Erreur erreur={fiche.error} /></>;
  if (!contact) return <><EnTete titre={L.message.titre} retour={{ to: "/contacts", libelle: L.commun.retourContacts }} /><Vide texte={L.fiche.introuvable} /></>;

  const max = LONGUEUR_MAX[genre];
  const motifBlocage: MotifBlocage | null = typeEnvoi === "invitation"
    ? pr52MotifInvitationBloquee(contact.statut, invitations.data ?? 0)
    : pr57MotifRelanceBloquee(contact.statut, fiche.data?.relances ?? [], typeEnvoi);
  const versViolations = () => refViolations.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  const motifTexte: MotifInactif | null = violations.length ? { texte: violations[0]?.code === "vide" ? L.motifs.message_vide : L.motifs.message_non_conforme, action: versViolations } : null;
  const motifSuivi: MotifInactif | null = motifBlocage
    ? { texte: L.motifs[motifBlocage], lien: motifBlocage === "plafond_atteint" ? "/jour" : `/contacts/${id}` }
    : motifTexte;

  const libelleViolation = (code: keyof typeof L.message.violation, extrait?: string) =>
    t(L.message.violation[code], { n: extrait ?? "", x: extrait ?? "" });

  return (
    <div>
      <EnTete
        titre={`${L.message.titre} · ${L.typesInteraction[typeEnvoi]}`}
        sousTitre={genre === "invitation" ? L.message.sousTitreInvitation : L.message.sousTitreMessage}
        retour={{ to: `/contacts/${id}`, libelle: L.commun.retourFiche }}
      />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_360px]">
        <Carte className="p-[22px]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <Etiquette>{L.message.texte}</Etiquette>
            <Bouton libelle={texte ? L.message.regenerer : L.message.generer} onClick={() => generer.mutate()} chargement={generer.isPending} motifInactif={envoye ? { texte: L.motifs.relance_deja_faite } : null} />
          </div>
          <Erreur erreur={generer.error} className="mb-3" />
          <ZoneTexte value={texte} onChange={(e) => setTexte(e.target.value)} className="min-h-[220px] font-sans text-[15px]" disabled={!!envoye} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px]">
            <span className={cn(texte.length > max ? "font-semibold text-avisdoc-coral-ink" : "text-muted-foreground")}>{t(L.message.caracteres, { n: texte.length, max })}</span>
            <span className="text-muted-foreground">{L.message.relecture}</span>
          </div>

          {violations.length > 0 && texte.trim() && (
            <div ref={refViolations} role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900">
              <div className="mb-1 font-semibold">{L.message.violationsTitre}</div>
              <ul className="list-disc pl-5">
                {violations.map((v) => <li key={v.code}>{libelleViolation(v.code, v.extrait)}</li>)}
              </ul>
            </div>
          )}

          {envoye ? (
            <div className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
              <div className="font-semibold">{typeEnvoi === "invitation" ? L.message.envoye : L.message.envoyeRelance}</div>
              <div className="mt-1">{L.statuts[envoye.statut as keyof typeof L.statuts]} · {t(L.jour.kpiInvitations, {})} : {envoye.restantes}</div>
              <div className="mt-2"><LienRetour to={`/contacts/${id}`} libelle={L.commun.retourFiche} /></div>
            </div>
          ) : (
            <div className="mt-5 flex flex-wrap items-start gap-3">
              <Bouton principal libelle={L.message.copier} motifInactif={motifTexte}
                onClick={() => void copier(texte).then((ok) => ok && toast.success(L.commun.copie))} />
              <Bouton libelle={L.message.marquerEnvoye} onClick={() => envoyer.mutate()} chargement={envoyer.isPending} motifInactif={motifSuivi} />
            </div>
          )}
          <Erreur erreur={envoyer.error} className="mt-3" />
        </Carte>

        <Carte className="p-[22px]">
          <Etiquette>{L.message.contexte}</Etiquette>
          <p className="mt-1 text-[12.5px] text-muted-foreground">{L.message.contexteDetail}</p>
          <dl className="mt-4 flex flex-col gap-2 text-[13px]">
            <Ligne l={L.fiche.champType} v={contact.compte ? L.typesCompte[contact.compte.type] : L.fiche.sansCompte} />
            <Ligne l={L.fiche.champCercle} v={L.cercles[(contact.compte?.cercle ?? 0) as 0 | 1 | 2 | 3]} />
            <Ligne l={L.fiche.champFonction} v={contact.fonction ?? L.commun.aucune} />
            <Ligne l={L.fiche.objection} v={L.objections[pr31ObjectionAttendue(contact.compte?.type, contact.compte?.cercle)]} />
            <Ligne l={L.message.modele} v={generer.data?.modele ?? ""} />
          </dl>
        </Carte>
      </div>
    </div>
  );
}

function Ligne({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{l}</dt>
      <dd className="text-avisdoc-ink">{v}</dd>
    </div>
  );
}
