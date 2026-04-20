/**
 * Données schema.org centralisées — réutilisées dans les JSON-LD par page.
 * Charte : toutes les URL absolues, NAP cohérent, entités déclarées une seule fois.
 */

const SITE_URL = "https://www.avisdoc.fr";

export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "MedicalOrganization",
  "@id": `${SITE_URL}/#organization`,
  name: "AvisDoc",
  legalName: "AVISDOC SAS",
  alternateName: "AvisDoc · Téléexpertise dermatologique",
  url: SITE_URL,
  logo: `${SITE_URL}/og-image.svg`,
  description:
    "Réseau de soins et téléexpertise dermatologique française. Avis d'un dermatologue expert sous 96 heures, créé par des dermatologues en 2022.",
  foundingDate: "2022",
  medicalSpecialty: "Dermatology",
  slogan: "La dermatologie n'attend pas.",
  areaServed: {
    "@type": "Country",
    name: "France",
  },
  address: {
    "@type": "PostalAddress",
    streetAddress: "11, Chaussée de la Muette",
    postalCode: "75016",
    addressLocality: "Paris",
    addressCountry: "FR",
  },
  contactPoint: {
    "@type": "ContactPoint",
    email: "contact@avisdoc.fr",
    telephone: "+33-6-73-99-59-27",
    contactType: "customer support",
    areaServed: "FR",
    availableLanguage: ["French"],
  },
  sameAs: ["https://www.linkedin.com/company/avisdoc/"],
};

export const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  url: SITE_URL,
  name: "AvisDoc",
  inLanguage: "fr-FR",
  publisher: { "@id": `${SITE_URL}/#organization` },
};

export const buildFaqSchema = (faqs: { question: string; answer: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
});

export const howToEnterpriseSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "Déployer un programme de dépistage dermatologique en entreprise avec AvisDoc",
  description:
    "Processus en 8 étapes pour déployer un dépistage des cancers de la peau sur site, de la contractualisation au bilan.",
  step: [
    { "@type": "HowToStep", position: 1, name: "Contractualisation" },
    { "@type": "HowToStep", position: 2, name: "Cadrage opérationnel" },
    { "@type": "HowToStep", position: 3, name: "Communication interne" },
    { "@type": "HowToStep", position: 4, name: "Campagne de dépistage" },
    { "@type": "HowToStep", position: 5, name: "Télé-expertise par les dermatologues" },
    { "@type": "HowToStep", position: 6, name: "Transmission sécurisée des résultats" },
    { "@type": "HowToStep", position: 7, name: "Accompagnement via le réseau d'aval" },
    { "@type": "HowToStep", position: 8, name: "Bilan et valorisation" },
  ],
};

export const howToDoctorSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "Obtenir un avis dermatologique expert avec AvisDoc",
  description:
    "Demandez un avis spécialisé sur une lésion cutanée, recevez une réponse sous 96 heures.",
  totalTime: "PT96H",
  step: [
    { "@type": "HowToStep", position: 1, name: "Demande du professionnel de santé" },
    { "@type": "HowToStep", position: 2, name: "Transmission sécurisée des données" },
    { "@type": "HowToStep", position: 3, name: "Analyse par un dermatologue expert" },
    { "@type": "HowToStep", position: 4, name: "Prise en charge du patient" },
  ],
};

export const medicalServiceSchema = {
  "@context": "https://schema.org",
  "@type": "MedicalProcedure",
  "@id": `${SITE_URL}/#teleexpertise`,
  name: "Téléexpertise dermatologique",
  procedureType: "https://schema.org/NoninvasiveProcedure",
  howPerformed:
    "Un professionnel de santé sollicite à distance l'avis d'un dermatologue expert en transmettant le dossier clinique et des photographies de la lésion via la plateforme AvisDoc. L'expert délivre un avis sous 96 heures ouvrées.",
  availableService: { "@id": `${SITE_URL}/#organization` },
};
