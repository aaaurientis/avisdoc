import { useState } from "react";
import { Menu, X, Mail, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import AvisdocLogo from "./AvisdocLogo";

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navItems = [
    { label: "Pourquoi AvisDoc ?", href: "#pourquoi" },
    { label: "Entreprises", href: "#entreprises" },
    { label: "Collectivités", href: "#collectivites" },
    { label: "Professionnels de santé", href: "#medecins" },
    { label: "Qui sommes-nous ?", href: "#equipe" },
    { label: "FAQ", href: "#faq" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="section-container">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <a href="#" className="flex-shrink-0">
            <AvisdocLogo className="h-10 md:h-12 w-auto" />
          </a>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-8">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* CTA Buttons */}
          <div className="hidden md:flex items-center gap-3">
            <Button variant="outline" size="sm" asChild>
              <a href="mailto:contact@avisdoc.fr" className="gap-2">
                <Mail className="h-4 w-4" />
                Contact
              </a>
            </Button>
            <Button size="sm" asChild>
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

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-2 text-foreground"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="lg:hidden bg-background border-b border-border animate-fade-in">
          <div className="section-container py-4">
            <nav className="flex flex-col space-y-4">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="text-base font-medium text-muted-foreground hover:text-primary transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <div className="flex flex-col gap-3 pt-4 border-t border-border">
                <Button variant="outline" asChild className="w-full">
                  <a href="mailto:contact@avisdoc.fr" className="gap-2">
                    <Mail className="h-4 w-4" />
                    Nous contacter
                  </a>
                </Button>
                <Button asChild className="w-full">
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
