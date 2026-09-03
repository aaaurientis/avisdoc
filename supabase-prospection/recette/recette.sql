-- ============================================================================
-- Recette SQL du module de prospection — données fictives, transaction annulée.
-- À jouer dans le SQL Editor du projet VITRINE après la migration 0001, ou en
-- local via scripts/prospection-recette-sql.sh. Chaque bloc lève une exception
-- si l'attendu n'est pas constaté ; le ROLLBACK final ne laisse rien en base.
-- Couvre les points 1, 2, 5, 6 et 7 du plan de recette (§8 du brief) côté
-- serveur. Les points 3 et 4 (scoring, garde-fous de génération) se recettent
-- par `npm run test` (fonctions pures du domaine).
-- ============================================================================
begin;

-- On se fait passer pour un membre @avisdoc.fr (ce que PostgREST fait via le JWT).
select set_config('request.jwt.claims', '{"email":"recette@avisdoc.fr","role":"authenticated"}', true);
set local role postgres;

-- Un contact déjà en exclusion (opposition antérieure).
insert into prospection.exclusion (linkedin_url, motif)
  values ('https://www.linkedin.com/in/recette-exclu', 'opposition');

-- ---------------------------------------------------------------------------
-- 1. Import de dix lignes : deux doublons, un contact en exclusion.
-- ---------------------------------------------------------------------------
create temp table recette_lignes as
select $j$[
 {"compte":{"nom":"Recette Courtage Est","type":"courtier","cercle":1,"region":"Grand Est"},
  "contact":{"prenom":"Alice","nom":"Recette-1","fonction":"Associée","niveau":"associe","linkedin_url":"https://www.linkedin.com/in/recette-1/","score":40}},
 {"compte":{"nom":"Recette Courtage Est","type":"courtier","cercle":1},
  "contact":{"prenom":"Bruno","nom":"Recette-2","fonction":"Directeur","niveau":"directeur","linkedin_url":"linkedin.com/in/recette-2?trk=x"}},
 {"compte":{"nom":"Recette QVCT Île-de-France","type":"qvct","cercle":2},
  "contact":{"prenom":"Chloé","nom":"Recette-3","fonction":"Responsable QVCT","niveau":"responsable","linkedin_url":"https://fr.linkedin.com/in/recette-3","email":"c.recette3@exemple.fr"}},
 {"compte":{"nom":"Recette Industrie","type":"entreprise","cercle":3,"effectif_min":250,"effectif_max":1000,"expose":true},
  "contact":{"prenom":"David","nom":"Recette-4","fonction":"DRH","niveau":"directeur","linkedin_url":"https://www.linkedin.com/in/recette-4"}},
 {"compte":{"nom":"Recette Industrie","type":"entreprise"},
  "contact":{"prenom":"Emma","nom":"Recette-5","fonction":"Chargée de prévention","niveau":"charge","linkedin_url":"https://www.linkedin.com/in/recette-5"}},
 {"compte":{"nom":"Recette Courtage Est","type":"courtier"},
  "contact":{"prenom":"Alice","nom":"Recette-1","email":"alice@exemple.fr","linkedin_url":"https://www.linkedin.com/in/recette-1"}},
 {"compte":{"nom":"Recette Mutuelle","type":"mutuelle","cercle":2},
  "contact":{"prenom":"Farid","nom":"Recette-6","fonction":"VP Partenariats","niveau":"vp","linkedin_url":"https://www.linkedin.com/in/recette-6"}},
 {"compte":{"nom":"Recette Grossiste","type":"grossiste","cercle":2},
  "contact":{"prenom":"Gaëlle","nom":"Recette-7","fonction":"Directrice","niveau":"directeur","linkedin_url":"https://www.linkedin.com/in/recette-7"}},
 {"compte":{"nom":"Recette Exclu SARL","type":"courtier","cercle":1},
  "contact":{"prenom":"Hugo","nom":"Recette-exclu","linkedin_url":"https://www.linkedin.com/in/recette-exclu"}},
 {"compte":{"nom":"Recette Industrie","type":"entreprise"},
  "contact":{"prenom":"David","nom":"Recette-4","fonction":"DRH","linkedin_url":"HTTPS://WWW.LINKEDIN.COM/IN/RECETTE-4/"}}
]$j$::jsonb as lignes;

