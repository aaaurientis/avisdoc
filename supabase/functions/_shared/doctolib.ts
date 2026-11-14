// Lien vers la fiche Doctolib d'un praticien : logique PURE (testée).
//
// Le Hub ne lit jamais une page Doctolib. Il examine seulement les adresses que
// renvoie une recherche web limitée à doctolib.fr, et ne retient un lien d'office
// que s'il est LE SEUL à porter le nom, le prénom et une commune d'exercice du
// praticien, au format doctolib.fr/<spécialité>/<ville>/<prénom-nom>.

export type CorrespondanceDoctolib =
  | { statut: "trouve_auto"; url: string }
  | { statut: "a_confirmer"; candidats: number }
  | { statut: "introuvable" };

/** « Saint-Martin-d'Hères » → « saint-martin-d-heres » (forme des adresses Doctolib). */
export function slug(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/['’]/g, "-").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Une adresse de fiche Doctolib : https, domaine doctolib, au moins trois segments. */
export function urlDoctolibValide(u: unknown): u is string {
  if (typeof u !== "string") return false;
  try {
    const x = new URL(u);
    return x.protocol === "https:" && /(^|\.)doctolib\.(fr|de|it)$/.test(x.hostname) &&
      x.pathname.split("/").filter(Boolean).length >= 3 && !/\s/.test(u);
  } catch {
    return false;
  }
}

/** Adresse propre : sans paramètres ni ancre (seul le lien de la fiche est conservé). */
export function urlPropre(u: string): string {
  const x = new URL(u);
  return `${x.origin}${x.pathname.replace(/\/+$/, "")}`;
}

export function choisirDoctolib(
  urls: string[],
  p: { nom: string; prenom: string; communes: string[] },
): CorrespondanceDoctolib {
  const fiches = [...new Set(urls.filter(urlDoctolibValide).map(urlPropre))];
  if (fiches.length === 0) return { statut: "introuvable" };
  const nom = slug(p.nom).split("-").filter((m) => m.length >= 2);
  const prenom = slug(p.prenom).split("-")[0] ?? "";
  const villes = p.communes.map(slug).filter(Boolean);
  const sures = fiches.filter((u) => {
    const [, ville, fiche] = new URL(u).pathname.split("/").filter(Boolean);
    const mots = `-${fiche ?? ""}-`;
    const villeOk = villes.some((v) => ville === v || ville?.startsWith(`${v}-`) || v.startsWith(`${ville}-`));
    return nom.length > 0 && nom.every((m) => mots.includes(`-${m}-`)) && (!prenom || mots.includes(`-${prenom}-`)) && villeOk;
  });
  if (sures.length === 1) return { statut: "trouve_auto", url: sures[0] };
  // Correspondances faibles écartées : seules les fiches portant le nom méritent une vérification.
  const auNom = fiches.filter((u) => {
    const fiche = new URL(u).pathname.split("/").filter(Boolean)[2] ?? "";
    return nom.length > 0 && nom.every((m) => `-${fiche}-`.includes(`-${m}-`));
  });
  return auNom.length > 0 ? { statut: "a_confirmer", candidats: auNom.length } : { statut: "introuvable" };
}

/** Recherche web à ouvrir par l'opérateur (aucune lecture par le Hub). */
export function lienRechercheDoctolib(p: { nom: string; prenom: string; communes: string[] }): string {
  const q = `site:doctolib.fr "${p.prenom} ${p.nom}" ${p.communes[0] ?? ""}`.trim();
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
