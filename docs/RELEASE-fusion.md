# Release — Fusion espace client + Rendez-vous

Pas à pas de mise en production de la branche `claude/avisdoc-fusion`.
Projet Supabase plateforme : **`wtovhzxymlqnfxyjxrdq`**.

> Les migrations et fonctions sont **idempotentes** : sans risque si une étape
> a déjà été faite. Respecter l'**ordre** des sections (la base avant les
> fonctions, le conteneur de génération avant la régénération).

---

## 1. Récupérer le code

```bash
cd /Users/arthuraurientis/avisdoc
git fetch origin claude/avisdoc-fusion
git checkout claude/avisdoc-fusion && git pull
```
Vérifier que l'action GitHub « generation-image » est **au vert** (elle a
reconstruit l'image de génération avec WeasyPrint 69).

## 2. Base de données — migrations

Supabase → **SQL Editor**. Coller et exécuter **dans l'ordre** le contenu de :

- [ ] `supabase/migrations/0003_fusion_espace_client.sql`
- [ ] `supabase/migrations/0004_rattachement_par_email.sql`
- [ ] `supabase/migrations/0005_rendez_vous.sql`
- [ ] `supabase/migrations/0006_rdv_annulation.sql`
- [ ] `supabase/migrations/0007_rdv_rappels.sql`

*(0001 / 0002 = schéma admin de base, déjà en place.)*

## 3. Configuration Auth — Supabase → Authentication

- [ ] **URL Configuration → Site URL** = `https://client.avisdoc.fr`
- [ ] **Redirect URLs** : ajouter `https://client.avisdoc.fr/**` et `https://admin.avisdoc.fr/**`
- [ ] **Email Templates → Magic Link** = contenu de `supabase/email-templates/magic-link.html`
- [ ] **Email Templates → Invite user** = contenu de `supabase/email-templates/invite-user.html`

## 4. Secrets — Supabase (Edge Functions → Secrets, ou CLI)

```bash
supabase secrets set CLIENT_APP_URL=https://client.avisdoc.fr --project-ref wtovhzxymlqnfxyjxrdq
supabase secrets set RESEND_API_KEY=re_xxx                    --project-ref wtovhzxymlqnfxyjxrdq
supabase secrets set RAPPELS_SECRET=un-secret-aleatoire       --project-ref wtovhzxymlqnfxyjxrdq
# optionnel : supabase secrets set RDV_FROM="AvisDoc <noreply@avisdoc.fr>" --project-ref wtovhzxymlqnfxyjxrdq
```
*(`PAPPERS_API_KEY`, `CONTACT_TO` = fonctions pré-existantes, déjà configurées.)*

## 5. Edge Functions — déploiement

```bash
find supabase/functions -name '.DS_Store' -delete   # évite « Invalid Function name »
supabase functions deploy inviter-espace  --project-ref wtovhzxymlqnfxyjxrdq
supabase functions deploy supprimer-client --project-ref wtovhzxymlqnfxyjxrdq
supabase functions deploy rdv             --project-ref wtovhzxymlqnfxyjxrdq
supabase functions deploy rdv-rappels     --project-ref wtovhzxymlqnfxyjxrdq
```

## 6. Cron des rappels — Supabase → Database → Cron Jobs

- [ ] Planifier `rdv-rappels` **toutes les 15 min**, en-tête `x-secret: <RAPPELS_SECRET>`.

Fallback SQL (extensions `pg_cron` + `pg_net` à activer) :
```sql
select cron.schedule('rdv-rappels', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://wtovhzxymlqnfxyjxrdq.supabase.co/functions/v1/rdv-rappels',
    headers := jsonb_build_object('Content-Type','application/json','x-secret','TON_SECRET'),
    body := '{}'::jsonb);
$$);
```

## 7. Service de génération — image + conteneur

- [ ] L'image `:latest` (WeasyPrint 69 + corrections logos) est reconstruite au push (étape 1).
- [ ] **Redéployer le conteneur Scaleway** pour tirer la nouvelle image
      (Console Scaleway → Containers → `generation` → Deploy).

> Prérequis déjà en place : la Database Webhook Supabase sur `INSERT` dans
> `admin_generation_jobs` pointe vers le conteneur (en-tête `X-Webhook-Secret`).

## 8. Fronts — OVH

```bash
./scripts/deploy-ovh.sh          # admin + client
# ./scripts/deploy-ovh.sh all    # + vitrine (www) si elle a changé
```
Attendre `✓ admin déployé` et `✓ client déployé`.

## 9. Régénération des documents (clients « Signé » existants)

Après l'étape 7 (conteneur à jour), pour chaque client concerné :
- **Bouton « Régénérer »** dans la fiche client → carte Espace client → Documents générés,
- ou SQL :
```sql
delete from admin_generated_docs where client_id = 'CLIENT_ID';
insert into admin_generation_jobs (client_id, type, logo_sha256)
select id, 'maj_logo', logo_sha256 from admin_clients where id = 'CLIENT_ID';
```

## 10. Vérifications post-release

- [ ] `admin.avisdoc.fr` : CRM en **accordéon**, carte **Espace client**, section **Rendez-vous**.
- [ ] **Inviter** un utilisateur → e-mail brandé → lien `client.avisdoc.fr/auth/confirm` → **connecté**.
- [ ] `client.avisdoc.fr` : documents (**visionneuse intégrée**), e-mails (**accordéon + lien par journée**), **rendez-vous**.
- [ ] Créer une **journée** → réserver via le lien → **confirmation e-mail** (Google/Outlook/.ics + annulation) → inscrit visible (admin + espace client).
- [ ] Documents régénérés : **logos détourés**, en-têtes alignés, plaque blanche sur les couvertures PPT.

---

### Récapitulatif des dépendances externes
| Élément | Où | Secret / config |
|--------|-----|-----------------|
| Auth e-mails (magic link, invite) | Resend (SMTP Supabase) | DKIM/DMARC sur `avisdoc.fr` |
| Confirmation / rappels RDV | Resend API | `RESEND_API_KEY` |
| Rappels planifiés | Supabase Cron | `RAPPELS_SECRET` |
| Génération documents | Scaleway Container | image `:latest`, `WEBHOOK_SECRET` |
| Fronts | OVH Multisite | `.env.deploy` (SFTP) |
