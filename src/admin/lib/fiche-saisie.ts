// Une fiche d'entreprise saisie à la main : tout ce que le commercial sait, rangé là
// où la fiche le lit.
//
// Olivier (19/10) : « je dois pouvoir ouvrir une fiche avec toutes les informations
// dedans », sans SIREN obligatoire, et rien qui vienne de Merx tant qu'on ne le lui
// demande pas. Le même brouillon sert à « Ajouter un prospect », à « Nouveau client »
// et à « Modifier » : une seule façon de remplir une fiche.

import type { Prospect, Secteur } from "./merx";

export interface PersonneSaisie {
  nom: string;
  fonction: string;
  email: string;
  telephone: string;
}

export interface FicheSaisie {
  nom: string;
  siren: string;
  secteur: Secteur | "";
  activite: string;
  /** Code de tranche INSEE (voir TRANCHES), ou vide. */
  effectif: string;
  adresse: string;
  codePostal: string;
  ville: string;
  departement: string;
  site: string;
  /** Le standard et l'adresse générale de l'entreprise. */
  telephone: string;
  email: string;
  dirigeant: string;
  dirigeantQualite: string;
  interlocuteurs: PersonneSaisie[];
  referent: string;
  pourquoi: string;
}

export const FICHE_VIDE: FicheSaisie = {
  nom: "",
  siren: "",
  secteur: "",
  activite: "",
  effectif: "",
  adresse: "",
  codePostal: "",
  ville: "",
  departement: "",
  site: "",
  telephone: "",
  email: "",
  dirigeant: "",
  dirigeantQualite: "",
  interlocuteurs: [],
  referent: "",
  pourquoi: "",
};

export const PERSONNE_VIDE: PersonneSaisie = { nom: "", fonction: "", email: "", telephone: "" };

/** « 67000 » → « 67 » ; « 20000 » → « 2A » ; « 97411 » → « 974 ». */
export function departementDuCodePostal(cp: string): string {
  const c = cp.replace(/\s/g, "");
  if (!/^\d{5}$/.test(c)) return "";
  if (c.startsWith("97") || c.startsWith("98")) return c.slice(0, 3);
  if (c.startsWith("20")) return Number(c) < 20200 ? "2A" : "2B";
  return c.slice(0, 2);
}

type ProspectLu = Prospect & { referent?: string | null };

const t = (v: string | null | undefined) => (v ?? "").trim();

/** Ce que la fiche contient déjà, prêt à corriger. */
export function saisieDepuisProspect(p: ProspectLu): FicheSaisie {
  // Les interlocuteurs : celui de la fiche d'abord, puis tous les autres, sans doublon.
  const vus = new Set<string>();
  const interlocuteurs: PersonneSaisie[] = [];
  const ajouter = (q: PersonneSaisie) => {
    const cle = q.nom.trim().toLowerCase();
    if (!cle || vus.has(cle)) return;
    vus.add(cle);
    interlocuteurs.push(q);
  };
  if (p.contact_name) ajouter({ nom: p.contact_name, fonction: t(p.contact_role), email: t(p.contact_email), telephone: t(p.contact_phone) });
  for (const q of p.personnes ?? []) ajouter({ nom: q.nom, fonction: t(q.fonction), email: t(q.email), telephone: t(q.telephone ?? q.mobile) });

  // Le dirigeant a sa ligne à lui ; s'il est aussi un interlocuteur, il reste dans la
  // liste avec ses coordonnées (les retirer les effaçait à l'enregistrement).
  const chef = p.leaders?.[0];

  return {
    nom: p.name,
    siren: t(p.siren),
    secteur: p.sector ?? "",
    activite: t(p.activity),
    effectif: t(p.headcount_band),
    adresse: t(p.head_office?.address),
    codePostal: "",
    ville: t(p.city ?? p.head_office?.city),
    departement: t(p.department ?? p.head_office?.department),
    site: t(p.website),
    // Le standard est rangé avec les numéros du site ; une fiche sans interlocuteur
    // le porte aussi dans contact_* (c'est là que Merx et Google le posent).
    telephone: t(p.site_contacts?.phones?.[0]) || (p.contact_name ? "" : t(p.contact_phone)),
    email: t(p.site_contacts?.emails?.[0]) || (p.contact_name ? "" : t(p.contact_email)),
    dirigeant: chef?.name ?? "",
    dirigeantQualite: t(chef?.role),
    interlocuteurs,
    referent: t(p.referent),
    pourquoi: t(p.rationale),
  };
}

/**
 * Les colonnes de admin_prospects que la saisie remplit.
 *
 * - Le premier interlocuteur devient le contact principal (contact_*) : c'est lui
 *   que l'import, les e-mails et Merx lisent en premier. Tous sont dans `personnes`.
 * - Le standard et l'adresse générale vont avec les numéros relevés sur le site
 *   (site_contacts), là où la fiche les montre parmi « ce qu'on sait d'elle ».
 * - Un champ vidé est effacé : c'est le commercial qui décide de ce que dit sa fiche.
 */
