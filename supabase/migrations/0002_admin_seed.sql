-- ============================================================================
-- AvisDoc — Back-office : données de démonstration (optionnel)
--
-- À exécuter APRÈS 0001_admin_schema.sql, pour que la base ne démarre pas vide.
-- Idempotent (ON CONFLICT DO NOTHING) — réexécutable sans dupliquer.
-- Supprimez ce jeu quand vous passez en production réelle.
-- ============================================================================

-- --- Annuaire du réseau -----------------------------------------------------
insert into public.admin_network_contacts
  (id, name, role, type, statut, ville, adresse, email, tel, last_contact, notes)
values
  ('20000000-0000-0000-0000-000000000001','Dr Camille Roux','Médecin généraliste','Requérant','Accepté','Valence','12 rue des Alpes, 26000','c.roux@msp-valence.fr','06 12 48 77 30','12 juil.','Très active depuis mars — 40+ demandes envoyées. Souhaite une session de formation pour ses internes en septembre.'),
  ('20000000-0000-0000-0000-000000000002','Dr Karim Haddad','Dermatologue','Expert','Accepté','Lyon','45 cours Gambetta, 69003','k.haddad@avisdoc.fr','06 84 21 09 55','11 juil.','Expert référent mélanomes. Disponibilités réduites en août — prévoir la rotation des demandes.'),
  ('20000000-0000-0000-0000-000000000003','CHU de Grenoble','Service dermatologie','Réseau d''Aval','Accepté','Grenoble','Boulevard de la Chantourne, 38700 La Tronche','dermato@chu-grenoble.fr','04 76 76 75 75','9 juil.','Convention de prise en charge rapide signée en mai. Délai moyen de RDV post-avis : 9 jours.'),
  ('20000000-0000-0000-0000-000000000004','Dr Inès Marchal','Médecin du travail','Requérant','En attente','Annecy','8 avenue de Genève, 74000','i.marchal@sst74.fr','06 33 90 12 84','8 juil.','Campagne de dépistage en entreprise prévue T4 2026 — attente du devis.'),
  ('20000000-0000-0000-0000-000000000005','Dr Paul Verdier','Dermatologue','Expert','Accepté','Paris','102 boulevard Malesherbes, 75017','p.verdier@avisdoc.fr','06 71 55 42 18','8 juil.','Nouveau dans le réseau (juin 2026). Onboarding terminé, premières réponses sous 24h.'),
  ('20000000-0000-0000-0000-000000000006','Clinique Belledonne','Chirurgie dermatologique','Réseau d''Aval','Accepté','Saint-Martin','83 avenue Gabriel Péri, 38400 Saint-Martin-d''Hères','contact@belledonne.fr','04 76 90 11 22','5 juil.','Accepte les exérèses sous 15 jours. Point trimestriel à planifier.'),
  ('20000000-0000-0000-0000-000000000007','Dr Sofia Lemaire','Médecin généraliste','Requérant','Refusé','Montélimar','3 place du Marché, 26200','s.lemaire@cabinet-ml.fr','06 45 02 98 61','3 juil.','Demande une intégration avec son logiciel métier. À recontacter après la démo produit.'),
  ('20000000-0000-0000-0000-000000000008','Dr Élise Fontan','Dermatologue pédiatrique','Expert','Accepté','Marseille','27 rue Paradis, 13001','e.fontan@avisdoc.fr','06 28 74 30 96','1 juil.','Seule experte pédiatrique du réseau — recruter un second profil avant fin 2026.'),
  ('20000000-0000-0000-0000-000000000009','Centre Léon Bérard','Oncologie cutanée','Réseau d''Aval','Accepté','Lyon','28 rue Laennec, 69008','orientation@lyon-clb.fr','04 78 78 28 28','28 juin','Filière mélanome prioritaire. Contact direct : secrétariat oncodermatologie.'),
  ('20000000-0000-0000-0000-000000000010','Dr Hugo Bellec','Médecin généraliste','Requérant','En attente','Gap','14 boulevard Pompidou, 05000','h.bellec@msp-gap.fr','06 09 33 71 25','25 juin','Zone sous-dotée — usage régulier. Témoignage possible pour le site.'),
  ('20000000-0000-0000-0000-000000000011','Dr Anna Kovacs','Dermatologue','Expert','Accepté','Bordeaux','56 cours de l''Intendance, 33000','a.kovacs@avisdoc.fr','06 52 18 46 07','21 juin','Volume élevé (30 avis/mois). Renouvellement de la convention d''expertise en octobre.'),
  ('20000000-0000-0000-0000-000000000012','Hôpital Nord Ardèche','Consultations avancées','Réseau d''Aval','En attente','Annonay','Rue du Bon Pasteur, 07100','consult@hna07.fr','04 75 67 35 00','15 juin','Convention en cours de négociation — voir pipeline CRM.')
