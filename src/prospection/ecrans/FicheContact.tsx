// Fiche contact : identité, compte, qualification (signaux datés), score
// rejoué, séquence de relances, historique, actions. Une seule action
// principale, dictée par le statut ; les transitions passent par le serveur.
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  ajouterNote, creerCompte, enregistrerReponse, invitationsDuJour, lireContact, mettreAJourCompte,
  mettreAJourContact, rattacherCompte, transition, type FicheContact as Fiche,
} from "../data/repo";
import type { Canal, ContactAvecCompte, Interaction, ModificationCompte, ModificationContact, NiveauContact, Relance, StatutContact, TypeCompte } from "../data/types";
import { Constants } from "../data/types.gen";
import { calculerScore, CODES_SIGNAUX, signauxDepuisJson, signauxVersJson, type CodeSignal, type Evaluation } from "../domaine/signaux";
import { pr40TransitionAutorisee } from "../domaine/machineEtats";
import { pr52MotifInvitationBloquee, pr53RelanceSuivante, pr54RetardJours, pr55TypePourEcheance } from "../domaine/relances";
import { pr31ObjectionAttendue } from "../domaine/gardeFousMessage";
import { L, t } from "../i18n/libelles";
import { aujourdhuiIso, dateFr, dateHeureFr, nomComplet } from "../lib/format";
import { lienMailto } from "../lib/navigateur";
import { URL_INFORMATION_PROSPECTION, urlOpposition } from "../lib/config";
import {
  Bouton, Carte, Cercle, Champ, Chargement, EnTete, Erreur, Etiquette, LienPrincipal, Saisie, Selection, Score, Statut, Vide, ZoneTexte, CIBLE,
} from "../composants/ui";

export default function FicheContact() {
  const { id = "" } = useParams();
  const fiche = useQuery({ queryKey: ["contact", id], queryFn: () => lireContact(id) });

  if (fiche.isPending) return <Chargement />;
  if (fiche.isError) return <><EnTete titre={L.fiche.titre} retour={{ to: "/contacts", libelle: L.commun.retourContacts }} /><Erreur erreur={fiche.error} /></>;
  if (!fiche.data) return <><EnTete titre={L.fiche.titre} retour={{ to: "/contacts", libelle: L.commun.retourContacts }} /><Vide texte={L.fiche.introuvable} /></>;

  // Remontée à chaque modification : les formulaires repartent des valeurs en base.
  return <Contenu key={fiche.data.contact.maj_le + (fiche.data.contact.compte?.maj_le ?? "")} fiche={fiche.data} />;
}

