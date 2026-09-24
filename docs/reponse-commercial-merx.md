# Merx — ce qui marche, ce qui ne marchait pas, et comment on avance

Merci pour ce retour. Il est précis, vérifiable, et il a permis de trouver un vrai défaut.
Voici ce que la vérification a donné, ce qui est déjà corrigé, et ce que je propose pour la suite.

## Vous aviez raison sur BB GR

J'ai interrogé l'annuaire de l'État avec les paramètres exacts de Merx. Sa réponse pour BB GR :

```
SIRET 30260795700263 · STRASBOURG 67000 · état = F
```

`F` pour fermé. L'information était dans la réponse à chaque appel — nous ne lisions pas ce champ.

La cause exacte : le filtre d'état que nous envoyions ne s'applique qu'à **l'entreprise**.
L'annuaire répond au filtre « département 67 » avec les établissements fermés autant qu'avec
les ouverts, et nous prenions le premier de la liste.

En rejouant votre recherche alsacienne (125 entreprises) :

| | |
|---|---|
| Aucun établissement ouvert dans la zone | **24 — 19 %** |
| Mélange ouverts/fermés, premier pris à l'aveugle | **44 — 35 %** |

Essilor à Habsheim, Guerlain à Strasbourg, Boiron à Ostwald, Baxter à Illkirch : fermés.

**Votre second point était juste aussi.** L'effectif affiché était celui du groupe, jamais du
site. Alliance Healthcare Répartition : 1 000 à 1 999 salariés pour l'entreprise, **six à neuf**
pour son agence de Richwiller. Merx donnait 20 points sur 20 à une campagne impossible à tenir.

## Deux de vos exemples étaient pourtant de bons prospects

- **ELANCO France à Huningue** : établissement **ouvert**, 100 à 199 salariés sur place.
- **HILL-ROM à Ernolsheim-Bruche** : établissement **ouvert**. (Celui de Bischheim est fermé,
  d'où le risque — mais Ernolsheim est actif.)

Sur vos quatre exemples, deux étaient des erreurs réelles, deux étaient des cibles valables.

## Ce qui est corrigé, en ligne depuis ce matin

1. **Les établissements fermés sont écartés.** Une entreprise sans établissement ouvert dans la
   zone demandée n'est plus retenue — et le nombre d'écartées vous est annoncé, pour que vous ne
   croyiez pas la recherche incomplète.
2. **L'effectif est celui du site**, quand l'annuaire le publie. Sinon on affiche celui de
   l'entreprise **en le disant**.
3. **Une seconde note apparaît : la fiabilité, sur 10.**

## Les deux notes, et pourquoi elles sont séparées

Votre remarque a mis le doigt sur une confusion qui était la nôtre : une seule note pour deux
questions qui n'ont rien à voir.

- **La note sur 100 juge le prospect** : taille, exposition, implantation, sensibilité au sujet.
- **La note sur 10 juge l'information** : d'où vient chaque ligne de la fiche.

Le registre de l'État et le site officiel de l'entreprise valent 2 points. Une page web
réellement consultée vaut 1 point. Une affirmation sans source vaut 0.

BB GR aurait affiché 50/100 **et** une fiabilité effondrée sur la ligne « Implantation ». Vous
auriez vu l'erreur sans avoir à la chercher.

Le détail est consultable ligne par ligne dans la fiche : « Téléphone : fiche d'établissement
Google », « Interlocuteur : page web consultée ». Vous savez quoi croire avant de décrocher.

## Le point le plus important : Merx travaille en deux temps

C'est probablement ce qui a créé le malentendu, et nous ne l'avons pas assez dit.

**Premier temps — la recherche.** Quelques secondes, le registre officiel, 100 à 200 entreprises.
Aucune qualification commerciale n'a lieu à ce stade : on établit qui existe, où, de quelle taille,
dans quel métier. Rien de plus. La note affichée est un **profil théorique**, pas un verdict.

**Second temps — l'approfondissement.** Une fiche à la fois. Lecture du site officiel, recherche
de l'interlocuteur et de sa fonction, téléphone du standard, preuves de sensibilité au sujet,
angle d'approche. **C'est seulement là que la note devient une vraie note.**

Les 91 fiches de votre recherche n'étaient pas approfondies. Les juger comme des prospects
qualifiés, c'est juger un brouillon : elles n'en étaient pas encore. La colonne « Approfondie »
le dit dans la liste — nous allons la rendre plus visible.

Votre méthode en six étapes — implantation vérifiée, effectif pertinent, activité réelle, preuve
récente, interlocuteur actuel, canal exploitable — décrit exactement le second temps. Nous ne
faisons pas autre chose ; nous le faisons après avoir ratissé, pas avant.

## Sur les critères éliminatoires

Votre distinction est juste, mais la ligne ne passe pas tout à fait où vous la mettez.

- **Un fait doit être éliminatoire.** « L'établissement est ouvert », « l'effectif du site » :
  c'est vrai ou c'est faux. C'est désormais bloquant.
- **Un critère commercial ne doit pas l'être.** « Démarche RSE », « politique santé-sécurité » :
  les rendre bloquants écarterait des entreprises valables au seul motif que leur site web est
  pauvre. Beaucoup de PME parfaites pour nous ne communiquent pas là-dessus.

Autrement dit : une information fausse est un bug, une information absente n'en est pas un.

## Ce que je propose

Le scoring ne doit pas être décidé par l'outil, ni par moi. **Il se construit avec vous.**

Les critères actuels — exposition solaire, métier de la peau, RSE, santé au travail, plusieurs
sites, zone — sont un premier jet. Leurs pondérations le sont aussi. Vous êtes ceux qui savez ce
qui fait qu'un rendez-vous se transforme.

Je propose une séance de travail pour arrêter ensemble :

- les critères qui **éliminent** (faits vérifiables uniquement) ;
- les critères qui **donnent des points**, et combien ;
- le seuil à partir duquel une fiche mérite un approfondissement ;
- ce qui manque à vos yeux dans le dossier remis avant l'appel.

Merx sait déjà mémoriser vos critères personnels. Ce qui lui manque, ce sont les vôtres.
