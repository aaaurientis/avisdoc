// Le banc d'essai : faire tourner un barème sur de vraies entreprises AVANT de le
// mettre en production.
//
// Ce matin, une note de fiabilité est partie en prod et sortait toutes les fiches à
// dix sur dix. Personne ne l'avait vue tourner. Ce fichier existe pour que cela ne se
// reproduise pas : on lit ici la distribution complète d'un barème sur deux cent
// cinquante entreprises réelles, et on ne pousse que si les chiffres tiennent.
//
// Les jeux de données sont des réponses de l'annuaire de l'État, capturées telles
// quelles : pharmacie et dispositifs médicaux en Alsace, bâtiment en Gironde, beauté
// à Paris. Trois métiers, trois régions, trois profils d'effectif.
//
//   npx esbuild supabase/functions/merx/banc/essai.ts --bundle --format=esm \
//     --platform=node --outfile=$TMPDIR/essai.mjs \
//     && node $TMPDIR/essai.mjs supabase/functions/merx/banc

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { metierDe } from "../metiers.ts";
import {
  CATEGORIES,
  CRITERIA,
  decision,
  deploiementScore,
  expositionScore,
  peauScore,
  populationScore,
  total,
  type Score,
} from "../scoring.ts";

// Le dossier des jeux de données, passé en argument. Une fois le script compilé
// ailleurs, « à côté de moi » désigne le dossier de compilation : il lisait donc de
// vieilles captures sans rien dire. Le banc d'essai a commencé par se tromper
// lui-même — raison de plus pour qu'il annonce ce qu'il lit.
const ICI = process.argv[2] ?? "supabase/functions/merx/banc";

interface Cas {
  jeu: string;
  nom: string;
  naf: string | null;
  bandeEntreprise: string | null;
  bandeDuSite: string | null;
  siteOuvert: boolean;
  etablissements: number;
}

function charger(): Cas[] {
  const cas: Cas[] = [];
  const vus = new Set<string>();
  for (const f of readdirSync(ICI).filter((n) => n.endsWith(".json")).sort()) {
    const jeu = f.replace(/-p\d+\.json$/, "");
    const d = JSON.parse(readFileSync(join(ICI, f), "utf8"));
    for (const r of d.results ?? []) {
      if (vus.has(r.siren)) continue;
      vus.add(r.siren);
      const me = (r.matching_etablissements ?? []) as { etat_administratif?: string; tranche_effectif_salarie?: string }[];
      const ouverts = me.filter((e) => e.etat_administratif !== "F");
      cas.push({
        jeu,
        nom: r.nom_complet,
        naf: r.activite_principale ?? null,
        bandeEntreprise: r.tranche_effectif_salarie ?? null,
        bandeDuSite: ouverts[0]?.tranche_effectif_salarie ?? null,
        siteOuvert: ouverts.length > 0,
        etablissements: r.nombre_etablissements_ouverts ?? 0,
      });
    }
  }
  if (cas.length === 0) throw new Error(`Aucun jeu de données dans ${ICI}`);
  return cas;
}

// ══ LE POTENTIEL : LA GRILLE DE STÉPHANE, TELLE QUELLE ═════════════════
//
// On appelle ici les VRAIES fonctions de scoring.ts, pas une copie : un banc d'essai
// qui teste sa propre version du barème ne prouve rien sur ce qui partira en prod.
//
// Seule l'étape 2 — la pertinence AvisDoc, soixante points — se lit au registre.
// Les étapes 3 et 4 (maturité prévention, accessibilité) demandent de lire le site de
// l'entreprise : une fiche non approfondie plafonne donc à soixante.

const effectifClair = (b: string | null) =>
  ({ "53": "10 000 et plus", "52": "5 000 à 9 999", "51": "2 000 à 4 999", "42": "1 000 à 1 999", "41": "500 à 999",
     "32": "250 à 499", "31": "200 à 249", "22": "100 à 199", "21": "50 à 99", "12": "20 à 49", "11": "10 à 19",
     "03": "6 à 9", "02": "3 à 5", "01": "1 à 2", "00": "0 salarié", NN: "non renseigné" } as Record<string, string>)[b ?? ""] ?? "?";

