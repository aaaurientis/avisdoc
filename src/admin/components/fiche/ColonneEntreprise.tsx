// La colonne de gauche d'une fiche, reprise du hub Onetip (12/10) : le nom, la
// notation, la place dans le Pipeline, qui la suit, les interlocuteurs, puis
// l'établissement. Les cases vides restent connues mais repliées.

import { useState, type ReactNode } from "react";
import { Notation, TitreColonne } from "../FicheEntreprise";
import type { NotesFiche } from "../../lib/fiche";
import type { Prospect } from "../../lib/merx";
import { effectifLabel } from "../../lib/merx";

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
    { label: "Téléphone", valeur: telephone ? <a href={`tel:${telephone.replace(/\s/g, "")}`} className="text-avisdoc-teal">{telephone}</a> : null },
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
 * qui permettent de contacter… dans la colonne de gauche »). Les fiches approfondies
 * depuis le 20/10 les ont rangés à part ; pour les plus anciennes, on relève chaque
 * numéro et chaque adresse cités dans le texte du dossier, avec la phrase qui les cite.
 */
export function autresContactsDe(p: Prospect | null): AutreContact[] {
  const d = p?.dossier;
  if (!p || !d) return [];
  if (d.autres_contacts?.length) {
    return d.autres_contacts.map((ligne) => {
      const [nom, role, structure, tel, mel] = ligne.split("|").map((x) => x.trim());
      return {
        qui: [nom, role, structure].filter(Boolean).join(" — ") || ligne,
        telephones: tel ? (tel.match(TEL) ?? [tel]) : [],
        emails: mel ? (mel.match(MEL) ?? []) : [],
      };
    });
  }
  // Ce qui est déjà ailleurs dans la colonne ne se répète pas.
  const connus = new Set(
    [p.contact_phone, ...(p.site_contacts?.phones ?? []), p.dossier?.fiche_appel?.numero, ...(p.personnes ?? []).map((x) => x.telephone)]
      .flatMap((t) => (t ?? "").match(TEL) ?? [])
      .map(chiffres),
  );
  const melsConnus = new Set(
    [p.contact_email, ...(p.site_contacts?.emails ?? []), ...(p.personnes ?? []).map((x) => x.email)].filter(Boolean).map((m) => m!.toLowerCase()),
  );
  const textes = [
    ...(d.a_retenir ?? []),
    d.qui_aborder,
    d.accroche,
    d.fiche_appel?.qui_demander,
    d.fiche_appel?.si_on_insiste,
    ...(d.arguments ?? []).flatMap((a) => [a.argument, a.parce_que]),
    ...(d.objections ?? []).map((o) => o.reponse),
    d.offre,
    ...(d.a_verifier ?? []),
  ].filter((t): t is string => !!t);
  // Un contact par numéro ou adresse : le nom est ce qui le précède dans la phrase
  // (« …, Robin Lafugie au 05 57 24 93 38 »), une précision entre parenthèses juste
  // après lui revient (« … au 05 47 84 06 76 (M. Gérard Canuel, maire…) »).
  const vus = new Set<string>();
  const out: AutreContact[] = [];
  const COORD = new RegExp(`${TEL.source}|${MEL.source}`, "g");
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
        if (estMel ? melsConnus.has(cle) : connus.has(cle)) continue;
        if (vus.has(cle)) continue;
        vus.add(cle);
        const qui = (avant.split(/[:;,]\s|\s[–—-]\s(?=[a-zé])/).at(-1) ?? "")
          .replace(/\s*\b(?:au|tél\.?|téléphone|joignable au|par mail|e-mail|mail)\s*:?\s*$/i, "")
          .replace(/[\s(:–—-]+$/, "")
          .trim();
        const nom = qui || "Contact cité dans le dossier";
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
      <h2 className="pr-10 font-display text-[22px] font-semibold leading-tight text-avisdoc-ink md:pr-0">{titre}</h2>
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
          <TitreColonne className="mt-0">Autres contacts utiles</TitreColonne>
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
