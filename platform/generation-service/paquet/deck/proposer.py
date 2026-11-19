"""Étape 2, mode règles : deck-brut.json → deck.json (un gabarit par diapositive).

Heuristiques ordonnées (brief §6), sans appel réseau. Chaque décision enregistre la règle qui l'a
prise. Le texte n'est jamais reformulé : seules la typographie (tiret cadratin) et la graphie de la
marque (« Avisdoc » → « AvisDoc », tracée dans `corrections`) sont normalisées.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import jsonschema

from .generer import SCHEMA

NOMBRE = re.compile(r"^(\d[\d\s  .,]*\s?(?:%|‰|€|k€|M€)?(?:\s(?:jours?|mois|ans?|heures?|h|min|semaines?|fois))?)\s+(.+)$", re.I)
NUMEROTE = re.compile(r"^\s*(\d{1,2})\s*[.)\-–]\s+(.+)$")
ANNEE = re.compile(r"^((?:19|20)\d{2})\s*[:\-–]\s*(.+)$")
MARQUE = re.compile(r"(?<![\w./@-])(avis ?doc)(?![\w.-]*\.(?:fr|com))", re.I)
ICONES = [
    (r"travail|entreprise|bureau|site", "entreprise"), (r"frais|€|euro|gratuit|coût", "euro"),
    (r"dermatolog|médecin|docteur|infirmi", "medecin"), (r"confidenti|secret|anonym", "cadenas"),
    (r"rapide|délai|heure|minute|jour", "horloge"), (r"repér|dépist|détect|lésion|examen", "loupe"),
    (r"salarié|collaborat|personne|équipe", "personnes"), (r"calendrier|date|campagne", "calendrier"),
    (r"santé|soin|prévention", "coeur"), (r"peau|grain|tache", "peau"),
]
LIGNES_PAR_DIAPO = 7


def _typo(t: str) -> str:
    return t.replace("—", "–") if isinstance(t, str) else t


class Proposition:
    def __init__(self, brut: dict):
        self.brut = brut
        self.corrections, self.anomalies, self.decisions, self.diapos = [], [], [], []

    def _texte(self, n: int, t: str) -> str:
        """Typographie et marque ; toute correction de marque est tracée."""
        t = _typo(t.strip())
        def remplacer(m):
            if m.group(1) != "AvisDoc":
                self.corrections.append({"diapositive": n, "type": "marque", "avant": m.group(1), "apres": "AvisDoc"})
            return "AvisDoc"
        return MARQUE.sub(remplacer, t)

    def _ajouter(self, n, gabarit, motif, **champs):
        self.decisions.append({"diapositive": n, "gabarit": gabarit, "motif": motif})
        if gabarit == "texte":
            self.anomalies.append({"diapositive": n, "code": "GABARIT_REPLI", "message": f"Aucun gabarit adapté ({motif}) : gabarit texte."})
        self.diapos.append({"gabarit": gabarit, **champs})

    @staticmethod
    def _icone(texte: str) -> str:
        for motif, icone in ICONES:
            if re.search(motif, texte, re.I):
                return icone
        return "coche"

    def diapositive(self, d: dict, derniere: bool):
        n = d["source"]
        T = lambda t: self._texte(n, t)  # noqa: E731
        titre = T(d["titre"] or "")
        zones = [{**z, "paragraphes": [T(p) for p in z["paragraphes"]]} for z in d["zones"]]
        lignes = [p for z in zones for p in z["paragraphes"]]
        images = d["images"]
        base = {"source": n, "titre": titre}
        if d.get("notes"):
            base["notes"] = d["notes"]

        if n == 1:
            champs = {**base, "titre": titre or (lignes.pop(0) if lignes else "Présentation")}
            if lignes:
                champs["chapo"] = " ".join(lignes)
            grandes = [i for i in images if i["l"] >= 2.5]
            if grandes:
                champs["image"] = {"fichier": grandes[0]["fichier"], "alt": "Image de couverture"}
            return self._ajouter(n, "couverture", "première diapositive", **champs)

        if derniere and not lignes and not d["tableaux"]:
            return self._ajouter(n, "cloture", "dernière diapositive sans texte propre",
                                 **{**base, "titre": titre or "AvisDoc", "phrase": "La dermatologie n'attend pas."})

        if images and not lignes and not d["tableaux"]:
            for k in range(0, len(images), 2):
                lot = images[k:k + 2]
                self.anomalies.append({"diapositive": n, "code": "DONNEES_PATIENT",
                                       "message": "Captures : vérifier qu'aucune donnée patient réelle n'apparaît, puis lever l'avertissement."})
                self._ajouter(n, "captures", "images sans texte propre" + (" (suite)" if k else ""),
                              **{**base, "titre": titre or "Captures",
                                 "images": [{"fichier": i["fichier"], "alt": f"{titre or 'Capture'}, image {k + j + 1}"} for j, i in enumerate(lot)]})
            return

        if d["tableaux"]:
            t = [[T(c) for c in ligne] for ligne in d["tableaux"][0]]
            if 2 <= len(t) <= 7 and 2 <= len(t[0]) <= 4:
                champs = {**base, "colonnes": t[0], "lignes": t[1:]}
                if self._numerique(t[1:]):
                    champs["graphique"] = {"alt": f"{', '.join(t[0][1:])} par {t[0][0].lower()}"}
                return self._ajouter(n, "tableau", "tableau de la source", **champs)

        annees = [ANNEE.match(l) for l in lignes]
        if len(lignes) >= 2 and all(annees):
            colonnes, rangs = self._tableau_annees([(m.group(1), m.group(2)) for m in annees])
            if colonnes and len(rangs) <= 6:
                champs = {**base, "colonnes": colonnes, "lignes": rangs}
                if self._numerique(rangs):
                    champs["graphique"] = {"alt": f"{', '.join(colonnes[1:])} par année"}
                return self._ajouter(n, "tableau", "mêmes libellés répétés sur plusieurs années", **champs)

        numeros = [NUMEROTE.match(l) for l in lignes]
        if 2 <= len(lignes) <= 6 and all(numeros):
            return self._ajouter(n, "etapes", "liste numérotée", **{**base, "etapes": [{"texte": m.group(2)} for m in numeros]})

        chiffres = [NOMBRE.match(l) for l in lignes]
        if 2 <= len(lignes) <= 5 and sum(1 for m in chiffres if m) > len(lignes) / 2 and all(chiffres):
            nb_accents = min(2, max(0, len(lignes) - 2))
            blocs = [{"valeur": m.group(1).strip(), "libelle": m.group(2).strip(), **({"accent": True} if i < nb_accents else {})}
                     for i, m in enumerate(chiffres)]
            return self._ajouter(n, "chiffres", "majorité de lignes commençant par un nombre", **{**base, "blocs": blocs})

        objectifs = [l for l in lignes if re.match(r"^objectifs?\b", l, re.I)]
        questions = [l for l in lignes if l.rstrip().endswith("?")]
        if 1 <= len(objectifs) <= 2 and 2 <= len(questions) <= 5 and len(objectifs) + len(questions) == len(lignes):
            return self._ajouter(n, "objectifs_questions", "lignes « Objectif » et lignes interrogatives",
                                 **{**base, "objectifs": [{"texte": o, "icone": self._icone(o)} for o in objectifs], "questions": questions})

        if len(zones) == 2 and zones[0]["taille"] >= 24 and 2 <= len(zones[1]["paragraphes"]) <= 5:
            z0 = zones[0]["paragraphes"]
            champs = {**base, "elements": zones[1]["paragraphes"]}
            if len(z0) >= 2 and len(z0[0]) <= 14:
                champs.update(cle=z0[0], enonce=" ".join(z0[1:]))
            else:
                champs["enonce"] = " ".join(z0)
            return self._ajouter(n, "enonce_liste", f"un énoncé fort et {len(zones[1]['paragraphes'])} éléments", **champs)

        if 3 <= len(lignes) <= 6 and all(len(l) <= 60 for l in lignes) and not images:
            return self._ajouter(n, "grille", f"{len(lignes)} puces courtes",
                                 **{**base, "cartes": [{"texte": l, "icone": self._icone(l)} for l in lignes]})

        if not lignes and not images:
            self.anomalies.append({"diapositive": n, "code": "DIAPOSITIVE_ECARTEE", "message": "Diapositive sans contenu : écartée."})
            return
        for k in range(0, max(1, len(lignes)), LIGNES_PAR_DIAPO):
            self._ajouter(n, "texte", "repli" + (" (suite)" if k else ""), **{**base, "titre": titre or "(sans titre)",
                          "lignes": lignes[k:k + LIGNES_PAR_DIAPO] or [titre]})
        if images:
            self.anomalies.append({"diapositive": n, "code": "DIAPOSITIVE_ECARTEE",
                                   "message": f"{len(images)} image(s) mêlée(s) au texte non reprise(s) par le gabarit texte."})

    @staticmethod
    def _numerique(rangs) -> bool:
        try:
            for r in rangs:
                for v in r[1:]:
                    float(re.sub(r"[\s  %]", "", v).replace(",", "."))
            return True
        except ValueError:
            return False

    @staticmethod
    def _tableau_annees(lignes):
        """« 2024 : 3 120 avis, 410 consultations » → colonnes Année, Avis, Consultations."""
        rangs, libelles = [], None
        for annee, reste in lignes:
            paires = [re.match(r"^\s*(\d(?:[\d\s\u00a0\u202f.,]*\d)?\s?%?)\s+(\D.*?)\s*$", x) for x in reste.split(",")]
            if not all(paires):
                return None, None
            noms = [p.group(2).lower() for p in paires]
            if libelles is None:
                libelles = noms
            elif noms != libelles:
                return None, None
            rangs.append([annee] + [p.group(1).strip() for p in paires])
        return ["Année"] + [l.capitalize() for l in libelles], rangs

    def resultat(self) -> dict:
        diapos = self.brut["diapositives"]
        for i, d in enumerate(diapos):
            self.diapositive(d, i == len(diapos) - 1)
        vus: dict[str, int] = {}
        for d in self.diapos:
            if d["gabarit"] in ("couverture", "cloture"):
                continue
            if d["titre"] in vus and vus[d["titre"]] != d["source"]:
                self.anomalies.append({"diapositive": d["source"], "code": "TITRE_DOUBLON", "message": f"Même titre que la diapositive {vus[d['titre']]}."})
            vus.setdefault(d["titre"], d["source"])
        for d in self.diapos:
            texte = json.dumps(d, ensure_ascii=False)
            if re.search(r"d[ée]pist", texte, re.I):
                self.anomalies.append({"diapositive": d["source"], "code": "VOCABULAIRE",
                                       "message": "« dépistage » : terme attendu « repérage de lésions suspectes ». Signalé, non remplacé."})
        diapos_sortie = [{"source": d["source"], **{k: v for k, v in d.items() if k != "source"}} for d in self.diapos]
        titre = next((d["titre"] for d in diapos_sortie if d["gabarit"] == "couverture"), diapos_sortie[0]["titre"] if diapos_sortie else "")
        deck = {
            "version": 1,
            "meta": {"titre": titre, "source": self.brut["meta"]["source"], "fond": "creme", "logo_client": False,
                     "acces": "hds" if any(d["gabarit"] == "captures" for d in diapos_sortie) else "client"},
            "diapositives": diapos_sortie, "corrections": self.corrections, "anomalies": self.anomalies, "decisions": self.decisions,
        }
        jsonschema.validate(deck, SCHEMA)
        return deck


def proposer(chemin_brut: Path, sortie: Path) -> Path:
    brut = json.loads(chemin_brut.read_text(encoding="utf-8"))
    deck = Proposition(brut).resultat()
    sortie.write_text(json.dumps(deck, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return sortie
