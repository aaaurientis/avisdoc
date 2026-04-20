import { FormEvent, useState } from "react";
import { Mail, Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Profile = "entreprise" | "collectivite" | "professionnel" | "autre";

const profiles: { value: Profile; label: string }[] = [
  { value: "entreprise", label: "Entreprise" },
  { value: "collectivite", label: "Collectivité" },
  { value: "professionnel", label: "Professionnel de santé" },
  { value: "autre", label: "Autre" },
];

const ContactForm = () => {
  const [profile, setProfile] = useState<Profile>("entreprise");
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.includes("@") || !message.trim()) {
      setError("Merci de vérifier votre nom, email et message.");
      return;
    }

    const subject = encodeURIComponent(`[${profiles.find((p) => p.value === profile)?.label}] ${name}`);
    const body = encodeURIComponent(
      `Nom : ${name}\n` +
        `Structure : ${organization || "—"}\n` +
        `Email : ${email}\n` +
        `Profil : ${profiles.find((p) => p.value === profile)?.label}\n\n` +
        `${message}`
    );

    window.location.href = `mailto:contact@avisdoc.fr?subject=${subject}&body=${body}`;
    setSent(true);
  };

  if (sent) {
    return (
      <div className="bg-avisdoc-teal-soft/80 border border-primary/25 rounded-3xl p-10 text-center">
        <div className="h-14 w-14 mx-auto rounded-full bg-primary text-primary-foreground flex items-center justify-center mb-5">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h2 className="font-display text-2xl font-semibold text-foreground mb-3">
          Message prêt à être envoyé
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          Votre client mail s'est ouvert avec le message pré-rempli. Si rien n'a
          démarré, vous pouvez nous écrire directement à{" "}
          <a href="mailto:contact@avisdoc.fr" className="text-primary font-medium hover:underline">
            contact@avisdoc.fr
          </a>.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card border border-border/60 rounded-3xl p-8 md:p-10 shadow-soft space-y-6"
      noValidate
    >
      <fieldset>
        <legend className="block text-sm font-semibold text-foreground mb-3">Je suis …</legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {profiles.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setProfile(p.value)}
              aria-pressed={profile === p.value}
              className={`rounded-full px-3 py-2 text-sm font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                profile === p.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-foreground/80 hover:text-primary hover:border-primary/40"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="contact-name" className="block text-sm font-semibold text-foreground mb-2">
            Nom
          </label>
          <Input
            id="contact-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Prénom Nom"
            required
            autoComplete="name"
            className="h-11 rounded-xl"
          />
        </div>
        <div>
          <label htmlFor="contact-org" className="block text-sm font-semibold text-foreground mb-2">
            Structure <span className="font-normal text-muted-foreground/70">(facultatif)</span>
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

      <div>
        <label htmlFor="contact-email" className="block text-sm font-semibold text-foreground mb-2">
          Email
        </label>
        <div className="relative">
          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="contact-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.fr"
            required
            autoComplete="email"
            className="pl-10 h-11 rounded-xl"
          />
        </div>
      </div>

      <div>
        <label htmlFor="contact-message" className="block text-sm font-semibold text-foreground mb-2">
          Votre message
        </label>
        <Textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder="Décrivez votre besoin, votre contexte ou vos questions…"
          required
          className="rounded-2xl"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <p className="text-xs text-muted-foreground leading-relaxed">
        Vos informations ne sont pas stockées par ce site : elles ouvrent simplement votre client mail
        vers <strong className="font-medium">contact@avisdoc.fr</strong>.
      </p>

      <Button type="submit" size="lg" className="rounded-full shadow-primary group w-full sm:w-auto">
        Envoyer mon message
        <Send className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
      </Button>
    </form>
  );
};

export default ContactForm;
