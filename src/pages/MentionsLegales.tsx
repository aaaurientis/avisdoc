import LegalLayout from "@/components/LegalLayout";

const MentionsLegales = () => {
  return (
    <LegalLayout
      eyebrow="Informations légales"
      title="Mentions légales"
      canonicalPath="/mentions-legales"
      metaDescription="Mentions légales du site AvisDoc : éditeur, hébergement, directeur de la publication, RGPD, propriété intellectuelle."
    >
      <section>
        <h2>Éditeur du site</h2>
        <p>Le site www.avisdoc.fr est édité par la SAS AVISDOC, au capital de 2 000 €, immatriculée au RCS de Paris sous le numéro SIREN 901 941 880, SIRET 901 941 880 00014, TVA intracommunautaire FR79 901941880.</p>
        <p>Activité principale (NAF) : programmation informatique (6201Z).</p>
      </section>

      <section>
        <h2>Siège social et contact</h2>
        <p>
          Siège : 11, Chaussée de la Muette, 75016 Paris<br />
          Président : M. Henry Pawin<br />
          Email : contact@avisdoc.fr<br />
          Téléphone : 06 73 99 59 27
        </p>
      </section>

      <section>
        <h2>Directeur de la publication</h2>
        <p>M. Henry Pawin, Président de la SAS AVISDOC.</p>
      </section>

      <section>
        <h2>Hébergement</h2>
        <p>Le site est hébergé par [Nom Hébergeur à compléter], situé à [Adresse Hébergeur à compléter].</p>
      </section>

      <section>
        <h2>Données personnelles</h2>
        <p>Conformément au RGPD et à la loi « Informatique et Libertés », vous disposez d'un droit d'accès, de rectification, de suppression et d'opposition des données vous concernant. Pour l'exercer, contactez‑nous à : contact@avisdoc.fr.</p>
      </section>

      <section>
        <h2>Propriété intellectuelle</h2>
        <p>L'ensemble du contenu du site (textes, images, logos, base, etc.) est protégé par le droit d'auteur. Toute reproduction, totale ou partielle, est interdite sans autorisation préalable.</p>
      </section>

      <section>
        <h2>Responsabilité</h2>
        <p>AVISDOC décline toute responsabilité quant à l'accès ou l'usage du site et des liens externes. Les informations et services sont fournis à titre indicatif, sans garantie d'exhaustivité.</p>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>Ce site utilise des cookies nécessaires à sa navigation. Aucun cookie publicitaire n'est installé sans consentement. Consultez notre Politique de confidentialité pour plus d'informations.</p>
      </section>

      <section>
        <h2>Durée de conservation</h2>
        <p>Les données collectées sont conservées pour la durée nécessaire aux finalités décrites ou selon les obligations légales.</p>
      </section>

      <p className="text-sm text-muted-foreground/80 italic">Paris, le 22 juillet 2025</p>
    </LegalLayout>
  );
};

export default MentionsLegales;