do $$
declare r jsonb;
begin
  -- Aperçu : aucune écriture.
  r := prospection.importer('Recette', 'recette.csv', (select lignes from recette_lignes), false);
  assert (r ->> 'lues')::int = 10, 'aperçu : 10 lignes lues attendues, ' || r::text;
  assert (r ->> 'creees')::int = 7, 'aperçu : 7 créées attendues, ' || r::text;
  assert (r ->> 'mises_a_jour')::int = 2, 'aperçu : 2 doublons attendus, ' || r::text;
  assert (r -> 'ignorees' ->> 'exclusion')::int = 1, 'aperçu : 1 exclusion attendue, ' || r::text;
  assert (select count(*) from prospection.contact) = 0, 'aperçu : aucune écriture attendue';

  -- Écriture.
  r := prospection.importer('Recette', 'recette.csv', (select lignes from recette_lignes), true);
  assert (r ->> 'creees')::int = 7 and (r ->> 'mises_a_jour')::int = 2
     and (r -> 'ignorees' ->> 'exclusion')::int = 1, 'écriture : compteurs, ' || r::text;
  assert (select count(*) from prospection.contact) = 7, 'écriture : 7 contacts en base';
  assert (select count(*) from prospection.compte) = 5, 'écriture : 5 comptes en base (le compte de la ligne exclue n''est pas créé)';
  assert (select email from prospection.contact where nom = 'Recette-1') = 'alice@exemple.fr',
    'le doublon a complété le champ vide email';
  assert (select fonction from prospection.contact where nom = 'Recette-1') = 'Associée',
    'le doublon n''a pas écrasé la fonction renseignée';
  assert (select linkedin_url from prospection.contact where nom = 'Recette-2')
     = 'https://www.linkedin.com/in/recette-2', 'normalisation de l''URL LinkedIn';
  assert not exists (select 1 from prospection.contact where nom = 'Recette-exclu'), 'le contact exclu n''est pas créé';
  assert (select lignes_creees from prospection.import limit 1) = 7, 'trace d''import renseignée';
  raise notice '1. Import : OK (%)', r;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Même fichier une seconde fois : aucune duplication, aucun statut régressé.
-- ---------------------------------------------------------------------------
do $$
declare r jsonb; v_id uuid;
begin
  select id into v_id from prospection.contact where nom = 'Recette-3';
  perform prospection.transition_contact(v_id, 'a_contacter');
  r := prospection.importer('Recette bis', 'recette.csv', (select lignes from recette_lignes), true);
  assert (r ->> 'creees')::int = 0, 'second import : rien de créé, ' || r::text;
  assert (r ->> 'mises_a_jour')::int = 9, 'second import : 9 doublons, ' || r::text;
  assert (select count(*) from prospection.contact) = 7, 'second import : toujours 7 contacts';
  assert (select statut from prospection.contact where id = v_id) = 'a_contacter', 'aucun statut régressé';
  raise notice '2. Réimport : OK';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Séquence complète : envoi, trois relances armées, réponse, annulation.
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid; r jsonb;
begin
  select id into v_id from prospection.contact where nom = 'Recette-1';
  -- Le front ne peut pas écrire le statut.
  begin
    update prospection.contact set statut = 'invite' where id = v_id;
    raise exception 'garde statut absente';
  exception when others then
    assert sqlerrm = 'statut_non_modifiable', 'garde statut : ' || sqlerrm;
  end;
  -- Transition interdite, motif nommé.
  begin
    perform prospection.transition_contact(v_id, 'partenaire');
    raise exception 'transition interdite acceptée';
  exception when others then
    assert sqlerrm = 'transition_refusee', 'motif nommé attendu : ' || sqlerrm;
  end;
  perform prospection.transition_contact(v_id, 'a_contacter');
  r := prospection.marquer_envoye(v_id, 'invitation', 'Bonjour, invitation de recette.');
  assert (r ->> 'statut') = 'invite', 'statut invite après envoi';
  assert (select count(*) from prospection.relance where contact_id = v_id and etat = 'en_attente') = 3, 'trois relances armées';
  assert (select du_le from prospection.relance where contact_id = v_id and echeance = 'j5')
       = (now() at time zone 'Europe/Paris')::date + 5, 'échéance J+5';
  assert (select du_le from prospection.relance where contact_id = v_id and echeance = 'j21')
       = (now() at time zone 'Europe/Paris')::date + 21, 'échéance J+21';
  -- Relance J+5 faite.
  r := prospection.marquer_envoye(v_id, 'message_valeur', 'Message de valeur.');
  assert (select etat from prospection.relance where contact_id = v_id and echeance = 'j5') = 'fait', 'J+5 faite';
  -- Réponse entrante : annule le reste, passe en conversation.
  r := prospection.enregistrer_reponse(v_id, 'linkedin', 'Merci, intéressée.');
  assert (r ->> 'statut') = 'en_conversation', 'en conversation après réponse : ' || r::text;
  assert (select count(*) from prospection.relance where contact_id = v_id and etat = 'en_attente') = 0, 'relances restantes annulées';
  assert (select count(*) from prospection.relance where contact_id = v_id and etat = 'annule') = 2, 'deux relances annulées';
  assert (select count(*) from prospection.v_reponses_non_traitees where contact_id = v_id) = 1, 'réponse visible dans l''écran du jour';
  perform prospection.marquer_traitee((select id from prospection.v_reponses_non_traitees where contact_id = v_id));
  assert (select count(*) from prospection.v_reponses_non_traitees where contact_id = v_id) = 0, 'réponse traitée';

  -- Fin de séquence sans réponse : la proposition J+21 clôt.
  select id into v_id from prospection.contact where nom = 'Recette-2';
  perform prospection.transition_contact(v_id, 'a_contacter');
  perform prospection.marquer_envoye(v_id, 'invitation', 'Invitation.');
  perform prospection.marquer_envoye(v_id, 'message_valeur', 'J+5.');
  perform prospection.marquer_envoye(v_id, 'partage_contenu', 'J+12.');
  r := prospection.marquer_envoye(v_id, 'proposition', 'J+21.');
  assert (r ->> 'statut') = 'arrete', 'séquence arrêtée après la proposition';
  begin
    perform prospection.marquer_envoye(v_id, 'message_valeur', 'Encore ?');
    raise exception 'relance hors séquence acceptée';
  exception when others then
    assert sqlerrm = 'relance_hors_sequence', 'motif attendu : ' || sqlerrm;
  end;
  raise notice '5. Séquence : OK';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Plafond : seize invitations dans la journée, la seizième refusée.