on conflict (id) do nothing;

-- --- Projets CRM ------------------------------------------------------------
insert into public.admin_clients
  (id, company, siren, naf, adresse, effectif, stage, jours, tarif, depistes, orientes, resultat, statut_propo)
values
  ('10000000-0000-0000-0000-000000000001','CHU de Grenoble','263 800 302','8610Z — Activités hospitalières','Bd de la Chantourne, 38700 La Tronche','5 000+','Signé',4,1400,312,18,'Convention filière rapide active. 4 journées réalisées au T2, taux d''orientation de 5,8% — reconduction proposée pour 2027.','Acceptée'),
  ('10000000-0000-0000-0000-000000000002','Mutuelle Alpes Santé','538 209 771','6512Z — Autres assurances','18 av. Félix Viallet, 38000 Grenoble','250-499','Nouveau',2,1200,0,0,null,'Brouillon'),
  ('10000000-0000-0000-0000-000000000003','SST Haute-Savoie','776 528 041','8621Z — Médecine générale','8 av. de Genève, 74000 Annecy','50-99','Qualifié',3,1200,0,0,null,'Brouillon'),
  ('10000000-0000-0000-0000-000000000004','CC du Diois','242 600 252','8411Z — Administration publique','42 rue Camille Buffardel, 26150 Die','100-249','Proposition',5,1100,0,0,null,'Envoyée'),
  ('10000000-0000-0000-0000-000000000005','Clinique Belledonne','057 505 470','8610Z — Activités hospitalières','83 av. Gabriel Péri, 38400 Saint-Martin-d''Hères','500-999','Signé',2,1400,145,11,'Campagne salariés réalisée en juin : 145 dépistés sur 2 journées, 11 orientations dont 2 exérèses programmées.','Acceptée'),
  ('10000000-0000-0000-0000-000000000006','Groupe scolaire Champollion','779 559 852','8531Z — Enseignement secondaire','1 cours Lafontaine, 38000 Grenoble','100-249','Proposition',1,950,0,0,null,'Envoyée')
on conflict (id) do nothing;

insert into public.admin_client_contacts (id, client_id, name, role, email, tel)
values
  ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Pr D. Salomon','Chef de service dermatologie','d.salomon@chu-grenoble.fr','04 76 76 75 75'),
  ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Claire Dumont','Responsable prévention','c.dumont@alpes-sante.fr','04 76 12 40 88'),
  ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','Dr Inès Marchal','Médecin du travail','i.marchal@sst74.fr','06 33 90 12 84'),
  ('30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000004','Marie Faure','Élue déléguée à la santé','m.faure@paysdiois.fr','04 75 22 29 44'),
  ('30000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000005','Dr M. Costa','Chirurgien dermatologue','m.costa@belledonne.fr','04 76 90 11 22'),
  ('30000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000006','Nathalie Perrin','Infirmière scolaire','n.perrin@champollion.fr','04 76 44 08 51')
on conflict (id) do nothing;

insert into public.admin_client_docs (id, client_id, name, ext, date_label)
values
  ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Convention filière rapide.pdf','PDF','9 juil.'),
  ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Bilan campagne T2.pdf','PDF','30 juin'),
  ('40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Planning journées.xlsx','XLS','2 juin'),
  ('40000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002','Plaquette AvisDoc entreprises.pdf','PDF','10 juil.'),
  ('40000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000003','Note de cadrage T4.docx','DOC','4 juil.'),
  ('40000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000004','Proposition campagne 5 jours.pdf','PDF','8 juil.'),
  ('40000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000004','Devis DEP-2026-041.pdf','PDF','8 juil.'),
  ('40000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000005','Convention exérèses.pdf','PDF','18 juin'),
  ('40000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000005','Bilan campagne salariés.pdf','PDF','28 juin'),
  ('40000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000006','Proposition sensibilisation.pdf','PDF','1 juil.')
