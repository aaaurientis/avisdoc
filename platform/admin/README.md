# Admin — admin.avisdoc.fr

Backoffice AvisDoc : CRM (statut), création d'espaces clients, logo, domaines,
utilisateurs, suivi de la génération, envoi des invitations.

Vite + React + TypeScript + Tailwind, sur le backend Supabase commun.

## Développement

```bash
npm install
cp .env.example .env   # renseigner VITE_SUPABASE_ANON_KEY
npm run dev            # http://localhost:8090
```

## Rôle d'administrateur

L'accès est réservé aux comptes présents dans la table `admins`. Connexion par
lien magique (`signInWithOtp`). Un compte connecté mais absent d'`admins` voit
un écran « Accès réservé ».

Pour déclarer un premier admin (une fois le compte Auth créé) :

```sql
insert into admins (auth_user_id, email)
values ('<auth_user_id>', 'prenom@avisdoc.fr');
```

## Flux couvert

1. Créer un client, déclarer ses **domaines** (`acme.fr`) et ses **utilisateurs**
   (contrôle : l'adresse doit relever d'un domaine déclaré).
2. **Téléverser le logo** (PNG/SVG transparent, hauteur ≥ 200 px) → bucket `logos`.
3. Passer le statut à **« Signé »** → déclenche la génération (trigger + service).
   Le passage à « Signé » est refusé tant qu'aucun logo n'est téléversé.
4. Suivre l'état de la **génération** et la liste des **documents** produits.
5. **Envoyer les invitations** (validation humaine) → Edge Function
   `inviter-utilisateurs` (magic link restreint aux domaines déclarés).

## Sécurité

- Seule la **clé anon** (publique) est utilisée côté navigateur ; toutes les
  écritures sensibles passent par la RLS (droits admin) ou par l'Edge Function
  à clé service_role.
- Les documents de niveau `hds` n'existent pas sur ce backend : rien à masquer
  côté UI, ils ne remontent jamais.
