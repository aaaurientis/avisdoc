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
3. Renseigner la clé dans `.env` :

   ```
   VITE_GOOGLE_MAPS_KEY="votre_clé"
   ```

4. Rebuild / redéploiement (le front lit la clé au build).

Tant que la clé est vide, l'onglet **Carte** affiche un message de configuration
(aucune erreur bloquante).

## Géocodage & cache

Les contacts n'ont pas de coordonnées au départ. À l'ouverture de la carte, les
contacts sans coordonnées sont **géocodés** depuis leur adresse (API Geocoding),
puis la latitude/longitude est **mise en cache en base** (colonnes `lat`/`lng`,
migration `0020_contact_geo.sql`). Un contact n'est donc géocodé qu'**une fois**.

Migration à exécuter dans le SQL Editor du projet admin (`wtovhzxymlqnfxyjxrdq`) :
`supabase/migrations/0020_contact_geo.sql`.

## RGPD

Les coordonnées sont dérivées de l'adresse **professionnelle** déjà enregistrée
(aucune donnée nouvelle sensible). En utilisant Google Maps, Google agit comme
sous-traitant : les adresses des contacts visibles sur la carte sont transmises à
Google pour l'affichage et le géocodage — à mentionner dans le registre des
traitements / la politique de confidentialité.
