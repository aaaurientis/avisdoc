// Analyse d'une fiche Doctolib relevée par un opérateur (favori « Relever sur
// Doctolib ») : logique PURE, testée. Le Hub ne parcourt jamais Doctolib : c'est
// l'opérateur qui ouvre la fiche et clique ; seul le texte de CETTE page arrive ici.
//
// L'analyse lit le texte visible par rubriques (« Expertises, actes et symptômes »,
// « Tarifs », « Langues parlées »…). Elle est tolérante, et tout passe par un écran
// de vérification avant enregistrement : un intitulé changé par Doctolib donne un
// champ vide, jamais une valeur inventée.

import type { TypeSignal } from "./reseau-signaux.ts";

export interface SignalPropose {
  type: TypeSignal;
  valeur: string;
  /** Le passage de la page qui le justifie (affiché à l'opérateur, non conservé). */
  extrait: string;
}

export interface FicheDoctolib {
  nom: string | null;
  specialite: string | null;
  expertises: string[];
  langues: string[];
  tarifs: string[];
  /** « Conventionné secteur 1 », « Conventionné secteur 2 », « Non conventionné »… */
  conventionnement: string | null;
  carteVitale: boolean | null;
  teleconsultation: boolean | null;
  presentation: string | null;
  /** false : fiche « … n'est pas sur Doctolib » / « pas réservable en ligne ». */
  reservable: boolean | null;
  /** Adresses relevées sur la fiche. */
  adresses: string[];
  nouveauxPatients: { valeur: "oui" | "non"; extrait: string } | null;
  premierCreneau: { date: string | null; jours: number | null; valeur: "moins_7j" | "7_30j" | "plus_30j" | "aucun_nouveau"; extrait: string } | null;
  signaux: SignalPropose[];
}

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

