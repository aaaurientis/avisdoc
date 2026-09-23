-- ============================================================================
-- 0042 — L'activité en français, pas en code
-- ----------------------------------------------------------------------------
-- « Remets-moi l'activité comme c'était : fabrication de produits pharmaceutiques
--   de base. Mais pas les codes NAF, pas dans ces colonnes-là. »
--
-- L'annuaire de l'État ne rend que le code d'activité : « 21.20Z ». Quand j'ai
-- cessé de jeter les entreprises dont le métier n'était pas dans notre petite
-- table, je leur ai laissé ce code pour libellé, faute de mieux. Quatre-vingt-seize
-- fiches sur cent soixante affichent donc un matricule là où le commercial attend
-- un métier.
--
-- La fonction dispose désormais de la nomenclature officielle en entier : les
-- nouvelles fiches arrivent déjà traduites. Celles-ci sont les anciennes.
--
-- 50 codes distincts, tous traduits par le libellé officiel de la
-- nomenclature d'activités française.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

update public.admin_prospects
set activity = case substring(activity from 10)
  when '10.11Z' then 'Transformation et conservation de la viande de boucherie'
  when '10.41A' then 'Fabrication d’huiles et graisses brutes'
  when '10.51C' then 'Fabrication de fromage'
  when '10.71A' then 'Fabrication industrielle de pain et de pâtisserie fraîche'
  when '10.71C' then 'Boulangerie et boulangerie-pâtisserie'
  when '10.82Z' then 'Fabrication de cacao, chocolat et de produits de confiserie'
  when '10.83Z' then 'Transformation du thé et du café'
  when '10.91Z' then 'Fabrication d’aliments pour animaux de ferme'
  when '13.92Z' then 'Fabrication d’articles textiles, sauf habillement'
  when '14.13Z' then 'Fabrication de vêtements de dessus'
  when '14.14Z' then 'Fabrication de vêtements de dessous'
  when '14.19Z' then 'Fabrication d’autres vêtements et accessoires'
  when '14.31Z' then 'Fabrication d’articles chaussants à mailles'
  when '15.12Z' then 'Fabrication d’articles de voyage, de maroquinerie et de sellerie'
  when '15.20Z' then 'Fabrication de chaussures'
  when '16.24Z' then 'Fabrication d’emballages en bois'
  when '17.21A' then 'Fabrication de carton ondulé'
  when '19.20Z' then 'Raffinage du pétrole'
  when '20.11Z' then 'Fabrication de gaz industriels'
  when '20.14Z' then 'Fabrication d’autres produits chimiques organiques de base'
  when '20.15Z' then 'Fabrication de produits azotés et d’engrais'
  when '20.30Z' then 'Fabrication de peintures, vernis, encres et mastics'
  when '20.59Z' then 'Fabrication d’autres produits chimiques n.c.a.'
  when '22.21Z' then 'Fabrication de plaques, feuilles, tubes et profilés en matières plastiques'
  when '22.22Z' then 'Fabrication d’emballages en matières plastiques'
  when '22.29A' then 'Fabrication de pièces techniques à base de matières plastiques'
  when '23.12Z' then 'Façonnage et transformation du verre plat'
  when '23.51Z' then 'Fabrication de ciment'
  when '23.61Z' then 'Fabrication d’éléments en béton pour la construction'
  when '23.62Z' then 'Fabrication d’éléments en plâtre pour la construction'
  when '23.63Z' then 'Fabrication de béton prêt à l’emploi'
  when '23.64Z' then 'Fabrication de mortiers et bétons secs'
  when '23.99Z' then 'Fabrication d’autres produits minéraux non métalliques n.c.a.'
  when '24.33Z' then 'Profilage à froid par formage ou pliage'
  when '24.51Z' then 'Fonderie de fonte'
  when '26.30Z' then 'Fabrication d’équipements de communication'
  when '26.51A' then 'Fabrication d’équipements d’aide à la navigation'
  when '27.12Z' then 'Fabrication de matériel de distribution et de commande électrique'
  when '27.33Z' then 'Fabrication de matériel d’installation électrique'
  when '28.13Z' then 'Fabrication d’autres pompes et compresseurs'
  when '28.29B' then 'Fabrication d’autres machines d’usage général'
  when '29.10Z' then 'Construction de véhicules automobiles'
  when '29.20Z' then 'Fabrication de carrosseries et remorques'
  when '33.11Z' then 'Réparation d’ouvrages en métaux'
  when '33.12Z' then 'Réparation de machines et équipements mécaniques'
  when '33.13Z' then 'Réparation de matériels électroniques et optiques'
  when '33.14Z' then 'Réparation d’équipements électriques'
  when '33.20A' then 'Installation de structures métalliques, chaudronnées et de tuyauterie'
  when '33.20B' then 'Installation de machines et équipements mécaniques'
  when '33.20D' then 'Installation d’équipements électriques, de matériels électroniques et optiques ou d’autres matériels'
end
where activity ~ '^Activité [0-9]'
  and substring(activity from 10) in ('10.11Z', '10.41A', '10.51C', '10.71A', '10.71C', '10.82Z', '10.83Z', '10.91Z', '13.92Z', '14.13Z', '14.14Z', '14.19Z', '14.31Z', '15.12Z', '15.20Z', '16.24Z', '17.21A', '19.20Z', '20.11Z', '20.14Z', '20.15Z', '20.30Z', '20.59Z', '22.21Z', '22.22Z', '22.29A', '23.12Z', '23.51Z', '23.61Z', '23.62Z', '23.63Z', '23.64Z', '23.99Z', '24.33Z', '24.51Z', '26.30Z', '26.51A', '27.12Z', '27.33Z', '28.13Z', '28.29B', '29.10Z', '29.20Z', '33.11Z', '33.12Z', '33.13Z', '33.14Z', '33.20A', '33.20B', '33.20D');
