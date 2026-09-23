// Ce que dit le code d'activité : le métier, et donc l'exposition.
//
// Le registre donne le code NAF de chaque entreprise. Un terrassier est dehors, une
// esthéticienne fait un métier de la peau : ce sont des faits, pas des jugements, et
// on n'a pas besoin d'un modèle pour les établir. C'est ce qui permet de noter deux
// cents fiches en une seconde là où il fallait deux minutes pour en deviner sept.
//
// Les correspondances vont du plus précis au plus général : « 43.91 » l'emporte sur
// « 43 ». Un code qu'on ne connaît pas ne reçoit RIEN — ni secteur, ni exposition —
// plutôt qu'une supposition : la fiche s'affiche « non évalué », et l'approfondissement
// tranchera. On ne devine pas.

import type { AffinityLevel, Sector, SunLevel } from "./scoring.ts";

export interface Metier {
  secteur: Sector;
  soleil: SunLevel;
  affinite: AffinityLevel;
  /** Ce que fait l'entreprise, en clair — l'annuaire ne rend que le code. */
  activite: string;
  /** Pourquoi c'est une cible, en une phrase, vraie pour tout le métier. */
  pourquoi: string;
}

const DEHORS: Pick<Metier, "soleil" | "affinite"> = { soleil: "majorite_dehors", affinite: "aucune" };
const PARTIE_DEHORS: Pick<Metier, "soleil" | "affinite"> = { soleil: "partie_dehors", affinite: "aucune" };
const PEAU: Pick<Metier, "soleil" | "affinite"> = { soleil: "interieur", affinite: "metier_de_la_peau" };
const SANTE: Pick<Metier, "soleil" | "affinite"> = { soleil: "interieur", affinite: "secteur_sante" };

