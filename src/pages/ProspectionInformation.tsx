import LegalLayout from "@/components/LegalLayout";
import { Link } from "react-router-dom";

/**
 * Information des personnes concernées par le traitement de prospection B2B
 * (art. 13 et 14 RGPD). Page publique référencée dans le premier email envoyé.
 * Ce traitement est distinct de la plateforme de téléexpertise : aucune donnée
 * de santé, aucun lien avec le dossier HDS.
 */
const ProspectionInformation = () => (
  <LegalLayout
    eyebrow="Protection des données"
    title="Prospection professionnelle : information sur le traitement de vos données"
    subtitle="Vous avez été contacté par AvisDoc dans l’exercice de vos fonctions. Voici ce que nous traitons, pourquoi, combien de temps, et comment vous y opposer."
    metaDescription="Information RGPD sur la prospection professionnelle d’AvisDoc : finalité, base légale, données traitées, durée de conservation, droit d’opposition."
    canonicalPath="/prospection-information"
  >
    <section>
      <h2>Responsable du traitement</h2>
      <p>
        AvisDoc, éditeur d’une solution française de téléexpertise dermatologique, est responsable de ce
        traitement. Les coordonnées figurent dans les <Link to="/mentions-legales">mentions légales</Link>.
      </p>
    </section>

    <section>
      <h2>Finalité et base légale</h2>
      <p>
        Le traitement a pour seule finalité la prospection commerciale entre professionnels : proposer à des
        courtiers, acteurs de la qualité de vie au travail, mutuelles, grossistes et entreprises un
        partenariat autour de journées de repérage de lésions suspectes sur le lieu de travail.
      </p>
      <p>
        Il repose sur l’intérêt légitime d’AvisDoc (article 6.1.f du RGPD) à faire connaître ses services
        auprès de personnes contactées dans l’exercice de leur fonction. Cet intérêt a été mis en balance
        avec vos droits : les données sont limitées à votre identité professionnelle, les sollicitations
        sont manuelles et plafonnées, et vous pouvez vous y opposer à tout moment, gratuitement.
      </p>
    </section>

    <section>
      <h2>Données traitées et origine</h2>
      <ul>
        <li>identité professionnelle : prénom, nom, fonction, niveau hiérarchique, ancienneté dans le poste ;</li>
        <li>coordonnées professionnelles : profil LinkedIn, adresse email professionnelle ;</li>
        <li>organisation : nom, secteur, effectif, région, site web ;</li>
        <li>signaux publics et datés (publication d’un rapport RSE, recrutement en cours, prise de poste) ;</li>
        <li>historique de nos échanges : dates, canal, objet et résumé court. Le corps de vos emails n’est jamais conservé.</li>
      </ul>
      <p>
        Ces données proviennent de votre profil public LinkedIn, exporté depuis les fonctions natives de
        Sales Navigator, de sources publiques, et de nos échanges. Aucune extraction automatisée, aucune
        donnée sensible, aucune information de santé ne sont collectées ni déduites.
      </p>
    </section>

    <section>
      <h2>Destinataires et sous-traitants</h2>
      <p>
        Les données sont accessibles à l’équipe AvisDoc uniquement. Elles sont hébergées par Supabase
        (Union européenne). La rédaction assistée des messages fait appel à Amazon Bedrock dans la région
        Paris (eu-west-3), sans transfert hors de l’Union européenne. Le suivi des échanges email utilise
        Gmail (Google). Aucune donnée n’est cédée ni vendue.
      </p>
    </section>

    <section>
      <h2>Durée de conservation</h2>
      <p>
        Trois ans à compter du dernier échange. Au-delà, les données sont supprimées automatiquement et
        cette suppression est journalisée. En cas d’opposition, votre identifiant est conservé dans une
        liste d’exclusion, dans le seul but de ne plus vous solliciter.
      </p>
    </section>

    <section>
      <h2>Vos droits</h2>
      <p>
        Vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation et d’opposition.
        Le lien d’opposition présent dans chacun de nos emails prend effet immédiatement et
        définitivement. Vous pouvez aussi nous écrire via la <Link to="/contact">page de contact</Link> ou
        demander la <Link to="/suppression-donnees">suppression de vos données</Link>. Vous pouvez
        introduire une réclamation auprès de la CNIL.
      </p>
    </section>

    <section>
      <h2>Séparation avec la plateforme de téléexpertise</h2>
      <p>
        Ce traitement est distinct de la plateforme de téléexpertise d’AvisDoc, qui héberge des données de
        santé auprès d’un hébergeur certifié. Les deux ne partagent ni base de données, ni finalité, ni durée
        de conservation. Aucune donnée de santé n’entre dans le traitement de prospection.
      </p>
    </section>
  </LegalLayout>
);

export default ProspectionInformation;
