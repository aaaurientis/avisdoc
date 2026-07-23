# Espace client — client.avisdoc.fr

Espace destiné aux collaborateurs des entreprises clientes : bibliothèque de
documents de campagne, aperçu, e-mails prêts à copier.

Vite + React + TypeScript + Tailwind, sur le backend Supabase commun.

## Développement

```bash
npm install
cp .env.example .env   # renseigner VITE_SUPABASE_ANON_KEY
npm run dev            # http://localhost:8091
```

## Accès

- Connexion par **lien magique** (`signInWithOtp`, `shouldCreateUser: false` :
  une adresse inconnue ne crée pas de compte).
- L'utilisateur est rattaché à son client via `utilisateurs_client` ; la RLS ne
  lui montre que les documents de **son** espace (niveaux `public` et `client`).
- Les documents `hds` n'existent pas sur ce backend : aucun risque d'exposition.

## Fonctionnalités

- **Bibliothèque** filtrable par phase de campagne et par format. Aperçu /
  téléchargement via URL publique (bucket public) ou URL signée (bucket client).
- **E-mails** servis depuis `src/data/emails.json` (copie du gabarit du pack) :
  substitution des champs `{{date}}`, `{{lieu}}`, `{{lien}}`, `{{entreprise}}`,
  `{{signature}}` côté client, avec bouton « Copier ». Ce ne sont pas des PDF.

## Note

`src/data/emails.json` est une copie du gabarit
`generation-service/paquet/scripts/gabarits/emails.json`. Si le gabarit évolue,
resynchroniser ce fichier.
