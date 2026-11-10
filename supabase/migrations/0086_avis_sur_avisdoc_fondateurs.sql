-- ============================================================================
-- 0086 — « Les avis sur AvisDoc » : AvisDoc, et ses fondateurs (Olivier, 10/11)
-- ----------------------------------------------------------------------------
-- Ce qu'on dit des fondateurs et dirigeants d'AvisDoc à propos de leur rôle chez
-- AvisDoc (félicitations, nomination, interview) entre dans la rubrique.
-- On ne remplace la description que si personne ne l'a modifiée dans le Paramétrage.
-- Idempotent : rejouable sans effet.
-- ============================================================================
update public.admin_veille_rubriques
set description = 'Tout ce que d''autres disent d''AvisDoc, la télé-expertise dermatologique, ou de ses fondateurs et dirigeants à propos de leur rôle chez AvisDoc (félicitations, nomination, interview) : article de presse, avis, commentaire, post ou réponse sur un réseau social, mention par un client, un médecin, un partenaire ou un concurrent, même en passant. Seulement AvisDoc, la société : pas un « avis » de médecin ni un autre service au nom proche. Pas ce qu''AvisDoc publie elle-même (son site, sa page LinkedIn).',
    updated_at = now()
where nom = 'Ce qu''on dit d''AvisDoc'
  and description = 'Tout ce que d''autres disent d''AvisDoc, la télé-expertise dermatologique : article de presse, avis, commentaire, post ou réponse sur un réseau social, mention par un client, un médecin, un partenaire ou un concurrent, même en passant. Seulement AvisDoc, la société : pas un « avis » de médecin ni un autre service au nom proche. Pas ce qu''AvisDoc publie elle-même (son site, sa page LinkedIn).';
