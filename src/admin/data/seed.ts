// Jeu de données de démonstration — repris du prototype de design.
// Sert de contenu au mode « mock » (sans backend) et de graine pour peupler
// Supabase lors de la première configuration.

import type {
  ActivityItem,
  Client,
  DocItem,
  NetworkContact,
  PappersResult,
} from "../types";

export const SEED_CONTACTS: NetworkContact[] = [
  { id: "ct-1", name: "Dr Camille Roux", role: "Médecin généraliste", type: "Requérant", statut: "Accepté", ville: "Valence", adresse: "12 rue des Alpes, 26000", email: "c.roux@msp-valence.fr", tel: "06 12 48 77 30", last: "12 juil.", notes: "Très active depuis mars — 40+ demandes envoyées. Souhaite une session de formation pour ses internes en septembre." },
  { id: "ct-2", name: "Dr Karim Haddad", role: "Dermatologue", type: "Expert", statut: "Accepté", ville: "Lyon", adresse: "45 cours Gambetta, 69003", email: "k.haddad@avisdoc.fr", tel: "06 84 21 09 55", last: "11 juil.", notes: "Expert référent mélanomes. Disponibilités réduites en août — prévoir la rotation des demandes." },
  { id: "ct-3", name: "CHU de Grenoble", role: "Service dermatologie", type: "Réseau d'Aval", statut: "Accepté", ville: "Grenoble", adresse: "Boulevard de la Chantourne, 38700 La Tronche", email: "dermato@chu-grenoble.fr", tel: "04 76 76 75 75", last: "9 juil.", notes: "Convention de prise en charge rapide signée en mai. Délai moyen de RDV post-avis : 9 jours." },
  { id: "ct-4", name: "Dr Inès Marchal", role: "Médecin du travail", type: "Requérant", statut: "En attente", ville: "Annecy", adresse: "8 avenue de Genève, 74000", email: "i.marchal@sst74.fr", tel: "06 33 90 12 84", last: "8 juil.", notes: "Campagne de dépistage en entreprise prévue T4 2026 — attente du devis." },
  { id: "ct-5", name: "Dr Paul Verdier", role: "Dermatologue", type: "Expert", statut: "Accepté", ville: "Paris", adresse: "102 boulevard Malesherbes, 75017", email: "p.verdier@avisdoc.fr", tel: "06 71 55 42 18", last: "8 juil.", notes: "Nouveau dans le réseau (juin 2026). Onboarding terminé, premières réponses sous 24h." },
  { id: "ct-6", name: "Clinique Belledonne", role: "Chirurgie dermatologique", type: "Réseau d'Aval", statut: "Accepté", ville: "Saint-Martin", adresse: "83 avenue Gabriel Péri, 38400 Saint-Martin-d'Hères", email: "contact@belledonne.fr", tel: "04 76 90 11 22", last: "5 juil.", notes: "Accepte les exérèses sous 15 jours. Point trimestriel à planifier." },
  { id: "ct-7", name: "Dr Sofia Lemaire", role: "Médecin généraliste", type: "Requérant", statut: "Refusé", ville: "Montélimar", adresse: "3 place du Marché, 26200", email: "s.lemaire@cabinet-ml.fr", tel: "06 45 02 98 61", last: "3 juil.", notes: "Demande une intégration avec son logiciel métier. À recontacter après la démo produit." },
  { id: "ct-8", name: "Dr Élise Fontan", role: "Dermatologue pédiatrique", type: "Expert", statut: "Accepté", ville: "Marseille", adresse: "27 rue Paradis, 13001", email: "e.fontan@avisdoc.fr", tel: "06 28 74 30 96", last: "1 juil.", notes: "Seule experte pédiatrique du réseau — recruter un second profil avant fin 2026." },
  { id: "ct-9", name: "Centre Léon Bérard", role: "Oncologie cutanée", type: "Réseau d'Aval", statut: "Accepté", ville: "Lyon", adresse: "28 rue Laennec, 69008", email: "orientation@lyon-clb.fr", tel: "04 78 78 28 28", last: "28 juin", notes: "Filière mélanome prioritaire. Contact direct : secrétariat oncodermatologie." },
  { id: "ct-10", name: "Dr Hugo Bellec", role: "Médecin généraliste", type: "Requérant", statut: "En attente", ville: "Gap", adresse: "14 boulevard Pompidou, 05000", email: "h.bellec@msp-gap.fr", tel: "06 09 33 71 25", last: "25 juin", notes: "Zone sous-dotée — usage régulier. Témoignage possible pour le site." },
  { id: "ct-11", name: "Dr Anna Kovacs", role: "Dermatologue", type: "Expert", statut: "Accepté", ville: "Bordeaux", adresse: "56 cours de l'Intendance, 33000", email: "a.kovacs@avisdoc.fr", tel: "06 52 18 46 07", last: "21 juin", notes: "Volume élevé (30 avis/mois). Renouvellement de la convention d'expertise en octobre." },
  { id: "ct-12", name: "Hôpital Nord Ardèche", role: "Consultations avancées", type: "Réseau d'Aval", statut: "En attente", ville: "Annonay", adresse: "Rue du Bon Pasteur, 07100", email: "consult@hna07.fr", tel: "04 75 67 35 00", last: "15 juin", notes: "Convention en cours de négociation — voir pipeline CRM." },
];