-- ---------------------------------------------------------------------------
do $$
declare i integer; v_id uuid; v_refus boolean := false;
begin
  -- Deux invitations déjà tracées (recette 5) : on en crée quatorze de plus.
  for i in 1..14 loop
    insert into prospection.contact (nom, prenom, linkedin_url)
      values ('Plafond-' || i, 'P', 'https://www.linkedin.com/in/plafond-' || i) returning id into v_id;
    perform prospection.transition_contact(v_id, 'a_contacter');
    if i <= 13 then
      perform prospection.marquer_envoye(v_id, 'invitation', 'Invitation ' || i);
    else
      begin
        perform prospection.marquer_envoye(v_id, 'invitation', 'Invitation 16');
      exception when others then
        v_refus := (sqlerrm = 'plafond_invitations_atteint');
      end;
    end if;
  end loop;
  assert prospection.invitations_du_jour() = 15, 'quinze invitations aujourd''hui, ' || prospection.invitations_du_jour();
  assert v_refus, 'la seizième invitation doit être refusée avec le motif plafond_invitations_atteint';
  raise notice '6. Plafond : OK';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Purge : un contact sans interaction depuis trois ans est purgé et journalisé.
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid; n integer;
begin
  select id into v_id from prospection.contact where nom = 'Recette-7';
  -- On vieillit la fiche (trigger : on passe par une mise à jour directe puis on force les dates).
  alter table prospection.contact disable trigger trg_contact_avant_ecriture;
  update prospection.contact set maj_le = now() - interval '3 years 1 day', cree_le = now() - interval '4 years' where id = v_id;
  alter table prospection.contact enable trigger trg_contact_avant_ecriture;
  n := prospection.purger_inactifs();
  assert n = 1, 'un contact purgé attendu, ' || n;
  assert not exists (select 1 from prospection.contact where id = v_id), 'contact purgé';
  assert exists (select 1 from prospection.journal where evenement = 'purge' and (detail ->> 'contacts')::int = 1), 'purge journalisée';
  raise notice '7. Purge : OK';
end $$;

-- ---------------------------------------------------------------------------
-- Opposition (lien email) : exclusion créée, fiche supprimée, réimport bloqué.
-- ---------------------------------------------------------------------------
do $$
declare v_jeton uuid; r jsonb;
begin
  select jeton_opposition into v_jeton from prospection.contact where nom = 'Recette-3';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  assert prospection.opposition(v_jeton), 'opposition acceptée';
  perform set_config('request.jwt.claims', '{"email":"recette@avisdoc.fr","role":"authenticated"}', true);
  assert exists (select 1 from prospection.exclusion where email = 'c.recette3@exemple.fr'), 'exclusion par email';
  assert not exists (select 1 from prospection.contact where nom = 'Recette-3'), 'fiche supprimée';
  r := prospection.importer('Recette ter', 'recette.csv', (select lignes from recette_lignes), true);
  -- Recette-7 (purgé, non exclu) est légitimement recréé ; Recette-3 (opposé) ne l'est jamais.
  assert (r ->> 'creees')::int = 1 and (r -> 'ignorees' ->> 'exclusion')::int = 2, 'l''opposé n''est jamais recréé, ' || r::text;
  assert not exists (select 1 from prospection.contact where nom = 'Recette-3'), 'l''opposé reste absent';
  raise notice 'Opposition : OK';
end $$;

-- Synthèse hebdomadaire de la semaine courante (vérification de forme).
do $$
declare s prospection.synthese_hebdo;
begin
  s := prospection.generer_synthese_hebdo((date_trunc('week', current_date))::date);
  assert s.invitations = 15, 'quinze invitations cette semaine, ' || s.invitations;
  assert jsonb_typeof(s.par_cercle) = 'array', 'répartition par cercle';
  raise notice 'Synthèse : OK (% invitations, % acceptations, % conversations)', s.invitations, s.acceptations, s.conversations_ouvertes;
end $$;

rollback;