export function colonnesProspect(s: FicheSaisie, avant?: ProspectLu | null): Record<string, unknown> {
  const n = (v: string) => v.trim() || null;
  // Une personne déjà sur la fiche garde d'où elle vient et son « à confirmer » ;
  // une nouvelle est saisie à la main, donc sûre.
  const connues = new Map((avant?.personnes ?? []).map((q) => [q.nom.trim().toLowerCase(), q]));
  const personnes = s.interlocuteurs
    .filter((q) => q.nom.trim())
    .map((q) => {
      const deja = connues.get(q.nom.trim().toLowerCase());
      return {
        nom: q.nom.trim(),
        fonction: n(q.fonction),
        email: n(q.email),
        telephone: n(q.telephone),
        mobile: deja?.mobile ?? null,
        source: deja?.source ?? "saisi à la main",
        sur: deja?.sur ?? true,
      };
    });
  const principal = personnes[0] ?? null;
  const departement = n(s.departement) ?? (departementDuCodePostal(s.codePostal) || null);
  const site = n(s.site);
  const autresTelephones = (avant?.site_contacts?.phones ?? []).slice(1);
  const autresEmails = (avant?.site_contacts?.emails ?? []).slice(1);
  return {
    name: s.nom.trim(),
    siren: n(s.siren.replace(/\s/g, "")),
    sector: s.secteur || null,
    activity: n(s.activite),
    headcount_band: n(s.effectif),
    city: n(s.ville),
    department: departement,
    head_office: s.adresse.trim() || s.ville.trim()
      ? { ...(avant?.head_office ?? {}), address: n([s.adresse, s.codePostal].filter((x) => x.trim()).join(", ")), city: n(s.ville), department: departement }
      : null,
    website: site && !/^https?:\/\//i.test(site) ? `https://${site}` : site,
    // Le premier dirigeant garde ce que la fiche savait de lui en plus de son nom.
    leaders: s.dirigeant.trim()
      ? [{ ...(avant?.leaders?.[0] ?? {}), name: s.dirigeant.trim(), role: n(s.dirigeantQualite) }, ...(avant?.leaders ?? []).slice(1)]
      : (avant?.leaders ?? []).slice(1),
    site_contacts:
      s.telephone.trim() || s.email.trim() || autresTelephones.length || autresEmails.length || avant?.site_contacts?.equipe?.length || avant?.site_contacts?.readOn
        ? {
            emails: [s.email.trim(), ...autresEmails].filter(Boolean),
            phones: [s.telephone.trim(), ...autresTelephones].filter(Boolean),
            equipe: avant?.site_contacts?.equipe ?? [],
            readOn: avant?.site_contacts?.readOn ?? "saisi à la main",
          }
        : null,
    contact_name: principal?.nom ?? null,
    contact_role: principal?.fonction ?? null,
    // Sans interlocuteur, le contact de la fiche est l'entreprise elle-même.
    contact_email: principal ? principal.email : n(s.email),
    contact_phone: principal ? principal.telephone : n(s.telephone),
    // Un téléphone changé par le commercial porte « saisi à la main » : un approfondissement
    // suivant ne le remplace plus (Merx ne remplace que les numéros qu'il a lui-même posés).
    contact_source:
      (principal ? principal.telephone : n(s.telephone)) && (principal ? principal.telephone : n(s.telephone)) !== (avant?.contact_phone ?? null)
        ? "saisi à la main"
        : principal
          ? avant?.contact_name === principal.nom
            ? (avant?.contact_source ?? "saisi à la main")
            : "saisi à la main"
          : s.telephone.trim() || s.email.trim()
            ? (avant?.contact_source ?? "saisi à la main")
            : null,
    personnes: personnes.length ? personnes : null,
    referent: n(s.referent),
    rationale: n(s.pourquoi),
  };
}

/** Ce qu'il faut pour enregistrer : un nom, et des coordonnées lisibles si on en donne. */
export function erreurSaisie(s: FicheSaisie): string | null {
  if (!s.nom.trim()) return "Le nom de l’entreprise est nécessaire.";
  const siren = s.siren.replace(/\s/g, "");
  if (siren && !/^\d{9}$/.test(siren)) return "Le SIREN a 9 chiffres (laissez-le vide si vous ne l’avez pas).";
  const mails = [s.email, ...s.interlocuteurs.map((q) => q.email)].map((m) => m.trim()).filter(Boolean);
  const faux = mails.find((m) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m));
  if (faux) return `Adresse e-mail illisible : « ${faux} ».`;
  if (s.interlocuteurs.some((q) => !q.nom.trim() && (q.fonction.trim() || q.email.trim() || q.telephone.trim())))
    return "Un interlocuteur sans nom : donnez son nom ou retirez la ligne.";
  return null;
}

/** Fermer une fiche commencée demande confirmation : un clic à côté perdait toute la saisie. */
export async function fermerSiRienAPerdre(initiale: unknown, actuelle: unknown, fermer: () => void): Promise<void> {
  if (JSON.stringify(initiale) !== JSON.stringify(actuelle)) {
    const { confirmer } = await import("../components/Confirmation");
    if (!(await confirmer({ titre: "Fermer sans enregistrer ?", message: "Ce que vous avez saisi dans la fiche sera perdu.", action: "Fermer" }))) return;
  }
  fermer();
}