export const SEED_CLIENTS: Client[] = [
  {
    id: "cl-1", company: "CHU de Grenoble", siren: "263 800 302", naf: "8610Z — Activités hospitalières", adresse: "Bd de la Chantourne, 38700 La Tronche", effectif: "5 000+",
    stage: "Signé", jours: 4, tarif: 1400, depistes: 312, orientes: 18, statutPropo: "Acceptée",
    resultat: "Convention filière rapide active. 4 journées réalisées au T2, taux d'orientation de 5,8% — reconduction proposée pour 2027.",
    contacts: [{ id: "pc-1", name: "Pr D. Salomon", role: "Chef de service dermatologie", email: "d.salomon@chu-grenoble.fr", tel: "04 76 76 75 75" }],
    docs: [
      { id: "pd-1", name: "Convention filière rapide.pdf", ext: "PDF", date: "9 juil." },
      { id: "pd-2", name: "Bilan campagne T2.pdf", ext: "PDF", date: "30 juin" },
      { id: "pd-3", name: "Planning journées.xlsx", ext: "XLS", date: "2 juin" },
    ],
    suivis: [
      { id: "sv-1", text: "Bilan T2 partagé et validé par le service.", deadline: null, done: true, when: "30 juin" },
      { id: "sv-2", text: "4e journée de dépistage réalisée (78 patients).", deadline: null, done: true, when: "24 juin" },
      { id: "sv-3", text: "Convention signée.", deadline: null, done: true, when: "12 mai" },
    ],
  },
  {
    id: "cl-2", company: "Mutuelle Alpes Santé", siren: "538 209 771", naf: "6512Z — Autres assurances", adresse: "18 av. Félix Viallet, 38000 Grenoble", effectif: "250-499",
    stage: "Nouveau", jours: 2, tarif: 1200, depistes: 0, orientes: 0, statutPropo: "Brouillon", resultat: null,
    contacts: [{ id: "pc-2", name: "Claire Dumont", role: "Responsable prévention", email: "c.dumont@alpes-sante.fr", tel: "04 76 12 40 88" }],
    docs: [{ id: "pd-4", name: "Plaquette AvisDoc entreprises.pdf", ext: "PDF", date: "10 juil." }],
    suivis: [{ id: "sv-4", text: "Premier échange téléphonique — intérêt pour 2 journées adhérents.", deadline: null, done: true, when: "10 juil." }],
  },
  {
    id: "cl-3", company: "SST Haute-Savoie", siren: "776 528 041", naf: "8621Z — Médecine générale", adresse: "8 av. de Genève, 74000 Annecy", effectif: "50-99",
    stage: "Qualifié", jours: 3, tarif: 1200, depistes: 0, orientes: 0, statutPropo: "Brouillon", resultat: null,
    contacts: [{ id: "pc-3", name: "Dr Inès Marchal", role: "Médecin du travail", email: "i.marchal@sst74.fr", tel: "06 33 90 12 84" }],
    docs: [{ id: "pd-5", name: "Note de cadrage T4.docx", ext: "DOC", date: "4 juil." }],
    suivis: [
      { id: "sv-5", text: "Préparer la proposition 3 journées sites industriels", deadline: "2026-07-12", done: false },
      { id: "sv-6", text: "Réunion de cadrage", deadline: "2026-07-04", done: true },
    ],
  },
  {
    id: "cl-4", company: "CC du Diois", siren: "242 600 252", naf: "8411Z — Administration publique", adresse: "42 rue Camille Buffardel, 26150 Die", effectif: "100-249",
    stage: "Proposition", jours: 5, tarif: 1100, depistes: 0, orientes: 0, statutPropo: "Envoyée", resultat: null,
    contacts: [{ id: "pc-4", name: "Marie Faure", role: "Élue déléguée à la santé", email: "m.faure@paysdiois.fr", tel: "04 75 22 29 44" }],
    docs: [
      { id: "pd-6", name: "Proposition campagne 5 jours.pdf", ext: "PDF", date: "8 juil." },
      { id: "pd-7", name: "Devis DEP-2026-041.pdf", ext: "PDF", date: "8 juil." },
    ],
    suivis: [
      { id: "sv-7", text: "Relancer après le conseil communautaire", deadline: "2026-07-23", done: false },
      { id: "sv-8", text: "Envoyer le devis DEP-2026-041", deadline: "2026-07-08", done: true },
      { id: "sv-9", text: "Visiter les 3 sites envisagés", deadline: "2026-06-26", done: true },
    ],
  },
  {
    id: "cl-5", company: "Clinique Belledonne", siren: "057 505 470", naf: "8610Z — Activités hospitalières", adresse: "83 av. Gabriel Péri, 38400 Saint-Martin-d'Hères", effectif: "500-999",
    stage: "Signé", jours: 2, tarif: 1400, depistes: 145, orientes: 11, statutPropo: "Acceptée",
    resultat: "Campagne salariés réalisée en juin : 145 dépistés sur 2 journées, 11 orientations dont 2 exérèses programmées.",
    contacts: [{ id: "pc-5", name: "Dr M. Costa", role: "Chirurgien dermatologue", email: "m.costa@belledonne.fr", tel: "04 76 90 11 22" }],
    docs: [
      { id: "pd-8", name: "Convention exérèses.pdf", ext: "PDF", date: "18 juin" },
      { id: "pd-9", name: "Bilan campagne salariés.pdf", ext: "PDF", date: "28 juin" },
    ],
    suivis: [
      { id: "sv-10", text: "Bilan de campagne transmis à la direction.", deadline: null, done: true, when: "28 juin" },
      { id: "sv-11", text: "Convention signée.", deadline: null, done: true, when: "18 juin" },
    ],
  },
  {
    id: "cl-6", company: "Groupe scolaire Champollion", siren: "779 559 852", naf: "8531Z — Enseignement secondaire", adresse: "1 cours Lafontaine, 38000 Grenoble", effectif: "100-249",
    stage: "Proposition", jours: 1, tarif: 950, depistes: 0, orientes: 0, statutPropo: "Envoyée", resultat: null,
    contacts: [{ id: "pc-6", name: "Nathalie Perrin", role: "Infirmière scolaire", email: "n.perrin@champollion.fr", tel: "04 76 44 08 51" }],
    docs: [{ id: "pd-10", name: "Proposition sensibilisation.pdf", ext: "PDF", date: "1 juil." }],
    suivis: [{ id: "sv-12", text: "Proposition 1 journée sensibilisation + dépistage personnels.", deadline: null, done: true, when: "1 juil." }],
  },
];

