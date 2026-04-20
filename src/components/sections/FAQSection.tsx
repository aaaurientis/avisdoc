import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SectionHeader } from "@/components/primitives";
import { faqs } from "./faq-data";

const FAQSection = () => {
  return (
    <section id="faq" className="section-padding surface-mist">
      <div className="section-container">
        <SectionHeader
          eyebrow="FAQ"
          title={
            <>
              Questions <span className="italic text-primary">fréquentes.</span>
            </>
          }
          description="Retrouvez les réponses aux questions les plus courantes sur les prestations AvisDoc en entreprise."
        />

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
