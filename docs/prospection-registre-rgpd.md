# Fiche de registre — Traitement « Prospection B2B prescripteurs et entreprises cibles »

Fiche distincte de celle de la téléexpertise. Elle ne touche pas au dossier HDS
et ne doit pas y être versée. Livrée avec le lot 1 du module de prospection.

| Champ | Contenu |
|---|---|
| Responsable de traitement | AvisDoc (coordonnées : mentions légales du site) |
| Référent | Direction AvisDoc ; contact via la page « Contact » et « Suppression des données » d’avisdoc.fr |
| Nom du traitement | Prospection commerciale B2B : sourcing, qualification, contact et suivi de prescripteurs (courtiers, acteurs QVCT, événementiel, mutuelles, grossistes) et d’entreprises cibles |
| Finalité | Proposer un partenariat ou une prestation autour de journées de repérage de lésions suspectes sur le lieu de travail. Aucune autre finalité : ni profilage marketing, ni revente, ni enrichissement |
| Base légale | Intérêt légitime (art. 6.1.f RGPD) : prospection entre professionnels, personnes contactées dans l’exercice de leur fonction. Balance des intérêts : voir ci-dessous |
| Personnes concernées | Dirigeants, associés, directeurs, responsables et chargés de fonctions RH, QVCT, HSE, prévention, partenariats, dans les organisations ciblées |
| Catégories de données | Identité professionnelle (prénom, nom, fonction, niveau, ancienneté dans le poste) ; coordonnées professionnelles (URL LinkedIn, email professionnel) ; organisation (nom, type, secteur, effectif, région, site web, cercle de cible) ; signaux publics datés (PR-01 à PR-10) ; historique des échanges (date, canal, sens, type, objet, résumé court, texte des messages que nous avons rédigés) ; trace d’origine (import) |
| Données exclues | Aucune donnée sensible (art. 9), aucune donnée de santé, aucune inférence sur la santé, aucun ciblage sur un critère de santé. Le corps des emails reçus n’est jamais conservé. Notes internes typées et bornées à 280 caractères |
| Sources | Export CSV natif d’une liste Sales Navigator (déposé à la main), sources publiques, échanges directs. Aucune extraction automatisée, aucun scraper, aucune API LinkedIn |
| Destinataires | Équipe AvisDoc (comptes Google @avisdoc.fr), via RLS restreinte au domaine |
| Sous-traitants | Supabase (hébergement Postgres et fonctions, projet « vitrine », Union européenne) ; Amazon Web Services, Bedrock région Paris eu-west-3 (rédaction assistée des messages et résumés d’emails, sans profil d’inférence multi-régions) ; Google (Gmail API, lecture des échanges de la boîte de prospection) |
| Transferts hors UE | Aucun transfert organisé. Région Bedrock verrouillée sur eu-west-3 dans le code |
| Durée de conservation | Trois ans à compter de la dernière interaction, puis purge automatique quotidienne (`prospection.purger_inactifs`), journalisée (table `journal`, événement `purge`). Liste d’exclusion conservée sans limite, dans le seul but de ne plus solliciter |
| Information des personnes | Page publique https://www.avisdoc.fr/prospection-information, liée dans le premier email. Pas dans la note d’invitation LinkedIn (300 caractères) |
| Droit d’opposition | Lien dans chaque email → https://www.avisdoc.fr/prospection-opposition?jeton=… ; effet immédiat et définitif : exclusion, annulation des relances, suppression de la fiche, journalisation |
| Autres droits | Accès, rectification, effacement, limitation : via la page « Contact » ou « Suppression des données ». Réclamation possible auprès de la CNIL |
| Mesures de sécurité | Projet Supabase distinct de la plateforme de téléexpertise ; schéma dédié `prospection` ; RLS sur toutes les tables ; SSO Google restreint au domaine ; statut modifiable uniquement par fonction serveur ; champs bornés ; plafond de quinze invitations par jour et par identité ; journal des transitions, imports, oppositions, purges ; interdiction de code (lint et tests) d’importer le domaine téléexpertise ; clés API côté serveur uniquement |
| Automatisation | Aucun envoi automatisé : LinkedIn manuel, relances = file de rappels, email envoyé depuis la messagerie de l’utilisateur. Seule la trace des emails déjà échangés est automatisée (métadonnées et résumé) |
| Date de création | 3 septembre 2026 |

## Balance des intérêts (intérêt légitime)

**Intérêt poursuivi.** Faire connaître, auprès d’intermédiaires et d’entreprises,
un service de prévention en santé au travail. Intérêt économique réel et licite,
raisonnablement attendu de la part d’une entreprise qui s’adresse à des
professionnels dans leur fonction.

**Nécessité.** Les données traitées sont limitées à ce qu’un interlocuteur
professionnel rend public de lui-même (profil LinkedIn, fonction, organisation)
et à l’historique de nos propres échanges. Les signaux sont datés et périment à
quatre-vingt-dix jours. Aucun champ libre non borné, aucune donnée sensible.

**Attentes raisonnables et impact.** Les personnes sont contactées sur un canal
professionnel, avec un message individuel, relu et envoyé à la main, au plus une
invitation puis deux relances et une proposition sur trois semaines, puis arrêt
définitif. Quinze invitations par jour et par identité. Une réponse arrête la
séquence. Le droit d’opposition est à un clic dans chaque email et bloque tout
réimport. L’impact sur la vie privée est faible ; la balance penche en faveur du
traitement, à condition de maintenir ces garanties, qui sont codées, pas
seulement documentées.

## Ce que ce traitement n’est pas

Il n’est pas une extension de la plateforme de téléexpertise. Pas de base
commune, pas de finalité commune, pas de durée commune, pas de personnes
concernées communes. Il n’entre pas dans le périmètre de l’AIPD ni du dossier HDS.
