# Carte des contacts (Google Maps)

L'écran **Contacts** propose une bascule **Liste / Carte**. La carte affiche un
marqueur par contact, coloré selon son type (Requérant / Expert / Réseau d'Aval),
et respecte les filtres et la recherche en cours.

## Configuration de la clé API

1. Google Cloud Console → activer **Maps JavaScript API** et **Geocoding API**.
2. Créer une **clé API**, puis la **restreindre** :
   - *Restrictions d'application* → **Référents HTTP** → `https://admin.avisdoc.fr/*`
     (ajouter `http://localhost:*` pour le développement) ;
   - *Restrictions d'API* → limiter à *Maps JavaScript API* + *Geocoding API*.
3. Enregistrer la clé comme **secret Supabase** (projet admin) :

   ```
   supabase secrets set GOOGLE_MAPS_KEY=votre_clé
   ```

   (ou Dashboard → Edge Functions → Secrets). Le front la récupère via l'Edge
   Function `maps-cle`, réservée aux comptes `@avisdoc.fr` — la clé n'est donc
   pas commitée dans le dépôt.

Tant qu'aucune clé n'est disponible, l'onglet **Carte** affiche un message de
configuration (aucune erreur bloquante).

> **Note.** Une clé Maps JavaScript est de toute façon visible dans le
> navigateur (le SDK s'exécute côté client) ; sa protection réelle est la
> restriction par référent HTTP ci-dessus, pas le fait de la stocker côté serveur.
>
> **Dev local.** `VITE_GOOGLE_MAPS_KEY` dans `.env` sert d'override optionnel
> (prioritaire s'il est renseigné), pratique hors ligne du backend.

## Géocodage & cache

Les contacts n'ont pas de coordonnées au départ. À l'ouverture de la carte, les
contacts sans coordonnées sont **géocodés** depuis leur adresse, puis la
latitude/longitude est **mise en cache en base** (colonnes `lat`/`lng`, migration
`0020_contact_geo.sql`). Un contact n'est donc géocodé qu'**une fois**.

Le géocodage utilise **en priorité l'API Adresse française (BAN,
`api-adresse.data.gouv.fr`)** : gratuite, sans clé, optimisée pour les adresses
françaises — la *Geocoding API* de Google n'est donc **pas nécessaire**. Google
n'est utilisé qu'en **repli** (adresses hors France, ou que la BAN ne résout pas) ;
si sa *Geocoding API* n'est pas activée sur la clé, ce repli échoue simplement, sans
gêner l'affichage de la carte.

Migration à exécuter dans le SQL Editor du projet admin (`wtovhzxymlqnfxyjxrdq`) :
`supabase/migrations/0020_contact_geo.sql`.

## RGPD

Les coordonnées sont dérivées de l'adresse **professionnelle** déjà enregistrée
(aucune donnée nouvelle sensible). Le géocodage interroge l'**API Adresse
française** (service public, data.gouv.fr). L'affichage de la carte passe par
**Google Maps** (sous-traitant) : les adresses des contacts visibles sont donc
transmises à Google pour le rendu (et, en repli de géocodage, à sa Geocoding
API). À mentionner dans le registre des traitements / la politique de
confidentialité.
