import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import Reveal from "@/components/Reveal";
import { faqs } from "./faq-data";

const FAQSection = () => {
  return (
    <section id="faq" className="section-padding surface-mist">
      <div className="section-container">
        <Reveal className="text-center max-w-3xl mx-auto mb-14">
          <span className="eyebrow text-primary">FAQ</span>
          <h2 className="font-display text-3xl md:text-5xl font-semibold text-avisdoc-ink mt-5 mb-5 leading-[1.08]">
            Questions <span className="italic text-primary">fréquentes.</span>
          </h2>
          <p className="text-muted-foreground text-base md:text-lg">
            Retrouvez les réponses aux questions les plus courantes sur les prestations AvisDoc en entreprise.
          </p>
        </Reveal>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="bg-card border border-border/60 rounded-2xl px-6 data-[state=open]:shadow-soft data-[state=open]:border-primary/30 transition-all"
              >
                <AccordionTrigger className="text-left text-base font-semibold text-foreground hover:no-underline py-5">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed pb-5">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
