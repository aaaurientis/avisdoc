"""Lot 0 de la commande deck : schéma du pivot et jeu de test fictif."""
import hashlib
import json
import zipfile
from pathlib import Path

import jsonschema
from pptx import Presentation

ICI = Path(__file__).resolve().parent
SCHEMA = json.loads((ICI.parent / "deck.schema.json").read_text(encoding="utf-8"))
JEU = ICI / "jeu"


def contenu(chemin: Path) -> str:
    """Empreinte du contenu d'un PPTX, hors horodatage des entrées du zip."""
    z = zipfile.ZipFile(chemin)
    return hashlib.md5(b"".join(n.encode() + z.read(n) for n in sorted(z.namelist()))).hexdigest()


def test_le_deck_attendu_respecte_le_schema():
    jsonschema.validate(json.loads((JEU / "deck-attendu.json").read_text(encoding="utf-8")), SCHEMA)


def test_aucune_diapositive_ne_disparait_sans_le_dire():
    deck = json.loads((JEU / "deck-attendu.json").read_text(encoding="utf-8"))
    n = len(Presentation(JEU / "source-fictive.pptx").slides)
    reprises = {d["source"] for d in deck["diapositives"]}
    ecartees = {a["diapositive"] for a in deck["anomalies"] if a["code"] == "DIAPOSITIVE_ECARTEE"}
    assert reprises | ecartees == set(range(1, n + 1))


def test_un_gabarit_hors_bornes_est_refuse():
    deck = json.loads((JEU / "deck-attendu.json").read_text(encoding="utf-8"))
    grille = next(d for d in deck["diapositives"] if d["gabarit"] == "grille")
    grille["cartes"] = grille["cartes"] * 2  # 10 cartes : au-delà de 6
    try:
        jsonschema.validate(deck, SCHEMA)
    except jsonschema.ValidationError:
        return
    raise AssertionError("une grille de 10 cartes aurait dû être refusée")


def test_le_jeu_est_deterministe(tmp_path, monkeypatch):
    import importlib.util
    spec = importlib.util.spec_from_file_location("fabriquer_jeu", ICI / "fabriquer_jeu.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    monkeypatch.setattr(mod, "SORTIE", tmp_path / "copie.pptx")
    assert contenu(mod.fabriquer()) == contenu(JEU / "source-fictive.pptx")
