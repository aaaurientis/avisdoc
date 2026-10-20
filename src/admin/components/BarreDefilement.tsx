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
    // Celle qu'on fait défiler mène, l'autre suit — et l'on ignore l'écho que la suiveuse
    // renvoie. Sans ce verrou, les deux se renvoyaient leur position (arrondis au demi-
    // pixel) et le tableau tremblait (Olivier, 20/10).
    let meneuse: "barre" | "zone" | null = null;
    let relache = 0;
    const accompagner = (de: "barre" | "zone") => {
      if (meneuse && meneuse !== de) return;
      meneuse = de;
      if (de === "barre") zone.scrollLeft = b.scrollLeft;
      else b.scrollLeft = zone.scrollLeft;
      cancelAnimationFrame(relache);
      relache = requestAnimationFrame(() => requestAnimationFrame(() => (meneuse = null)));
    };
    const depuisBarre = () => accompagner("barre");
    const depuisZone = () => accompagner("zone");

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
      cancelAnimationFrame(relache);
      b.removeEventListener("scroll", depuisBarre);
      zone.removeEventListener("scroll", depuisZone);
    };
  }, [cible]);

  return (
    <div
      ref={barre}
      aria-hidden
      className={utile ? "ad-barre-defilement sticky top-0 z-10 mb-2 overflow-x-auto overflow-y-hidden overscroll-x-contain bg-background" : "hidden"}
    >
      <div style={{ width: largeur, height: 1 }} />
    </div>
  );
}
