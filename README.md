# AvisDoc — site vitrine

Site vitrine d'AvisDoc, solution française de téléexpertise dermatologique.

- **Slogan** : *La dermatologie n'attend pas.*
- **Proposition** : avis d'un dermatologue expert sous 96 heures, sans déplacement.
- **Publics** : entreprises, collectivités, professionnels de santé.

## Stack

- **Vite** + **React 18** + **TypeScript**
- **Tailwind CSS** avec un design system maison (`src/index.css`, `tailwind.config.ts`)
- **React Router** pour la navigation
- **shadcn/ui** — seulement les composants réellement utilisés (`button`, `accordion`, `input`, `toast`, `sonner`, `tooltip`)
- **lucide-react** pour les icônes
- **Supabase Edge Function** pour le formulaire de suppression de données (`supabase/functions/send-data-deletion-request`)

## Développement

```bash
npm install
npm run dev       # http://localhost:8080
```

Autres scripts :

```bash
npm run build         # build production
npm run build:dev     # build avec mode development
npm run preview       # servir le build
npm run lint          # ESLint
npm run test          # Vitest (un seul run)
npm run test:watch    # Vitest watch
```

## Structure

```
src/
  assets/               Images (photos équipe, hero, logos partenaires)
  components/
    primitives.tsx      Eyebrow, Chip, Section, SectionHeader
    sections/           Sections marketing de la home
    ui/                 Primitifs shadcn (button, accordion, input, toast, tooltip)
    Header.tsx
    Footer.tsx
    LegalLayout.tsx     Layout partagé pour CGU / mentions / confidentialité
  integrations/
    supabase/           Client Supabase (suppression des données)
  lib/
    seo.ts              Hook useSEO (title, description, canonical, OG, JSON-LD)
    schema.ts           Schémas schema.org réutilisables (MedicalOrganization, HowTo, FAQPage…)
    utils.ts            cn() Tailwind merge
  pages/
    Index.tsx           Home
    CGU.tsx
    MentionsLegales.tsx
    PolitiqueConfidentialite.tsx
    SuppressionDonnees.tsx
    NotFound.tsx
public/
  favicon.svg           Favicon SVG aux couleurs de la marque
  og-image.svg          Image de partage (LinkedIn / Twitter / Meta)
  robots.txt            Autorise les bots classiques ET génératifs (GPTBot, ClaudeBot, PerplexityBot…)
  sitemap.xml           Plan du site
  llms.txt              Résumé structuré du site pour les moteurs génératifs (GEO)
  manifest.webmanifest  Manifeste PWA minimal
```

## SEO & GEO

Chaque page appelle `useSEO({ title, description, canonical, jsonLd })` pour :

- mettre à jour `<title>`, `<meta description>`, `<link rel="canonical">`
- pousser les bonnes métadonnées Open Graph & Twitter
- injecter un bloc JSON-LD (`MedicalOrganization`, `WebSite`, `MedicalProcedure`, `HowTo`, `FAQPage`)

Le dossier `public/` contient également `robots.txt`, `sitemap.xml` et `llms.txt` pour maximiser la découvrabilité par Google, Bing, et les moteurs génératifs (ChatGPT search, Perplexity, Google SGE, Claude search).

Sur la home, le composant `AtAGlanceSection` fournit un résumé déclaratif et citable (chiffres clés, mission) optimisé pour les extraits générés par les LLMs.

## Environnement

Les variables d'environnement vivent dans `.env` (non commité normalement) :

```
VITE_SUPABASE_PROJECT_ID=…
VITE_SUPABASE_PUBLISHABLE_KEY=…   # clé anon, publique par design
VITE_SUPABASE_URL=…
```

## Déploiement

Le build (`npm run build`) produit le dossier `dist/` servable par n'importe quel hébergement statique (Netlify, Vercel, Cloudflare Pages, OVH, GitHub Pages…). Penser à configurer les redirections SPA (toute route → `/index.html`) pour que React Router fonctionne.
