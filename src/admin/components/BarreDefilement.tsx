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

    const mesurer = () => {
      setLargeur(zone.scrollWidth);
      setUtile(zone.scrollWidth > zone.clientWidth + 1);
      b.scrollLeft = zone.scrollLeft;
    };
    // Égalité vérifiée de part et d'autre : sans elle, chaque barre relancerait l'autre.
    const depuisBarre = () => {
      if (zone.scrollLeft !== b.scrollLeft) zone.scrollLeft = b.scrollLeft;
    };
    const depuisZone = () => {
      if (b.scrollLeft !== zone.scrollLeft) b.scrollLeft = zone.scrollLeft;
    };

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
      b.removeEventListener("scroll", depuisBarre);
      zone.removeEventListener("scroll", depuisZone);
    };
  }, [cible]);

  return (
    <div
      ref={barre}
      aria-hidden
      className={utile ? "ad-barre-defilement sticky top-0 z-10 mb-2 overflow-x-auto overflow-y-hidden bg-background" : "hidden"}
    >
      <div style={{ width: largeur, height: 1 }} />
    </div>
  );
}
