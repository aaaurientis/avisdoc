import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Mail, CheckCircle, Shield } from "lucide-react";
import { useSEO } from "@/lib/seo";

const SuppressionDonnees = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  useSEO({
    title: "Suppression de vos données personnelles · AvisDoc",
    description:
      "Demandez la suppression de vos données personnelles AvisDoc conformément au RGPD. Traitement sous 30 jours.",
    canonical: "/suppression-donnees",
    robots: "noindex,follow",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes("@")) {
      toast({
        title: "Erreur",
        description: "Veuillez saisir une adresse email valide.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.functions.invoke("send-data-deletion-request", {
        body: { email },
      });

      if (error) throw error;

      setIsSubmitted(true);
    } catch (err) {
      console.error("Error:", err);
      toast({
        title: "Erreur",
        description: "Une erreur est survenue. Veuillez réessayer ou nous contacter directement à contact@avisdoc.fr.",
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
        <section className="relative overflow-hidden pt-32 md:pt-40 pb-12 md:pb-16 surface-hero">
          <div aria-hidden className="absolute -top-24 -right-24 w-[460px] h-[460px] rounded-full bg-primary/10 blur-[160px]" />
          <div aria-hidden className="absolute inset-0 pattern-grid opacity-40" />

          <div className="relative section-container">
            <div className="max-w-2xl">
              <span className="chip bg-primary/10 text-primary mb-5">
                <Shield className="h-3.5 w-3.5" />
                RGPD · Vos droits
              </span>
              <h1 className="font-display text-3xl md:text-5xl font-semibold text-avisdoc-ink mb-5 leading-[1.08]">
                Suppression de vos{" "}
                <span className="italic text-primary">données personnelles.</span>
              </h1>
              <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
                Conformément au Règlement Général sur la Protection des Données (RGPD),
                vous avez le droit de demander la suppression de vos données personnelles.
                Remplissez le formulaire ci-dessous et nous traiterons votre demande dans
                un délai de 30 jours.
              </p>
            </div>
          </div>
        </section>

        <section className="py-12 md:py-20">
          <div className="section-container">
            <div className="max-w-2xl mx-auto">
              {isSubmitted ? (
                <div className="bg-avisdoc-teal-soft/80 border border-primary/20 rounded-3xl p-10 text-center">
                  <div className="h-14 w-14 mx-auto rounded-full bg-primary text-primary-foreground flex items-center justify-center mb-5">
                    <CheckCircle className="h-7 w-7" />
                  </div>
                  <h2 className="font-display text-2xl font-semibold text-foreground mb-3">
                    Demande envoyée avec succès
                  </h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Votre demande de suppression de données a bien été transmise à notre équipe. Nous vous contacterons à l'adresse email indiquée dans un délai de 30 jours pour confirmer le traitement de votre demande.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="bg-card border border-border/60 rounded-3xl p-8 md:p-10 shadow-soft">
                  <div className="mb-6">
                    <label htmlFor="email" className="block text-sm font-semibold text-foreground mb-2">
                      Votre adresse email
                    </label>
                    <p className="text-muted-foreground text-sm mb-4">
                      Veuillez saisir l'adresse email associée à votre compte AvisDoc.
                    </p>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="votre@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-11 h-12 rounded-full"
                        required
                      />
                    </div>
                  </div>

                  <div className="bg-muted/60 rounded-2xl p-5 mb-6 border border-border/60">
                    <h3 className="font-semibold text-foreground text-sm mb-2">Informations importantes :</h3>
                    <ul className="text-muted-foreground text-sm space-y-1.5">
                      <li>• Votre demande sera traitée dans un délai maximum de 30 jours.</li>
                      <li>• Nous pourrons vous demander une pièce d'identité pour vérifier votre identité.</li>
                      <li>• Certaines données peuvent être conservées pour des obligations légales.</li>
                    </ul>
                  </div>

                  <Button type="submit" disabled={isLoading} className="w-full rounded-full shadow-primary" size="lg">
                    {isLoading ? "Envoi en cours..." : "Envoyer ma demande de suppression"}
                  </Button>
                </form>
              )}

              <div className="mt-8 text-center">
                <p className="text-muted-foreground text-sm">
                  Vous pouvez également nous contacter directement à{" "}
                  <a href="mailto:contact@avisdoc.fr" className="text-primary hover:underline font-medium">
                    contact@avisdoc.fr
                  </a>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default SuppressionDonnees;
