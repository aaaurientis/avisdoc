# Fiche de registre RGPD — Réseau d'aval (prospection des médecins correspondants)

Livrée avec le lot 1 (brief, §9). Version du 14 novembre 2026. **À valider par le DPO
d'AvisDoc** : les points marqués « à confirmer » ne sont pas tranchés.

| Rubrique | Contenu |
|---|---|
| **Nom du traitement** | Constitution du réseau d'aval : prospection et qualification de médecins correspondants |
| **Responsable de traitement** | AvisDoc |
| **Finalité** | Identifier, qualifier et contacter, département par département, des médecins (dermatologues, ORL, chirurgiens plasticiens, chirurgiens généralistes, généralistes formés à la dermoscopie) vers qui un patient peut être orienté en présentiel après un avis de télé-expertise. Tracer leur accord pour figurer sur la liste des correspondants. |
| **Ce que le traitement ne fait pas** | Aucune prise de rendez-vous. **Aucune donnée de patient ni donnée de santé.** Aucune rémunération ni contrepartie liée à l'adressage. Aucun e-mail collecté. |
| **Base légale** | Intérêt légitime d'AvisDoc à constituer un réseau de correspondants, sur des données professionnelles publiques — **à confirmer par le DPO**. |
| **Personnes concernées** | Médecins en exercice, identifiés par leur numéro RPPS. |
| **Données traitées** | Identité professionnelle : civilité d'exercice, nom et prénom d'exercice, RPPS. Spécialités ordinales. Lieux d'exercice : structure, adresse, téléphone professionnel, mode d'exercice (libéral, salarié), secteur d'activité, FINESS, SIRET. État dans le processus (identifié, contacté, accord…). Historique des actions (qui, quand, quoi). En cas d'exclusion : RPPS, motif, date, auteur. |
| **Données exclues** | Données de patients, données de santé, e-mails, verbatim d'avis en ligne, contenu des fiches Google Maps (seul l'identifiant de fiche est conservé, lot 2), âge, sexe. |
| **Sources** | Extraction RPPS en libre accès de l'Annuaire Santé (ANS), Licence Ouverte, via data.gouv.fr. À partir du lot 2 : fiche Google Maps (API Places, affichage sans stockage), recherche web assistée par IA (pages publiques, sources vérifiées et validées par un opérateur), échanges directs avec le praticien. |
| **Destinataires internes** | Membres d'AvisDoc ayant le droit « Professionnels de Santé » dans le Hub. |
| **Destinataires externes** | Aucun pour les données de prospection. La liste des correspondants (praticiens ayant donné leur accord) pourra être communiquée aux patients orientés, dans les limites de l'accord. |
| **Sous-traitants** | Supabase (hébergement de la base, projet admin, hors périmètre HDS). À partir du lot 2 : Google (API Places, Google Maps Platform) et Anthropic (API Claude, recherche web assistée). **Accords de sous-traitance et transferts hors UE à vérifier par le DPO.** |
| **Information des personnes** | Au premier contact (lot 3), le praticien est informé : de l'origine de ses coordonnées (Annuaire Santé public), de la finalité, de son droit d'opposition et de la manière de l'exercer. Le texte d'information est à rédiger et à valider par le DPO avant le lot 3. |
| **Droit d'opposition** | Exercé par simple demande, à tout moment. Il est **définitif** : le RPPS est inscrit dans la table d'exclusion, qui ne se modifie ni ne s'efface, et aucun import ultérieur ne recrée le praticien. |
| **Autres droits** | Accès, rectification, effacement, limitation : sur demande au responsable de traitement. Les données issues du RPPS se rectifient à la source, auprès de l'Ordre ; le Hub les met à jour à chaque import. |
| **Durées de conservation** | Proposition, **à confirmer par le DPO** :<br>• praticien ayant donné son accord : tant qu'il figure dans le réseau, puis 3 ans après sa sortie ;<br>• praticien non retenu (refus, injoignable, jamais contacté) : 3 ans après le dernier contact ou le dernier import qui l'a vu ;<br>• exclusion (RPPS, motif, date) : conservée sans limite de durée, seul moyen de respecter l'opposition dans le temps ;<br>• journal des imports et historique : 3 ans.<br>La purge automatique n'est pas encore en place : à livrer au lot 3. |
| **Sécurité** | Accès réservé aux comptes @avisdoc.fr ayant le droit « sante », contrôlé par la base (RLS) et revérifié dans chaque fonction serveur. Le front ne fait que lire ; toute écriture passe par une fonction serveur et laisse une trace (qui, quand, quoi). Exclusions protégées contre la modification et la suppression par un déclencheur en base. |
| **Analyse d'impact (AIPD)** | Non requise a priori : données professionnelles publiques, pas de données de santé, pas de décision automatisée (le score classe la file mais ne décide jamais). **À confirmer par le DPO**, notamment pour la recherche assistée par IA du lot 2. |
