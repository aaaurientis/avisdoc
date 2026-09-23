// Où l'on arrive en ouvrant le Hub depuis un téléphone.
//
// Un commercial sort d'un rendez-vous et veut raconter avant d'avoir oublié : la
// dictée. Quelqu'un qui consulte veut voir son activité : le tableau de bord. Les
// deux usages sont légitimes, et ce n'est pas à nous de trancher pour tout le monde.
//
// Gardé par navigateur, comme le thème : c'est un réglage d'appareil. Le téléphone
// du commercial ouvre sur la dictée, son ordinateur n'est pas concerné — la question
// ne se pose que sur petit écran.

const CLE = "avisdoc.admin.arrivee-mobile";

export type Arrivee = "dictee" | "dashboard";

/** Par défaut la dictée : c'est ce pour quoi on sort son téléphone. */
export function lireArrivee(): Arrivee {
  try {
    return localStorage.getItem(CLE) === "dashboard" ? "dashboard" : "dictee";
  } catch {
    return "dictee";
  }
}

export function ecrireArrivee(a: Arrivee): void {
  try {
    localStorage.setItem(CLE, a);
  } catch {
    /* stockage indisponible : on garde le comportement par défaut */
  }
}