/** Intitulés de rubriques connus (formes normalisées), et la clé à laquelle ils mènent. */
const RUBRIQUES: [RegExp, string][] = [
  [/^expertises?(, actes)?( et symptomes)?$|^actes et expertises$|^expertises et actes$/, "expertises"],
  [/^presentation$|^a propos$/, "presentation"],
  [/^langues? parlees?$|^langues$/, "langues"],
  [/^tarifs?( et remboursements?)?$|^honoraires$/, "tarifs"],
  [/^moyens de paiement$/, "paiement"],
  [/^informations? d'acces$|^carte et informations d'acces$|^acces$/, "acces"],
  [/^horaires( et coordonnees)?$|^horaires d'ouverture$|^coordonnees$/, "horaires"],
  [/^informations legales$|^site web$|^diplomes( nationaux et universitaires)?$|^formations$|^experience$|^travaux et publications$|^parcours$/, "autre"],
];

function cleRubrique(ligne: string): string | null {
  const n = norm(ligne).replace(/[:.]$/, "");
  if (n.length > 60) return null;
  for (const [rx, cle] of RUBRIQUES) if (rx.test(n)) return cle;
  return null;
}

/** Séparateur entre les états successifs de la page envoyés par le favori (avant / après chaque « Voir plus »). */
export const SEPARATEUR_RELEVE = "§§avisdoc§§";

/** Découpe le texte en rubriques : clé → lignes jusqu'à la rubrique suivante. */
function rubriques(lignes: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let courante: string | null = null;
  for (const l of lignes) {
    if (l === SEPARATEUR_RELEVE) { courante = null; continue; }
    const c = cleRubrique(l);
    if (c) { courante = c; if (!out.has(c)) out.set(c, []); continue; }
    if (courante) out.get(courante)!.push(l);
  }
  return out;
}

const MOIS: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
  janv: 1, fevr: 2, fev: 2, avr: 4, juil: 7, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** « Prochain RDV le jeudi 20 novembre » → date ISO, l'année étant déduite d'aujourd'hui. */
export function dateProchainRdv(texte: string, aujourdhui: Date): string | null {
  const m = norm(texte).match(/(\d{1,2})(?:er)? (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|janv|fevr|fev|avr|juil|sept|oct|nov|dec)\.?(?: (\d{4}))?/);
  if (!m) return null;
  const jour = Number(m[1]);
  const mois = MOIS[m[2]];
  let annee = m[3] ? Number(m[3]) : aujourdhui.getFullYear();
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  const auj = Date.UTC(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate());
  if (!m[3] && d.getTime() < auj - 86_400_000) annee++; // « 3 janvier » vu en décembre
  return new Date(Date.UTC(annee, mois - 1, jour)).toISOString().slice(0, 10);
}

function compartiment(jours: number): "moins_7j" | "7_30j" | "plus_30j" {
  return jours < 7 ? "moins_7j" : jours <= 30 ? "7_30j" : "plus_30j";
}

/** Liste propre : lignes courtes, sans doublon, sans les boutons de l'interface. */
function liste(lignes: string[] | undefined, max = 40): string[] {
  const bruit = /^(voir plus|voir moins|afficher plus|afficher moins|prendre rendez-vous|en savoir plus|lire la suite|consignes|\+ ?\d+)$|^(voir plus|afficher plus) d/;
  return [...new Set((lignes ?? []).map((l) => l.replace(/\s+\+\s?\d+$/, "").trim()).filter((l) => l && l.length <= 120 && !bruit.test(norm(l))))].slice(0, max);
}

const MOTS_SIGNAUX: { type: TypeSignal; valeur: string; rx: RegExp }[] = [
  { type: "dermoscopie", valeur: "oui", rx: /dermoscop|dermatoscop|cartographie|videodermoscop|suivi des grains de beaute|naevus|nevus/ },
  { type: "motif_exerese", valeur: "oui", rx: /exerese|ablation (de |d'un |des )?(grain|lesion|kyste|naevus|nevus|tumeur)|lesion suspecte|depistage (du |des )?cancers? (de la peau|cutanes?)|melanome|carcinome|biopsie/ },
  { type: "chirurgie_sur_place", valeur: "oui", rx: /chirurgie (dermatologique|cutanee)|petite chirurgie|chirurgie des tumeurs cutanees/ },
];

export function analyserFicheDoctolib(texte: string, aujourdhui: Date = new Date()): FicheDoctolib {
  const lignes = texte.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const r = rubriques(lignes);
  // Le reste de l'analyse ignore les séparateurs.
  lignes.splice(0, lignes.length, ...lignes.filter((l) => l !== SEPARATEUR_RELEVE));
  const tout = norm(texte);
  const fiche: FicheDoctolib = {
    nom: lignes.find((l) => /^(dr|docteur|pr|professeur)\.? /i.test(l) && l.length < 80) ?? null,
    specialite: null,
    expertises: liste(r.get("expertises")),
    langues: liste(r.get("langues"), 15).flatMap((l) => l.split(/,| et /).map((x) => x.trim())).filter((x) => x && x.length < 30),
    tarifs: liste(r.get("tarifs"), 20).filter((l) => /€|eur|tarif|consultation|secteur|conventionn|tiers payant|carte vitale|remboursement/i.test(l)),
    conventionnement: null,
    carteVitale: null,
    teleconsultation: null,
    presentation: null,
    reservable: null,
    adresses: [...new Set(lignes.filter((l) => /\b\d{5}\b/.test(l) && l.length < 120 && /(rue|avenue|bd|boulevard|place|chemin|allee|route|quai|cours|impasse)\b/i.test(norm(l))))].slice(0, 5),
    nouveauxPatients: null,
    premierCreneau: null,
    signaux: [],
  };
  // Fiche « fantôme » : le praticien a une page, mais ne prend pas de rendez-vous en ligne.
  if (/n'est pas sur doctolib|n'est pas reservable en ligne|pas reservable en ligne sur doctolib/.test(tout)) fiche.reservable = false;
  else if (/prendre rendez-vous|prochain (rdv|rendez-vous)|choisissez (votre|un) motif/.test(tout)) fiche.reservable = true;
  if (fiche.nom) {
    const i = lignes.indexOf(fiche.nom);
    fiche.nom = fiche.nom.replace(/\s+n'est pas sur Doctolib\s*$/i, "").trim();
    const suivante = lignes[i + 1];
    if (suivante && suivante.length < 60 && !/\d/.test(suivante)) fiche.specialite = suivante;
  }
  // Les « Voir plus » ouverts par le favori répètent des passages : sans doublon.
  const lignesPres = [...new Set(r.get("presentation") ?? [])].filter((l) => !/^(voir plus|voir moins|lire la suite|afficher plus)$/.test(norm(l)));
  // Un passage tronqué (« Le docteur… ») est remplacé par sa version dépliée.
  const presentation = lignesPres.filter((l) => {
    const debut = l.replace(/(…|\.\.\.)\s*$/, "");
    return debut === l || !lignesPres.some((x) => x !== l && x.startsWith(debut));
  }).join(" ").trim();
  if (presentation) fiche.presentation = presentation.slice(0, 1500);

  // Conventionnement et carte Vitale (n'importe où sur la page).
  const conv = lignes.find((l) => /conventionn|secteur [123]\b|optam/i.test(l) && l.length < 120);
  if (conv) fiche.conventionnement = conv;
  if (/carte vitale (non )?acceptee|n'accepte pas la carte vitale/.test(tout)) fiche.carteVitale = !/carte vitale non acceptee|n'accepte pas la carte vitale/.test(tout);
  if (/(consultation|rdv|rendez-vous) (en |par )?(video|teleconsultation)|teleconsultation (disponible|possible)|consultation video disponible/.test(tout)) fiche.teleconsultation = true;

  // Nouveaux patients.
  const nonNouveaux = lignes.find((l) => /(reserve|reservee|limite|limitee|uniquement|seulement)[^.]{0,80}(patients? (deja|connus|suivis)|patienteles? existante)|n'accepte pas de nouveaux patients|ne prend (pas|plus) de nouveaux patients/i.test(norm(l)));
  const ouiNouveaux = lignes.find((l) => /accepte (les )?nouveaux patients|nouveaux patients (acceptes|bienvenus)|ouvert aux nouveaux patients/i.test(norm(l)));
  if (nonNouveaux) fiche.nouveauxPatients = { valeur: "non", extrait: nonNouveaux };
  else if (ouiNouveaux) fiche.nouveauxPatients = { valeur: "oui", extrait: ouiNouveaux };

  // Premier créneau.
  const rdv = lignes.find((l) => /prochain (rdv|rendez-vous|creneau)|premiere disponibilite|disponible (des |a partir )?(le )?\d/i.test(norm(l)));
  const aucun = lignes.find((l) => /aucune disponibilite|pas de disponibilite|aucun (rendez-vous|creneau) disponible|pas de rendez-vous disponible/i.test(norm(l)));
  if (rdv) {
    const date = dateProchainRdv(rdv, aujourdhui);
    const jours = date ? Math.round((Date.parse(date) - Date.UTC(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate())) / 86_400_000) : null;
    if (jours !== null && jours >= 0) fiche.premierCreneau = { date, jours, valeur: compartiment(jours), extrait: rdv };
  } else if (aucun) {
    fiche.premierCreneau = { date: null, jours: null, valeur: "aucun_nouveau", extrait: aucun };
  }

  // Signaux proposés : toujours avec le passage qui les justifie.
  if (fiche.premierCreneau) fiche.signaux.push({ type: "creneau_doctolib", valeur: fiche.premierCreneau.valeur, extrait: fiche.premierCreneau.extrait });
  if (fiche.nouveauxPatients) fiche.signaux.push({ type: "nouveaux_patients", valeur: fiche.nouveauxPatients.valeur, extrait: fiche.nouveauxPatients.extrait });
  for (const s of MOTS_SIGNAUX) {
    const ex = fiche.expertises.find((e) => s.rx.test(norm(e)));
    if (ex && !fiche.signaux.some((x) => x.type === s.type)) fiche.signaux.push({ type: s.type, valeur: s.valeur, extrait: ex });
  }
  // La téléconsultation reste une information : elle ne vaut pas télé-expertise.
  return fiche;
}

// ── Page de prise de rendez-vous : créneaux affichés ─────────────────────────
// L'opérateur ouvre lui-même « Prendre rendez-vous », choisit le motif, puis clique sur
// le favori. On compte les horaires affichés (« 09:30 ») sous chaque jour (« lun. 17 nov. »).
// L'attribution horaire → jour suit l'ordre du texte : l'écran de vérification montre le
// détail par jour pour que l'opérateur le compare à ce qu'il voit.

export interface Disponibilites {
  /** Horaires affichés au total. */
  creneaux: number;
  /** Détail par jour affiché (date ISO), dans l'ordre de la page. */
  parJour: { date: string; n: number }[];
  /** Premier jour avec au moins un horaire, et son délai en jours. */
  premier: { date: string; jours: number } | null;
  /** Horaires dans les 7 prochains jours. */
  sous7Jours: number;
  valeur: "moins_7j" | "7_30j" | "plus_30j" | "aucun_nouveau" | null;
  extrait: string;
}

/** La page reçue est-elle celle de la prise de rendez-vous (et non la fiche) ? */
export function estPageRendezVous(url: string, texte: string): boolean {
  if (/\/booking(\/|$)/.test(url)) return true;
  const horaires = texte.split(/\r?\n/).filter((l) => /^\s*\d{1,2}[:h]\d{2}\s*$/.test(l)).length;
  return horaires >= 3 && /choisissez|disponibilit|motif|rendez-vous/i.test(texte);
}

/** Lien de la fiche à partir de l'adresse de la page de rendez-vous (…/nom/booking/… → …/nom). */
export function urlFicheDepuisRendezVous(url: string): string {
  const x = new URL(url);
  const chemin = x.pathname.split("/booking")[0].replace(/\/+$/, "");
  return `${x.origin}${chemin}`;
}

// « lun. 17 nov. », « lun. » + « 17 nov. », ou « Mercredi 20 janvier 2027 ».
const JOUR_ENTETE = /^(lun|mar|mer|jeu|ven|sam|dim)[a-z]*\.?\s*(\d{1,2})?\s*([a-zéû]+\.?)?(?:\s+\d{4})?$/i;

export function analyserCreneaux(texte: string, aujourdhui: Date = new Date()): Disponibilites {
  const lignes = texte.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const parJour: { date: string; n: number }[] = [];
  let courant: { date: string; n: number } | null = null;
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    const m = norm(l).match(JOUR_ENTETE);
    if (m) {
      // « lun. » puis « 17 nov. » sur la ligne suivante, ou tout sur une ligne.
      const avecDate = m[2] ? l : `${l} ${lignes[i + 1] ?? ""}`;
      const date = dateProchainRdv(avecDate, aujourdhui);
      if (date) {
        // Un jour déjà vu (le favori envoie la page avant et après « Voir plus ») : on recompte.
        courant = parJour.find((j) => j.date === date) ?? { date, n: 0 };
        if (parJour.includes(courant)) courant.n = 0;
        else parJour.push(courant);
        if (!m[2]) i++;
        continue;
      }
    }
    if (courant && /^\d{1,2}[:h]\d{2}$/.test(l)) courant.n++;
  }
  const auj = Date.UTC(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate());
  const delai = (d: string) => Math.round((Date.parse(d) - auj) / 86_400_000);
  const avec = parJour.filter((j) => j.n > 0).sort((a, b) => a.date.localeCompare(b.date));
  const creneaux = parJour.reduce((t, j) => t + j.n, 0);
  const premier = avec.length ? { date: avec[0].date, jours: Math.max(0, delai(avec[0].date)) } : null;
  // Sans horaire affiché : « Prochain RDV le … » ou « aucune disponibilité » (voir la fiche).
  let valeur: Disponibilites["valeur"] = premier ? compartiment(premier.jours) : null;
  let extrait = premier ? `${creneaux} horaire${creneaux > 1 ? "s" : ""} affiché${creneaux > 1 ? "s" : ""}, le premier le ${premier.date}` : "";
  if (!premier) {
    const prochain = lignes.find((l) => /prochain (rdv|rendez-vous)/i.test(norm(l)));
    const aucun = lignes.find((l) => /aucune disponibilite|pas de disponibilite|aucun (rendez-vous|creneau) disponible/i.test(norm(l)));
    const d = prochain ? dateProchainRdv(prochain, aujourdhui) : null;
    if (d && delai(d) >= 0) { valeur = compartiment(delai(d)); extrait = prochain!; }
    else if (aucun) { valeur = "aucun_nouveau"; extrait = aucun; }
  }
  return {
    creneaux, parJour, premier,
    sous7Jours: parJour.filter((j) => delai(j.date) >= 0 && delai(j.date) < 7).reduce((t, j) => t + j.n, 0),
    valeur, extrait,
  };
}
