// Contenu de l'écran Aide : la partie commerciale expliquée, puis des questions toutes
// prêtes avec leur réponse.
//
// Chaque phrase décrit ce que fait le code aujourd'hui (libellés recopiés des écrans).
// Quand un écran change, ce fichier doit changer avec lui : une aide fausse est pire
// qu'une aide absente.

export interface EcranAide {
  /** Ancre dans la page. */
  id: string;
  titre: string;
  /** Lien vers l'écran décrit. */
  to: string;
  resume: string;
  points: string[];
}

export interface QuestionAide {
  question: string;
  reponse: string;
}

export interface ThemeAide {
  titre: string;
  questions: QuestionAide[];
}

/** Le chemin d'une entreprise, du premier repérage à la signature. */
export const PARCOURS: { etape: string; texte: string }[] = [
  { etape: "Merx", texte: "sert à trouver des entreprises à démarcher, à les noter et à les documenter." },
  { etape: "Prospection", texte: "le fichier des prospects trouvés par Merx, importés ou saisis à la main." },
  { etape: "Pipeline", texte: "le tunnel de conversion des clients, de la première action (appel, rendez-vous, présentation) jusqu'à la signature." },
  { etape: "Clients", texte: "l'étape finale : la page où sont classées les entreprises signées au Pipeline." },
];

