// La colonne de gauche d'une fiche, reprise du hub Onetip (12/10) : le nom, la
// notation, la place dans le Pipeline, qui la suit, les interlocuteurs, puis
// l'établissement. Les cases vides restent connues mais repliées.

import { useState, type ReactNode } from "react";
import { Notation, TitreColonne } from "../FicheEntreprise";
import { personnesDuProspect, type NotesFiche } from "../../lib/fiche";
import type { Prospect } from "../../lib/merx";
import { effectifLabel } from "../../lib/merx";
import PastilleApprofondie from "../PastilleApprofondie";

export interface LigneEtablissement {
  label: string;
  valeur: ReactNode;
}

/** « 4,7 Md € », « 167 M € », « 850 k € ». */
const euros = (n: number): string =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1).replace(".", ",")} Md €` : n >= 1e6 ? `${Math.round(n / 1e6)} M €` : n >= 1e3 ? `${Math.round(n / 1e3)} k €` : `${n} €`;

/** L'essentiel de l'établissement, tiré de la fiche de prospection. Le détail complet est dans Dossier. */
export function etablissementDe(p: Prospect | null): { lignes: LigneEtablissement[]; manquants: string[] } {
  if (!p) return { lignes: [], manquants: [] };
  const f = p.registre?.finances;
  const annee = f ? Object.keys(f).sort().at(-1) : undefined;
  const ca = annee ? f?.[annee]?.ca : undefined;
  const effectif = effectifLabel(p.headcount_band);
  const lien = (href: string, texte: string) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-avisdoc-teal underline-offset-2 hover:underline">
      {texte}
    </a>
  );
  // Le standard : saisi à la main, il est rangé avec les numéros du site ; trouvé par
  // Merx, c'est le contact de la fiche.
  // À défaut, le numéro que l'approfondissement a mis dans la fiche d'appel du dossier
  // (« Appeler : 05 57 … ») : il doit se voir ici, pas seulement dans le Dossier (20/10).
  const duDossier = (p.dossier?.fiche_appel?.numero ?? "").match(/(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/)?.[0] ?? null;
  const telephone = (p.found_by ? (p.contact_phone ?? p.site_contacts?.phones?.[0]) : (p.site_contacts?.phones?.[0] ?? p.contact_phone)) ?? duDossier;
  // Un 06/07 est le portable de quelqu'un : on dit « Mobile » et à qui il est (Olivier,
  // 20/10), d'après les interlocuteurs ou le contact de la fiche qui portent ce numéro.
  const num = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "").replace(/^33/, "0");
  const estMobile = !!telephone && /^0[67]/.test(num(telephone));
  const titulaire = (() => {
    if (!telephone) return null;
    const qui = (p.personnes ?? []).find((x) => num(x.telephone) === num(telephone) || num(x.mobile) === num(telephone));
    if (qui) return [qui.nom, qui.fonction?.split(/[,(]/)[0].trim()].filter(Boolean).join(", ");
    if (p.contact_name && num(p.contact_phone) === num(telephone)) return [p.contact_name, p.contact_role].filter(Boolean).join(", ");
    return null;
  })();
  const email = p.found_by ? (p.contact_email ?? p.site_contacts?.emails?.[0]) : (p.site_contacts?.emails?.[0] ?? p.contact_email);
  const chef = p.leaders?.[0];
  const candidates: { label: string; valeur: ReactNode | null | undefined }[] = [
    { label: "Dirigeant", valeur: chef ? [chef.name, chef.role].filter(Boolean).join(" — ") : null },
    { label: "Adresse", valeur: p.head_office?.address ?? null },
    { label: "Activité", valeur: p.activity },
    { label: "Effectif", valeur: effectif },
    { label: "Établissements", valeur: p.open_establishments ?? null },
    { label: typeof ca === "number" ? `Chiffre d’affaires ${annee}` : "Chiffre d’affaires", valeur: typeof ca === "number" ? euros(ca) : null },
    { label: "Site", valeur: p.website ? lien(p.website, p.website.replace(/^https?:\/\//, "").replace(/\/$/, "")) : null },
    {
      label: estMobile ? "Mobile" : "Téléphone",
      valeur: telephone ? (
        <>
          <a href={`tel:${telephone.replace(/\s/g, "")}`} className="text-avisdoc-teal">{telephone}</a>
          {titulaire && <span className="text-muted-foreground"> — {titulaire}</span>}
        </>
      ) : null,
    },
    { label: "E-mail", valeur: email ? <a href={`mailto:${email}`} className="break-all text-avisdoc-teal">{email}</a> : null },
  ];
  const vide = (v: ReactNode | null | undefined) => v === null || v === undefined || v === "";
  return {
    lignes: candidates.filter((c) => !vide(c.valeur)).map((c) => ({ label: c.label, valeur: c.valeur })),
    manquants: [
      ...candidates.filter((c) => vide(c.valeur)).map((c) => c.label),
      ...(p.contact_name || p.personnes?.length ? [] : ["Interlocuteur"]),
      ...(p.siren ? [] : ["SIREN"]),
    ],
  };
}

const TEL = /(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/g;
const MEL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
/** Rien avant la coordonnée que de la ponctuation ou « e-mail » : elle suit la précédente. */
const debutPhrase = (avant: string) => !/^[\s,;:–—-]*(?:et\s+)?(?:e-mail|mail|tél\.?|ou)?\s*:?\s*$/i.test(avant);
/** « prenom.nom@… », « p.nom@… » : un modèle d'adresse, pas l'adresse de quelqu'un. */
const MODELE = /^(?:prenom|nom|p|n|initiale|x+)(?:[._-](?:prenom|nom|p|n|initiale))*$/i;
/** « ludovic.lamotte@… » → « Ludovic Lamotte » : le nom que porte une adresse nominative. */
const nomDeLAdresse = (m: string): string | null => {
  const local = m.split("@")[0];
  const maj = (x: string) => x.replace(/(^|-)(\p{L})/gu, (_, s, c) => s + c.toUpperCase());
  // « s.chevalier@… » → « S. Chevalier »
  if (/^[a-zà-ÿ]\.[a-zà-ÿ-]{2,}$/i.test(local) && !MODELE.test(local)) return `${local[0].toUpperCase()}. ${maj(local.slice(2))}`;
  if (!/^[a-zà-ÿ-]{2,}\.[a-zà-ÿ-]{2,}$/i.test(local)) return null;
  return local.split(".").map(maj).join(" ");
};
const sansAccent = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const chiffres = (t: string) => t.replace(/\D/g, "").replace(/^33/, "0");

export interface AutreContact {
  /** Qui : « Gérard Canuel — maire — Château Adaugusta », ou la phrase du dossier. */
  qui: string;
  telephones: string[];
  emails: string[];
}

/**
 * Tous les contacts utiles que l'approfondissement a trouvés hors des interlocuteurs de
 * l'entreprise : voisins, mairie, syndicat… (Olivier, 20/10 : « toutes les informations
 * qui permettent de contacter… dans la colonne de gauche »). On relève chaque numéro et
 * chaque adresse cités dans le texte du dossier — Merx les y écrit sous la forme
 * « Contact utile : Nom (rôle / structure) au 05…, e-mail … » —, avec le nom qui les précède.
 * (Pas de case à part dans la réponse de Merx : elle rendait son schéma trop gros pour
 * l'API, 20/10.)
 */
export function autresContactsDe(p: Prospect | null): AutreContact[] {
  const d = p?.dossier;
  if (!p || !d) return [];
  // Ce qui est déjà ailleurs dans la colonne (le standard de l'établissement, les
  // interlocuteurs) ne se répète pas ; tout le reste du site et du dossier s'affiche.
  const pers = personnesDuProspect(p);
  const standard = p.found_by ? (p.contact_phone ?? p.site_contacts?.phones?.[0]) : (p.site_contacts?.phones?.[0] ?? p.contact_phone);
  const melStandard = p.found_by ? (p.contact_email ?? p.site_contacts?.emails?.[0]) : (p.site_contacts?.emails?.[0] ?? p.contact_email);
  const connus = new Set(
    [standard, p.dossier?.fiche_appel?.numero, ...pers.map((x) => x.telephone)]
      .flatMap((t) => (typeof t === "string" ? t : "").match(TEL) ?? [])
      .map(chiffres),
  );
  const melsConnus = new Set(
    [melStandard, ...pers.flatMap((x) => [x.email, x.emailDeduit])].filter((m): m is string => typeof m === "string").map((m) => m.toLowerCase()),
  );
  const textes = [
    ...(d.a_retenir ?? []),
    d.qui_aborder,
    d.accroche,
    d.fiche_appel?.qui_demander,
    d.fiche_appel?.format_email,
    d.fiche_appel?.si_on_insiste,
    ...(d.arguments ?? []).flatMap((a) => [a.argument, a.parce_que]),
    ...(d.objections ?? []).map((o) => o.reponse),
    d.offre,
    ...(d.a_verifier ?? []),
  ].filter((t): t is string => typeof t === "string" && !!t);
  // Un contact par numéro ou adresse : le nom est ce qui le précède dans la phrase
  // (« …, Robin Lafugie au 05 57 24 93 38 »), une précision entre parenthèses juste
  // après lui revient (« … au 05 47 84 06 76 (M. Gérard Canuel, maire…) »).
  const vus = new Set<string>();
  const out: AutreContact[] = [];
  const COORD = new RegExp(`${TEL.source}|${MEL.source}`, "g");
  // 1. Les personnes que le site présente (« Responsable commercial Vincent Viti Pôle
  //    Services v.viti@… Contacter ») : nom, fonction, portable et adresse.
  for (const extrait of p.site_contacts?.equipe ?? []) {
    if (typeof extrait !== "string") continue;
    for (const bloc of extrait.replace(/&#0?38;/g, "&").split(/\bContacter\b/)) {
      for (const m of bloc.matchAll(MEL)) {
        const mel = m[0];
        const cle = mel.toLowerCase();
        const local = sansAccent(cle.split("@")[0]);
        if (vus.has(cle) || melsConnus.has(cle) || MODELE.test(local)) continue;
        const avant = bloc.slice(0, m.index);
        const mots = avant.trim().split(/\s+/).filter(Boolean);
        const [ini, fam] = local.includes(".") ? local.split(".") : ["", local];
        let trouve: { i: number; n: number } | null = null;
        for (let i = 0; i < mots.length && !trouve; i++) {
          for (let n = 2; n <= 4 && i + n <= mots.length; n++) {
            const w = mots.slice(i, i + n);
            if (!w.every((x) => /^\p{Lu}/u.test(x))) break;
            const prenom = sansAccent(w[0]);
            if (ini && !(ini.length === 1 ? prenom[0] === ini : prenom === ini)) continue;
            if (sansAccent(w.slice(1).join("")).replace(/[^a-z]/g, "") === fam.replace(/[^a-z]/g, "")) {
              trouve = { i, n };
              break;
            }
          }
        }
        const sansDebris = (w: string[]) => w.slice(w.findIndex((x) => /^\p{Lu}/u.test(x)) >= 0 ? w.findIndex((x) => /^\p{Lu}/u.test(x)) : w.length);
        const telephones = (trouve ? mots.slice(trouve.i + trouve.n).join(" ") : avant).match(TEL)?.filter((t) => !connus.has(chiffres(t)) && !vus.has(chiffres(t))) ?? [];
        let qui: string;
        if (trouve) {
          const role = sansDebris(mots.slice(0, trouve.i)).join(" ");
          const service = mots.slice(trouve.i + trouve.n).join(" ").replace(TEL, "").replace(/\s+/g, " ").trim();
          qui = [mots.slice(trouve.i, trouve.i + trouve.n).join(" "), [role, service].filter(Boolean).join(", ")].filter(Boolean).join(" — ");
        } else {
          const t = sansDebris(mots).join(" ").replace(TEL, "").replace(/\s+/g, " ").trim();
          qui = (t.length > 120 ? `…${t.slice(-117)}` : t) || nomDeLAdresse(mel) || "Relevé sur le site";
        }
        vus.add(cle);
        telephones.forEach((t) => vus.add(chiffres(t)));
        out.push({ qui, telephones, emails: [mel] });
      }
    }
  }
  // 2. Ce que le dossier cite.
  for (const texte of textes) {
    for (const phrase of texte.split(/(?<!\b(?:M|Mme|Mlle|Mr|Dr|St|Ste)\.)(?<=[.;!?])\s+/)) {
      let debut = 0;
      let dernier: AutreContact | null = null;
      for (const m of phrase.matchAll(COORD)) {
        const coord = m[0];
        const estMel = coord.includes("@");
        const cle = estMel ? coord.toLowerCase() : chiffres(coord);
        let avant = phrase.slice(debut, m.index);
        debut = m.index + coord.length;
        const paren = avant.match(/^\s*(\([^)]*\))/);
        if (paren) {
          if (dernier) dernier.qui = `${dernier.qui} ${paren[1]}`;
          avant = avant.slice(paren[0].length);
        }
        if (estMel && MODELE.test(coord.split("@")[0])) continue;
        if (estMel ? melsConnus.has(cle) : connus.has(cle)) continue;
        if (vus.has(cle)) continue;
        vus.add(cle);
        // Le dernier morceau qui reste un nom une fois « au », « e-mail »… retirés :
        // « Syndicat (président / ODG), e-mail x@y » garde « Syndicat (président / ODG) ».
        const nettoyer = (t: string) =>
          t.replace(/\s*\b(?:au|tél\.?|téléphone|joignable au|par mail|e-mail|mail)\s*:?\s*$/i, "").replace(/[\s(:–—-]+$/, "").trim();
        const morceaux = avant.split(/[:;,]\s|\s[–—-]\s(?=[a-zé])/).map(nettoyer);
        const qui = (!dernier || debutPhrase(avant) ? [...morceaux].reverse().find(Boolean) : morceaux.at(-1)) ?? "";
        // « …au 05 47 84 06 76, e-mail x@y.fr » : l'e-mail revient au même contact.
        // Sauf « x@… et ludovic.lamotte@… » : deux adresses nominatives, deux personnes.
        // « c.paulin@…, s.chevalier@… » : une liste d'adresses nominatives, autant de personnes.
        if (!qui && dernier && !(estMel && nomDeLAdresse(coord) && (/^\s*et\s*$/i.test(avant) || dernier.emails.length > 0))) {
          (estMel ? dernier.emails : dernier.telephones).push(coord);
          continue;
        }
        // Une adresse nominative dit au moins à qui elle est : « d'après x@… et
        // ludovic.lamotte@… » ne donne pas de nom avant, l'adresse le donne (20/10).
        const personne = estMel ? nomDeLAdresse(coord) : null;
        const nom = personne && (!qui || /^(?:et|ou|d'après|relevée?s?|format)(?=[\s:,]|$)/i.test(qui))
          ? `${personne} — fonction non précisée`
          : qui ? qui.charAt(0).toUpperCase() + qui.slice(1) : "Contact cité dans le dossier";
        const deja = out.find((c) => c.qui === nom);
        if (deja) {
          (estMel ? deja.emails : deja.telephones).push(coord);
          dernier = deja;
          continue;
        }
        dernier = { qui: nom.length > 160 ? `${nom.slice(0, 157)}…` : nom, telephones: estMel ? [] : [coord], emails: estMel ? [coord] : [] };
        out.push(dernier);
      }
      const reste = phrase.slice(debut).match(/^\s*(\([^)]*\))/);
      if (reste && dernier) dernier.qui = `${dernier.qui} ${reste[1]}`;
    }
  }
  // 3. Le reste de ce que le site publie : aucune adresse ni aucun numéro ne se perd.
  for (const mel of p.site_contacts?.emails ?? []) {
    const cle = typeof mel === "string" ? mel.toLowerCase() : "";
    if (!cle || vus.has(cle) || melsConnus.has(cle) || MODELE.test(cle.split("@")[0])) continue;
    vus.add(cle);
    out.push({ qui: nomDeLAdresse(mel) ? `${nomDeLAdresse(mel)} — fonction non précisée` : "Adresse relevée sur le site", telephones: [], emails: [mel] });
  }
  for (const tel of p.site_contacts?.phones ?? []) {
    const cle = typeof tel === "string" ? chiffres(tel) : "";
    if (!cle || vus.has(cle) || connus.has(cle)) continue;
    vus.add(cle);
    out.push({ qui: "Numéro relevé sur le site", telephones: [cle.length === 10 ? cle.replace(/(\d{2})(?=\d)/g, "$1 ") : tel], emails: [] });
  }
  return out;
}

export default function ColonneEntreprise({
  titre,
  sousTitre,
  identite,
  notes,
  place,
  referent,
  inscrite,
  interlocuteurs,
  autresContacts = [],
  etablissement,
  manquants = [],
  onCompleter,
}: {
  titre: string;
  sousTitre?: ReactNode;
  /** SIREN, raison sociale, siège. */
  identite?: ReactNode;
  notes: NotesFiche | null;
  /** « Place dans le Pipeline » : le menu des colonnes, ou ce qui en tient lieu. */
  place?: ReactNode;
  referent?: ReactNode;
  /** « Trouvée le 3 oct. par Merx ». */
  inscrite?: string | null;
  interlocuteurs: ReactNode;
  /** Les contacts utiles hors de l'entreprise : voir autresContactsDe. */
  autresContacts?: AutreContact[];
  etablissement: LigneEtablissement[];
  manquants?: string[];
  onCompleter?: () => void;
}) {
  const [voirManquants, setVoirManquants] = useState(false);
  return (
    <>
      <h2 className="pr-10 font-display text-[22px] font-semibold leading-tight text-avisdoc-ink md:pr-0">
        {titre} <PastilleApprofondie le={notes?.approfondieLe} className="ml-1 -translate-y-0.5" />
      </h2>
      {sousTitre && <div className="mt-1 text-[13px] text-muted-foreground">{sousTitre}</div>}
      {identite && <div className="mt-1.5">{identite}</div>}

      <TitreColonne className="mt-4">Notation</TitreColonne>
      <Notation notes={notes} />

      {place && (
        <>
          <TitreColonne>Place dans le Pipeline</TitreColonne>
          {place}
        </>
      )}

      {referent && <div className="mt-4">{referent}</div>}
      {inscrite && <div className="mt-1.5 text-[12px] text-muted-foreground">{inscrite}</div>}

      <div className="mt-5">{interlocuteurs}</div>

      {autresContacts.length > 0 && (
        <div className="mb-5">
          <TitreColonne className="mt-0">Autres contacts trouvés</TitreColonne>
          <div className="divide-y divide-border/70">
            {autresContacts.map((c, i) => (
              <div key={i} className="py-1.5 text-[13px] leading-snug">
                <div className="text-avisdoc-ink">{c.qui}</div>
                {(c.telephones.length > 0 || c.emails.length > 0) && (
                  <div className="mt-0.5 flex flex-wrap gap-x-3">
                    {c.telephones.map((t) => (
                      <a key={t} href={`tel:${t.replace(/[\s.-]/g, "")}`} className="text-avisdoc-teal">
                        {t}
                      </a>
                    ))}
                    {c.emails.map((m) => (
                      <a key={m} href={`mailto:${m}`} className="break-all text-avisdoc-teal">
                        {m}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {etablissement.length > 0 && (
        <>
          <TitreColonne className="mt-0">Établissement</TitreColonne>
          <div className="divide-y divide-border/70">
            {etablissement.map((l) => (
              <div key={l.label} className="flex gap-3 py-1.5">
                <div className="w-[110px] shrink-0 text-[12.5px] text-muted-foreground">{l.label}</div>
                <div className="min-w-0 flex-1 break-words text-[13px] text-avisdoc-ink">{l.valeur}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {manquants.length > 0 && (
        <div className="mt-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
          <button type="button" onClick={() => setVoirManquants(!voirManquants)} className="underline underline-offset-2">
            {manquants.length} information{manquants.length > 1 ? "s" : ""} à renseigner {voirManquants ? "▴" : "▾"}
          </button>
          {onCompleter && (
            <>
              {" · "}
              <button type="button" onClick={onCompleter} className="underline underline-offset-2">
                Compléter
              </button>
            </>
          )}
          {voirManquants && <div className="mt-1.5">{manquants.join(" · ")}</div>}
        </div>
      )}
    </>
  );
}
