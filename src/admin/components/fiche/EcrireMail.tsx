// La fenêtre « Mail » d'une fiche (Olivier, 21/10) : écrire, envoyer, noter — en une fois.
//
//  1. Écrire : Merx l'écrit (on lui dit en une phrase ce qu'on veut dire), ou on écrit
//     soi-même. Dans les deux cas, l'objet et le message se corrigent directement.
//  2. Envoyer : depuis SA boîte — Gmail s'ouvre en rédaction, déjà rempli (le lien
//     « mailto » cherchait un logiciel de messagerie installé, que Stéphane n'a pas).
//     Le Hub n'envoie rien lui-même.
//  3. Noter : « Mail envoyé » range le mail, objet et texte, dans l'historique, et
//     propose une relance en un clic.
// Programmer pour plus tard, ou noter un mail déjà envoyé hors du Hub, restent possibles
// en bas, sans doublon « À programmer » / « Programmer ».

import { useState } from "react";
import { Check, ClipboardPaste, Clock, Copy, Loader2, Mail, PenLine, Sparkles, X } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { Modal } from "../ui";
import { ajouterEchange, marquerTraitee, type ClesFiche, type Echange } from "../../lib/echanges";
import { colonneDEntree, etapeProposee, instant, jourISO } from "../../lib/actions-fiche";
import type { EtapeFiche } from "./CompteRendu";
import type { BrouillonRendu } from "../../lib/merx-appels";
import { cn } from "@/lib/utils";

/** Un interlocuteur à qui écrire : son adresse, quand on la connaît. */
export interface ContactMail {
  nom: string;
  fonction?: string | null;
  email: string | null;
  /** Adresse composée au format maison, jamais vue publiée : à confirmer. */
  deduite?: boolean;
}

type Messagerie = "gmail" | "outlook" | "autre";
const CLE_MESSAGERIE = "avisdoc.messagerie";

const lirePreference = (): Messagerie => {
  try {
    const v = localStorage.getItem(CLE_MESSAGERIE);
    return v === "outlook" || v === "autre" ? v : "gmail";
  } catch {
    return "gmail";
  }
};

const champ =
  "ad-input w-full min-w-0 rounded-xl border border-border bg-background px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";
const etapeCls = "mb-1.5 mt-5 text-[12px] font-bold uppercase tracking-wide text-muted-foreground";
const bouton =
  "inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[13px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal disabled:opacity-60";

const dansJours = (n: number) => jourISO(new Date(Date.now() + n * 86_400_000));