/** La note d'une fiche brute : les quatre critères de l'étape 2. */
function noteRegistre(c: Cas): Score {
  const m = metierDe(c.naf);
  const duSite = Boolean(c.bandeDuSite && c.bandeDuSite !== "NN");
  return {
    exposition: expositionScore(m?.soleil ?? "non_evalue", m?.pourquoi ?? "", null),
    population: populationScore(duSite ? c.bandeDuSite : c.bandeEntreprise, duSite, null),
    peau: peauScore(m?.affinite ?? "non_evalue", m?.pourquoi ?? "", null),
    deploiement: deploiementScore(c.etablissements),
  };
}

const potentiel = (c: Cas) => total(noteRegistre(c));

// ══ DEUX FIABILITÉS, PARCE QUE DEUX CHOSES SONT EN JEU ══════════════════
//
// Olivier, 24/09 : « Une boîte qui construit des autoroutes, 80 % des salariés sur le
// bitume — ça, c'est une information qualifiée, on le sait. En revanche on peut
// n'avoir aucune information dessus et pourtant c'est un gros potentiel. Est-ce qu'il
// faut l'écarter ? Je ne crois pas. Mais est-ce qu'il faut faire confiance aux
// informations ? Ben non. »
//
// Un premier barème écrasait ce potentiel parce qu'il manquait un numéro de
// téléphone. C'était confondre deux questions :
//
//   LE FONDEMENT — activité, effectif du site, établissement ouvert — dit si la
//   RAISON D'Y ALLER est établie. Lui seul plafonne la note : Guerlain perd ses
//   points parce que son établissement est fermé, pas parce qu'on n'a pas son
//   standard.
//
//   LE CONTACT — site, interlocuteur, e-mail, téléphone — dit si l'on PEUT y aller
//   aujourd'hui. Il ne plafonne rien : il commande la consigne.
//
// Pour l'activité et l'effectif, le registre est la source qui fait foi — rien ne
// « recoupe » un code d'activité. Pour l'établissement il a du retard, et c'est ce
// retard qui a produit les adresses fermées : une seule source y vaut un point, deux
// sources concordantes en valent deux.

type Degre = 0 | 1 | 2;
interface Ligne {
  quoi: string;
  degre: Degre;
  dit: string;
}
const surDix = (l: Ligne[]) => Math.round((10 * l.reduce((t, x) => t + x.degre, 0)) / (2 * l.length));

/** Ce qui fonde le potentiel. Plafonne la note. */
function fondement(c: Cas, recoupe = false): { note: number; lignes: Ligne[] } {
  const duSite = Boolean(c.bandeDuSite && c.bandeDuSite !== "NN");
  const lignes: Ligne[] = [
    { quoi: "Activité", degre: 2, dit: "code d’activité officiel — source qui fait foi" },
    duSite
      ? { quoi: "Effectif du site", degre: 2, dit: "publié pour ce site par le registre" }
      : c.bandeEntreprise
        ? { quoi: "Effectif du site", degre: 1, dit: "effectif du groupe — celui du site n’est pas publié" }
        : { quoi: "Effectif du site", degre: 0, dit: "inconnu" },
    c.siteOuvert
      ? recoupe
        ? { quoi: "Établissement", degre: 2, dit: "ouvert au registre ET localisé — deux sources" }
        : { quoi: "Établissement", degre: 1, dit: "ouvert au registre, adresse non recoupée" }
      : { quoi: "Établissement", degre: 0, dit: "aucun site local — siège d’une autre région" },
  ];
  return { note: surDix(lignes), lignes };
}

type Qualite = "aucun" | "pauvre" | "moyen" | "complet";

/** Ce qui permet d'y aller. Commande la consigne, ne plafonne rien. */
function contact(q: Qualite): { note: number; lignes: Ligne[] } {
  const table: Record<Qualite, Ligne[]> = {
    aucun: [
      { quoi: "Site web", degre: 0, dit: "non recherché — fiche non approfondie" },
      { quoi: "Interlocuteur", degre: 0, dit: "non recherché" },
      { quoi: "E-mail", degre: 0, dit: "non recherché" },
      { quoi: "Téléphone", degre: 0, dit: "non recherché" },
    ],
    pauvre: [
      { quoi: "Site web", degre: 1, dit: "site probable, non confirmé" },
      { quoi: "Interlocuteur", degre: 0, dit: "aucun interlocuteur trouvé" },
      { quoi: "E-mail", degre: 0, dit: "aucune adresse trouvée" },
      { quoi: "Téléphone", degre: 0, dit: "aucun numéro trouvé" },
    ],
    moyen: [
      { quoi: "Site web", degre: 2, dit: "site officiel visité" },
      { quoi: "Interlocuteur", degre: 1, dit: "dirigeant au registre, fonction non confirmée" },
      { quoi: "E-mail", degre: 1, dit: "adresse générique relevée" },
      { quoi: "Téléphone", degre: 1, dit: "standard, une seule source" },
    ],
    complet: [
      { quoi: "Site web", degre: 2, dit: "site officiel, deux sources" },
      { quoi: "Interlocuteur", degre: 2, dit: "nommé sur le site, fonction confirmée" },
      { quoi: "E-mail", degre: 2, dit: "publié sur le site officiel" },
      { quoi: "Téléphone", degre: 2, dit: "site et fiche d’établissement concordent" },
    ],
  };
  return { note: surDix(table[q]), lignes: table[q] };
}

