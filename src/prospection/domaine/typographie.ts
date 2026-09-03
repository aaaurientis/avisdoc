// Typographie française des libellés d'interface : espace insécable avant
// ? ! : ;, guillemets français, apostrophe courbe, aucun tiret cadratin.
// (Les messages LinkedIn générés suivent la règle inverse : voir gardeFousMessage.)

export type CodeTypo = "tiret_cadratin" | "apostrophe_droite" | "insecable_manquante" | "guillemets_droits" | "points_de_suspension";

const NBSP = "\u00a0"; // avant :
const FINE = "\u202f"; // avant ? ! ;  et dans « »

/** PR-90 : violations typographiques d'un libellé. */
export function pr90VerifierTypographie(texte: string): CodeTypo[] {
  const v: CodeTypo[] = [];
  if (/—/.test(texte)) v.push("tiret_cadratin");
  if (/'/.test(texte)) v.push("apostrophe_droite");
  if (/(^|[^\u00a0\u202f])[?!:;]/.test(texte.replace(/https?:\/\/\S+/g, "").replace(/\d:\d/g, ""))) v.push("insecable_manquante");
  if (/"/.test(texte)) v.push("guillemets_droits");
  if (/\.\.\./.test(texte)) v.push("points_de_suspension");
  return v;
}

/** PR-91 : applique les règles à un texte saisi « à plat » dans le code. */
export function pr91Franciser(texte: string): string {
  return texte
    .replace(/'/g, "’")
    .replace(/\.\.\./g, "…")
    .replace(/ ?:/g, (m, offset: number, s: string) => (/\d/.test(s[offset - 1] ?? "") && /\d/.test(s[offset + m.length] ?? "") ? m : `${NBSP}:`))
    .replace(/ ?([?!;])/g, `${FINE}$1`)
    .replace(/«\s?/g, `«${FINE}`)
    .replace(/\s?»/g, `${FINE}»`)
    .replace(/https?\u00a0:/g, (m) => m.replace(NBSP, ""));
}

/** Applique pr91Franciser à toutes les chaînes d'un objet, récursivement. */
export function franciserObjet<T>(objet: T): T {
  if (typeof objet === "string") return pr91Franciser(objet) as T;
  if (Array.isArray(objet)) return objet.map((x) => franciserObjet(x)) as T;
  if (objet && typeof objet === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(objet as Record<string, unknown>)) out[k] = franciserObjet(v);
    return out as T;
  }
  return objet;
}
