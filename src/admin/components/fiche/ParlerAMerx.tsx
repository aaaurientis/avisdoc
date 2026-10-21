// « Parler à Merx » depuis une fiche (Olivier, 21/10) : une erreur constatée, une fiche à
// améliorer — on en discute avec Merx, qui vérifie et PROPOSE des corrections, chacune avec
// sa source. Rien ne change sans le clic du commercial ; chaque correction appliquée laisse
// une note dans l'historique (qui, quoi, ancienne et nouvelle valeur, source).

import { useState } from "react";
import { Check, Loader2, Send, Sparkles, X } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { useAdminData } from "../../data/AdminDataContext";
import { Modal } from "../ui";
import { supabaseAdmin } from "../../data/supabaseAdmin";
import { ajouterEchange, type ClesFiche } from "../../lib/echanges";
import { discuterFiche, type CorrectionFiche } from "../../lib/merx-appels";
import { ADRESSE_GENERIQUE, ADRESSE_SERVICE } from "../../lib/fiche";
import type { Prospect } from "../../lib/merx";
import { cn } from "@/lib/utils";

type Personne = NonNullable<Prospect["personnes"]>[number];

const IDEES = [
  "Le numéro de téléphone est faux : vérifie-le.",
  "Trouve le responsable QSE ou prévention.",
  "Vérifie toutes les coordonnées de cette fiche.",
];

const LIBELLES: Record<CorrectionFiche["champ"], string> = {
  telephone: "Téléphone",
  email: "E-mail",
  site: "Site",
  interlocuteur: "Interlocuteur",
  retirer_interlocuteur: "Retirer l’interlocuteur",
};