/** La fiabilité affichée : tout ce que la fiche avance, fondement et contact. */
const fiabilite = (c: Cas, q: Qualite, recoupe = false) =>
  surDix([...fondement(c, recoupe).lignes, ...contact(q).lignes]);

// ══ PAS DE PLAFOND : DEUX NOTES INDÉPENDANTES ═══════════════════════════
//
// Olivier, 24/09, après réflexion : « Il faut vraiment faire une distinction grave
// entre le potentiel client et la note de fiabilité. On peut avoir une société à
// très gros potentiel — personnel soumis au soleil, politique RSE, communication —
// et aucune info fiable sur la boîte. À nous de la démarcher. Mais elle a un gros
// potentiel. »
//
// Un premier barème dégradait la note de potentiel quand la fiabilité était faible.
// C'était mélanger ce qu'il demandait de séparer : un chantier de terrassement de
// huit cents personnes est un gros client, qu'on ait ou non son numéro de standard.
// Lui retirer des points, c'est le faire disparaître du haut de la liste — donc ne
// jamais aller le démarcher.
//
// Les deux notes restent donc pures, et c'est la CONSIGNE qui porte la nuance :
// « À approfondir » dit exactement « gros potentiel, rien de vérifié, allez-y ».
const noteRetenue = (pot: number, _fond: number) => pot;

// ══ LA CONSIGNE ═════════════════════════════════════════════════════════
//
// « Ou alors on met pas une note mais on met client à voir, client à approfondir. »
//
// Pas une moyenne : les deux notes ne se compensent pas, et une moyenne les
// compenserait. Le croisement donne mieux — ce qu'il faut FAIRE. Sans contact on ne
// peut pas appeler, quel que soit le potentiel : ce n'est pas une raison d'écarter
// l'entreprise, c'en est une d'aller chercher son DRH.
// Les seuils dépendent de CE QUI A PU ÊTRE ÉVALUÉ. Une fiche brute ne dispose que
// des cinq critères du registre : trente sur cinquante y est une excellente note, et
// la juger sur cent reviendrait à écarter les meilleures cibles avant de les avoir
// regardées. Une fois les dix critères renseignés, les seuils d'Olivier s'appliquent :
// quatre-vingts et huit de fiabilité font un vrai client.
function consigne(pot: number, cont: number, approfondie: boolean): string {
  if (approfondie) {
    if (cont >= 7 && pot >= 80) return "À appeler";
    if (cont >= 7 && pot >= 50) return "À garder au chaud";
    if (pot >= 50) return "À approfondir";
    return "Sans suite";
  }
  // Sur cinquante possibles : la moitié haute mérite qu'on aille voir.
  if (pot >= 25) return "À approfondir";
  if (pot >= 15) return "À approfondir si le temps";
  return "Sans suite";
}

// ══ LE TABLEAU ══════════════════════════════════════════════════════════
function histogramme(titre: string, valeurs: number[], max: number, pas: number) {
  console.log(`\n${titre}`);
  const paliers: { de: number; a: number; n: number }[] = [];
  for (let d = 0; d <= max; d += pas) paliers.push({ de: d, a: Math.min(d + pas - 1, max), n: 0 });
  for (const v of valeurs) {
    const p = paliers.find((x) => v >= x.de && v <= x.a);
    if (p) p.n++;
  }
  const large = Math.max(...paliers.map((p) => p.n), 1);
  for (const p of paliers) {
    if (p.n === 0) continue;
    console.log(`  ${(pas === 1 ? `${p.de}` : `${p.de}–${p.a}`).padStart(6)}  ${String(p.n).padStart(3)}  ${"█".repeat(Math.round((p.n / large) * 44))}`);
  }
}

