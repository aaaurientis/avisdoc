// L'échéance de la veille : le vendredi à 9 h, heure de Paris (un seul rapport par semaine depuis le 30/10, pour réduire les frais).
// Un rapport couvre [fin du rapport précédent, 9 h du jour[. La préparation
// commence une heure avant (Perplexity peut chercher un quart d'heure).
//
// L'heure de Paris est calculée par Intl : le passage à l'heure d'hiver ou
// d'été ne décale rien (9 h reste 9 h à Paris, en UTC c'est 7 h ou 8 h).

const JOURS_RAPPORT = new Set([5]); // vendredi
export const HEURE_ENVOI = 9;
export const AVANCE_PREPARATION_MIN = 60;

/** Les composants de l'heure de Paris à cet instant. */
export function paris(d: Date) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short", hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const jours: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { annee: +p.year, mois: +p.month, jour: +p.day, heure: +p.hour, minute: +p.minute, seconde: +p.second, semaine: jours[p.weekday] };
}

/** L'instant UTC qui correspond à cette date et cette heure à Paris. */
export function aParis(annee: number, mois: number, jour: number, heure: number): Date {
  // On part de l'heure lue comme UTC, puis on corrige du décalage de Paris à cet instant (deux fois, pour le jour du changement).
  let t = Date.UTC(annee, mois - 1, jour, heure);
  for (let i = 0; i < 2; i++) {
    const p = paris(new Date(t));
    const lu = Date.UTC(p.annee, p.mois - 1, p.jour, p.heure, p.minute, p.seconde);
    t += Date.UTC(annee, mois - 1, jour, heure) - lu;
  }
  return new Date(t);
}

/** La dernière échéance passée ou en préparation à cet instant (9 h un vendredi). */
export function echeanceCourante(maintenant: Date): Date {
  const visee = new Date(maintenant.getTime() + AVANCE_PREPARATION_MIN * 60_000);
  for (let recul = 0; recul < 8; recul++) {
    const jour = new Date(visee.getTime() - recul * 86_400_000);
    const p = paris(jour);
    if (!JOURS_RAPPORT.has(p.semaine)) continue;
    const e = aParis(p.annee, p.mois, p.jour, HEURE_ENVOI);
    if (e.getTime() <= visee.getTime()) return e;
  }
  throw new Error("Aucune échéance trouvée sur huit jours.");
}

/** L'échéance qui précède celle-ci (pour le tout premier rapport, qui n'a pas de prédécesseur). */
export function echeancePrecedente(e: Date): Date {
  return echeanceCourante(new Date(e.getTime() - AVANCE_PREPARATION_MIN * 60_000 - 60_000));
}

/** « lundi 19 octobre » */
export const jourEnClair = (d: Date) =>
  d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });

/** « vendredi 16 octobre, 9 h » */
export const momentEnClair = (d: Date) => {
  const p = paris(d);
  return `${jourEnClair(d)}, ${p.heure} h${p.minute ? String(p.minute).padStart(2, "0") : ""}`;
};

/** La tournée quotidienne : chaque jour à 7 h, heure de Paris. Rend le dernier créneau atteint. */
export const HEURE_QUOTIDIENNE = 7;
export function creneauQuotidien(maintenant: Date): Date {
  const p = paris(maintenant);
  const aujourdhui = aParis(p.annee, p.mois, p.jour, HEURE_QUOTIDIENNE);
  if (aujourdhui.getTime() <= maintenant.getTime()) return aujourdhui;
  // « Hier » se calcule sur la date (midi UTC du jour d'avant), pas en retirant 24 h : un jour de changement d'heure n'en compte pas 24.
  const hier = paris(new Date(Date.UTC(p.annee, p.mois - 1, p.jour - 1, 12)));
  return aParis(hier.annee, hier.mois, hier.jour, HEURE_QUOTIDIENNE);
}

/** La tournée légère : toutes les 3 heures (0 h, 3 h, 6 h… 21 h, heure de Paris). Rend le dernier créneau atteint. */
export function creneauLeger(maintenant: Date): Date {
  const p = paris(maintenant);
  return aParis(p.annee, p.mois, p.jour, Math.floor(p.heure / 3) * 3);
}

/** Le premier jour du mois, à minuit heure de Paris : sert au compteur mensuel de Linkup. */
export function debutDuMois(maintenant: Date): Date {
  const p = paris(maintenant);
  return aParis(p.annee, p.mois, 1, 0);
}