export const ECRANS: EcranAide[] = [
  {
    id: "merx",
    titre: "Merx",
    to: "/merx",
    resume: "Votre agent de prospection : vous lui dites ce que vous cherchez, il trouve les entreprises, les note et les range dans Prospection.",
    points: [
      "Écrivez votre demande (« Des entreprises de travaux publics en Gironde… ») ou remplissez le panneau « Ce que vous cherchez » puis « Chercher ».",
      "Les menus (secteur, lieu, taille, interlocuteur) décident qui entre dans la liste. Les boutons de « Ce qu'on préfère » font seulement remonter ce que vous préférez : ils n'écartent personne.",
      "Merx reformule d'abord votre demande en une phrase et vous demande si c'est bien ce que vous cherchez : la recherche ne part qu'après votre « oui ».",
      "Une recherche demande une à deux minutes. Merx part du registre officiel des entreprises (100 au plus) et écarte celles déjà connues en Prospection, au Pipeline ou dans Clients.",
      "Une société précise (« les agences Vinci en Gironde ») : Merx ne cherche que ses agences, une fiche par ville. À la fin, il vous propose d'élargir à des entreprises comparables, sans rien ajouter avant votre accord.",
      "Le micro permet de dicter sa question (une minute au plus).",
      "Vous pouvez aussi lui demander conseil sur une entreprise déjà trouvée : il relit sa fiche et les objections notées par l'équipe.",
      "« Vos conversations » garde vos 30 dernières conversations. Elles ne sont visibles que par vous.",
    ],
  },
  {
    id: "prospection",
    titre: "Prospection",
    to: "/prospects",
    resume: "La liste commune des entreprises à démarcher, pas encore passées au Pipeline.",
    points: [
      "Colonnes : Créée · Entreprise · Secteur · Activité · Ville · Interlocuteur · Salariés · Note · Consigne · Fiabilité · Approfondie. Un clic sur un titre de colonne trie.",
      "« Nouveau » signale une fiche jamais ouverte. Dans « Approfondie » : « À approfondir », « En cours… », « Terminé » (pas encore relue) ou la date.",
      "« Ajouter un prospect » ouvre une fiche complète à remplir (seul le nom est obligatoire), « Importer » pour un fichier Excel, « Exporter » pour récupérer la liste affichée.",
      "Une fiche ajoutée à la main ou importée n'est jamais complétée d'office par Merx : c'est vous qui cliquez sur « Enrichir par Merx » si vous le voulez.",
      "Cochez des fiches pour « Compléter » (registre et Pappers), « Approfondir » (durée et coût annoncés avant), « Écrire à » (votre messagerie, en copie cachée) ou « Supprimer ».",
      "Une fiche disparaît de la Prospection dès qu'elle passe au Pipeline.",
      "Quand la liste est plus large que l'écran, une barre de défilement sous les filtres la fait glisser de côté.",
    ],
  },
  {
    id: "fiche",
    titre: "La fiche d'une entreprise",
    to: "/prospects",
    resume: "La même fiche partout (prospect, affaire, client) : à gauche l'entreprise, à droite les onglets Actions, Dossier et Devis.",
    points: [
      "À gauche : la notation, la « Place dans le Pipeline », « Suivi par » (le commercial référent), les interlocuteurs et l'établissement.",
      "Actions : « Noter : + Appel · + Rendez-vous · + Présentation · + Mail · + Note », et « Autre… » (salon, SMS ou WhatsApp, LinkedIn, devis envoyé).",
      "Chaque action est « À programmer » ou « Déjà fait ». Un appel, un rendez-vous ou une présentation faits demandent « Ça a donné quoi ? ».",
      "« ✦ Où on en est » : Merx résume toutes les actions de la fiche.",
      "« Modifier la fiche » corrige tout : l'entreprise, le dirigeant, les interlocuteurs, qui la suit. Une action, passée ou à venir, se corrige en l'ouvrant.",
      "Dossier : « Approfondir la fiche » fait travailler Merx une bonne minute ; il prépare ce qu'il faut savoir avant d'appeler, les arguments, les objections, ce qu'on peut proposer.",
      "Devis (affaire et client) : la proposition (journées × tarif) et le devis Qonto se débloquent à l'étape « Proposition ».",
    ],
  },
  {
    id: "pipeline",
    titre: "Pipeline",
    to: "/crm",
    resume: "Le tableau des affaires en cours, colonne par colonne.",
    points: [
      "Colonnes de base : Qualifié · Contacté · Présentation · RDV · Proposition · Signé · Perdu.",
      "Glissez une carte d'une colonne à l'autre pour changer son étape.",
      "Chaque pipeline a ses colonnes et peut être assigné à un commercial ; « Général » montre toutes les affaires. Aucun pipeline n'est privé.",
      "« Colonnes » renomme, déplace ou supprime les colonnes : le changement vaut pour toute l'équipe.",
      "Sur une carte, les pastilles montrent les actions à venir : orange dans les 24 h, rouge si en retard.",
      "« Nouveau client » ouvre une fiche complète à remplir ; le SIREN est facultatif. Qonto ou l'annuaire des entreprises peuvent la préremplir.",
      "« Exporter » donne un fichier Excel des affaires affichées (une ligne par interlocuteur, avec pipeline, colonne, journées et tarif) ; « Importer » fait entrer un fichier au Pipeline.",
      "La barre de défilement sous les filtres fait glisser le tableau de côté, sans descendre tout en bas.",
    ],
  },
  {
    id: "clients",
    titre: "Clients",
    to: "/fichier-client",
    resume: "Le fichier commun des entreprises signées ou saisies à la main.",
    points: [
      "Vue Kanban (par mois d'entrée, secteur ou toute autre colonne) ou Liste.",
      "Une affaire qui passe en « Signé » crée sa fiche client toute seule.",
      "« Colonnes » ajoute vos propres colonnes ; « Importer » et « Exporter » pour Excel.",
      "Sur la fiche, « Leur proposer : » donne des idées de suite (nouvelle campagne, journée supplémentaire, bilan…), et « Remettre au Pipeline » fait revenir l'affaire d'une étape.",
    ],
  },
  {
    id: "planning",
    titre: "Planning",
    to: "/planning",
    resume: "Tout ce qui est programmé par l'équipe, à la semaine (du lundi au vendredi) ou au mois.",
    points: [
      "Toute action programmée sur une fiche y apparaît au jour prévu.",
      "« Semaine » montre le détail de chaque action ; « Mois » montre le mois entier, week-ends compris. Un clic sur un jour du mois ouvre sa semaine.",
      "« Ajouter une action » : rendez-vous, appel, e-mail ou « À faire », pour une entreprise ou juste pour vous (« Aucune — c'est une action à moi »).",
      "Au survol d'une action : l'œil ouvre la fiche, le crayon la modifie ou la déplace, la poubelle l'annule.",
      "Un mail de rappel part à celui qui a programmé l'action : 15 minutes avant, ou 2 heures avant un rendez-vous sur place ou chez le client.",
    ],
  },
  {
    id: "debrief",
    titre: "Débrief et dictée",
    to: "/debrief",
    resume: "Racontez votre sortie, à la voix ou au clavier : Merx range, et vous dit où.",
    points: [
      "« À la voix » ouvre la dictée : jusqu'à 10 minutes. Sans réseau, la note reste sur le téléphone et part toute seule au retour du réseau.",
      "Les notes sont transcrites et rangées sur cet écran Débrief : revenez-y après une dictée.",
      "« Au clavier » : écrivez, puis « Merx range ça ».",
      "Merx reconnaît les entreprises citées, crée celles qui manquent, ajoute une note à leur historique, pose les actions au planning et retient les objections entendues.",
      "Le bilan « C'est rangé » dit ce qui a été créé, mis à jour, et ce que Merx n'a pas su ranger.",
      "Sur téléphone, le Hub s'ouvre directement sur la dictée. Le bouton « Ouvrir sur le tableau de bord » du menu change ce réglage pour ce téléphone.",
    ],
  },
  {
    id: "cap",
    titre: "CAP",
    to: "/couts",
    resume: "Le coût d'acquisition par prospect : ce que chaque entreprise a réellement coûté en recherches Merx.",
    points: [
      "Le bandeau donne le coût du mois, le total, le coût moyen d'un prospect et le plus cher.",
      "Une recherche est partagée entre les fiches qu'elle a produites. Les montants sont en dollars.",
      "Un clic sur une entreprise déplie le détail de ses dépenses.",
    ],
  },
  {
    id: "corbeille",
    titre: "Corbeille",
    to: "/corbeille",
    resume: "Tout ce qui est supprimé en Prospection, au Pipeline, dans Clients et au Débrief y reste 30 jours.",
    points: [
      "« Restaurer » remet la fiche là d'où elle vient, avec sa colonne.",
      "Passé 30 jours, la fiche part d'elle-même, la nuit.",
      "Seule l'administration peut détruire tout de suite.",
    ],
  },
];

