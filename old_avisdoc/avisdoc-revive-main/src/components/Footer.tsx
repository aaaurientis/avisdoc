import { Link } from "react-router-dom";
import { Linkedin, Mail, MapPin, Phone } from "lucide-react";
import AvisdocLogo from "./AvisdocLogo";

const Footer = () => {
  const legalLinks = [
    { label: "CGU", href: "/cgu", internal: true },
    { label: "Politique de confidentialité", href: "/politique-de-confidentialite", internal: true },
    { label: "Mentions légales", href: "/mentions-legales", internal: true },
    { label: "Suppression des données", href: "/suppression-donnees", internal: true },
  ];

  const navLinks = [
    { label: "Pourquoi AvisDoc ?", href: "#pourquoi" },
    { label: "Entreprises", href: "#entreprises" },
    { label: "Collectivités", href: "#collectivites" },
    { label: "Professionnels de santé", href: "#medecins" },
    { label: "Qui sommes-nous ?", href: "#equipe" },
  ];

  return (
    <footer className="bg-foreground text-primary-foreground">
      <div className="section-container section-padding">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="bg-background rounded-lg p-3 inline-block mb-6">
              <AvisdocLogo className="h-10 w-auto" />
            </div>
            <p className="text-primary-foreground/70 text-sm leading-relaxed mb-6">
              Le spécialiste de la dermatologie en téléexpertise. Créée par des dermatologues en 2022.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://www.linkedin.com/company/avisdoc/"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 bg-primary-foreground/10 rounded-lg hover:bg-primary-foreground/20 transition-colors"
                aria-label="LinkedIn"
              >
                <Linkedin className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Navigation */}
          <div>
            <h3 className="font-display font-semibold text-lg mb-6">Navigation</h3>
            <ul className="space-y-3">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-display font-semibold text-lg mb-6">Informations légales</h3>
            <ul className="space-y-3">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  {'internal' in link && link.internal ? (
                    <Link
                      to={link.href}
                      className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm"
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm"
                    >
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-display font-semibold text-lg mb-6">Contact</h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-secondary flex-shrink-0 mt-0.5" />
                <span className="text-primary-foreground/70 text-sm">
                  11, Chaussée de la Muette<br />75016 Paris
                </span>
              </li>
              <li>
                <a
                  href="mailto:contact@avisdoc.fr"
                  className="flex items-center gap-3 text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm"
                >
                  <Mail className="h-5 w-5 text-secondary flex-shrink-0" />
                  contact@avisdoc.fr
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-16 pt-8 border-t border-primary-foreground/10">
          <p className="text-center text-primary-foreground/50 text-sm">
            © {new Date().getFullYear()} AvisDoc. Tous droits réservés.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