function Contenu({ fiche }: { fiche: Fiche }) {
  const { contact, interactions, relances } = fiche;
  const qc = useQueryClient();
  const invitations = useQuery({ queryKey: ["invitations"], queryFn: invitationsDuJour });
  const score = useMemo(() => calculerScore(contact, contact.compte), [contact]);
  const [formulaire, setFormulaire] = useState<"aucun" | "reponse" | "note">("aucun");

  const rafraichir = () => {
    void qc.invalidateQueries({ queryKey: ["contact", contact.id] });
    void qc.invalidateQueries({ queryKey: ["contacts"] });
    void qc.invalidateQueries({ queryKey: ["jour"] });
    void qc.invalidateQueries({ queryKey: ["invitations"] });
  };

  const transiter = useMutation({
    mutationFn: (vers: StatutContact) => transition(contact.id, vers),
    onSuccess: () => { toast.success(L.fiche.transitionFaite); rafraichir(); },
  });

  const prochaine = pr53RelanceSuivante(relances);
  const nom = nomComplet(contact.prenom, contact.nom) || L.commun.sansNom;

  return (
    <div>
      <EnTete
        titre={nom}
        sousTitre={[contact.fonction, contact.compte?.nom ?? L.fiche.sansCompte].filter(Boolean).join(" · ")}
        retour={{ to: "/contacts", libelle: L.commun.retourContacts }}
        action={
          <div className="flex items-center gap-3">
            <Cercle cercle={contact.compte?.cercle} />
            <Statut statut={contact.statut} />
            <Score total={score.total} />
          </div>
        }
      />
      <Erreur erreur={transiter.error} className="mb-4" />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-5">
          <Actions contact={contact} prochaine={prochaine} invitationsDuJour={invitations.data ?? 0}
            transiter={(v) => transiter.mutate(v)} enCours={transiter.isPending} ouvrir={(f) => setFormulaire((x) => (x === f ? "aucun" : f))} formulaire={formulaire} />
          {formulaire === "reponse" && <FormulaireReponse contact={contact} apres={() => { setFormulaire("aucun"); rafraichir(); }} />}
          {formulaire === "note" && <FormulaireNote contact={contact} apres={() => { setFormulaire("aucun"); rafraichir(); }} />}
          <Sequence relances={relances} />
          <Historique interactions={interactions} />
        </div>
        <div className="flex flex-col gap-5">
          <Signaux contact={contact} apres={rafraichir} />
          <DetailScore evaluations={score.evaluations} />
          <Identite contact={contact} apres={rafraichir} />
          <CompteFiche contact={contact} apres={rafraichir} />
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------

function Actions({ contact, prochaine, invitationsDuJour, transiter, enCours, ouvrir, formulaire }: {
  contact: ContactAvecCompte; prochaine: Relance | null; invitationsDuJour: number;
  transiter: (v: StatutContact) => void; enCours: boolean; ouvrir: (f: "reponse" | "note") => void; formulaire: string;
}) {
  const peut = (v: StatutContact) => pr40TransitionAutorisee(contact.statut, v);
  const motifTransition = (v: StatutContact) => (peut(v) ? null : { texte: L.motifs.transition_impossible });
  const objection = L.objections[pr31ObjectionAttendue(contact.compte?.type, contact.compte?.cercle)];

  let principal: ReactNode = <p className="text-sm text-muted-foreground">{L.fiche.aucuneTransition}</p>;
  const secondaires: ReactNode[] = [];

  switch (contact.statut) {
    case "a_qualifier":
      principal = <Bouton principal libelle={L.fiche.passerAContacter} onClick={() => transiter("a_contacter")} chargement={enCours} />;
      break;
    case "a_contacter": {
      const motif = pr52MotifInvitationBloquee(contact.statut, invitationsDuJour);
      principal = <LienPrincipal to={`/contacts/${contact.id}/message/invitation`} libelle={L.fiche.preparerInvitation}
        motifInactif={motif ? { texte: L.motifs[motif], lien: "/jour" } : null} />;
      secondaires.push(<Bouton key="disq" danger libelle={L.fiche.disqualifier} onClick={() => transiter("arrete")} chargement={enCours} motifInactif={motifTransition("arrete")} />);
      break;
    }
    case "invite":
    case "accepte": {
      if (prochaine) {
        const type = pr55TypePourEcheance(prochaine.echeance);
        principal = <LienPrincipal to={`/contacts/${contact.id}/message/${type}`} libelle={`${L.fiche.preparerRelance} ${L.echeances[prochaine.echeance]}`} />;
        if (contact.statut === "invite") secondaires.push(<Bouton key="acc" libelle={L.fiche.invitationAcceptee} onClick={() => transiter("accepte")} chargement={enCours} />);
      } else if (contact.statut === "invite") {
        principal = <Bouton principal libelle={L.fiche.invitationAcceptee} onClick={() => transiter("accepte")} chargement={enCours} />;
      } else {
        principal = <Bouton principal libelle={L.fiche.saisirReponse} onClick={() => ouvrir("reponse")} />;
      }
      if (!(contact.statut === "accepte" && !prochaine)) secondaires.push(<Bouton key="rep" libelle={L.fiche.saisirReponse} onClick={() => ouvrir("reponse")} />);
      secondaires.push(<Bouton key="refus" danger libelle={L.fiche.refus} onClick={() => transiter("refus")} chargement={enCours} motifInactif={motifTransition("refus")} />);
      secondaires.push(<Bouton key="arret" danger libelle={L.fiche.arreter} onClick={() => transiter("arrete")} chargement={enCours} motifInactif={motifTransition("arrete")} />);
      break;
    }
    case "en_conversation":
      principal = <Bouton principal libelle={L.fiche.marquerPartenaire} onClick={() => transiter("partenaire")} chargement={enCours} />;
      secondaires.push(<Bouton key="rep" libelle={L.fiche.saisirReponse} onClick={() => ouvrir("reponse")} />);
      secondaires.push(<Bouton key="refus" danger libelle={L.fiche.refus} onClick={() => transiter("refus")} chargement={enCours} />);
      break;
    default:
      break;
  }

  const lienEmail = contact.email
    ? lienMailto(contact.email, L.fiche.emailObjet, t(L.fiche.emailCorps, { info: URL_INFORMATION_PROSPECTION, opposition: urlOpposition(contact.jeton_opposition) }))
    : null;
  const classeLien = cn(CIBLE, "inline-flex items-center rounded-full border-[1.5px] border-border bg-card px-5 text-sm font-semibold text-avisdoc-ink hover:border-avisdoc-teal");

  return (
    <Carte className="p-[22px]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-avisdoc-ink">{L.fiche.actions}</h2>
        <div className="max-w-md rounded-xl bg-muted px-3 py-2 text-[12px]">
          <Etiquette>{L.fiche.objection}</Etiquette>
          <div className="mt-0.5 text-avisdoc-ink">{objection}</div>
        </div>
      </div>
      <div className="mb-4">{principal}</div>
      <div className="flex flex-wrap items-start gap-3">
        {secondaires}
        <Bouton libelle={L.fiche.ajouterNote} onClick={() => ouvrir("note")} className={formulaire === "note" ? "border-avisdoc-teal" : undefined} />
        {contact.linkedin_url && <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className={classeLien}>{L.fiche.ouvrirLinkedin}</a>}
        {lienEmail && <a href={lienEmail} className={classeLien} title={L.fiche.redigerEmailAide}>{L.fiche.redigerEmail}</a>}
      </div>
      {lienEmail && <p className="mt-3 text-[11.5px] text-muted-foreground">{L.fiche.redigerEmailAide}</p>}
    </Carte>
  );
}

function FormulaireReponse({ contact, apres }: { contact: ContactAvecCompte; apres: () => void }) {
  const [canal, setCanal] = useState<Canal>("linkedin");
  const [contenu, setContenu] = useState("");
  const m = useMutation({
    mutationFn: () => enregistrerReponse(contact.id, canal, contenu.trim()),
    onSuccess: () => { toast.success(L.fiche.reponseEnregistree); apres(); },
  });
  return (
    <Carte className="p-[22px]">
      <h2 className="mb-3 font-display text-lg font-semibold text-avisdoc-ink">{L.fiche.saisirReponse}</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[200px_1fr]">
        <Champ libelle={L.fiche.canal}>
          <Selection value={canal} onChange={(e) => setCanal(e.target.value as Canal)}>
            {Constants.prospection.Enums.canal.map((c) => <option key={c} value={c}>{L.canaux[c]}</option>)}
          </Selection>
        </Champ>
        <Champ libelle={L.fiche.reponseContenu} aide={L.fiche.reponseAide}>
          <ZoneTexte value={contenu} maxLength={600} onChange={(e) => setContenu(e.target.value)} />
        </Champ>
      </div>
      <Erreur erreur={m.error} className="mt-3" />
      <div className="mt-3"><Bouton libelle={L.commun.enregistrer} onClick={() => m.mutate()} chargement={m.isPending} /></div>
    </Carte>
  );
}

function FormulaireNote({ contact, apres }: { contact: ContactAvecCompte; apres: () => void }) {
  const [canal, setCanal] = useState<Canal>("linkedin");
  const [contenu, setContenu] = useState("");
  const m = useMutation({
    mutationFn: () => ajouterNote(contact.id, canal, contenu.trim()),
    onSuccess: () => { toast.success(L.fiche.noteAjoutee); apres(); },
  });
  return (
    <Carte className="p-[22px]">
      <h2 className="mb-3 font-display text-lg font-semibold text-avisdoc-ink">{L.fiche.ajouterNote}</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[200px_1fr]">
        <Champ libelle={L.fiche.canal}>
          <Selection value={canal} onChange={(e) => setCanal(e.target.value as Canal)}>
            {Constants.prospection.Enums.canal.map((c) => <option key={c} value={c}>{L.canaux[c]}</option>)}
          </Selection>
        </Champ>
        <Champ libelle={L.fiche.noteContenu} aide={L.fiche.noteAide}>
          <ZoneTexte value={contenu} maxLength={280} onChange={(e) => setContenu(e.target.value)} />
        </Champ>
      </div>
      <Erreur erreur={m.error} className="mt-3" />
      <div className="mt-3">
        <Bouton libelle={L.commun.enregistrer} onClick={() => m.mutate()} chargement={m.isPending} motifInactif={contenu.trim() ? null : { texte: L.motifs.message_vide }} />
      </div>
    </Carte>
  );
}

function Sequence({ relances }: { relances: Relance[] }) {
  const ordre: Relance["echeance"][] = ["j5", "j12", "j21"];
  const tri = [...relances].sort((a, b) => ordre.indexOf(a.echeance) - ordre.indexOf(b.echeance));
  return (
    <Carte className="p-[22px]">
      <h2 className="mb-3 font-display text-lg font-semibold text-avisdoc-ink">{L.fiche.sequence}</h2>
      {tri.length === 0 ? <Vide texte={L.fiche.sequenceVide} /> : (
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {tri.map((r) => {
            const retard = pr54RetardJours(r.du_le, new Date());
            return (
              <li key={r.id} className={cn("rounded-xl border px-3 py-3", r.etat === "en_attente" && retard >= 0 ? "border-amber-300 bg-amber-50" : "border-border")}>
                <div className="text-[12.5px] font-semibold text-avisdoc-ink">{L.echeances[r.echeance]}</div>
                <div className="text-[11.5px] text-muted-foreground">{L.fiche.due} {dateFr(r.du_le)}</div>
                <div className={cn("mt-1 text-[11.5px] font-semibold", r.etat === "fait" ? "text-emerald-700" : r.etat === "annule" ? "text-muted-foreground" : retard > 0 ? "text-avisdoc-coral-ink" : "text-avisdoc-ink")}>
                  {L.etatsRelance[r.etat]}{r.etat === "en_attente" && retard > 0 ? ` · ${t(L.jour.retard, { n: retard })}` : ""}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Carte>
  );
}

function Historique({ interactions }: { interactions: Interaction[] }) {
  return (
    <Carte className="p-[22px]">
      <h2 className="mb-3 font-display text-lg font-semibold text-avisdoc-ink">{L.fiche.historique}</h2>
      {interactions.length === 0 ? <Vide texte={L.fiche.historiqueVide} /> : (
        <ul className="flex flex-col gap-3">
          {interactions.map((i) => (
            <li key={i.id} className="flex items-start gap-3">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", i.sens === "entrant" ? "bg-emerald-500" : "bg-avisdoc-teal")} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold text-avisdoc-ink">
                  {[L.typesInteraction[i.type], L.canaux[i.canal], L.sens[i.sens]].join(" · ")}
                </div>
                <div className="text-[11.5px] text-muted-foreground">{dateHeureFr(i.survenu_le)}{i.cree_par ? ` · ${i.cree_par}` : ""}</div>
                {i.objet && <div className="mt-1 text-[12.5px] font-medium text-avisdoc-ink">{i.objet}</div>}
                {i.contenu && <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-avisdoc-ink/90">{i.contenu}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Carte>
  );
}

function Signaux({ contact, apres }: { contact: ContactAvecCompte; apres: () => void }) {
  const signaux = signauxDepuisJson(contact.signaux);
  const [code, setCode] = useState<CodeSignal>("PR-03");
  const [date, setDate] = useState(aujourdhuiIso());
  const [detail, setDetail] = useState("");
  const m = useMutation({
    mutationFn: (liste: ReturnType<typeof signauxDepuisJson>) => mettreAJourContact(contact, { signaux: signauxVersJson(liste) }),
    onSuccess: () => { toast.success(L.fiche.enregistre); setDetail(""); apres(); },
  });
  return (
    <Carte className="p-[22px]">
      <h2 className="mb-3 font-display text-lg font-semibold text-avisdoc-ink">{L.fiche.signaux}</h2>
      {signaux.length === 0 ? <Vide texte={L.fiche.signauxVide} /> : (
        <ul className="mb-4 flex flex-col divide-y divide-border">
          {signaux.map((s, i) => (
            <li key={`${s.code}-${s.constate_le}-${i}`} className="flex items-start gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold text-avisdoc-ink">{s.code} · {L.regles[s.code]}</div>
                <div className="text-[11.5px] text-muted-foreground">{dateFr(s.constate_le)}{s.detail ? ` · ${s.detail}` : ""}</div>
              </div>
              <button type="button" onClick={() => m.mutate(signaux.filter((_, j) => j !== i))} className={cn(CIBLE, "px-2 text-[12px] font-semibold text-muted-foreground hover:text-avisdoc-coral-ink")}>
                {L.fiche.retirerSignal}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-3">
        <Champ libelle={L.fiche.signal}>
          <Selection value={code} onChange={(e) => setCode(e.target.value as CodeSignal)}>
            {CODES_SIGNAUX.map((c) => <option key={c} value={c}>{c} · {L.regles[c]}</option>)}
          </Selection>
        </Champ>
        <Champ libelle={L.fiche.dateConstat}><Saisie type="date" value={date} max={aujourdhuiIso()} onChange={(e) => setDate(e.target.value)} /></Champ>
        <Champ libelle={L.fiche.detailSignal} aide={L.fiche.detailSignalAide}><Saisie value={detail} maxLength={120} onChange={(e) => setDetail(e.target.value)} /></Champ>
        <Erreur erreur={m.error} />
        <Bouton libelle={L.fiche.ajouterSignal} chargement={m.isPending}
          onClick={() => m.mutate([...signaux, { code, constate_le: date, ...(detail.trim() ? { detail: detail.trim() } : {}) }])}
          motifInactif={date ? null : { texte: L.fiche.dateConstat }} />
      </div>
    </Carte>
  );
}

function DetailScore({ evaluations }: { evaluations: Evaluation[] }) {
  return (
    <Carte className="p-[22px]">
      <h2 className="mb-3 font-display text-lg font-semibold text-avisdoc-ink">{L.fiche.scoreDetail}</h2>
      <ul className="flex flex-col gap-1.5 text-[12.5px]">
        {evaluations.map((e) => (
          <li key={e.code} className={cn("flex items-center justify-between gap-3", !e.actif && "text-muted-foreground")}>
            <span className="min-w-0 truncate">{e.code} · {L.regles[e.code]}
              <span className="ml-1 text-[11px] text-muted-foreground">({L.sources[e.source]})</span>
            </span>
            <span className={cn("shrink-0 font-semibold", e.actif ? "text-avisdoc-ink" : "text-muted-foreground")}>+{e.points}</span>
          </li>
        ))}
      </ul>
    </Carte>
  );
}

function Identite({ contact, apres }: { contact: ContactAvecCompte; apres: () => void }) {
  const [f, setF] = useState<ModificationContact>({
    prenom: contact.prenom, nom: contact.nom, fonction: contact.fonction ?? "", niveau: contact.niveau,
    email: contact.email ?? "", linkedin_url: contact.linkedin_url ?? "", anciennete_poste_mois: contact.anciennete_poste_mois,
  });
  const m = useMutation({
    mutationFn: () => mettreAJourContact(contact, {
      ...f, fonction: f.fonction || null, email: f.email || null, linkedin_url: f.linkedin_url || null,
    }),
    onSuccess: () => { toast.success(L.fiche.enregistre); apres(); },
  });
  return (
    <Carte className="p-[22px]">
      <h2 className="mb-3 font-display text-lg font-semibold text-avisdoc-ink">{L.fiche.identite}</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Champ libelle={L.fiche.champPrenom}><Saisie value={f.prenom ?? ""} maxLength={80} onChange={(e) => setF({ ...f, prenom: e.target.value })} /></Champ>
        <Champ libelle={L.fiche.champNom}><Saisie value={f.nom ?? ""} maxLength={80} onChange={(e) => setF({ ...f, nom: e.target.value })} /></Champ>
        <Champ libelle={L.fiche.champFonction}><Saisie value={f.fonction ?? ""} maxLength={120} onChange={(e) => setF({ ...f, fonction: e.target.value })} /></Champ>
        <Champ libelle={L.fiche.champNiveau}>
          <Selection value={f.niveau ?? ""} onChange={(e) => setF({ ...f, niveau: (e.target.value || null) as NiveauContact | null })}>
            <option value="">{L.commun.aucun}</option>
            {Constants.prospection.Enums.niveau_contact.map((n) => <option key={n} value={n}>{L.niveaux[n]}</option>)}
          </Selection>
        </Champ>
        <Champ libelle={L.fiche.champEmail}><Saisie type="email" value={f.email ?? ""} onChange={(e) => setF({ ...f, email: e.target.value })} /></Champ>
        <Champ libelle={L.fiche.champLinkedin}><Saisie value={f.linkedin_url ?? ""} onChange={(e) => setF({ ...f, linkedin_url: e.target.value })} /></Champ>
        <Champ libelle={L.fiche.champAnciennete}>
          <Saisie type="number" min={0} value={f.anciennete_poste_mois ?? ""} onChange={(e) => setF({ ...f, anciennete_poste_mois: e.target.value === "" ? null : Number(e.target.value) })} />
        </Champ>
      </div>
      <Erreur erreur={m.error} className="mt-3" />
      <div className="mt-3"><Bouton libelle={L.commun.enregistrer} onClick={() => m.mutate()} chargement={m.isPending} motifInactif={(f.nom ?? "").trim() ? null : { texte: L.fiche.champNom }} /></div>
    </Carte>
  );
}

function CompteFiche({ contact, apres }: { contact: ContactAvecCompte; apres: () => void }) {
  const c = contact.compte;
  const [f, setF] = useState<ModificationCompte & { nom: string }>({
    nom: c?.nom ?? "", type: c?.type ?? "courtier", cercle: c?.cercle ?? null, secteur: c?.secteur ?? "", expose: c?.expose ?? false,
    effectif_min: c?.effectif_min ?? null, effectif_max: c?.effectif_max ?? null, region: c?.region ?? "", site_web: c?.site_web ?? "",
    linkedin_url: c?.linkedin_url ?? "", statut: c?.statut ?? "a_qualifier",
  });
  const m = useMutation({
    mutationFn: async () => {
      const champs = { ...f, secteur: f.secteur || null, region: f.region || null, site_web: f.site_web || null, linkedin_url: f.linkedin_url || null };
      if (c) return mettreAJourCompte(c.id, champs);
      const nouveau = await creerCompte(champs);
      await rattacherCompte(contact, nouveau);
      return nouveau;
    },
    onSuccess: () => { toast.success(L.fiche.enregistre); apres(); },
  });
  const nombre = (v: string) => (v === "" ? null : Number(v));
  return (
    <Carte className="p-[22px]">
      <h2 className="mb-3 font-display text-lg font-semibold text-avisdoc-ink">{L.fiche.compte}</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Champ libelle={L.fiche.champCompteNom}><Saisie value={f.nom} maxLength={160} onChange={(e) => setF({ ...f, nom: e.target.value })} /></Champ>
        <Champ libelle={L.fiche.champType}>
          <Selection value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as TypeCompte })}>
            {Constants.prospection.Enums.type_compte.map((x) => <option key={x} value={x}>{L.typesCompte[x]}</option>)}
          </Selection>
        </Champ>
        <Champ libelle={L.fiche.champCercle}>
          <Selection value={f.cercle ?? ""} onChange={(e) => setF({ ...f, cercle: nombre(e.target.value) })}>
            {([0, 1, 2, 3] as const).map((x) => <option key={x} value={x === 0 ? "" : x}>{L.cercles[x]}</option>)}
          </Selection>
        </Champ>
        <Champ libelle={L.fiche.champStatutCompte}>
          <Selection value={f.statut} onChange={(e) => setF({ ...f, statut: e.target.value as ModificationCompte["statut"] })}>
            {Constants.prospection.Enums.statut_compte.map((x) => <option key={x} value={x}>{L.statutsCompte[x]}</option>)}
          </Selection>
        </Champ>
        <Champ libelle={L.fiche.champSecteur}><Saisie value={f.secteur ?? ""} maxLength={120} onChange={(e) => setF({ ...f, secteur: e.target.value })} /></Champ>
        <label className={cn(CIBLE, "flex items-center gap-2 self-end text-sm text-avisdoc-ink")}>
          <input type="checkbox" checked={!!f.expose} onChange={(e) => setF({ ...f, expose: e.target.checked })} className="size-5" />
          {L.fiche.champExpose}
        </label>
        <Champ libelle={L.fiche.champEffectifMin}><Saisie type="number" min={0} value={f.effectif_min ?? ""} onChange={(e) => setF({ ...f, effectif_min: nombre(e.target.value) })} /></Champ>
        <Champ libelle={L.fiche.champEffectifMax}><Saisie type="number" min={0} value={f.effectif_max ?? ""} onChange={(e) => setF({ ...f, effectif_max: nombre(e.target.value) })} /></Champ>
        <Champ libelle={L.fiche.champRegion}><Saisie value={f.region ?? ""} maxLength={80} onChange={(e) => setF({ ...f, region: e.target.value })} /></Champ>
        <Champ libelle={L.fiche.champSiteWeb}><Saisie value={f.site_web ?? ""} onChange={(e) => setF({ ...f, site_web: e.target.value })} /></Champ>
      </div>
      <Erreur erreur={m.error} className="mt-3" />
      <div className="mt-3">
        <Bouton libelle={c ? L.commun.enregistrer : L.fiche.creerCompte} onClick={() => m.mutate()} chargement={m.isPending}
          motifInactif={f.nom.trim() ? null : { texte: L.fiche.champCompteNom }} />
      </div>
    </Carte>
  );
}
