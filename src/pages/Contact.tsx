import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import ContactForm from "@/components/ContactForm";
import SEO from "@/components/SEO";
import { Mail, MapPin, Linkedin, Phone } from "lucide-react";

const Contact = () => {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Contact · AvisDoc"
        description="Contacter AvisDoc pour un programme de dépistage dermatologique, un partenariat territorial ou rejoindre notre réseau de professionnels de santé."
        canonical="/contact"
      />
      <Header />
      <main id="main-content">
        <PageHero
          eyebrow="Contact"
          breadcrumbs={[{ label: "Accueil", to: "/" }, { label: "Contact" }]}
          title={
            <>
              Parlons de vos <span className="italic text-primary">enjeux santé.</span>
            </>
          }
          subtitle="Entreprise, collectivité, professionnel de santé ? Écrivez-nous : un membre de l'équipe AvisDoc vous recontacte rapidement pour discuter de votre projet."
        />

        <section className="section-padding pt-0">
          <div className="section-container">
            <div className="grid lg:grid-cols-3 gap-10">
              <aside className="lg:col-span-1 space-y-6">
                <div className="bg-card border border-border/60 rounded-3xl p-6 shadow-soft">
                  <h2 className="font-display text-lg font-semibold text-foreground mb-4">
                    Nous joindre directement
                  </h2>
                  <ul className="space-y-4 text-sm">
                    <li className="flex items-start gap-3">
                      <Mail className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <a href="mailto:contact@avisdoc.fr" className="text-foreground hover:text-primary transition-colors">
                        contact@avisdoc.fr
                      </a>
                    </li>
                    <li className="flex items-start gap-3">
                      <Phone className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <a href="tel:+33673995927" className="text-foreground hover:text-primary transition-colors">
                        06 73 99 59 27
                      </a>
                    </li>
                    <li className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground leading-relaxed">
                        11, Chaussée de la Muette
                        <br />
                        75016 Paris
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Linkedin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <a
                        href="https://www.linkedin.com/company/avisdoc/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-foreground hover:text-primary transition-colors"
                      >
                        LinkedIn AvisDoc
                      </a>
                    </li>
                  </ul>
                </div>

                <div className="rounded-3xl p-6 bg-gradient-to-br from-avisdoc-teal-soft/70 to-avisdoc-coral-soft/50 border border-border/60">
                  <h3 className="font-display text-base font-semibold text-foreground mb-2">
                    Vous êtes médecin ?
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                    Inscrivez-vous directement sur notre plateforme pour rejoindre le réseau.
                  </p>
                  <a
                    href="https://app.avisdoc.fr/register"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    Accéder à l'inscription →
                  </a>
                </div>
              </aside>

              <div className="lg:col-span-2">
                <ContactForm />
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Contact;