export const QUESTIONS: ThemeAide[] = [
  {
    titre: "Trouver des prospects",
    questions: [
      {
        question: "Comment demander à Merx de trouver des entreprises ?",
        reponse: "Dans Merx, écrivez ce que vous cherchez comme à un collègue (« des transporteurs de plus de 50 salariés en Bretagne »), ou remplissez le panneau « Ce que vous cherchez » puis cliquez sur « Chercher ». Merx vous renvoie votre demande en une phrase : répondez « oui » (ou corrigez) et la recherche part. Comptez une à deux minutes : les fiches arrivent dans Prospection.",
      },
      {
        question: "Comment avoir toutes les agences d'une société (Vinci, Colas…) ?",
        reponse: "Demandez-le à Merx : « les agences Colas en Gironde », ou sans lieu pour toute la France. Après votre « oui », il ne cherche que les agences ouvertes de cette société au registre officiel, une fiche par ville, jamais d'autre entreprise. À la fin, il vous propose d'élargir à des entreprises comparables : c'est vous qui acceptez ou non.",
      },
      {
        question: "Merx va-t-il me redonner des entreprises que l'équipe connaît déjà ?",
        reponse: "Non. Il écarte celles qui sont déjà en Prospection, au Pipeline ou dans Clients (même nom et même ville, ou même SIREN).",
      },
      {
        question: "Comment ajouter une entreprise moi-même ?",
        reponse: "Dans Prospection, « Ajouter un prospect » ; au Pipeline, « Nouveau client ». Une fiche complète s'ouvre : l'entreprise, son standard, son dirigeant, les interlocuteurs avec leur poste, qui la suit. Seul le nom est obligatoire, le SIREN est facultatif.",
      },
      {
        question: "Comment importer mon fichier Excel ?",
        reponse: "Dans Prospection, « Importer », puis « Télécharger le modèle » pour voir les colonnes attendues. Seule la colonne « Raison sociale » est obligatoire. Rien n'est enregistré avant le clic sur « Importer N entreprises ». Si une ligne a un « Avancement » (Contacté, A répondu, RDV), l'entreprise entre directement au Pipeline choisi.",
      },
      {
        question: "Je réimporte un fichier déjà importé, avec des changements : que se passe-t-il ?",
        reponse: "Rien n'est mis en double. Une entreprise déjà connue n'est pas recréée : elle reçoit seulement ce qui lui manquait (interlocuteur, e-mail, téléphone, département…), et l'historique ne reçoit que les lignes qu'il n'a pas déjà. Ce qui est déjà rempli n'est jamais écrasé, et une affaire déjà au Pipeline reste dans sa colonne.",
      },
      {
        question: "Une date de relance future dans mon fichier : que devient-elle ?",
        reponse: "Elle devient une action à venir : elle apparaît au Planning au jour dit, dans « Actions à venir » sur la fiche, et le rappel par mail part avant l'heure.",
      },
      {
        question: "Que veut dire « Approfondir » ?",
        reponse: "Merx retravaille la fiche une bonne minute : qui aborder et pourquoi, ce qu'on sait de l'entreprise, les arguments, les objections possibles, ce qu'on peut leur proposer. Le résultat est dans l'onglet Dossier. Le coût est annoncé avant.",
      },
      {
        question: "Que veut dire « Compléter » ?",
        reponse: "Le Hub va chercher les informations manquantes (registre, Pappers, fiche d'établissement) sans faire travailler Merx. Les fiches sans téléphone ni site sont aussi complétées d'elles-mêmes à l'affichage de la Prospection.",
      },
    ],
  },
  {
    titre: "Note, consigne et fiabilité",
    questions: [
      {
        question: "D'où vient la note sur 100 ?",
        reponse: "D'une grille en trois parties : pertinence pour AvisDoc (60 points : exposition au soleil, nombre de salariés concernés, lien avec la peau, nombre de sites), maturité en prévention (25 points) et accessibilité commerciale (15 points). La bulle « ? » à côté de la colonne Note l'explique, et l'onglet Dossier donne « La note, critère par critère ».",
      },
      {
        question: "Que veulent dire « Prioritaire », « À qualifier »… ?",
        reponse: "C'est la consigne, calculée sur les points que Merx a pu vérifier : « Prioritaire » à 70 % et plus, « À qualifier » à 55 %, « Piste secondaire » à 40 %, « Faible priorité » en dessous. « À compléter » : il manque l'activité ou l'effectif pour noter.",
      },
      {
        question: "Que veut dire la fiabilité sur 10 ?",
        reponse: "À quel point la fiche est sûre. Huit informations sont vérifiées (identité, implantation, activité, effectif, site, interlocuteur, e-mail, téléphone) : deux sources qui concordent valent plus qu'une seule. Vert à partir de 8, orange à partir de 5.",
      },
    ],
  },
  {
    titre: "Fiches et actions",
    questions: [
      {
        question: "Comment noter un appel que je viens de passer ?",
        reponse: "Ouvrez la fiche, onglet Actions, « + Appel », choisissez « Déjà fait », indiquez ce que ça a donné (Joint, Pas joint, Messagerie, Pas intéressé) et écrivez le compte rendu. Vous pouvez programmer la suite dans « Et après ? ».",
      },
      {
        question: "Comment programmer un rendez-vous ?",
        reponse: "Sur la fiche, « + Rendez-vous », « À programmer », jour et heure, puis En visio, Sur place ou Chez le client. Il apparaît dans le Planning et un mail vous le rappelle : 15 minutes avant pour une visio, 2 heures avant sur place ou chez le client. La fiche passe d'elle-même en colonne « RDV ».",
      },
      {
        question: "Je fais une action sur un prospect : que devient-il ?",
        reponse: "Il entre au Pipeline (sauf pour une simple note) : en « Contacté » si l'action est faite, en « RDV » pour un rendez-vous, sinon en première colonne. Il quitte alors la Prospection.",
      },
      {
        question: "Puis-je corriger une action déjà faite ?",
        reponse: "Oui. Ouvrez-la dans l'historique de la fiche : la date, ce que ça a donné, avec qui et le compte rendu se corrigent, puis « Enregistrer ». Une action à venir se déplace ou s'annule de la même façon.",
      },
      {
        question: "Merx va-t-il modifier une fiche que j'ai saisie ?",
        reponse: "Non, pas tant que vous ne le lui demandez pas. Le bouton « Enrichir par Merx », en haut de la fiche, le fait travailler : il remplit ce qui est vide et ajoute ce qu'il trouve en plus, sans rien remplacer de ce que vous avez écrit.",
      },
      {
        question: "Un rendez-vous est annulé : que faire ?",
        reponse: "Ouvrez l'action et cliquez sur « Annuler l'action ». Elle quitte le Planning, reste dans l'historique marquée « Annulé », et la fiche revient dans la colonne où elle était s'il n'y a plus d'autre rendez-vous prévu.",
      },
      {
        question: "Comment faire écrire un e-mail par Merx ?",
        reponse: "Sur la fiche, « + Mail », puis « Écrire un e-mail personnalisé avec Merx » (une trentaine de secondes). Rien n'est envoyé par le Hub : « Ouvrir dans ma messagerie » ou « Copier », et vous envoyez vous-même.",
      },
      {
        question: "Comment savoir où on en est avec une entreprise ?",
        reponse: "Onglet Actions, « ✦ Où on en est » : Merx résume tout l'historique de la fiche.",
      },
      {
        question: "Comment désigner le commercial qui suit une fiche ?",
        reponse: "Dans la colonne de gauche de la fiche, « Suivi par ». Tant que personne n'est choisi, le champ affiche « — à attribuer — ».",
      },
    ],
  },
  {
    titre: "Pipeline et clients",
    questions: [
      {
        question: "Comment changer l'étape d'une affaire ?",
        reponse: "Glissez sa carte dans une autre colonne du Pipeline, ou changez la colonne dans « Place dans le Pipeline » sur la fiche.",
      },
      {
        question: "Que se passe-t-il quand une affaire passe en « Signé » ?",
        reponse: "Sa fiche client est créée dans Clients, « Client depuis » aujourd'hui, avec le même commercial référent.",
      },
      {
        question: "Quand puis-je faire la proposition et le devis ?",
        reponse: "À partir de l'étape « Proposition ». L'onglet Devis permet alors de régler les journées et le tarif, le statut de la proposition, et de créer le devis Qonto.",
      },
      {
        question: "Un client signé doit revenir en négociation : comment faire ?",
        reponse: "Sur sa fiche client, « Remettre au Pipeline » : l'affaire recule d'une étape et ses actions la suivent.",
      },
      {
        question: "Comment exporter ou importer le Pipeline ?",
        reponse: "Dans le Pipeline, « Exporter » donne un fichier Excel des affaires affichées, filtres compris. « Importer » fait entrer un fichier au Pipeline : les colonnes « Pipeline » et « Colonne » de l'export disent où ranger chaque entreprise ; à défaut, l'Avancement, sinon la première colonne du pipeline choisi. Une affaire déjà présente est complétée, jamais déplacée.",
      },
      {
        question: "Le Pipeline est très large : comment aller voir les colonnes de droite ?",
        reponse: "Utilisez la barre de défilement juste sous la recherche et les filtres. Elle reste en haut de l'écran quand vous descendez.",
      },
      {
        question: "Comment ajouter un pipeline ou une colonne ?",
        reponse: "« Ajouter un pipeline » dans la barre des pipelines, et « Colonnes » pour renommer, ajouter, déplacer ou supprimer une colonne. Attention : ces changements valent pour toute l'équipe.",
      },
    ],
  },
  {
    titre: "Planning et rappels",
    questions: [
      {
        question: "Comment ajouter une tâche qui ne concerne aucune entreprise ?",
        reponse: "Dans le Planning, « Ajouter une action », genre « À faire », et choisissez « Aucune — c'est une action à moi ».",
      },
      {
        question: "Comment déplacer une action ?",
        reponse: "Dans le Planning, survolez l'action et cliquez sur le crayon « Modifier ou déplacer ». Le rappel par mail repart pour la nouvelle heure.",
      },
      {
        question: "Qui reçoit le mail de rappel ?",
        reponse: "La personne qui a programmé l'action, 15 minutes avant (2 heures avant un rendez-vous sur place ou chez le client). Il n'y a qu'un rappel par action.",
      },
      {
        question: "Je vois les actions de mes collègues : c'est normal ?",
        reponse: "Oui, le Planning montre toute l'équipe.",
      },
      {
        question: "Comment voir tout le mois ?",
        reponse: "Dans le Planning, cliquez sur « Mois ». Chaque jour montre ses trois premières actions ; « + N autres » ou un clic sur le jour ouvre la semaine en détail. Les flèches passent d'un mois à l'autre.",
      },
    ],
  },
  {
    titre: "Débrief et dictée",
    questions: [
      {
        question: "Je sors d'un rendez-vous : comment tout noter vite ?",
        reponse: "Sur le téléphone, le Hub s'ouvre sur la dictée : appuyez sur le micro et racontez (10 minutes au plus), puis « Retour ». Sur l'écran Débrief, Merx range tout seul : note à l'historique, actions au planning, objections retenues.",
      },
      {
        question: "Je n'ai pas de réseau : ma dictée est-elle perdue ?",
        reponse: "Non. Elle reste sur le téléphone et part toute seule dès que le réseau revient.",
      },
      {
        question: "Comment faire pour que Merx mette une action à la bonne date ?",
        reponse: "Dites la date (« je le rappelle jeudi »). Merx la pose à 9 h ce jour-là. Sans date, l'action est enregistrée au moment du débrief.",
      },
      {
        question: "Qui peut réécouter ma dictée ?",
        reponse: "Vous seul. Le texte rangé est visible par l'équipe, l'enregistrement ne l'est pas.",
      },
    ],
  },
  {
    titre: "Suppression et corbeille",
    questions: [
      {
        question: "J'ai supprimé une fiche par erreur : comment la récupérer ?",
        reponse: "Dans Corbeille, cochez-la et cliquez sur « Restaurer ». Elle revient là d'où elle vient. Vous avez 30 jours.",
      },
      {
        question: "Qui peut supprimer définitivement ?",
        reponse: "Personne d'un clic. Toute suppression — prospect, affaire ou client — passe par la corbeille, où la fiche reste 30 jours. Seule l'administration peut la détruire avant.",
      },
      {
        question: "Que deviennent les fiches à la corbeille ?",
        reponse: "Elles partent d'elles-mêmes 30 jours après leur suppression. Leurs actions disparaissent du Planning et n'envoient plus de rappel.",
      },
    ],
  },
  {
    titre: "Coûts",
    questions: [
      {
        question: "Combien coûte une recherche ou un approfondissement ?",
        reponse: "L'écran CAP donne le coût réel par entreprise, le coût moyen d'un prospect et les tarifs appliqués. Avant d'approfondir plusieurs fiches, la durée et le coût estimé sont annoncés.",
      },
    ],
  },
];