export const SEED_DOCS: DocItem[] = [
  { id: "dc-1", name: "Convention CHU Grenoble — filière rapide.pdf", cat: "Conventions", ext: "PDF", size: "1,2 Mo", date: "9 juil. 2026", owner: "S. Benali", version: 1 },
  { id: "dc-2", name: "Compte-rendu comité médical T2 2026.docx", cat: "Comptes-rendus", ext: "DOC", size: "340 Ko", date: "5 juil. 2026", owner: "S. Benali", version: 1 },
  { id: "dc-3", name: "Grille tarifaire téléexpertise 2026.xlsx", cat: "Facturation", ext: "XLS", size: "88 Ko", date: "1 juil. 2026", owner: "M. Diallo", version: 1 },
  { id: "dc-4", name: "Registre des traitements RGPD — v4.pdf", cat: "Juridique", ext: "PDF", size: "2,1 Mo", date: "24 juin 2026", owner: "Cabinet Lexa", version: 1 },
  { id: "dc-5", name: "Convention Clinique Belledonne — exérèses.pdf", cat: "Conventions", ext: "PDF", size: "980 Ko", date: "18 juin 2026", owner: "S. Benali", version: 1 },
  { id: "dc-6", name: "Modèle de consentement patient — 2026.docx", cat: "Juridique", ext: "DOC", size: "120 Ko", date: "12 juin 2026", owner: "Cabinet Lexa", version: 1 },
  { id: "dc-7", name: "Facturation experts — juin 2026.xlsx", cat: "Facturation", ext: "XLS", size: "210 Ko", date: "2 juin 2026", owner: "M. Diallo", version: 1 },
  { id: "dc-8", name: "Charte du réseau d'experts AvisDoc.pdf", cat: "Conventions", ext: "PDF", size: "640 Ko", date: "20 mai 2026", owner: "S. Benali", version: 1 },
  { id: "dc-9", name: "Compte-rendu AG annuelle 2026.pdf", cat: "Comptes-rendus", ext: "PDF", size: "1,8 Mo", date: "14 mai 2026", owner: "S. Benali", version: 1 },
];

