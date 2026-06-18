import { useEffect, useState } from "react";

/**
 * Renvoie l'id de la section actuellement visible la plus haute dans le viewport.
 * Si aucune section observée n'est visible, renvoie null.
 *
 * Usage : surveille les sections de la home et met à jour le lien actif de la nav.
 */
export function useActiveSection(ids: string[], rootMarginTop = "-30%") {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActive(visible[0].target.id);
        }
      },
      { rootMargin: `${rootMarginTop} 0px -50% 0px`, threshold: 0 }
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [ids, rootMarginTop]);

  return active;
}