export interface ExerciceAide {
  id: string;
  titre: string;
  /** Où le faire. */
  to: string;
  etapes: string[];
}

/**
 * Des exercices à faire une fois pour prendre la main. Ils se cochent à la main : ils
 * touchent de vraies fiches, alors on choisit une entreprise réelle, ou on supprime
 * ensuite ce qu'on a créé pour s'entraîner (la corbeille le garde 30 jours).
 */
export const EXERCICES: ExerciceAide[] = [
  {
    id: "recherche",
    titre: "Lancer une recherche avec Merx",
    to: "/merx",
    etapes: [
      "Ouvrez Merx et remplissez « Ce que vous cherchez » : un secteur, un département.",
      "Cliquez sur « Chercher » et attendez une à deux minutes.",
      "Ouvrez Prospection : les fiches trouvées portent la pastille « Nouveau ».",
    ],
  },
  {
    id: "lire-fiche",
    titre: "Lire une fiche et l'approfondir",
    to: "/prospects",
    etapes: [
      "Dans Prospection, ouvrez une fiche « Prioritaire ».",
      "Survolez le « ? » de la colonne Note pour comprendre la note.",
      "Onglet Dossier : « Approfondir la fiche », puis lisez « Ce qu'il faut savoir avant d'appeler ».",
    ],
  },
  {
    id: "noter-appel",
    titre: "Noter un appel et programmer la suite",
    to: "/prospects",
    etapes: [
      "Sur une fiche, onglet Actions : « + Appel », « Déjà fait ».",
      "Choisissez ce que ça a donné et écrivez deux lignes de compte rendu.",
      "Dans « Et après ? », programmez un rendez-vous, puis enregistrez.",
      "Vérifiez : la fiche est au Pipeline, en colonne « RDV », et le rendez-vous est au Planning.",
    ],
  },
  {
    id: "pipeline",
    titre: "Faire avancer une affaire au Pipeline",
    to: "/crm",
    etapes: [
      "Glissez une carte d'une colonne à la suivante.",
      "Ouvrez-la et regardez « Place dans le Pipeline » : la colonne a suivi.",
      "Cherchez-la avec la recherche, puis avec les filtres.",
    ],
  },
  {
    id: "debrief",
    titre: "Débriefer un rendez-vous",
    to: "/debrief",
    etapes: [
      "Dans Débrief, « Au clavier » (ou « À la voix » sur le téléphone).",
      "Racontez : l'entreprise, la personne vue, ce qui s'est dit, la suite avec une date.",
      "« Merx range ça », puis lisez le bilan « C'est rangé » et ouvrez la fiche mise à jour.",
    ],
  },
  {
    id: "planning",
    titre: "Organiser sa semaine",
    to: "/planning",
    etapes: [
      "Dans le Planning, « Ajouter une action », genre « À faire », « Aucune — c'est une action à moi ».",
      "Déplacez-la avec le crayon « Modifier ou déplacer ».",
      "Annulez-la avec la poubelle : elle reste dans l'historique, « Annulé ».",
    ],
  },
  {
    id: "corbeille",
    titre: "Supprimer puis restaurer une fiche",
    to: "/corbeille",
    etapes: [
      "Supprimez une fiche créée pour l'exercice.",
      "Ouvrez Corbeille : elle y est, avec les jours qui restent.",
      "Cochez-la et cliquez sur « Restaurer » : elle revient là d'où elle vient.",
    ],
  },
];
