# Journée — journées de dépistage (extractions CSV, AWS S3)

Le bloc **Journée** du Hub a deux pages, et un encart sur le tableau de bord :

- **Statistiques** (`/journees`) : journées, passées, à venir, clients ; journées par mois ;
  préparation des journées à venir (confirmations, dermatoscope) ; avancement par contrat
  (client + devis) ; répartition par expert, dermatologue, lieu ou client.
- **Calendrier** (`/journees/calendrier`) : le mois en grille (à confirmer / confirmée / passée — confirmée = requérant confirmé et expert désigné),
  le détail du jour choisi, puis la liste complète (à venir, puis passées).
- **Tableau de bord** : les journées d'aujourd'hui et de la semaine (lundi → dimanche),
  pour les personnes qui ont le droit « Journée ».

L'extraction est lue une fois par session et partagée par ces trois écrans.

## Comment c'est branché

- Le navigateur ne parle jamais à AWS : il appelle la fonction Supabase **`journees-s3`**,
  qui détient les clés et lit le bucket (lecture seule).
- La fonction vérifie : compte `@avisdoc.fr` **et** droit « Journée » (ou super-admin).
- Le droit « Journée » ne fait **pas** partie des droits par défaut : il se coche
  personne par personne dans **Admin → Droits d'accès**.

## Mise en place (une seule fois)

Bucket : **`avisdoc-exports`**, dossier **`journees-depistage/`** (valeurs par défaut de la fonction).

1. **AWS IAM** : créer un utilisateur dédié, avec une clé d'accès, et seulement cette politique
   (lecture seule, limitée au dossier des journées) :

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": "s3:ListBucket",
         "Resource": "arn:aws:s3:::avisdoc-exports",
         "Condition": { "StringLike": { "s3:prefix": "journees-depistage/*" } }
       },
       {
         "Effect": "Allow",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::avisdoc-exports/journees-depistage/*"
       }
     ]
   }
   ```

2. **Supabase** → projet admin → *Edge Functions* → *Secrets* :

   | Secret | Valeur |
   |---|---|
   | `AWS_ACCESS_KEY_ID` | clé de l'utilisateur IAM |
   | `AWS_SECRET_ACCESS_KEY` | secret de cette clé |
   | `AWS_REGION` | facultatif — défaut `eu-west-3` ; une autre région est détectée seule |
   | `JOURNEES_S3_BUCKET` | facultatif — défaut `avisdoc-exports` |
   | `JOURNEES_S3_PREFIX` | facultatif — défaut `journees-depistage/` |

3. La fonction est déployée automatiquement avec le reste (push sur `main`).

## Format attendu des fichiers

- Une **extraction** = un fichier `.csv` daté (ex. `journees-depistage/2026-11-05.csv`) qui liste
  **toutes** les journées : **une ligne par journée**. L'écran lit la plus récente ; les autres
  restent consultables (menu « Extraction du … »).
- Colonnes reconnues par leur nom (ordre libre, accents et majuscules indifférents) :
  Date création, Client, Nombre de journées, Numéro devis, Dermatologue, Expert, Date événement,
  Date facture, Lieu, Numéro journée, Nom / Téléphone / Email du contact, Salle, Accès,
  Autres informations, Confirmation client / consentements / requérant (Oui/Non),
  Numéro et date d'envoi / de retour du dermatoscope. Une colonne absente est signalée à l'écran.
- Séparateur `;` ou `,` détecté tout seul ; UTF-8 ou Windows-1252 ; l'enrobage Excel `="0612…"` est retiré.
- Une journée est « passée » à partir du lendemain de sa date ; celle du jour est encore « à venir ».

## Sans S3

Tant que le bucket n'est pas branché, le bouton **Importer un CSV** lit l'extraction dans le
navigateur (rien n'est envoyé ni enregistré) et affiche les mêmes statistiques.