/** Préfixe de code NAF → métier. L'ordre importe peu : on retient le préfixe le plus long qui colle. */
const TABLE: Record<string, Metier> = {
  // ── Construction : gros œuvre et génie civil, dehors toute l'année ──
  "41.2": { secteur: "btp", ...DEHORS, activite: "Construction de bâtiments", pourquoi: "Leurs équipes sont sur les chantiers toute l’année, exposées au rayonnement solaire." },
  "42.1": { secteur: "btp", ...DEHORS, activite: "Construction de routes et de voies ferrées", pourquoi: "Travaux de voirie en plein air, sans ombre et sur revêtement réfléchissant." },
  "42.2": { secteur: "btp", ...DEHORS, activite: "Construction de réseaux", pourquoi: "Pose de réseaux en extérieur, sur tranchées ouvertes." },
  "42.9": { secteur: "btp", ...DEHORS, activite: "Autres ouvrages de génie civil", pourquoi: "Chantiers de génie civil à ciel ouvert." },
  "43.1": { secteur: "btp", ...DEHORS, activite: "Démolition et terrassement", pourquoi: "Terrassement et démolition en plein air, souvent l’été." },
  "43.91": { secteur: "btp", ...DEHORS, activite: "Travaux de couverture", pourquoi: "Les couvreurs travaillent sur les toits : l’exposition y est maximale, sans ombre possible." },
  "43.99": { secteur: "btp", ...DEHORS, activite: "Maçonnerie et travaux spécialisés", pourquoi: "Maçonnerie et structures : l’essentiel du temps de travail est en extérieur." },
  // Installation et finition : une partie du temps dehors, une partie en intérieur.
  "43.2": { secteur: "btp", ...PARTIE_DEHORS, activite: "Travaux d’installation", pourquoi: "Interventions partagées entre chantiers ouverts et bâtiments clos." },
  "43.3": { secteur: "btp", ...PARTIE_DEHORS, activite: "Travaux de finition", pourquoi: "Façades, peinture et vitrerie exposent une partie des équipes." },

  // ── Agriculture, viticulture, forêt ──
  "01.1": { secteur: "agriculture", ...DEHORS, activite: "Cultures non permanentes", pourquoi: "Travail aux champs du printemps à l’automne, aux heures les plus ensoleillées." },
  "01.2": { secteur: "agriculture", ...DEHORS, activite: "Cultures permanentes", pourquoi: "Vigne et vergers : saisons entières passées dehors, penchés vers le sol." },
  "01.3": { secteur: "agriculture", ...DEHORS, activite: "Multiplication de plantes", pourquoi: "Pépinières et plein champ : exposition continue en saison." },
  "01.4": { secteur: "agriculture", ...DEHORS, activite: "Élevage", pourquoi: "Pâtures, parcours et bâtiments ouverts : les équipes sont dehors." },
  "01.5": { secteur: "agriculture", ...DEHORS, activite: "Polyculture et élevage", pourquoi: "Travail aux champs et aux bâtiments, en extérieur l’essentiel de la saison." },
  "01.6": { secteur: "agriculture", ...DEHORS, activite: "Services de soutien à l’agriculture", pourquoi: "Prestataires agricoles : ils suivent les travaux de saison, toujours dehors." },
  "02.": { secteur: "agriculture", ...DEHORS, activite: "Sylviculture et exploitation forestière", pourquoi: "Bûcheronnage et travaux forestiers en plein air toute l’année." },

  // ── Espaces verts ──
  "81.3": { secteur: "espaces_verts", ...DEHORS, activite: "Aménagement paysager", pourquoi: "Jardiniers et paysagistes : dehors du premier au dernier jour de la saison." },

  // ── Collectivités ──
  "84.1": { secteur: "collectivites", ...PARTIE_DEHORS, activite: "Administration publique", pourquoi: "Services techniques, voirie et espaces verts municipaux travaillent en extérieur." },

  // ── Santé et beauté : personne au soleil, mais le sujet est leur métier ──
  "96.02": { secteur: "sante_beaute", ...PEAU, activite: "Coiffure et soins de beauté", pourquoi: "Elles voient la peau et le cuir chevelu de leurs clients toute la journée : le dépistage parle directement à leur métier." },
  "96.04": { secteur: "sante_beaute", ...PEAU, activite: "Entretien corporel et spas", pourquoi: "Le soin de la peau est leur métier ; leurs clients viennent pour elle." },
  "47.73": { secteur: "sante_beaute", ...PEAU, activite: "Pharmacie", pourquoi: "Ils conseillent la protection solaire au comptoir : la prévention du mélanome prolonge ce qu’ils font déjà." },
  "47.74": { secteur: "sante_beaute", ...PEAU, activite: "Commerce d’articles médicaux", pourquoi: "Public et clientèle sensibles aux sujets de santé." },
  "47.75": { secteur: "sante_beaute", ...PEAU, activite: "Parfumerie et produits de beauté", pourquoi: "Leur clientèle vient pour la peau : le sujet leur est naturel." },
  "20.42": { secteur: "sante_beaute", ...PEAU, activite: "Fabrication de produits d’hygiène et de beauté", pourquoi: "La protection de la peau est l’objet même de leurs produits." },
  "86.": { secteur: "sante_beaute", ...SANTE, activite: "Activités pour la santé humaine", pourquoi: "Professionnels de santé : le dépistage leur parle, et ils orientent leurs patients." },
  "87.": { secteur: "sante_beaute", ...SANTE, activite: "Hébergement médico-social", pourquoi: "Établissements de soin : sujet de santé entendu, personnel nombreux." },
  "93.13": { secteur: "sante_beaute", ...SANTE, activite: "Centres de culture physique", pourquoi: "Clientèle attentive à sa santé, et pratiques sportives souvent en extérieur." },
  "21.": { secteur: "sante_beaute", ...SANTE, activite: "Industrie pharmaceutique", pourquoi: "Secteur de la santé : le sujet est cohérent avec leur métier et leur image." },
};

/** Le métier correspondant à un code NAF, ou rien si on ne le connaît pas. */
export function metierDe(naf: string | null): Metier | null {
  if (!naf) return null;
  const code = naf.trim().toUpperCase();
  // Du préfixe le plus long au plus court : « 43.91 » avant « 43.9 » avant « 43. ».
  const prefixes = Object.keys(TABLE).sort((a, b) => b.length - a.length);
  for (const p of prefixes) if (code.startsWith(p)) return TABLE[p];
  return null;
}
