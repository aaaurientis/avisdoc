import { Link } from "react-router-dom";
import { Linkedin, Mail, MapPin } from "lucide-react";
import AvisdocLogo from "./AvisdocLogo";

const Footer = () => {
  const legalLinks = [
    { label: "CGU", to: "/cgu" },
    { label: "Politique de confidentialité", to: "/politique-de-confidentialite" },
    { label: "Mentions légales", to: "/mentions-legales" },
    { label: "Suppression des données", to: "/suppression-donnees" },
  ];

  const solutions = [
    { label: "Entreprises", to: "/entreprises" },
    { label: "Collectivités", to: "/collectivites" },
    { label: "Professionnels de santé", to: "/professionnels" },
  ];

  const company = [
    { label: "À propos", to: "/a-propos" },
    { label: "Contact", to: "/contact" },
    { label: "FAQ", to: "/#faq" },
  ];

  return (
    <footer className="relative overflow-hidden bg-avisdoc-ink text-white">
      <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-primary/25 blur-[140px]" />
      <div aria-hidden className="pointer-events-none absolute bottom-0 right-0 w-[360px] h-[360px] rounded-full bg-avisdoc-coral/20 blur-[140px]" />

      <div className="relative section-container pt-20 pb-10">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-12 gap-10 md:gap-12 mb-16">
          <div className="col-span-2 lg:col-span-4">
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

          <div className="lg:col-span-2">
            <h3 className="font-display text-sm font-semibold mb-5 text-white uppercase tracking-wider">
              Solutions
            </h3>
            <ul className="space-y-3">
              {solutions.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-white/70 hover:text-white transition-colors text-sm">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h3 className="font-display text-sm font-semibold mb-5 text-white uppercase tracking-wider">
              Entreprise
            </h3>
            <ul className="space-y-3">
              {company.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-white/70 hover:text-white transition-colors text-sm">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h3 className="font-display text-sm font-semibold mb-5 text-white uppercase tracking-wider">
              Légal
            </h3>
            <ul className="space-y-3">
              {legalLinks.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-white/70 hover:text-white transition-colors text-sm">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="col-span-2 lg:col-span-2">
            <h3 className="font-display text-sm font-semibold mb-5 text-white uppercase tracking-wider">
              Contact
            </h3>
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
          <p className="text-white/40 text-xs italic">La dermatologie n'attend pas.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