export default function EcrireMail({
  cles,
  contacts,
  etape,
  entrer,
  avancer,
  depuisPrevue,
  intitule,
  rediger,
  onFermer,
  onEnregistre,
}: {
  cles: ClesFiche;
  /** Les interlocuteurs de la fiche, le principal d'abord. */
  contacts: ContactMail[];
  etape: EtapeFiche | null;
  /** Prospect hors Pipeline : le mail envoyé l'y fait entrer (comme toute action). */
  entrer?: (colonne: string) => Promise<ClesFiche>;
  /** Affaire déjà au Pipeline : la passe à cette colonne (« Contacté » après un mail). */
  avancer?: (colonne: string) => Promise<void>;
  /** Le mail programmé qu'on écrit maintenant : il se clôt à l'envoi. */
  depuisPrevue?: Echange | null;
  /** Une proposition choisie sur la fiche (« Relancer pour la saison ») : ce qu'on veut dire. */
  intitule?: string;
  /** Merx rédige ; reçoit ce qu'on veut dire et à qui. */
  rediger?: (intention: string, a: ContactMail | null) => Promise<BrouillonRendu>;
  onFermer: () => void;
  onEnregistre: () => void;
}) {
  const { user } = useAuth();
  const par = user?.email ?? "";
  // Un mail programmé rouvert : un brouillon gardé (« À : … », « Objet : … » puis le texte)
  // revient tel quel, adresse comprise ; sinon, son détail est ce qu'on voulait dire.
  const garde = /^À : (.*?)(?:\n([\s\S]*))?$/.exec(depuisPrevue?.detail ?? "");
  const reste = garde ? (garde[2] ?? "") : (depuisPrevue?.detail ?? "");
  const brouillon = /^Objet : (.*?)(?:\n\n([\s\S]*))?$/.exec(reste);
  const premier = contacts.find((c) => c.nom === depuisPrevue?.avec) ?? contacts.find((c) => c.email) ?? contacts[0] ?? null;
  const [nom, setNom] = useState(premier?.nom ?? "");
  const [adresse, setAdresse] = useState(garde?.[1] ?? premier?.email ?? "");
  const [facon, setFacon] = useState<"merx" | "moi">(rediger ? "merx" : "moi");
  const [intention, setIntention] = useState(brouillon ? "" : depuisPrevue ? reste : (intitule ?? ""));
  const [objet, setObjet] = useState(brouillon?.[1] ?? "");
  const [corps, setCorps] = useState(brouillon?.[2] ?? "");
  const [messagerie, setMessagerie] = useState<Messagerie>(lirePreference);
  const [ouvert, setOuvert] = useState(false);
  const [relance, setRelance] = useState<number | null>(7);
  const [plusTard, setPlusTard] = useState(false);
  const [le, setLe] = useState(dansJours(1));
  const [aHeure, setAHeure] = useState("10:00");
  const [horsHub, setHorsHub] = useState(false);
  const [colle, setColle] = useState("");
  const [envoyeLe, setEnvoyeLe] = useState(jourISO(new Date()));
  const [ecriture, setEcriture] = useState(false);
  const [envoi, setEnvoi] = useState<null | "envoye" | "programme">(null);
  const [copie, setCopie] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Affaire au Pipeline : un mail envoyé propose de la passer en « Contacté », comme avant.
  const aProposer = etape?.actuelle ? etapeProposee("email", null, null, etape.actuelle, etape.colonnes) : null;
  const [etapeOk, setEtapeOk] = useState(true);

  const choisir = (c: ContactMail) => {
    // Pendant que Merx écrit pour une personne, on ne change pas de destinataire.
    if (ecriture) return;
    setNom(c.nom);
    setAdresse(c.email ?? "");
  };

  const ecrireAvecMerx = async () => {
    if (!rediger || ecriture) return;
    if (!intention.trim()) return setErreur("Dites en une phrase ce que vous voulez écrire.");
    setEcriture(true);
    setErreur(null);
    try {
      const contact = contacts.find((c) => c.nom === nom) ?? (nom ? { nom, email: adresse || null } : null);
      const r = await rediger(intention.trim(), contact);
      setObjet(r.objet);
      setCorps(r.corps);
      // L'adresse rendue par Merx est celle du contact principal : on ne la prend que si
      // personne n'a été choisi, jamais à la place de la personne choisie.
      if (!adresse && !nom && r.destinataire) setAdresse(r.destinataire);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Merx n’a pas pu écrire le mail. Réessayez.");
    } finally {
      setEcriture(false);
    }
  };

  const garderMessagerie = (m: Messagerie) => {
    setMessagerie(m);
    try {
      localStorage.setItem(CLE_MESSAGERIE, m);
    } catch {
      /* préférence non retenue : sans gravité */
    }
  };

  const ouvrir = (m: Messagerie) => {
    if (!corps.trim() && !objet.trim()) return setErreur("Écrivez d’abord le mail (ou demandez-le à Merx).");
    setErreur(null);
    garderMessagerie(m);
    const e = encodeURIComponent;
    if (m === "gmail") {
      // authuser : la bonne boîte s'ouvre même quand plusieurs comptes Google sont connectés.
      window.open(
        `https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=${e(adresse)}&su=${e(objet)}&body=${e(corps)}${par ? `&authuser=${e(par)}` : ""}`,
        "_blank",
        "noopener",
      );
    } else if (m === "outlook") {
      window.open(`https://outlook.office.com/mail/deeplink/compose?to=${e(adresse)}&subject=${e(objet)}&body=${e(corps)}`, "_blank", "noopener");
    } else {
      window.location.href = `mailto:${adresse}?subject=${e(objet)}&body=${e(corps)}`;
    }
    setOuvert(true);
  };

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(`${objet}\n\n${corps}`);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
      setOuvert(true);
    } catch {
      setErreur("La copie a été refusée par le navigateur : sélectionnez le texte à la main.");
    }
  };

  // Hors Pipeline, une action sur le prospect l'y fait entrer — comme dans la fenêtre d'action.
  const entree = Boolean(entrer) && !etape?.actuelle;
  const clesDeLAction = async (fait: boolean) => (entree && entrer ? entrer(etape ? colonneDEntree(fait, etape.colonnes) : "Contacté") : cles);

  /** « Mail envoyé » : il entre dans l'historique, texte compris ; la relance se programme. */
  const noterEnvoye = async () => {
    if (envoi) return;
    const texte = horsHub ? colle.trim() : [objet.trim() && `Objet : ${objet.trim()}`, corps.trim()].filter(Boolean).join("\n\n");
    if (!texte) return setErreur(horsHub ? "Collez le mail que vous avez envoyé." : "Le mail est vide.");
    if (horsHub && (!envoyeLe || envoyeLe > jourISO(new Date()))) return setErreur("Choisissez le jour où le mail est parti (aujourd’hui ou avant).");
    setEnvoi("envoye");
    setErreur(null);
    try {
      const c = await clesDeLAction(true);
      await ajouterEchange(c, {
        kind: "email",
        titre: (!horsHub && objet.trim()) || "E-mail envoyé",
        detail: texte,
        // Hors du Hub, le mail est daté du jour où il est vraiment parti.
        au: horsHub && envoyeLe !== jourISO(new Date()) ? instant(envoyeLe, "12:00") : new Date().toISOString(),
        par,
        prevu: false,
        avec: nom || null,
      });
      if (depuisPrevue) await marquerTraitee(depuisPrevue.id);
      if (!entree && aProposer && etapeOk && avancer) await avancer(aProposer);
      if (relance) {
        await ajouterEchange(c, {
          kind: "email",
          titre: "Relance prévue",
          // L'adresse choisie suit la relance (« À : … », comme un mail programmé).
          detail: `${adresse.trim() ? `À : ${adresse.trim()}\n` : ""}${objet.trim() ? `Relance de « ${objet.trim()} »` : ""}`,
          au: instant(dansJours(relance), "10:00"),
          par,
          prevu: true,
          avec: nom || null,
        });
      }
      onEnregistre();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L’enregistrement a échoué.");
      setEnvoi(null);
    }
  };

  /** « Pas maintenant » : le mail est programmé, brouillon compris, avec son rappel. */
  const programmer = async () => {
    if (envoi) return;
    if (!le || !aHeure) return setErreur("Choisissez le jour et l’heure.");
    if (le < jourISO(new Date())) return setErreur("Choisissez aujourd’hui ou plus tard.");
    setEnvoi("programme");
    setErreur(null);
    try {
      const c = await clesDeLAction(false);
      await ajouterEchange(c, {
        kind: "email",
        // Le brouillon se garde sous la forme « Objet : … » puis le texte, pour revenir à
        // l'identique ; sans brouillon, on garde ce qu'on voulait dire.
        titre: objet.trim() || "E-mail prévu",
        // L'adresse choisie se garde toujours (« À : … » en tête), brouillon écrit ou non.
        detail: `${adresse.trim() ? `À : ${adresse.trim()}\n` : ""}${corps.trim() || objet.trim() ? `Objet : ${objet.trim()}\n\n${corps.trim()}` : intention.trim()}`,
        au: instant(le, aHeure),
        par,
        prevu: true,
        avec: nom || null,
      });
      if (depuisPrevue) await marquerTraitee(depuisPrevue.id);
      onEnregistre();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L’enregistrement a échoué.");
      setEnvoi(null);
    }
  };

  const BoutonMessagerie = ({ m, libelle }: { m: Messagerie; libelle: string }) => (
    <button
      type="button"
      onClick={() => ouvrir(m)}
      className={
        m === messagerie
          ? "ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-4 py-2 text-[13px] font-bold text-white"
          : bouton
      }
    >
      {m === messagerie && <Mail className="size-4" />} {libelle}
    </button>
  );

  return (
    <Modal onClose={onFermer} width={720}>
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <h2 className="flex-1 font-display text-xl font-semibold text-avisdoc-ink">{depuisPrevue ? "Le mail prévu" : "Mail"}</h2>
        <button type="button" onClick={onFermer} aria-label="Fermer" className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink">
          <X className="size-5" />
        </button>
      </div>

      {/* À qui */}
      <div className={etapeCls}>À qui</div>
      {contacts.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {contacts.map((c) => (
            <button
              key={c.nom}
              type="button"
              onClick={() => choisir(c)}
              disabled={ecriture}
              className={cn(
                "rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors",
                c.nom === nom ? "border-avisdoc-teal bg-avisdoc-teal/10 text-avisdoc-teal" : "border-border text-avisdoc-ink hover:border-avisdoc-teal",
              )}
            >
              {c.nom}
              {!c.email && <span className="ml-1 font-normal text-muted-foreground">(sans adresse)</span>}
              {c.email && c.deduite && <span className="ml-1 font-normal text-amber-700">(adresse déduite)</span>}
            </button>
          ))}
        </div>
      )}
      <input value={adresse} onChange={(e) => setAdresse(e.target.value)} disabled={ecriture} placeholder="adresse@entreprise.fr" className={champ} aria-label="Adresse du destinataire" />
      {contacts.some((c) => c.deduite && c.email === adresse) && (
        <p className="mt-1 text-[12px] text-amber-700">Adresse déduite du format maison de l’entreprise, jamais vue publiée : à confirmer avant d’envoyer.</p>
      )}

      {/* 1. Écrire */}
      <div className={etapeCls}>1 · Écrire</div>
      {!horsHub && (
        <>
          {rediger && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFacon("merx")}
                className={cn("rounded-xl border px-3.5 py-2.5 text-left text-[13px] font-semibold", facon === "merx" ? "border-2 border-avisdoc-teal" : "border-border")}
              >
                <Sparkles className="mr-1 inline size-4 text-avisdoc-teal" /> Merx l’écrit pour moi
              </button>
              <button
                type="button"
                onClick={() => setFacon("moi")}
                className={cn("rounded-xl border px-3.5 py-2.5 text-left text-[13px] font-semibold", facon === "moi" ? "border-2 border-avisdoc-teal" : "border-border")}
              >
                <PenLine className="mr-1 inline size-4 text-avisdoc-teal" /> J’écris moi-même
              </button>
            </div>
          )}
          {facon === "merx" && rediger && (
            <div className="mt-2 flex gap-2">
              <input
                value={intention}
                onChange={(e) => setIntention(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void ecrireAvecMerx()}
                placeholder="Que voulez-vous dire ? Remercier pour la présentation et proposer deux dates…"
                className={champ}
                aria-label="Ce que vous voulez dire"
              />
              <button
                type="button"
                onClick={() => void ecrireAvecMerx()}
                disabled={ecriture}
                className="ad-btn-accent inline-flex shrink-0 items-center gap-1.5 rounded-full bg-avisdoc-teal px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60"
              >
                {ecriture ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {ecriture ? "Merx écrit…" : objet || corps ? "Réécrire" : "Rédiger"}
              </button>
            </div>
          )}
          <input value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="Objet" className={cn(champ, "mt-2")} aria-label="Objet" />
          <textarea
            value={corps}
            onChange={(e) => setCorps(e.target.value)}
            rows={10}
            placeholder={facon === "merx" ? "Le mail de Merx s’affichera ici : vous le corrigez directement." : "Votre message…"}
            className={cn(champ, "mt-2 resize-y leading-relaxed")}
            aria-label="Message"
          />

          {/* 2. Envoyer */}
          <div className={etapeCls}>2 · Envoyer depuis votre boîte</div>
          <div className="flex flex-wrap gap-2">
            <BoutonMessagerie m="gmail" libelle="Ouvrir dans Gmail" />
            <BoutonMessagerie m="outlook" libelle="Outlook" />
            <BoutonMessagerie m="autre" libelle="Autre messagerie" />
            <button type="button" onClick={() => void copier()} className={bouton}>
              {copie ? <Check className="size-4" /> : <Copy className="size-4" />} {copie ? "Copié" : "Copier"}
            </button>
          </div>
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">Le Hub n’envoie rien : le mail part quand vous cliquez « Envoyer » dans votre messagerie.</p>
        </>
      )}

      {horsHub && (
        <label className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-avisdoc-ink">
          Envoyé le
          <input
            type="date"
            value={envoyeLe}
            max={jourISO(new Date())}
            onChange={(e) => setEnvoyeLe(e.target.value)}
            className="ad-input h-9 rounded-xl border border-border bg-background px-2.5 text-[13px]"
          />
        </label>
      )}
      {horsHub && (
        <textarea
          value={colle}
          onChange={(e) => setColle(e.target.value)}
          rows={8}
          placeholder="Collez ici le mail que vous avez envoyé (objet et texte)."
          className={champ}
          aria-label="Le mail envoyé"
        />
      )}

      {/* 3. Noter — seulement une fois le mail parti (ou collé). */}
      {(ouvert || horsHub) && (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-[13.5px] font-semibold text-emerald-800">
            <Check className="mr-1 inline size-4" /> {horsHub ? "Le noter dans l’historique" : "Vous l’avez envoyé ?"}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void noterEnvoye()}
              disabled={Boolean(envoi)}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60"
            >
              {envoi === "envoye" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Mail envoyé
            </button>
            <span className="text-[12.5px] text-emerald-800">Relancer dans</span>
            {[3, 7, 15].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRelance(n)}
                className={cn("rounded-full border px-2.5 py-1 text-[12px] font-semibold text-emerald-800", relance === n ? "border-2 border-emerald-600" : "border-emerald-300")}
              >
                {n} j
              </button>
            ))}
            <button
              type="button"
              onClick={() => setRelance(null)}
              className={cn("rounded-full border px-2.5 py-1 text-[12px] font-semibold text-emerald-800", relance === null ? "border-2 border-emerald-600" : "border-emerald-300")}
            >
              non
            </button>
          </div>
          {aProposer && avancer && (
            <label className="mt-2 flex items-center gap-2 text-[12.5px] font-semibold text-emerald-800">
              <input type="checkbox" checked={etapeOk} onChange={(e) => setEtapeOk(e.target.checked)} className="size-4 accent-emerald-600" />
              Passer l’affaire en « {aProposer} »
            </label>
          )}
          <p className="mt-2 text-[11.5px] text-emerald-800/80">Le mail entre dans l’historique de la fiche, texte compris.</p>
        </div>
      )}

      {plusTard && (
        <div className="mt-4 rounded-2xl border border-border p-4">
          <p className="text-[13px] font-semibold text-avisdoc-ink">Me le rappeler le</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input type="date" value={le} min={jourISO(new Date())} onChange={(e) => setLe(e.target.value)} className="ad-input h-9 rounded-xl border border-border bg-background px-2.5 text-[13px]" aria-label="Jour" />
            <input type="time" value={aHeure} onChange={(e) => setAHeure(e.target.value)} className="ad-input h-9 rounded-xl border border-border bg-background px-2.5 text-[13px]" aria-label="Heure" />
            <button type="button" onClick={() => void programmer()} disabled={Boolean(envoi)} className={bouton}>
              {envoi === "programme" ? <Loader2 className="size-4 animate-spin" /> : <Clock className="size-4" />} Programmer
            </button>
          </div>
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">Il ira au Planning, brouillon compris, avec un rappel par mail.</p>
        </div>
      )}

      {erreur && <p className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{erreur}</p>}

      <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-border pt-3 text-[12.5px]">
        {!plusTard && !horsHub ? (
          <button type="button" onClick={() => setPlusTard(true)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-avisdoc-ink">
            <Clock className="size-3.5" /> Pas maintenant : me le rappeler le…
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => {
            setHorsHub(!horsHub);
            setPlusTard(false);
            setErreur(null);
          }}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-avisdoc-ink"
        >
          <ClipboardPaste className="size-3.5" /> {horsHub ? "Revenir à l’écriture" : "Déjà envoyé hors du Hub : coller le mail"}
        </button>
      </div>
    </Modal>
  );
}
