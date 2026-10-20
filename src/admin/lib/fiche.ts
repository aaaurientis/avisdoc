// Ce que la colonne commune des fiches affiche : les notes.
//
// Une entreprise garde la même fiche du premier repérage au contrat. La colonne dit
// d'un coup d'œil ce qu'elle vaut : qualification et fiabilité.

/** Les trois repères de la fiche. Rien de tout cela n'existe sur une fiche jamais évaluée. */
export interface NotesFiche {
  qualification: number | null;
  fiabilite: number | null;
  approfondieLe: string | null;
}

/** Les notes d'un prospect, d'où qu'on ouvre l'entreprise. */
export const notesDe = (
  p: { score_total: number | null; reliability?: number | null; enriched_at: string | null } | null | undefined,
): NotesFiche | null => (p ? { qualification: p.score_total, fiabilite: p.reliability ?? null, approfondieLe: p.enriched_at } : null);

/** Le ton d'une note de fiabilité sur 10, sur le modèle de celui de la qualification. */
export function tonFiabilite(f: number | null): string {
  if (f === null) return "bg-muted text-muted-foreground";
  if (f >= 8) return "bg-emerald-100 text-emerald-700";
  if (f >= 5) return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-700";
}

/** Une personne telle que le bloc « Interlocuteurs » l'affiche. */
export interface PersonneFiche {
  id?: string;
  nom: string;
  fonction: string | null;
  email: string | null;
  telephone: string | null;
  aConfirmer?: boolean;
  source?: string | null;
  /** Son adresse composée d'après le format maison relevé, faute d'adresse trouvée : à confirmer. */
  emailDeduit?: string | null;
}

/** Les adresses de service, qui ne sont celles de personne (webmaster@, contact@…). */
export const ADRESSE_GENERIQUE = /^(?:webmaster|contact|contacts|info|infos|accueil|dpo|rgpd|noreply|no-reply|admin|hello|bonjour|support|secretariat|standard)@/i;
const MAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
/** Messageries grand public : « vignobles.levrier@gmail.com » ne dit rien d'un format maison. */
const WEBMAIL = /^(?:gmail|googlemail|yahoo|hotmail|outlook|live|msn|free|orange|wanadoo|sfr|neuf|laposte|icloud|me|aol|gmx|proton|protonmail|bbox|numericable)\./i;
const sansAccent = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Le format maison des adresses d'une entreprise, d'après ses adresses nominatives
 * relevées (« j.dupont@ », « jean.dupont@ ») : la forme la plus vue, sur le domaine du
 * site, ou vue au moins deux fois.
 */
function formatMaison(adresses: string[], site: string | null | undefined): { domaine: string; initiale: boolean } | null {
  const hote = (site ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const comptes = new Map<string, number>();
  for (const a of adresses) {
    if (ADRESSE_GENERIQUE.test(a)) continue;
    const [local, domaine] = a.toLowerCase().split("@");
    if (!domaine || WEBMAIL.test(domaine)) continue;
    const forme = /^[a-z]\.[a-z-]{2,}$/.test(local) ? "i" : /^[a-z-]{2,}\.[a-z-]{2,}$/.test(local) ? "p" : null;
    if (forme) comptes.set(`${domaine}|${forme}`, (comptes.get(`${domaine}|${forme}`) ?? 0) + 1);
  }
  const [cle, n] = [...comptes].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!cle) return null;
  const [domaine, forme] = cle.split("|");
  if (n! < 2 && !(hote && (hote === domaine || hote.endsWith(`.${domaine}`) || domaine.endsWith(hote)))) return null;
  return { domaine, initiale: forme === "i" };
}

/** « Jérôme Valadier » au format « i » → « j.valadier@domaine ». */
function adresseComposee(nom: string, f: { domaine: string; initiale: boolean }): string | null {
  const mots = sansAccent(nom.replace(/\(.*?\)/g, " ")).replace(/[^a-z\s-]/g, "").split(/\s+/).filter(Boolean);
  if (mots.length < 2) return null;
  const [prenom, ...reste] = mots;
  return `${f.initiale ? prenom[0] : prenom}.${reste.join("")}@${f.domaine}`;
}

/**
 * Les personnes qu'une fiche de prospection connaît : l'interlocuteur retenu, puis
 * toutes celles que Merx a trouvées. `deja` : celles déjà listées (saisies sur
 * l'affaire), qu'on ne répète pas.
 */
export function personnesDuProspect(
  p: {
    contact_name: string | null;
    contact_role: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    personnes: { nom: string; fonction: string | null; email: string | null; telephone: string | null; mobile: string | null; source: string | null; sur: boolean }[] | null;
    site_contacts?: { emails?: string[] } | null;
    dossier?: unknown;
    website?: string | null;
  } | null | undefined,
  deja: PersonneFiche[] = [],
): PersonneFiche[] {
  if (!p) return [];
  // « Jean-Francois » et « Jean-François » sont la même personne.
  const cleDe = (nom: string) => sansAccent(nom.trim());
  const vus = new Set(deja.map((q) => cleDe(q.nom)));
  const sortie: PersonneFiche[] = [];
  // Une même personne peut figurer deux fois (contact principal ET personnes trouvées) :
  // on fusionne, en complétant les cases vides — sans quoi le téléphone trouvé par
  // l'approfondissement disparaissait de la colonne (Olivier, 20/10).
  const garder = (q: PersonneFiche) => {
    const cle = cleDe(q.nom);
    if (!cle || vus.has(cle)) return;
    const deja2 = sortie.find((x) => cleDe(x.nom) === cle);
    if (deja2) {
      deja2.fonction ||= q.fonction;
      deja2.email ||= q.email;
      deja2.telephone ||= q.telephone;
      if (deja2.aConfirmer && !q.aConfirmer) deja2.aConfirmer = false;
      return;
    }
    sortie.push({ ...q });
  };
  // L'adresse générale du site (webmaster@…) n'est celle de personne : elle reste
  // l'e-mail de l'établissement (Olivier, 20/10, « tu lui mets webmaster »).
  const email = p.contact_email && !ADRESSE_GENERIQUE.test(p.contact_email) ? p.contact_email : null;
  if (p.contact_name) garder({ nom: p.contact_name, fonction: p.contact_role, email, telephone: p.contact_phone });
  for (const q of p.personnes ?? []) {
    garder({ nom: q.nom, fonction: q.fonction, email: q.email, telephone: q.telephone ?? q.mobile, aConfirmer: !q.sur, source: q.source });
  }
  // Sans adresse trouvée, l'adresse composée au format maison, marquée « déduite »
  // (Olivier, 20/10 : « on pourrait lui mettre son adresse Valadier »).
  const f = formatMaison(
    [
      p.contact_email,
      ...(p.personnes ?? []).map((q) => q.email),
      ...(p.site_contacts?.emails ?? []),
      ...(JSON.stringify(p.dossier ?? null).match(MAIL) ?? []),
    ].filter((a): a is string => typeof a === "string" && a.includes("@")),
    p.website,
  );
  if (f) for (const q of sortie) if (!q.email) q.emailDeduit = adresseComposee(q.nom, f);
  return sortie;
}
