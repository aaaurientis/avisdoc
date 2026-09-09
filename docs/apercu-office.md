# Aperçu des documents dans le back-office (sans tiers, sans infra)

Tous les formats courants sont prévisualisés **directement dans le navigateur**.
Aucun fichier n'est envoyé à un service externe et **aucune brique** ne s'ajoute
à la stack (ni convertisseur, ni Edge Function, ni secret) : ce sont des
bibliothèques front chargées à la demande.

| Format | Méthode | Tiers ? | Infra ? |
|---|---|---|---|
| PDF | affichage natif du navigateur (iframe) | non | non |
| Word `.docx` | rendu navigateur (`docx-preview`) | non | non |
| Excel `.xlsx` | rendu navigateur (SheetJS `xlsx`) | non | non |
| PowerPoint `.pptx` | rendu navigateur (`pptx-preview`) | non | non |

## Fonctionnement

À l'ouverture de l'aperçu (écran **Documents**) :

1. une URL signée du fichier est demandée à Supabase Storage (bucket privé
   `admin-documents`) ;
2. le fichier est récupéré côté client puis rendu localement :
   - PDF → `iframe` ;
   - Word / Excel / PowerPoint → décodés et affichés dans un conteneur, via une
     bibliothèque chargée en *lazy-load* (`import()` dynamique) pour ne pas
     alourdir le bundle initial.

Si le rendu échoue (format exotique, fichier corrompu), l'aperçu bascule sur un
repli « télécharger le document ».

## Limite connue (PowerPoint)

Le rendu `.pptx` en pur navigateur restitue très bien les diapositives usuelles
(texte, images, formes, tableaux, graphiques). Certains cas avancés (animations,
SmartArt, polices embarquées exotiques) peuvent être imparfaits. Pour un usage
« consulter le contenu sans télécharger », c'est suffisant ; le bouton
**Télécharger** reste disponible pour ouvrir le fichier dans PowerPoint/LibreOffice
en cas de besoin de fidélité parfaite.
