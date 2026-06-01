import { Link } from "react-router-dom";
import { Linkedin, Mail, MapPin } from "lucide-react";
import AvisdocLogo from "./AvisdocLogo";

const Footer = () => {
  const legalLinks = [
    { label: "CGU", href: "/cgu", internal: true },
    { label: "Politique de confidentialité", href: "/politique-de-confidentialite", internal: true },
    { label: "Mentions légales", href: "/mentions-legales", internal: true },
    { label: "Suppression des données", href: "/suppression-donnees", internal: true },
  ];

  const navLinks = [
    { label: "Pourquoi AvisDoc ?", href: "/#pourquoi" },
    { label: "Entreprises", href: "/#entreprises" },
    { label: "Collectivités", href: "/#collectivites" },
    { label: "Professionnels de santé", href: "/#medecins" },
    { label: "Qui sommes-nous ?", href: "/#equipe" },
  ];

  return (
    <footer className="relative overflow-hidden bg-avisdoc-ink text-white">
      {/* Décor dégradé */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-primary/25 blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 w-[360px] h-[360px] rounded-full bg-avisdoc-coral/20 blur-[140px]"
      />

      <div className="relative section-container pt-20 pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-12 gap-10 md:gap-8 lg:gap-12 mb-16">
          <div className="sm:col-span-2 md:col-span-4 lg:col-span-4">
            <div className="inline-flex items-center justify-center bg-white rounded-2xl p-3 mb-6 shadow-soft">
              <AvisdocLogo className="h-9 w-auto" />
            </div>
            <p className="text-white/70 text-sm leading-relaxed mb-6 max-w-sm">
              Le spécialiste de la dermatologie en téléexpertise. Créée par des dermatologues en 2022.
            </p>
            <div className="flex items-center gap-3">
              <a
                href="https://www.linkedin.com/company/avisdoc/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-primary hover:text-white transition-colors"
                aria-label="LinkedIn AvisDoc"
              >
                <Linkedin className="h-4 w-4" />
              </a>
              <a
                href="mailto:contact@avisdoc.fr"
                className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-primary hover:text-white transition-colors"
                aria-label="Email AvisDoc"
              >
                <Mail className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="md:col-span-1 lg:col-span-3">
            <h3 className="font-display text-lg font-semibold mb-5 text-white">Navigation</h3>
            <ul className="space-y-3">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-white/70 hover:text-white transition-colors text-sm"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-1 lg:col-span-3">
            <h3 className="font-display text-lg font-semibold mb-5 text-white">Informations légales</h3>
            <ul className="space-y-3">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  {link.internal ? (
                    <Link
                      to={link.href}
                      className="text-white/70 hover:text-white transition-colors text-sm"
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/70 hover:text-white transition-colors text-sm"
                    >
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-2 lg:col-span-2">
            <h3 className="font-display text-lg font-semibold mb-5 text-white">Contact</h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3 text-white/70 text-sm leading-relaxed">
                <MapPin className="h-4 w-4 text-avisdoc-coral flex-shrink-0 mt-0.5" />
                <span>
                  11, Chaussée de la Muette
                  <br />
                  75016 Paris
                </span>
              </li>
              <li>
                <a
                  href="mailto:contact@avisdoc.fr"
                  className="flex items-center gap-3 text-white/70 hover:text-white transition-colors text-sm"
                >
                  <Mail className="h-4 w-4 text-avisdoc-coral flex-shrink-0" />
                  contact@avisdoc.fr
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t border-white/10">
          <p className="text-white/50 text-xs">
            © {new Date().getFullYear()} AvisDoc. Tous droits réservés.
          </p>
          <p className="text-white/40 text-xs italic">
            La dermatologie n'attend pas.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
