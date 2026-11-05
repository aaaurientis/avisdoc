// Journées de dépistage — lecture des extractions CSV et calculs des statistiques.
// Fonctions pures (sans réseau) : testées dans journees.test.ts.

export interface FichierS3 {
  key: string;
  taille: number;
  /** Date de dépôt dans le bucket (ISO). */
  modifie: string;
}

export interface TableCsv {
  colonnes: string[];
  lignes: Record<string, string>[];
}

export interface JourneeExtraite {
  key: string;
  /** Nom du fichier, sans le dossier. */
  nom: string;
  /** Date de la journée (AAAA-MM-JJ) : lue dans le nom du fichier, sinon date de dépôt. */
  date: string;
  /** Vrai si la date vient du nom du fichier (sinon, c'est la date de dépôt). */
  dateDuNom: boolean;
  modifie: string;
  table: TableCsv;
  erreur?: string;
}

/** Le séparateur le plus fréquent sur la ligne d'en-tête, hors guillemets. Excel FR écrit des « ; ». */
export function separateurProbable(texte: string): string {
  const entete = texte.split(/\r?\n/, 1)[0] ?? "";
  const comptes: Record<string, number> = { ";": 0, ",": 0, "\t": 0, "|": 0 };
  let dansGuillemets = false;
  for (const c of entete) {
    if (c === '"') dansGuillemets = !dansGuillemets;
    else if (!dansGuillemets && c in comptes) comptes[c]++;
  }
  const [sep, n] = Object.entries(comptes).sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? sep : ",";
}

/** CSV → lignes de cellules. Gère les guillemets, les "" échappés et les retours à la ligne dans une cellule. */
export function decouperCsv(texte: string, sep = separateurProbable(texte)): string[][] {
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let cellule = "";
  let dansGuillemets = false;
  const src = texte.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cellule += '"';
          i++;
        } else dansGuillemets = false;
      } else cellule += c;
    } else if (c === '"') dansGuillemets = true;
    else if (c === sep) {
      ligne.push(cellule);
      cellule = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      ligne.push(cellule);
      lignes.push(ligne);
      ligne = [];
      cellule = "";
    } else cellule += c;
  }
  if (cellule !== "" || ligne.length) {
    ligne.push(cellule);
    lignes.push(ligne);
  }
  // Les lignes entièrement vides (fin de fichier, lignes blanches) ne comptent pas.
  return lignes.filter((l) => l.some((x) => x.trim() !== ""));
}

/** CSV → table : la première ligne donne les colonnes. Une colonne sans nom reçoit « Colonne N ». */
export function lireCsv(texte: string): TableCsv {
  const [entete, ...corps] = decouperCsv(texte);
  if (!entete) return { colonnes: [], lignes: [] };
  const vus = new Map<string, number>();
  const colonnes = entete.map((brut, i) => {
    const base = brut.trim() || `Colonne ${i + 1}`;
    const n = (vus.get(base) ?? 0) + 1;
    vus.set(base, n);
    return n > 1 ? `${base} (${n})` : base;
  });
  const lignes = corps.map((cellules) => {
    const l: Record<string, string> = {};
    colonnes.forEach((c, i) => (l[c] = (cellules[i] ?? "").trim()));
    return l;
  });
  return { colonnes, lignes };
}

const valide = (a: number, m: number, j: number) => {
  if (a < 2000 || a > 2100 || m < 1 || m > 12 || j < 1 || j > 31) return null;
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCMonth() === m - 1 ? `${a}-${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}` : null;
};

/** La date d'une journée lue dans le nom du fichier : 2026-11-05, 20261105, 05-11-2026 ou 05_11_2026. */
export function dateDansLeNom(key: string): string | null {
  const nom = key.split("/").pop() ?? key;
  for (const m of nom.matchAll(/(\d{4})[-_.]?(\d{2})[-_.]?(\d{2})/g)) {
    const d = valide(+m[1], +m[2], +m[3]);
    if (d) return d;
  }
  for (const m of nom.matchAll(/(\d{2})[-_.](\d{2})[-_.](\d{4})/g)) {
    const d = valide(+m[3], +m[2], +m[1]);
    if (d) return d;
  }
  return null;
}

export function journeeDepuis(f: FichierS3, contenu: string | undefined, erreur?: string): JourneeExtraite {
  const duNom = dateDansLeNom(f.key);
  return {
    key: f.key,
    nom: f.key.split("/").pop() ?? f.key,
    date: duNom ?? (f.modifie ? f.modifie.slice(0, 10) : ""),
    dateDuNom: !!duNom,
    modifie: f.modifie,
    table: contenu === undefined ? { colonnes: [], lignes: [] } : lireCsv(contenu),
    erreur,
  };
}

/** Les colonnes présentes dans les extractions, de la plus fréquente à la moins fréquente. */
export function colonnesCommunes(journees: JourneeExtraite[]): string[] {
  const n = new Map<string, number>();
  for (const j of journees) for (const c of j.table.colonnes) n.set(c, (n.get(c) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

/**
 * La colonne qui se prête le mieux à une répartition : peu de valeurs différentes
 * (2 à 15), presque toujours remplie. Typiquement un résultat, un sexe, une orientation.
 */
export function colonneARepartir(journees: JourneeExtraite[]): string | null {
  const lignes = journees.flatMap((j) => j.table.lignes);
  if (!lignes.length) return null;
  let meilleure: { c: string; score: number } | null = null;
  for (const c of colonnesCommunes(journees)) {
    const valeurs = lignes.map((l) => l[c] ?? "").filter(Boolean);
    const distinctes = new Set(valeurs).size;
    if (distinctes < 2 || distinctes > 15) continue;
    // Presque une valeur par ligne : un identifiant, pas une catégorie.
    if (distinctes > valeurs.length / 2) continue;
    const score = valeurs.length / lignes.length - distinctes / 100;
    if (!meilleure || score > meilleure.score) meilleure = { c, score };
  }
  return meilleure?.c ?? null;
}

export interface Part {
  valeur: string;
  nombre: number;
}

/** Répartition des lignes selon une colonne : les `max` valeurs les plus fréquentes, le reste en « Autres ». */
export function repartition(journees: JourneeExtraite[], colonne: string, max = 10): Part[] {
  const n = new Map<string, number>();
  for (const j of journees)
    for (const l of j.table.lignes) {
      const v = (l[colonne] ?? "").trim() || "(vide)";
      n.set(v, (n.get(v) ?? 0) + 1);
    }
  const triees = [...n.entries()].sort((a, b) => b[1] - a[1]).map(([valeur, nombre]) => ({ valeur, nombre }));
  if (triees.length <= max) return triees;
  const reste = triees.slice(max).reduce((s, p) => s + p.nombre, 0);
  return [...triees.slice(0, max), { valeur: "Autres", nombre: reste }];
}

export type Periode = "tout" | "30j" | "90j" | "12m";

/** Garde les journées de la période, comptée en arrière depuis aujourd'hui. */
export function dansLaPeriode(journees: JourneeExtraite[], periode: Periode, aujourdhui = new Date()): JourneeExtraite[] {
  if (periode === "tout") return journees;
  const debut = new Date(aujourdhui);
  if (periode === "30j") debut.setDate(debut.getDate() - 30);
  else if (periode === "90j") debut.setDate(debut.getDate() - 90);
  else debut.setFullYear(debut.getFullYear() - 1);
  const borne = debut.toISOString().slice(0, 10);
  return journees.filter((j) => j.date >= borne);
}