const cas = charger();
const pots = cas.map(potentiel);
const fonds = cas.map((c) => fondement(c).note);

console.log(`Lu dans ${ICI}`);
console.log(`${cas.length} entreprises réelles · ${[...new Set(cas.map((c) => c.jeu))].join(", ")}`);

histogramme("POTENTIEL DES FICHES BRUTES (sur 50 possibles : 5 critères du registre)", pots, 50, 5);
histogramme("FONDEMENT SUR 10 — ce qui plafonne la note", fonds, 10, 1);

console.log("\nLE CAS QUE VOUS DÉCRIVEZ — routes et bitume, aucun contact :");
const routes = cas
  .map((c, i) => ({ c, pot: pots[i], f: fonds[i] }))
  .filter((b) => /^4[23]\./.test(b.c.naf ?? ""))
  .sort((a, b) => b.pot - a.pot)
  .slice(0, 6);
for (const r of routes) {
  const bande = r.c.bandeDuSite && r.c.bandeDuSite !== "NN" ? r.c.bandeDuSite : r.c.bandeEntreprise;
  console.log(
    `  ${r.c.nom.slice(0, 26).padEnd(26)} ${effectifClair(bande).padEnd(14)} potentiel ${String(r.pot).padStart(3)} · fiabilité ${fiabilite(r.c, "aucun")}/10 · « ${consigne(r.pot, 0, false)} »`,
  );
}

console.log("\nLA TROISIÈME COLONNE — ce qu'il faut faire :");
const compter = (q: Qualite, gagne: number) => {
  const m = new Map<string, number>();
  cas.forEach((c, i) => {
    const fond = fondement(c, q === "complet").note;
    const k = consigne(Math.min(100, pots[i] + gagne), contact(q).note, q !== "aucun");
    m.set(k, (m.get(k) ?? 0) + 1);
  });
  return [...m].sort((a, b) => b[1] - a[1]);
};
console.log("  fiches brutes (aucune approfondie) :");
for (const [k, n] of compter("aucun", 0)) console.log(`    ${k.padEnd(26)} ${String(n).padStart(3)} / ${cas.length}`);
console.log("\n  si on les approfondissait toutes :");
for (const [q, g] of [["pauvre", 5], ["moyen", 25], ["complet", 45]] as [Qualite, number][])
  console.log(`    ${q.padEnd(8)} ` + compter(q, g).map(([k, n]) => `${k} ${n}`).join(" · "));

// La preuve, sur de vraies entreprises : fondement élevé, potentiel nul.
console.log("\nSOCIÉTÉS PARFAITEMENT VÉRIFIÉES MAIS SANS INTÉRÊT POUR AVISDOC :");
const nulles = cas
  .map((c, i) => ({ c, pot: pots[i], f: fondement(c, true).note }))
  .filter((b) => b.pot <= 5)
  .sort((a, b) => b.f - a.f)
  .slice(0, 6);
for (const n of nulles)
  console.log(
    `  ${n.c.nom.slice(0, 30).padEnd(30)} potentiel ${String(n.pot).padStart(3)}/100 · fiabilité ${fiabilite(n.c, "complet", true)}/10 · « ${consigne(n.pot, 10, true)} »`,

  );
console.log(`  → ${cas.filter((_, i) => pots[i] <= 5).length} entreprises à potentiel quasi nul sur ${cas.length} : leur potentiel reste au ras du sol, même vérifiées dix sur dix.`);

console.log("\nLES DIX MEILLEURES FICHES BRUTES :");
const top = cas.map((c, i) => ({ c, pot: pots[i], f: fonds[i] })).sort((a, b) => noteRetenue(b.pot, b.f) - noteRetenue(a.pot, a.f)).slice(0, 10);
for (const t of top) {
  const bande = t.c.bandeDuSite && t.c.bandeDuSite !== "NN" ? t.c.bandeDuSite : t.c.bandeEntreprise;
  console.log(
    `  ${t.c.nom.slice(0, 26).padEnd(26)} potentiel ${String(t.pot).padStart(3)}/100 · fiabilité ${fiabilite(t.c, "aucun")}/10 · ` +
      `${effectifClair(bande).padEnd(14)} « ${consigne(t.pot, 0, false)} »`,
  );
}
