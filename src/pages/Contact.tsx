import { FormEvent, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Mail,
  MapPin,
  Linkedin,
  CheckCircle2,
  Send,
  AlertTriangle,
  Building2,
  Landmark,
  Stethoscope,
  HelpCircle,
} from "lucide-react";
import { useSEO } from "@/lib/seo";

type Profile = "entreprise" | "collectivite" | "professionnel" | "autre";

const profiles: { value: Profile; label: string; icon: typeof Building2 }[] = [
  { value: "entreprise", label: "Entreprise", icon: Building2 },
  { value: "collectivite", label: "Collectivité", icon: Landmark },
  { value: "professionnel", label: "Professionnel de santé", icon: Stethoscope },
  { value: "autre", label: "Autre", icon: HelpCircle },
];

const Contact = () => {
  const { toast } = useToast();
  useSEO({
    title: "Contact · AvisDoc",
    description:
      "Contacter l'équipe AvisDoc — entreprises, collectivités, professionnels de santé. Ce site ne permet pas d'obtenir des avis médicaux ou des rendez-vous avec des médecins.",
    canonical: "/contact",
  });

  const [profile, setProfile] = useState<Profile>("entreprise");
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [botField, setBotField] = useState(""); // honeypot anti-spam
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !email.includes("@") || message.trim().length < 10) {
      toast({
        title: "Formulaire incomplet",
        description:
          "Vérifie ton nom, ton email et ton message (au moins 10 caractères).",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/contact.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          profileLabel: profiles.find((p) => p.value === profile)?.label,
          name,
          organization,
          email,
          phone,
          message,
          _botfield: botField,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Erreur ${response.status}`);
      }

      setIsSubmitted(true);
    } catch (err) {
      console.error("Contact form error:", err);
      toast({
        title: "Erreur",
        description:
          err instanceof Error && err.message
            ? err.message
            : "Une erreur est survenue lors de l'envoi. Vous pouvez réessayer ou nous écrire à contact@avisdoc.fr.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main id="main-content">
        {/* Hero */}
        <section className="relative overflow-hidden pt-32 md:pt-40 pb-12 md:pb-16 surface-hero">
          <div
            aria-hidden
            className="absolute -top-24 -right-24 w-[460px] h-[460px] rounded-full bg-primary/10 blur-[160px]"
          />
          <div aria-hidden className="absolute inset-0 pattern-grid opacity-40" />

          <div className="relative section-container">
            <div className="max-w-3xl">
              <span className="eyebrow text-primary">Contact</span>
              <h1 className="font-display text-3xl md:text-5xl font-semibold text-avisdoc-ink mt-5 mb-4 leading-[1.08]">
                Parlons de votre <span className="italic text-primary">projet santé.</span>
              </h1>
              <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
                Entreprise, collectivité, professionnel de santé ? Décrivez votre besoin
                ci-dessous, un membre de l'équipe AvisDoc vous recontacte sous 48 h ouvrées.
              </p>
            </div>
          </div>
        </section>

        {/* Disclaimer + Form + Aside */}
        <section className="py-12 md:py-16">
          <div className="section-container">
            {/* Disclaimer médical bien visible */}
            <div
              role="note"
              className="max-w-5xl mx-auto mb-10 rounded-2xl border border-avisdoc-coral/30 bg-avisdoc-coral-soft/60 p-5 md:p-6 flex items-start gap-4"
            >
              <AlertTriangle className="h-5 w-5 md:h-6 md:w-6 text-avisdoc-coral flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-foreground text-sm md:text-base mb-1">
                  Information importante
                </p>
                <p className="text-foreground/80 text-sm md:text-[15px] leading-relaxed">
                  Ce site ne permet pas d'obtenir des avis médicaux ou des rendez-vous avec
                  des médecins. Pour tout symptôme nécessitant une prise en charge, consultez
                  votre médecin traitant ou les services d'urgence.
                </p>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-8 lg:gap-10 max-w-5xl mx-auto">
              {/* Aside infos */}
              <aside className="lg:col-span-1 space-y-6">
                <div className="bg-card border border-border/60 rounded-3xl p-6 shadow-soft">
                  <h2 className="font-display text-lg font-semibold text-foreground mb-4">
                    Nous joindre
                  </h2>
                  <ul className="space-y-4 text-sm">
                    <li className="flex items-start gap-3">
                      <Mail className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <a
                        href="mailto:contact@avisdoc.fr"
                        className="text-foreground hover:text-primary transition-colors break-all"
                      >
                        contact@avisdoc.fr
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

                <div className="rounded-3xl p-6 bg-gradient-to-br from-avisdoc-teal-soft/70 to-avisdoc-coral-soft/40 border border-border/60">
                  <h3 className="font-display text-base font-semibold text-foreground mb-2">
                    Vous êtes professionnel de santé ?
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

              {/* Form */}
              <div className="lg:col-span-2">
                {isSubmitted ? (
                  <div className="bg-avisdoc-teal-soft/80 border border-primary/25 rounded-3xl p-10 text-center">
                    <div className="h-14 w-14 mx-auto rounded-full bg-primary text-primary-foreground flex items-center justify-center mb-5">
                      <CheckCircle2 className="h-7 w-7" />
                    </div>
                    <h2 className="font-display text-2xl font-semibold text-foreground mb-3">
                      Message envoyé
                    </h2>
                    <p className="text-muted-foreground leading-relaxed">
                      Merci. Un membre de l'équipe AvisDoc vous recontactera sous 48 h
                      ouvrées à l'adresse <strong>{email}</strong>.
                    </p>
                  </div>
                ) : (
                  <form
                    onSubmit={handleSubmit}
                    className="bg-card border border-border/60 rounded-3xl p-6 md:p-10 shadow-soft space-y-6"
                    noValidate
                  >
                    <fieldset>
                      <legend className="block text-sm font-semibold text-foreground mb-3">
                        Je suis…
                      </legend>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {profiles.map((p) => (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => setProfile(p.value)}
                            aria-pressed={profile === p.value}
                            className={`rounded-2xl px-3 py-2.5 text-xs sm:text-sm font-medium border transition-colors flex items-center justify-center gap-1.5 ${
                              profile === p.value
                                ? "bg-primary text-primary-foreground border-primary shadow-primary"
                                : "bg-background border-border text-foreground/80 hover:text-primary hover:border-primary/40"
                            }`}
                          >
                            <p.icon className="h-3.5 w-3.5" />
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </fieldset>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="contact-name"
                          className="block text-sm font-semibold text-foreground mb-2"
                        >
                          Nom complet *
                        </label>
                        <Input
                          id="contact-name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Prénom Nom"
                          autoComplete="name"
                          required
                          className="h-11 rounded-xl"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="contact-org"
                          className="block text-sm font-semibold text-foreground mb-2"
                        >
                          Structure{" "}
                          <span className="font-normal text-muted-foreground/70">
                            (facultatif)
                          </span>
                        </label>
                        <Input
                          id="contact-org"
                          value={organization}
                          onChange={(e) => setOrganization(e.target.value)}
                          placeholder="Entreprise, commune, cabinet…"
                          autoComplete="organization"
                          className="h-11 rounded-xl"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="contact-email"
                          className="block text-sm font-semibold text-foreground mb-2"
                        >
                          Email *
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="contact-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="vous@exemple.fr"
                            autoComplete="email"
                            required
                            className="pl-10 h-11 rounded-xl"
                          />
                        </div>
                      </div>
                      <div>
                        <label
                          htmlFor="contact-phone"
                          className="block text-sm font-semibold text-foreground mb-2"
                        >
                          Téléphone{" "}
                          <span className="font-normal text-muted-foreground/70">
                            (facultatif)
                          </span>
                        </label>
                        <Input
                          id="contact-phone"
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="06 12 34 56 78"
                          autoComplete="tel"
                          className="h-11 rounded-xl"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="contact-message"
                        className="block text-sm font-semibold text-foreground mb-2"
                      >
                        Votre message *
                      </label>
                      <textarea
                        id="contact-message"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={5}
                        placeholder="Décrivez votre besoin, votre contexte ou vos questions…"
                        required
                        minLength={10}
                        className="w-full rounded-2xl border border-input bg-background px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                      />
                    </div>

                    {/* Honeypot anti-spam : champ caché aux humains. */}
                    <div
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        left: "-9999px",
                        width: "1px",
                        height: "1px",
                        overflow: "hidden",
                      }}
                    >
                      <label htmlFor="contact-website">Site web (ne pas remplir)</label>
                      <input
                        id="contact-website"
                        type="text"
                        name="website"
                        tabIndex={-1}
                        autoComplete="off"
                        value={botField}
                        onChange={(e) => setBotField(e.target.value)}
                      />
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      En envoyant ce message, vous acceptez que vos coordonnées soient
                      utilisées par AvisDoc pour vous recontacter dans le cadre de votre
                      demande. Aucune donnée médicale ne doit être transmise via ce
                      formulaire.
                    </p>

                    <Button
                      type="submit"
                      size="lg"
                      disabled={isLoading}
                      className="w-full sm:w-auto rounded-full shadow-primary group"
                    >
                      {isLoading ? (
                        "Envoi en cours…"
                      ) : (
                        <>
                          Envoyer mon message
                          <Send className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </Button>
                  </form>
                )}
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