on conflict (id) do nothing;

insert into public.admin_suivis (id, client_id, text, deadline, done, when_label)
values
  ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Bilan T2 partagé et validé par le service.',null,true,'30 juin'),
  ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','4e journée de dépistage réalisée (78 patients).',null,true,'24 juin'),
  ('50000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Convention signée.',null,true,'12 mai'),
  ('50000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002','Premier échange téléphonique — intérêt pour 2 journées adhérents.',null,true,'10 juil.'),
  ('50000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000003','Préparer la proposition 3 journées sites industriels','2026-07-12',false,null),
  ('50000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000003','Réunion de cadrage','2026-07-04',true,null),
  ('50000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000004','Relancer après le conseil communautaire','2026-07-23',false,null),
  ('50000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000004','Envoyer le devis DEP-2026-041','2026-07-08',true,null),
  ('50000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000004','Visiter les 3 sites envisagés','2026-06-26',true,null),
  ('50000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000005','Bilan de campagne transmis à la direction.',null,true,'28 juin'),
  ('50000000-0000-0000-0000-000000000011','10000000-0000-0000-0000-000000000005','Convention signée.',null,true,'18 juin'),
  ('50000000-0000-0000-0000-000000000012','10000000-0000-0000-0000-000000000006','Proposition 1 journée sensibilisation + dépistage personnels.',null,true,'1 juil.')
on conflict (id) do nothing;

-- --- Gestion documentaire globale -------------------------------------------
insert into public.admin_documents (id, name, ext, cat, size, date_label, owner, version)
values
  ('60000000-0000-0000-0000-000000000001','Convention CHU Grenoble — filière rapide.pdf','PDF','Conventions','1,2 Mo','9 juil. 2026','S. Benali',1),
  ('60000000-0000-0000-0000-000000000002','Compte-rendu comité médical T2 2026.docx','DOC','Comptes-rendus','340 Ko','5 juil. 2026','S. Benali',1),
  ('60000000-0000-0000-0000-000000000003','Grille tarifaire téléexpertise 2026.xlsx','XLS','Facturation','88 Ko','1 juil. 2026','M. Diallo',1),
  ('60000000-0000-0000-0000-000000000004','Registre des traitements RGPD — v4.pdf','PDF','Juridique','2,1 Mo','24 juin 2026','Cabinet Lexa',1),
  ('60000000-0000-0000-0000-000000000005','Convention Clinique Belledonne — exérèses.pdf','PDF','Conventions','980 Ko','18 juin 2026','S. Benali',1),
  ('60000000-0000-0000-0000-000000000006','Modèle de consentement patient — 2026.docx','DOC','Juridique','120 Ko','12 juin 2026','Cabinet Lexa',1),
  ('60000000-0000-0000-0000-000000000007','Facturation experts — juin 2026.xlsx','XLS','Facturation','210 Ko','2 juin 2026','M. Diallo',1),
  ('60000000-0000-0000-0000-000000000008','Charte du réseau d''experts AvisDoc.pdf','PDF','Conventions','640 Ko','20 mai 2026','S. Benali',1),
  ('60000000-0000-0000-0000-000000000009','Compte-rendu AG annuelle 2026.pdf','PDF','Comptes-rendus','1,8 Mo','14 mai 2026','S. Benali',1)
on conflict (id) do nothing;

-- --- Journal d'activité -----------------------------------------------------
insert into public.admin_activity (id, dot, text, when_label)
values
  ('70000000-0000-0000-0000-000000000001','bg-avisdoc-teal','Dr Camille Roux a envoyé 3 nouvelles demandes de téléexpertise.','Il y a 2 h'),
  ('70000000-0000-0000-0000-000000000002','bg-emerald-500','Convention signée avec le CHU de Grenoble (filière rapide).','Hier, 16:40'),
  ('70000000-0000-0000-0000-000000000003','bg-avisdoc-coral','Relance en attente : Hôpital Nord Ardèche — convention aval.','Hier, 09:15'),
  ('70000000-0000-0000-0000-000000000004','bg-avisdoc-teal','Dr Paul Verdier a rejoint le réseau d''experts.','8 juil.'),
  ('70000000-0000-0000-0000-000000000005','bg-slate-400','Compte-rendu trimestriel T2 ajouté aux documents.','5 juil.')
on conflict (id) do nothing;