const cleNom = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export default function ParlerAMerx({
  prospect,
  cles,
  onModifiee,
  onFermer,
}: {
  prospect: Prospect;
  /** Où ranger la note de chaque correction appliquée. */
  cles: ClesFiche;
  /** La fiche a changé : la relire. */
  onModifiee: () => Promise<void> | void;
  onFermer: () => void;
}) {
  const { user } = useAuth();
  const { rafraichir } = useAdminData();
  const par = user?.email ?? "";
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string; corrections?: CorrectionFiche[] }[]>([]);
  const [saisie, setSaisie] = useState("");
  const [attente, setAttente] = useState(false);
  const [application, setApplication] = useState<string | null>(null);
  const [faites, setFaites] = useState<Set<string>>(new Set());
  const [ignorees, setIgnorees] = useState<Set<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);

  const envoyer = async (texte: string) => {
    const t = texte.trim();
    if (!t || attente) return;
    const suite = [...messages, { role: "user" as const, content: t }];
    setMessages(suite);
    setSaisie("");
    setAttente(true);
    setErreur(null);
    try {
      const r = await discuterFiche(prospect.id, suite.map(({ role, content }) => ({ role, content })));
      setMessages([...suite, { role: "assistant", content: r.reponse || "Je n’ai rien trouvé de sûr.", corrections: r.corrections }]);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Merx n’a pas pu répondre. Réessayez.");
    } finally {
      setAttente(false);
    }
  };

  /** Applique une correction sur la fiche, et la note dans l'historique. */
  const appliquer = async (c: CorrectionFiche, id: string) => {
    if (application) return;
    setApplication(id);
    setErreur(null);
    try {
      const { data: actuelle, error: lecture } = await supabaseAdmin
        .from("admin_prospects")
        .select("contact_phone, contact_email, website, contact_name, personnes, site_contacts, dossier")
        .eq("id", prospect.id)
        .single();
      if (lecture) throw new Error(lecture.message);
      const a = actuelle as Pick<Prospect, "contact_phone" | "contact_email" | "website" | "contact_name" | "personnes" | "site_contacts" | "dossier">;
      const personnes = [...((a.personnes ?? []) as Personne[])];
      let patch: Record<string, unknown> = {};
      let avant = "";
      let apres = "";
      if (c.champ === "telephone" || c.champ === "email" || c.champ === "site") {
        const valeur = (c.valeur ?? "").trim();
        if (!valeur) throw new Error("La correction n’a pas de valeur.");
        const col = c.champ === "telephone" ? "contact_phone" : c.champ === "email" ? "contact_email" : "website";
        avant = String(a[col] ?? "vide");
        apres = valeur;
        patch = { [col]: valeur };
        // La personne qui portait l'ancien standard ou l'ancienne adresse les perd au profit
        // de la correction : sinon son ancienne valeur, vérifiée, repasserait devant.
        if (c.champ !== "site" && a[col]) {
          const ancien = String(a[col]);
          const meme = (x: string | null) =>
            c.champ === "telephone" ? (x ?? "").replace(/\D/g, "") === ancien.replace(/\D/g, "") && Boolean(x) : (x ?? "").toLowerCase() === ancien.toLowerCase();
          if (personnes.some((q) => (c.champ === "telephone" ? meme(q.telephone) || meme(q.mobile) : meme(q.email)))) {
            patch.personnes = personnes.map((q) =>
              c.champ === "telephone"
                ? { ...q, ...(meme(q.telephone) ? { telephone: valeur } : {}), ...(meme(q.mobile) ? { mobile: valeur } : {}) }
                : meme(q.email)
                  ? { ...q, email: valeur }
                  : q,
            );
          }
        }
        // Les coordonnées du site passent avant sur une fiche saisie : la correction s'y met en tête.
        const site = a.site_contacts;
        if (site && (c.champ === "telephone" || c.champ === "email")) {
          const liste = (c.champ === "telephone" ? site.phones : site.emails) ?? [];
          const norme = (x: string | null | undefined) => (c.champ === "telephone" ? (x ?? "").replace(/\D/g, "") : (x ?? "").toLowerCase().trim());
          // La valeur affichée et remplacée : le premier numéro du site sur une fiche saisie,
          // le contact de la fiche sinon. Seule elle s'en va ; les autres numéros restent.
          const remplacee = prospect.found_by ? a[col] : (liste[0] ?? a[col]);
          const reste = liste.filter((x) => norme(x) !== norme(valeur) && norme(x) !== norme(remplacee));
          const nouvelle = prospect.found_by && !liste.some((x) => norme(x) === norme(remplacee)) ? liste.filter((x) => norme(x) !== norme(valeur)) : [valeur, ...reste];
          patch.site_contacts = { ...site, [c.champ === "telephone" ? "phones" : "emails"]: nouvelle };
          if (!prospect.found_by && liste[0]) avant = liste[0];
        }
      } else {
        const nom = (c.nom ?? "").trim();
        if (!nom) throw new Error("La correction ne nomme personne.");
        const i = personnes.findIndex((q) => cleNom(q.nom) === cleNom(nom));
        if (c.champ === "retirer_interlocuteur") {
          const retiree = i >= 0 ? personnes[i] : null;
          if (i >= 0) personnes.splice(i, 1);
          avant = nom;
          apres = "retiré";
          // Le contact principal retiré emporte ses coordonnées personnelles (adresse
          // nominative, portable) ; le standard et une adresse générale restent ceux de l'entreprise.
          const principal = Boolean(a.contact_name && cleNom(a.contact_name) === cleNom(nom));
          const portable = /^(?:\+33\s?|0)[67]/.test((a.contact_phone ?? "").trim());
          // Son portable disparaît aussi des autres endroits où la fiche le range (numéros du
          // site, fiche d'appel du dossier), sans quoi il resterait affiché comme numéro.
          const chiffres = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "").replace(/^33/, "0");
          // Ses coordonnées personnelles : celles du contact principal, sinon celles de sa
          // ligne d'interlocuteur (portable, adresse nominative).
          const personnelle = (m: string | null | undefined) => Boolean(m && !ADRESSE_GENERIQUE.test(m) && !ADRESSE_SERVICE.test(m));
          const mobileDe = (t: string | null | undefined) => (/^(?:\+33\s?|0)[67]/.test((t ?? "").trim()) ? chiffres(t) : "");
          const sonPortable = principal && portable ? chiffres(a.contact_phone) : mobileDe(retiree?.mobile) || mobileDe(retiree?.telephone);
          const sonAdresse = principal && personnelle(a.contact_email) ? a.contact_email!.toLowerCase() : personnelle(retiree?.email) ? retiree!.email!.toLowerCase() : "";
          const site = a.site_contacts;
          const fa = a.dossier?.fiche_appel;
          patch = {
            personnes,
            ...(principal ? { contact_name: null, contact_role: null } : {}),
            ...(sonAdresse && (a.contact_email ?? "").toLowerCase() === sonAdresse ? { contact_email: null } : {}),
            ...(sonPortable && chiffres(a.contact_phone) === sonPortable ? { contact_phone: null } : {}),
            ...((sonPortable && site?.phones?.some((x) => chiffres(x) === sonPortable)) ||
            (sonAdresse && site?.emails?.some((x) => x.toLowerCase() === sonAdresse))
              ? {
                  site_contacts: {
                    ...site!,
                    phones: (site?.phones ?? []).filter((x) => !sonPortable || chiffres(x) !== sonPortable),
                    emails: (site?.emails ?? []).filter((x) => !sonAdresse || x.toLowerCase() !== sonAdresse),
                  },
                }
              : {}),
            ...(sonPortable && fa?.numero && chiffres(fa.numero).includes(sonPortable)
              ? { dossier: { ...a.dossier, fiche_appel: { ...fa, numero: "" } } }
              : {}),
          };
        } else {
          const ancienne = i >= 0 ? personnes[i] : null;
          const nouvelle: Personne = {
            nom,
            fonction: c.fonction?.trim() || ancienne?.fonction || null,
            email: c.email?.trim() || ancienne?.email || null,
            telephone: c.telephone?.trim() || ancienne?.telephone || null,
            // Un numéro corrigé remplace aussi l'ancien portable quand c'était lui qu'on affichait.
            mobile: c.telephone?.trim()
              ? /^(?:\+33\s?|0)[67]/.test(c.telephone.trim())
                ? c.telephone.trim()
                : ancienne?.telephone
                  ? (ancienne.mobile ?? null)
                  : null
              : (ancienne?.mobile ?? null),
            source: c.source || ancienne?.source || null,
            sur: true,
          };
          if (i >= 0) personnes[i] = nouvelle;
          else personnes.push(nouvelle);
          // Le contact principal de la fiche : sa fonction et son adresse suivent la correction
          // (le téléphone principal reste le standard de l'entreprise).
          const principal = Boolean(a.contact_name && cleNom(a.contact_name) === cleNom(nom));
          avant = ancienne ? [ancienne.nom, ancienne.fonction, ancienne.email, ancienne.telephone].filter(Boolean).join(", ") : "absent";
          apres = [nouvelle.nom, nouvelle.fonction, nouvelle.email, nouvelle.telephone].filter(Boolean).join(", ");
          patch = {
            personnes,
            ...(principal && c.fonction?.trim() ? { contact_role: c.fonction.trim() } : {}),
            ...(principal && c.email?.trim() ? { contact_email: c.email.trim() } : {}),
            // Le numéro du contact principal se lit dans contact_phone, qui sert aussi de
            // standard : il ne suit que s'il était vide ou un portable — un fixe reste le standard.
            ...(principal && c.telephone?.trim() && (!a.contact_phone?.trim() || /^(?:\+33\s?|0)[67]/.test(a.contact_phone.trim()))
              ? { contact_phone: c.telephone.trim() }
              : {}),
          };
        }
      }
      // Sur une affaire du Pipeline, les contacts saisis sur l'affaire passent devant ceux de
      // la fiche : la correction d'une personne les suit. Un contact saisi ne se retire pas
      // d'ici (il se retire avec « Modifier la fiche »).
      let contactSaisi: { id: string; name: string } | null = null;
      if (cles.clientId && (c.champ === "interlocuteur" || c.champ === "retirer_interlocuteur")) {
        const { data: lignes, error: lectureContacts } = await supabaseAdmin.from("admin_client_contacts").select("id, name, prenom, nom").eq("client_id", cles.clientId);
        if (lectureContacts) throw new Error(lectureContacts.message);
        const cible = cleNom(c.nom ?? "");
        contactSaisi =
          ((lignes ?? []) as { id: string; name: string | null; prenom: string | null; nom: string | null }[])
            .map((l) => ({ id: l.id, name: l.name || [l.prenom, l.nom].filter(Boolean).join(" ") }))
            .find((l) => cleNom(l.name) === cible) ?? null;
        if (contactSaisi && c.champ === "retirer_interlocuteur")
          throw new Error(`${contactSaisi.name} a été saisi sur l’affaire : retirez-le avec « Modifier la fiche ».`);
      }
      const { error } = await supabaseAdmin.from("admin_prospects").update(patch).eq("id", prospect.id);
      if (error) throw new Error(error.message);
      if (contactSaisi && c.champ === "interlocuteur") {
        const maj = {
          ...(c.fonction?.trim() ? { role: c.fonction.trim() } : {}),
          ...(c.email?.trim() ? { email: c.email.trim() } : {}),
          ...(c.telephone?.trim() ? { tel: c.telephone.trim() } : {}),
        };
        if (Object.keys(maj).length) {
          const { error: errContact } = await supabaseAdmin.from("admin_client_contacts").update(maj).eq("id", contactSaisi.id);
          if (errContact) throw new Error(errContact.message);
          await rafraichir();
        }
      }
      await ajouterEchange(cles, {
        kind: "note",
        titre: "Note",
        detail: `Fiche corrigée avec Merx — ${LIBELLES[c.champ]} : « ${avant} » → « ${apres} ». ${c.pourquoi} Source : ${c.source}`,
        au: new Date().toISOString(),
        par,
        prevu: false,
      });
      setFaites((s) => new Set(s).add(id));
      await onModifiee();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La correction n’a pas pu être appliquée.");
    } finally {
      setApplication(null);
    }
  };

  return (
    <Modal onClose={onFermer} width={680}>
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <h2 className="flex-1 font-display text-xl font-semibold text-avisdoc-ink">
          <Sparkles className="mr-1.5 inline size-5 text-avisdoc-teal" />
          Parler à Merx — {prospect.name}
        </h2>
        <button type="button" onClick={onFermer} aria-label="Fermer" className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink">
          <X className="size-5" />
        </button>
      </div>

      <div className="mt-4 max-h-[52vh] space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="text-[13px] text-muted-foreground">
            <p>Une information fausse, une fiche à compléter ? Dites-le à Merx : il vérifie, puis vous propose des corrections. Rien ne change sans votre clic.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {IDEES.map((t) => (
                <button key={t} type="button" onClick={() => void envoyer(t)} className="rounded-full border border-border px-3 py-1 text-[12.5px] font-semibold text-avisdoc-ink hover:border-avisdoc-teal">
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={cn(
                "max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed",
                m.role === "user" ? "bg-avisdoc-teal text-white" : "bg-muted/60 text-avisdoc-ink",
              )}
            >
              {m.content}
            </div>
            {m.corrections?.map((c, j) => {
              const id = `${i}-${j}`;
              if (ignorees.has(id)) return null;
              const fait = faites.has(id);
              return (
                <div key={id} className="mt-2 rounded-xl border border-border p-3 text-[13px]">
                  <div className="font-semibold text-avisdoc-ink">
                    {LIBELLES[c.champ]} :{" "}
                    {c.champ === "interlocuteur" || c.champ === "retirer_interlocuteur"
                      ? [c.nom, c.fonction, c.email, c.telephone].filter(Boolean).join(" · ")
                      : c.valeur}
                  </div>
                  <div className="mt-0.5 text-muted-foreground">{c.pourquoi}</div>
                  <div className="mt-0.5 break-all text-[12px] text-muted-foreground">Source : {c.source}</div>
                  <div className="mt-2 flex gap-2">
                    {fait ? (
                      <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-emerald-700">
                        <Check className="size-4" /> Appliqué — noté dans l’historique
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => void appliquer(c, id)}
                          disabled={application !== null}
                          className="inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-3.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-60"
                        >
                          {application === id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Appliquer
                        </button>
                        <button
                          type="button"
                          onClick={() => setIgnorees((s) => new Set(s).add(id))}
                          className="rounded-full border border-border px-3.5 py-1.5 text-[12.5px] font-bold text-muted-foreground"
                        >
                          Ignorer
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {attente && (
          <div className="inline-flex items-center gap-2 rounded-2xl bg-muted/60 px-3.5 py-2.5 text-[13px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Merx vérifie… (jusqu’à une minute s’il cherche sur le web)
          </div>
        )}
      </div>

      {erreur && <p className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{erreur}</p>}

      <form
        className="mt-4 flex gap-2 border-t border-border pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void envoyer(saisie);
        }}
      >
        <input
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder="Le numéro est faux, le bon est le 03 85 43 07 51…"
          className="ad-input w-full min-w-0 rounded-full border border-border bg-background px-4 py-2.5 text-[13px] outline-none focus:border-avisdoc-teal"
          aria-label="Votre message à Merx"
        />
        <button
          type="submit"
          disabled={attente || !saisie.trim()}
          className="ad-btn-accent inline-flex shrink-0 items-center gap-1.5 rounded-full bg-avisdoc-teal px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60"
        >
          {attente ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Envoyer
        </button>
      </form>
    </Modal>
  );
}
