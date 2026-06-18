import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * Bouton flottant « retour en haut » : apparaît après 500 px de scroll,
 * disparaît en haut de page. Position fixed bottom-right, respecte
 * prefers-reduced-motion.
 */
const ScrollToTop = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 500);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleClick = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Retour en haut de page"
      tabIndex={visible ? 0 : -1}
      className={`fixed bottom-5 right-5 md:bottom-8 md:right-8 z-40 h-11 w-11 md:h-12 md:w-12 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-primary transition-all duration-300 hover:scale-110 ${
        visible ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-3 pointer-events-none"
      }`}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
};

export default ScrollToTop;