export const SEED_DOC_TYPES: string[] = [
  "Conventions",
  "Comptes-rendus",
  "Facturation",
  "Juridique",
];

export const SEED_ACTIVITY: ActivityItem[] = [
  { id: "ac-1", dot: "bg-avisdoc-teal", text: "Dr Camille Roux a envoyé 3 nouvelles demandes de téléexpertise.", when: "Il y a 2 h" },
  { id: "ac-2", dot: "bg-emerald-500", text: "Convention signée avec le CHU de Grenoble (filière rapide).", when: "Hier, 16:40" },
  { id: "ac-3", dot: "bg-avisdoc-coral", text: "Relance en attente : Hôpital Nord Ardèche — convention aval.", when: "Hier, 09:15" },
  { id: "ac-4", dot: "bg-avisdoc-teal", text: "Dr Paul Verdier a rejoint le réseau d'experts.", when: "8 juil." },
  { id: "ac-5", dot: "bg-slate-400", text: "Compte-rendu trimestriel T2 ajouté aux documents.", when: "5 juil." },
];

/** Petite base Pappers simulée (mode démo). Le vrai appel passe par l'Edge Function. */
export const PAPPERS_DEMO: PappersResult[] = [
  { company: "Vercors Emballages SAS", siren: "812 445 903", naf: "1721A — Fabrication de carton ondulé", adresse: "14 ZA des Blanchisseries, 38160 Saint-Marcellin", effectif: "100-249", dirigeant: "Thomas Reynaud (Président)" },
  { company: "Alpes Logistique Groupe", siren: "423 887 165", naf: "5210B — Entreposage et stockage", adresse: "220 rue des Sagnes, 38430 Moirans", effectif: "250-499", dirigeant: "Sandrine Villard (DG)" },
];
