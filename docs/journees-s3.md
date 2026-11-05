# Journée — extractions des journées de dépistage (AWS S3)

L'onglet **Journée** du Hub (`/journees`) lit les extractions CSV déposées dans un bucket
AWS S3. Il affiche le nombre de journées, de lignes, la moyenne par journée, un graphique
des lignes par journée, la répartition des valeurs d'une colonne et le détail de chaque fichier.

## Comment c'est branché

- Le navigateur ne parle jamais à AWS : il appelle la fonction Supabase **`journees-s3`**,
  qui détient les clés et lit le bucket (lecture seule).
- La fonction vérifie : compte `@avisdoc.fr` **et** droit « Journée » (ou super-admin).
- Le droit « Journée » ne fait **pas** partie des droits par défaut : il se coche
  personne par personne dans **Admin → Droits d'accès**.

## Mise en place (une seule fois)

1. **AWS IAM** : créer un utilisateur dédié, avec une clé d'accès, et seulement cette politique :

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       { "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::NOM_DU_BUCKET" },
       { "Effect": "Allow", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::NOM_DU_BUCKET/*" }
     ]
   }
   ```

2. **Supabase** → projet admin → *Edge Functions* → *Secrets* :

   | Secret | Valeur |
   |---|---|
   | `AWS_ACCESS_KEY_ID` | clé de l'utilisateur IAM |
   | `AWS_SECRET_ACCESS_KEY` | secret de cette clé |
   | `AWS_REGION` | région du bucket, ex. `eu-west-3` (Paris) — défaut `eu-west-3` |
   | `JOURNEES_S3_BUCKET` | nom du bucket |
   | `JOURNEES_S3_PREFIX` | dossier des extractions, ex. `extractions/` (facultatif) |

3. La fonction est déployée automatiquement avec le reste (push sur `main`).

## Format attendu des fichiers

- Un fichier `.csv` par journée ; la première ligne donne les noms de colonnes.
- Séparateur `;`, `,`, tabulation ou `|` : détecté tout seul. UTF-8 ou Windows-1252 (export Excel).
- **Date de la journée** : lue dans le nom du fichier (`2026-11-05`, `20261105`, `05-11-2026`) ;
  sinon, c'est la date de dépôt dans le bucket (signalée « date de dépôt » à l'écran).
- L'écran analyse les 200 fichiers les plus récents.
