"""Étape 2, mode modèle (option --modele) : un appel à l'API Anthropic par présentation.

Le modèle reçoit le brut (TEXTE SEUL : les images ne sont décrites que par leur emplacement et
leurs dimensions), la proposition du mode règles et les bornes des gabarits ; il renvoie le
deck.json complété. Garde-fous vérifiés par le code (brief §6) :

  1. texte seul : la demande ne contient aucun octet d'image ;
  2. pas de réécriture : chaque texte renvoyé existe dans la source de sa diapositive (à la
     typographie et à la casse près), ou vient d'une correction tracée ;
  3. schéma : réponse validée contre deck.schema.json, rejouée une fois, sinon mode règles ;
  4. corrections bornées : orthographe, accent, casse, marque ; jamais un chiffre ;
  5. trace : demande et réponse enregistrées à côté du deck.json.

Configuration : DECK_MODELE (défaut claude-opus-5-5), ANTHROPIC_API_KEY. Rien dans le code.
"""
from __future__ import annotations

import difflib
import json
import os
import re
from pathlib import Path

import jsonschema

from .generer import SCHEMA
from .proposer import Proposition

MODELE_DEFAUT = "claude-opus-5-5"
CLES_LIBRES = {"gabarit", "fichier", "alt", "icone", "section", "notes"}
STRUCTURELS = {"année", "la dermatologie n'attend pas.", "avisdoc", "captures", "(sans titre)", "présentation"}

CONSIGNE = """Tu mets en forme une présentation PowerPoint à la charte AvisDoc. Tu ne rédiges pas.

Tu reçois :
- `brut` : le contenu extrait de chaque diapositive (titre, zones de texte avec taille de police et position, tableaux, images décrites par leur seul emplacement) ;
- `proposition` : le deck.json proposé par des règles automatiques, à corriger ou à confirmer ;
- `gabarits` : les gabarits disponibles et leurs bornes ;
- `schema` : le schéma JSON du deck.json à renvoyer.

Tu renvoies UNIQUEMENT le deck.json complet (un objet JSON, sans texte autour), conforme au schéma.

Règles absolues :
1. Chaque texte que tu places dans une diapositive doit être recopié tel quel depuis le brut de la MÊME diapositive. Tu peux découper un paragraphe (par exemple « 13 706 avis donnés » en valeur « 13 706 » et libellé « avis donnés »), retirer une numérotation ou une puce, mais jamais reformuler, résumer, traduire, compléter ni ajouter un mot.
2. Les seules corrections permises sont l'orthographe, les accents, la casse et la graphie de la marque (« AvisDoc »). Chacune figure dans `corrections` avec `avant` (tel que dans le brut) et `apres`. Aucune correction de chiffre, de fond ou de vocabulaire.
3. Un terme hors charte (« dépistage ») est signalé dans `anomalies` (code VOCABULAIRE), jamais remplacé.
4. Aucune diapositive d'origine ne disparaît sans une anomalie DIAPOSITIVE_ECARTEE. L'ordre est celui de la source. Les notes sont reprises telles quelles.
5. Respecte les bornes des gabarits ; si un contenu n'entre nulle part, utilise `texte` (et l'anomalie GABARIT_REPLI). Une diapositive peut être scindée en plusieurs (même `source`).
6. Toute diapositive `captures` reçoit l'anomalie DONNEES_PATIENT.
7. Garde `meta`, et dans `decisions` indique pour chaque diapositive le gabarit retenu et son motif en quelques mots."""

GABARITS = {
    "couverture": "ouverture : titre, sur-titre, chapô, une image au plus",
    "enonce_liste": "une affirmation forte (cle, legende, enonce) et une liste de 2 à 5 éléments",
    "grille": "3 à 6 cartes de 90 caractères au plus, avec une icône par mot-clé (entreprise, euro, medecin, cadenas, horloge, loupe, fleche, coche, personnes, calendrier, coeur, peau)",
    "chiffres": "2 à 5 chiffres clés (valeur, libelle), dont 2 au plus en accent",
    "tableau": "comparaison chiffrée : 2 à 4 colonnes, 6 lignes au plus, graphique natif en option",
    "etapes": "liste ordonnée de 2 à 6 étapes",
    "objectifs_questions": "1 à 2 objectifs d'un côté, 2 à 5 questions de l'autre",
    "captures": "une ou deux images à lire (pages, écrans), sans autre texte que le titre",
    "cloture": "fin : une phrase",
    "texte": "repli : titre et liste simple",
}


class ModeleRejete(Exception):
    pass


def _norm(t: str) -> str:
    t = t.replace("’", "'").replace("–", "-").replace("—", "-")
    t = re.sub(r"[\s  ]+", " ", t)
    return t.strip().lower()


def _chaines(x, cle=None):
    if isinstance(x, str):
        if cle not in CLES_LIBRES:
            yield x
    elif isinstance(x, dict):
        for k, v in x.items():
            yield from _chaines(v, k)
    elif isinstance(x, list):
        for v in x:
            yield from _chaines(v, cle)


def _texte_source(d: dict) -> str:
    morceaux = [d.get("titre") or ""] + [p for z in d["zones"] for p in z["paragraphes"]]
    morceaux += [c for t in d["tableaux"] for ligne in t for c in ligne]
    return _norm(" \n ".join(morceaux))


