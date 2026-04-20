import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Menu, X, LogIn, ArrowUpRight, Building2, Landmark, Stethoscope, Users, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import AvisdocLogo from "./AvisdocLogo";
import ThemeToggle from "./ThemeToggle";

interface MenuChild {
  label: string;
  to: string;
  icon: typeof Building2;
  description: string;
}

interface MenuItem {
  label: string;
  to?: string;
  children?: MenuChild[];
}

const solutions: MenuChild[] = [
  {
    label: "Entreprises",
    to: "/entreprises",
    icon: Building2,
    description: "Dépistage sur site pour vos collaborateurs",
  },
  {
    label: "Collectivités",
    to: "/collectivites",
    icon: Landmark,
    description: "Accès aux soins sur votre territoire",
  },
  {
    label: "Professionnels de santé",
    to: "/professionnels",
    icon: Stethoscope,
    description: "Téléexpertise dermatologique en 96 h",
  },
];

const navItems: MenuItem[] = [
  { label: "Solutions", children: solutions },
  { label: "À propos", to: "/a-propos" },
  { label: "FAQ", to: "/#faq" },
  { label: "Contact", to: "/contact" },
];

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openMega, setOpenMega] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setIsMenuOpen(false);
    setOpenMega(false);
  }, [location.pathname]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-border/60"
          : "bg-transparent"
      }`}
    >
      <div className="section-container">
        <div className="flex items-center justify-between h-16 md:h-20">
          <Link to="/" className="flex-shrink-0 flex items-center gap-2" aria-label="Accueil AvisDoc">
            <AvisdocLogo className="h-9 md:h-11 w-auto" />
          </Link>

          <nav
            className="hidden lg:flex items-center gap-1 rounded-full bg-background/60 border border-border/60 backdrop-blur px-2 py-1.5"
            onMouseLeave={() => setOpenMega(false)}
          >
            {navItems.map((item) =>
              item.children ? (
                <div
                  key={item.label}
                  className="relative"
                  onMouseEnter={() => setOpenMega(true)}
                >
                  <button
                    type="button"
                    onClick={() => setOpenMega((v) => !v)}
                    aria-expanded={openMega}
                    className="text-[13px] font-medium text-foreground/70 hover:text-primary px-3 py-1.5 rounded-full hover:bg-primary/10 transition-colors"
                  >
                    {item.label}
                  </button>

                  {openMega && (
                    <div
                      className="absolute left-1/2 -translate-x-1/2 top-full pt-3 w-[540px]"
                      onMouseLeave={() => setOpenMega(false)}
                    >
                      <div className="rounded-3xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-raised p-3 grid gap-1">
                        {item.children.map((child) => (
                          <Link
                            key={child.to}
                            to={child.to}
                            className="flex items-start gap-3 p-3 rounded-2xl hover:bg-primary/5 transition-colors group"
                          >
                            <span className="h-10 w-10 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                              <child.icon className="h-4 w-4" />
                            </span>
                            <span>
                              <span className="block text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                                {child.label}
                              </span>
                              <span className="block text-xs text-muted-foreground mt-0.5">
                                {child.description}
                              </span>
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to!}
                  className={({ isActive }) =>
                    `text-[13px] font-medium px-3 py-1.5 rounded-full transition-colors ${
                      isActive
                        ? "bg-primary/15 text-primary"
                        : "text-foreground/70 hover:text-primary hover:bg-primary/10"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              )
            )}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" asChild className="rounded-full">
              <Link to="/contact" className="gap-1.5">
                Contact
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="sm" asChild className="rounded-full shadow-primary">
              <a href="https://app.avisdoc.fr/login/" target="_blank" rel="noopener noreferrer" className="gap-2">
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
        <div className="lg:hidden bg-background/95 backdrop-blur-xl border-b border-border animate-fade-in max-h-[80vh] overflow-y-auto">
          <div className="section-container py-5">
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2 px-3">
                  <Sparkles className="h-3 w-3" />
                  Solutions
                </p>
                <div className="space-y-1">
                  {solutions.map((c) => (
                    <Link
                      key={c.to}
                      to={c.to}
                      className="flex items-start gap-3 p-3 rounded-2xl hover:bg-primary/5 transition-colors"
                    >
                      <span className="h-9 w-9 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                        <c.icon className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-foreground">{c.label}</span>
                        <span className="block text-xs text-muted-foreground">{c.description}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2 px-3">
                  <Users className="h-3 w-3" />
                  Entreprise
                </p>
                <div className="space-y-1">
                  <Link to="/a-propos" className="block px-3 py-2.5 rounded-xl text-sm font-medium text-foreground/80 hover:text-primary hover:bg-primary/5">
                    À propos
                  </Link>
                  <a href="/#faq" className="block px-3 py-2.5 rounded-xl text-sm font-medium text-foreground/80 hover:text-primary hover:bg-primary/5">
                    FAQ
                  </a>
                  <Link to="/contact" className="block px-3 py-2.5 rounded-xl text-sm font-medium text-foreground/80 hover:text-primary hover:bg-primary/5">
                    Contact
                  </Link>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-4 border-t border-border">
                <div className="flex items-center justify-between px-3 pb-2">
                  <span className="text-xs text-muted-foreground">Thème</span>
                  <ThemeToggle />
                </div>
                <Button variant="outline" asChild className="w-full rounded-full">
                  <Link to="/contact">Nous contacter</Link>
                </Button>
                <Button asChild className="w-full rounded-full">
                  <a href="https://app.avisdoc.fr/login/" target="_blank" rel="noopener noreferrer" className="gap-2">
                    <LogIn className="h-4 w-4" />
                    Connexion
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
