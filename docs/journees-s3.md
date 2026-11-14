# Journée — journées de dépistage (extractions CSV, AWS S3)

Le bloc **Statistiques** du Hub (ex-« Journée », droit `journee`) a trois pages — Vue globale, Journées, Expertises — et un encart sur le tableau de bord :

- **Vue globale** (`/journees`), en trois parties — Journées, Expertises, Journées et expertises (avis rendus en journée, moyenne par journée, journées passées sans avis, consultation en / hors journée) : journées, passées, à venir, clients ; journées par mois ;
  préparation des journées à venir (confirmations, dermatoscope) ; avancement par contrat
  (client + devis) ; répartition par expert, dermatologue, lieu ou client.
- **Journées** (`/journees/calendrier`, ex-Calendrier) : le mois en grille (à confirmer / confirmée / passée — confirmée = requérant confirmé et expert désigné),
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
         "Condition": { "StringLike": { "s3:prefix": ["journees-depistage/*", "expertises/*"] } }
       },
       {
         "Effect": "Allow",
         "Action": "s3:GetObject",
         "Resource": ["arn:aws:s3:::avisdoc-exports/journees-depistage/*", "arn:aws:s3:::avisdoc-exports/expertises/*"]
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
  Date création, Client, Nombre de journées, Numéro devis, Requérant, Requis (anciennement
  Dermatologue, Expert — les deux écritures sont lues), Date événement,
  Date facture, Lieu, Numéro journée, Nom / Téléphone / Email du contact, Salle, Accès,
  Autres informations, Confirmation client / consentements / requérant (Oui/Non),
  Numéro et date d'envoi / de retour du dermatoscope. Une colonne absente est signalée à l'écran.
- Séparateur `;` ou `,` détecté tout seul ; UTF-8 ou Windows-1252 ; l'enrobage Excel `="0612…"` est retiré.
- Une journée est « passée » à partir du lendemain de sa date ; celle du jour est encore « à venir ».

## Télécharger une extraction

Le bouton **Télécharger le CSV** (pages Vue globale, Journées et Expertises) enregistre l'extraction
affichée telle qu'elle est dans le bucket (UTF-8, lisible par Excel). Le menu « Extraction du … »
permet d'en choisir une plus ancienne avant de la télécharger. Chaque téléchargement est noté
au journal d'audit (Admin › Auditabilité) : le fichier contient des coordonnées de contacts.

L'import manuel d'un CSV a été retiré : les extractions viennent uniquement du bucket S3.

## Typologies de clients (règles de confirmation)

**Admin › Typologies clients** (`/typologies`, module Admin) — migration `0081_typologies_clients.sql`
à exécuter une fois dans le SQL Editor.

- Une **typologie** dit ce qui doit être acquis pour qu'une journée soit confirmée :
  requérant confirmé et/ou expert désigné. (Client, consentements et dermatoscope restent
  visibles dans le détail d'une journée mais ne comptent pas.)
  Exemple : « Partenaire sans CPS » (Viabeez fournit les requérants) → expert seulement.
- Chaque **client Qonto** reçoit une typologie ; sinon la typologie **par défaut** s'applique
  (au départ « Client direct » : requérant + expert).
- Les noms de l'extraction (« VIABEEZ ») sont rapprochés des clients Qonto : nom identique
  (sans accents, casse ni forme juridique), alias, ou nom proche s'il n'y a qu'un candidat.
  Un nom non rattaché se rattache à la main ; il devient un alias du client.
- Tant que la migration n'est pas jouée, les écrans Journée appliquent requérant + expert.

## Noms de fichiers dans le bucket

Les extractions des journées et des expertises sont déposées au même endroit, avec la même date
(`2026-11-14-journée.csv`, `2026-11-14-expertise.csv`). Le Hub ne retient pour les journées que les
fichiers dont le nom contient « journée » ; s'il n'en trouve aucun (anciens noms comme
`2026-11-05.csv`), il prend tout sauf les fichiers « expertise ».

## Lien avec les expertises

L'extraction des expertises (une ligne = un avis) n'a pas de colonne Client. Une expertise faite
lors d'une journée porte **Date événement + Lieu + Numéro journée** : ce triplet retrouve sa journée
sans ambiguïté (vérifié le 14/11/2026 : 1 122 expertises de journée sur 13 608, toutes rattachées à
une seule journée). Date + Numéro journée suffit aussi ; Date + Lieu seul est ambigu (plusieurs
journées le même jour au même endroit).

## Expertises

**Statistiques › Expertises** (`/journees/expertises`) lit l'extraction « expertise » la plus récente
dans le dossier **`expertises/`** du bucket (fichiers nommés par leur date, ex. `2026-11-13.csv` ;
un autre dossier se règle avec le secret `EXPERTISES_S3_PREFIX`). La règle IAM de l'utilisateur doit
autoriser ce dossier (voir plus haut).

- Avis par mois (en journée / hors journée), recommandations, délai de traitement (mesuré depuis
  fin août 2026 seulement), profession du requérant.
- **Par requis** : nombre d'avis et **taux de consultation** = avis qui orientent vers un
  dermatologue (consultation conseillée ou exérèse) sur les avis dont la recommandation est
  renseignée ; détail consultation / exérèse / non indispensable, délai médian, urgences.
- Dans **Journées**, le détail d'une journée montre ses expertises (rattachées par
  date + lieu + n° journée) ; la colonne « Avis » des contrats en fait la somme.

## Rapport client

Bouton **Rapport** (contrats, Vue globale) ou **Rapport de la journée** (page Journées) : bilan aux
couleurs AvisDoc (fond blanc, Newsreader + Hanken Grotesk, cyan / bleu marine / orange), à imprimer
ou enregistrer en PDF. Il n'existe qu'**au-delà de 20 expertises** et ne contient que des totaux et
des proportions (aucun chiffre par personne, aucune ventilation des recommandations par journée).
