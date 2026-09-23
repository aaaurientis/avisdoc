// Un écran qui se tient à jour tout seul.
//
// Un bouton « Actualiser » est l'aveu qu'on n'y arrive pas. On le retire, mais il faut
// alors que l'écran fasse le travail : au retour sur l'onglet, et pendant qu'un travail
// long tourne au loin — une recherche de Merx met deux minutes, on ne va pas demander
// au commercial de cliquer pour voir si elle est finie.

import { useEffect } from "react";

/**
 * Recharge quand la fenêtre redevient visible, et à intervalle régulier tant que
 * `enAttente` est vrai.
 *
 * Le minuteur ne tourne QUE pendant l'attente : une page au repos n'interroge pas la
 * base en boucle pour rien.
 */
export function useActualisation(recharger: () => void, enAttente = false, toutesLesMs = 10_000) {
  // Au retour sur l'onglet : on a pu partir cinq minutes, l'écran ne doit pas mentir.
  useEffect(() => {
    const auRetour = () => {
      if (document.visibilityState === "visible") recharger();
    };
    document.addEventListener("visibilitychange", auRetour);
    window.addEventListener("focus", auRetour);
    return () => {
      document.removeEventListener("visibilitychange", auRetour);
      window.removeEventListener("focus", auRetour);
    };
  }, [recharger]);

  // Pendant qu'un travail tourne : on regarde régulièrement s'il est fini.
  useEffect(() => {
    if (!enAttente) return;
    const minuteur = window.setInterval(() => {
      if (document.visibilityState === "visible") recharger();
    }, toutesLesMs);
    return () => window.clearInterval(minuteur);
  }, [enAttente, recharger, toutesLesMs]);
}