def verifier(deck: dict, brut: dict) -> None:
    """Garde-fous 2, 3 et 4. Lève ModeleRejete au premier écart."""
    try:
        jsonschema.validate(deck, SCHEMA)
    except jsonschema.ValidationError as e:
        raise ModeleRejete(f"schéma : {e.message}") from e
    sources = {d["source"]: d for d in brut["diapositives"]}
    corrections = deck.get("corrections", [])
    for c in corrections:
        if c["diapositive"] not in sources or _norm(c["avant"]) not in _texte_source(sources[c["diapositive"]]):
            raise ModeleRejete(f"correction introuvable dans la source : « {c['avant']} »")
        if re.findall(r"\d", c["avant"]) != re.findall(r"\d", c["apres"]):
            raise ModeleRejete(f"correction de chiffre interdite : « {c['avant']} » → « {c['apres']} »")
        if c["type"] != "marque" and difflib.SequenceMatcher(None, c["avant"].lower(), c["apres"].lower()).ratio() < 0.75:
            raise ModeleRejete(f"correction trop large pour de l'orthographe : « {c['avant']} » → « {c['apres']} »")
    for d in deck["diapositives"]:
        if d["source"] not in sources:
            raise ModeleRejete(f"diapositive {d['source']} inconnue")
        source = _texte_source(sources[d["source"]])
        for c in corrections:
            if c["diapositive"] == d["source"]:
                source += " \n " + _norm(c["apres"])
                source = source.replace(_norm(c["avant"]), _norm(c["apres"]))
        for t in _chaines(d):
            n = _norm(t)
            if n and n not in source and n not in STRUCTURELS:
                raise ModeleRejete(f"diapositive {d['source']} : texte absent de la source « {t[:80]} »")
    vues = {d["source"] for d in deck["diapositives"]} | {a.get("diapositive") for a in deck["anomalies"] if a["code"] == "DIAPOSITIVE_ECARTEE"}
    manquantes = set(sources) - vues
    if manquantes:
        raise ModeleRejete(f"diapositives disparues sans le dire : {sorted(manquantes)}")


def demande(brut: dict, regles: dict) -> dict:
    """Garde-fou 1 : texte seul. Les images ne sont décrites que par leur emplacement."""
    brut_texte = json.loads(json.dumps(brut))
    for d in brut_texte["diapositives"]:
        d["images"] = [{k: v for k, v in i.items() if k in ("fichier", "largeur_px", "hauteur_px", "x", "y", "l", "h")} for i in d["images"]]
    return {"brut": brut_texte, "proposition": regles, "gabarits": GABARITS, "schema": SCHEMA}


def _appeler(contenu: dict, erreur: str | None) -> str:
    import anthropic

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    messages = [{"role": "user", "content": json.dumps(contenu, ensure_ascii=False)}]
    if erreur:
        messages[0]["content"] += f"\n\nTa réponse précédente a été refusée : {erreur}. Corrige et renvoie le deck.json complet."
    with client.beta.messages.stream(
        model=os.environ.get("DECK_MODELE", MODELE_DEFAUT),
        max_tokens=64000,
        system=CONSIGNE,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={"effort": "medium"},
        messages=messages,
    ) as flux:
        message = flux.get_final_message()
    if message.stop_reason == "refusal":
        raise ModeleRejete("le modèle a refusé la demande")
    return "".join(b.text for b in message.content if b.type == "text")


def _json(texte: str) -> dict:
    texte = texte.strip()
    texte = re.sub(r"^```(?:json)?\s*|\s*```$", "", texte)
    try:
        return json.loads(texte)
    except json.JSONDecodeError as e:
        raise ModeleRejete(f"réponse illisible : {e}") from e


def proposer_modele(chemin_brut: Path, sortie: Path, appeler=_appeler) -> tuple[Path, str]:
    """Renvoie (deck.json, mode réellement utilisé). Repli sur le mode règles, en le disant."""
    brut = json.loads(chemin_brut.read_text(encoding="utf-8"))
    regles = Proposition(brut).resultat()
    contenu = demande(brut, regles)
    trace = sortie.parent
    (trace / "modele-demande.json").write_text(json.dumps(contenu, ensure_ascii=False, indent=2), encoding="utf-8")
    erreur, reponses = None, []
    for _ in range(2):
        try:
            texte = appeler(contenu, erreur)
            reponses.append(texte)
            deck = _json(texte)
            verifier(deck, brut)
            deck.setdefault("meta", regles["meta"])
            (trace / "modele-reponse.json").write_text("\n\n---\n\n".join(reponses), encoding="utf-8")
            sortie.write_text(json.dumps(deck, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            return sortie, "modele"
        except ModeleRejete as e:
            erreur = str(e)
        except Exception as e:  # noqa: BLE001 — réseau, clé, quota : on retombe sur les règles
            erreur = f"appel impossible ({type(e).__name__})"
            break
    (trace / "modele-reponse.json").write_text("\n\n---\n\n".join(reponses + [f"REJET : {erreur}"]), encoding="utf-8")
    for dec in regles["decisions"]:
        dec["motif"] += f" ; mode règles (mode modèle écarté : {erreur})"
    sortie.write_text(json.dumps(regles, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return sortie, f"regles ({erreur})"
