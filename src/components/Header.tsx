import { useEffect, useState } from "react";
import { Menu, X, LogIn, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import AvisdocLogo from "./AvisdocLogo";
import { useActiveSection } from "@/hooks/use-active-section";

const navItems = [
  { label: "Pourquoi AvisDoc ?", href: "/#pourquoi", id: "pourquoi" },
  { label: "Entreprises", href: "/#entreprises", id: "entreprises" },
  { label: "Collectivités", href: "/#collectivites", id: "collectivites" },
  { label: "Professionnels de santé", href: "/#medecins", id: "medecins" },
  { label: "Qui sommes-nous ?", href: "/#equipe", id: "equipe" },
  { label: "FAQ", href: "/#faq", id: "faq" },
];

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const activeId = useActiveSection(navItems.map((i) => i.id));

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Bloque le scroll du body quand le menu mobile est ouvert
  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMenuOpen]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-border/60 shadow-[0_1px_0_hsl(var(--border)/0.6)]"
          : "bg-transparent"
      }`}
    >
      <div className="section-container">
        <div className="flex items-center justify-between h-16 md:h-20">
          <a href="/" className="flex-shrink-0 flex items-center gap-2" aria-label="Accueil AvisDoc">
            <AvisdocLogo className="h-9 md:h-11 w-auto" />
          </a>

          <nav className="hidden lg:flex items-center gap-1 rounded-full bg-background/60 border border-border/60 backdrop-blur px-2 py-1.5">
            {navItems.map((item) => {
              const isActive = activeId === item.id;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "true" : undefined}
                  className={`text-[13px] font-medium px-3 py-1.5 rounded-full transition-colors ${
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-foreground/70 hover:text-primary hover:bg-primary/10"
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="rounded-full">
              <a href="mailto:contact@avisdoc.fr" className="gap-1.5">
                Contact
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </Button>
            <Button size="sm" asChild className="rounded-full shadow-primary">
              <a
                href="https://app.avisdoc.fr/login/"
                target="_blank"
                rel="noopener noreferrer"
                className="gap-2"
              >
                <LogIn className="h-4 w-4" />
                Connexion
              </a>
            </Button>
          </div>

          <button
            className="lg:hidden p-2 text-foreground rounded-full hover:bg-primary/10 transition-colors"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label={isMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-menu"
          >
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Backdrop derrière le menu mobile */}
      <div
        aria-hidden
        onClick={() => setIsMenuOpen(false)}
        className={`lg:hidden fixed inset-0 top-16 bg-avisdoc-ink/40 backdrop-blur-sm transition-opacity duration-300 ${
          isMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Menu mobile en slide depuis la droite */}
      <div
        id="mobile-menu"
        className={`lg:hidden fixed top-16 right-0 bottom-0 w-[85%] max-w-sm bg-background border-l border-border shadow-floating overflow-y-auto transition-transform duration-300 ease-out ${
          isMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="px-5 py-6">
          <nav className="flex flex-col gap-1" aria-label="Navigation principale">
            {navItems.map((item) => {
              const isActive = activeId === item.id;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "true" : undefined}
                  className={`text-base font-medium px-3 py-3 rounded-xl transition-colors ${
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-foreground/80 hover:text-primary hover:bg-primary/10"
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.label}
                </a>
              );
            })}
            <div className="flex flex-col gap-2 pt-4 mt-2 border-t border-border">
              <Button variant="outline" asChild className="w-full rounded-full">
                <a href="mailto:contact@avisdoc.fr">Nous contacter</a>
              </Button>
              <Button asChild className="w-full rounded-full">
                <a
                  href="https://app.avisdoc.fr/login/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gap-2"
                >
                  <LogIn className="h-4 w-4" />
                  Connexion
                </a>
              </Button>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
