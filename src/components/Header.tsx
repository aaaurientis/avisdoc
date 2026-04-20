import { useEffect, useState } from "react";
import { Menu, X, LogIn, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import AvisdocLogo from "./AvisdocLogo";

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navItems = [
    { label: "Pourquoi AvisDoc ?", href: "#pourquoi" },
    { label: "Entreprises", href: "#entreprises" },
    { label: "Collectivités", href: "#collectivites" },
    { label: "Professionnels de santé", href: "#medecins" },
    { label: "Qui sommes-nous ?", href: "#equipe" },
    { label: "FAQ", href: "#faq" },
  ];

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
          <a href="#" className="flex-shrink-0 flex items-center gap-2" aria-label="Accueil AvisDoc">
            <AvisdocLogo className="h-9 md:h-11 w-auto" />
          </a>

          <nav className="hidden lg:flex items-center gap-1 rounded-full bg-background/60 border border-border/60 backdrop-blur px-2 py-1.5">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-[13px] font-medium text-foreground/70 hover:text-primary px-3 py-1.5 rounded-full hover:bg-primary/10 transition-colors"
              >
                {item.label}
              </a>
            ))}
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
            aria-label="Ouvrir le menu"
            aria-expanded={isMenuOpen}
          >
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {isMenuOpen && (
        <div className="lg:hidden bg-background/95 backdrop-blur-xl border-b border-border animate-fade-in">
          <div className="section-container py-5">
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="text-base font-medium text-foreground/80 hover:text-primary px-3 py-3 rounded-xl hover:bg-primary/10 transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.label}
                </a>
              ))}
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
      )}
    </header>
  );
};

export default Header;
