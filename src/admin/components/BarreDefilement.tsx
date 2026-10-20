// Une barre de défilement horizontal EN HAUT d'un grand tableau, sous les filtres.
//
// La barre d'origine est tout en bas : sur un Pipeline très long, il faut descendre
// jusqu'au fond pour aller voir les colonnes de droite. Celle-ci double la vraie : les
// deux bougent ensemble. Elle reste en haut de l'écran quand on descend, et disparaît
// quand tout tient dans la largeur.

import { useEffect, useRef, useState } from "react";

/** `cible` : l'élément qui défile, passé par un ref en état — il peut arriver après le chargement. */
export default function BarreDefilement({ cible }: { cible: HTMLElement | null }) {
  const barre = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(0);
  const [utile, setUtile] = useState(false);

  useEffect(() => {
    const zone = cible;
    const b = barre.current;
    if (!zone || !b) return;

    // La mesure ne touche pas à la position (Codex, 20/10) : elle donne à la barre la
    // MÊME course que le tableau (sa bordure ne compte pas), puis la position se recale
    // une fois la largeur appliquée, et seulement si l'on ne tient pas la barre.
    let surLaBarre = false;
    const mesurer = () => {
      const course = zone.scrollWidth - zone.clientWidth;
      setLargeur(course + (b.clientWidth || zone.clientWidth));
      setUtile(course > 1);
      requestAnimationFrame(() => {
        if (!surLaBarre && Math.abs(b.scrollLeft - zone.scrollLeft) >= 1) b.scrollLeft = zone.scrollLeft;
      });
    };
    // Un seul sens à la fois, décidé par la souris et non par le temps (Olivier, 20/10 :
    // ça tremblait encore). La barre du haut ne commande le tableau QUE lorsqu'on la
    // tient ou qu'on la survole ; le reste du temps elle suit, sans jamais renvoyer de
    // position — il n'y a donc plus d'écho possible entre les deux.
    const entrer = () => (surLaBarre = true);
    const sortir = () => (surLaBarre = false);
    const depuisBarre = () => {
      if (surLaBarre && Math.abs(zone.scrollLeft - b.scrollLeft) >= 1) zone.scrollLeft = b.scrollLeft;
    };
    const depuisZone = () => {
      if (!surLaBarre && Math.abs(b.scrollLeft - zone.scrollLeft) >= 1) b.scrollLeft = zone.scrollLeft;
    };
    b.addEventListener("pointerenter", entrer);
    b.addEventListener("pointerdown", entrer);
    b.addEventListener("pointerleave", sortir);

    // La largeur change quand la fenêtre change, mais aussi quand le contenu change
    // (colonnes ajoutées, filtres) : on observe la zone et ce qu'elle contient.
    const taille = new ResizeObserver(mesurer);
    const suivre = () => {
      taille.disconnect();
      taille.observe(zone);
      for (const enfant of Array.from(zone.children)) taille.observe(enfant);
      mesurer();
    };
    const contenu = new MutationObserver(suivre);
    contenu.observe(zone, { childList: true });
    suivre();

    b.addEventListener("scroll", depuisBarre, { passive: true });
    zone.addEventListener("scroll", depuisZone, { passive: true });
    return () => {
      taille.disconnect();
      contenu.disconnect();
      b.removeEventListener("pointerenter", entrer);
      b.removeEventListener("pointerdown", entrer);
      b.removeEventListener("pointerleave", sortir);
      b.removeEventListener("scroll", depuisBarre);
      zone.removeEventListener("scroll", depuisZone);
    };
  }, [cible]);

  return (
    <div
      ref={barre}
      aria-hidden
      className={utile ? "ad-barre-defilement sticky top-0 z-10 mb-2 overflow-x-auto overflow-y-hidden overscroll-x-none bg-background" : "hidden"}
    >
      <div style={{ width: largeur, height: 1 }} />
    </div>
  );
}
