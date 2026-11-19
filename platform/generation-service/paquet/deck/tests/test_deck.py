"""Recette de la commande deck (brief §11). Lancer depuis paquet/ : python3 -m pytest deck/tests"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import zipfile
from pathlib import Path

import pytest
from pptx import Presentation

from deck import controles, extraire, generer, modele, proposer
from deck.__main__ import main

JEU = Path(__file__).resolve().parent / "jeu"
SOURCE = JEU / "source-fictive.pptx"


def contenu(chemin: Path) -> str:
    z = zipfile.ZipFile(chemin)
    return hashlib.md5(b"".join(n.encode() + z.read(n) for n in sorted(z.namelist()))).hexdigest()


@pytest.fixture(scope="module")
def travail(tmp_path_factory):
    d = tmp_path_factory.mktemp("deck")
    assert main(["tout", str(SOURCE), "-d", str(d), "--sans-planche"]) == 0
    return d


def _mots(texte: str) -> set[str]:
    texte = texte.replace("’", "'").replace(" ", "").replace(" ", " ")
    texte = re.sub(r"(?<=\d) (?=\d{3}\b)", "", texte)  # 13 706 = 13706
    return {m for m in re.findall(r"[\w']+", texte.lower()) if m}


def _textes(pptx: Path) -> list[set[str]]:
    out = []
    for s in Presentation(pptx).slides:
        t = []
        for f in s.shapes:
            if f.has_text_frame:
                t.append(f.text_frame.text)
            if f.has_table:
                t += [c.text for r in f.table.rows for c in r.cells]
        out.append(_mots(" | ".join(t)))
    return out


def test_1_generer_deux_fois_donne_le_meme_fichier(travail, tmp_path):
    shutil.copytree(travail, tmp_path / "b")
    generer.generer(tmp_path / "b" / "deck.json", tmp_path / "b" / "autre.pptx")
    assert contenu(tmp_path / "b" / "autre.pptx") == contenu(travail / "sortie.pptx")


def test_2_le_fichier_se_rouvre(travail):
    prs = Presentation(travail / "sortie.pptx")
    assert len(prs.slides) == 11
    assert {l.name for l in prs.slide_layouts} >= {"couverture", "chiffres", "tableau", "cloture", "texte"}


def test_3_aucun_texte_de_la_source_ne_se_perd(travail):
    deck = json.loads((travail / "deck.json").read_text(encoding="utf-8"))
    source, sortie = _textes(SOURCE), _textes(travail / "sortie.pptx")
    par_source: dict[int, set[str]] = {}
    for i, d in enumerate(deck["diapositives"]):
        par_source.setdefault(d["source"], set()).update(sortie[i])
    corrections = {(c["diapositive"], w) for c in deck["corrections"] for w in _mots(c["avant"])}
    ecartees = {a["diapositive"] for a in deck["anomalies"] if a["code"] == "DIAPOSITIVE_ECARTEE"}
    for n, mots in enumerate(source, 1):
        if n in ecartees:
            continue
        manquants = {m for m in mots if m not in par_source.get(n, set()) and (n, m) not in corrections}
        manquants -= {str(k) for k in range(1, 10)}  # numérotation « 1. » rendue par les pastilles
        assert not manquants, f"diapositive {n} : {manquants}"


def test_4_le_fond_change_en_un_seul_endroit(travail, tmp_path):
    deck = json.loads((travail / "deck.json").read_text(encoding="utf-8"))
    deck["meta"]["fond"] = "blanc"
    shutil.copytree(travail / "images", tmp_path / "images")
    (tmp_path / "deck.json").write_text(json.dumps(deck, ensure_ascii=False), encoding="utf-8")
    generer.generer(tmp_path / "deck.json", tmp_path / "blanc.pptx")
    a, b = zipfile.ZipFile(travail / "sortie.pptx"), zipfile.ZipFile(tmp_path / "blanc.pptx")
    differents = [n for n in sorted(a.namelist()) if a.read(n) != b.read(n) and not n.startswith("docProps/")]
    assert differents == ["ppt/theme/theme1.xml"] or set(differents) <= {"ppt/theme/theme1.xml", "ppt/theme/theme2.xml"}
    assert b"F7F4EF" not in b.read("ppt/theme/theme1.xml") and b'lt1><a:srgbClr val="FFFFFF"' in b.read("ppt/theme/theme1.xml")


def test_5_un_texte_trop_long_fait_echouer_la_generation(travail, tmp_path):
    deck = json.loads((travail / "deck.json").read_text(encoding="utf-8"))
    chiffres = next(d for d in deck["diapositives"] if d["gabarit"] == "chiffres")
    chiffres["blocs"][2]["libelle"] = "un libellé beaucoup trop long " * 6
    (tmp_path / "deck.json").write_text(json.dumps(deck, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(generer.Debordement) as e:
        generer.generer(tmp_path / "deck.json", tmp_path / "x.pptx")
    assert e.value.diapo == chiffres["source"] and "libellé" in e.value.bloc


def test_6_un_tiret_cadratin_dans_le_pivot_fait_echouer_les_controles(travail, tmp_path):
    deck = json.loads((travail / "deck.json").read_text(encoding="utf-8"))
    deck["diapositives"][1]["titre"] = "Le constat — national"
    res = controles.controler(travail / "sortie.pptx", deck)
    assert any(c.code == "TIRET_CADRATIN" for c in res.erreurs)


def test_6b_une_couleur_hors_palette_fait_echouer_les_controles(travail, tmp_path):
    copie = tmp_path / "rouge.pptx"
    with zipfile.ZipFile(travail / "sortie.pptx") as src, zipfile.ZipFile(copie, "w") as dst:
        for n in src.namelist():
            data = src.read(n)
            if n == "ppt/slides/slide2.xml":
                data = data.replace(b'<a:schemeClr val="tx1"/>', b'<a:srgbClr val="FF0000"/>', 1)
            dst.writestr(n, data)
    deck = json.loads((travail / "deck.json").read_text(encoding="utf-8"))
    assert any(c.code == "COULEUR_HORS_PALETTE" for c in controles.controler(copie, deck).erreurs)


def _faux_modele(transformer):
    def appeler(contenu, erreur):
        deck = json.loads(json.dumps(contenu["proposition"]))
        transformer(deck)
        return json.dumps(deck, ensure_ascii=False)
    return appeler


def test_7_le_modele_ne_peut_pas_changer_un_chiffre(travail, tmp_path):
    shutil.copy(travail / "deck-brut.json", tmp_path / "deck-brut.json")
    def tricher(deck):
        bloc = next(d for d in deck["diapositives"] if d["gabarit"] == "chiffres")["blocs"][0]
        bloc["valeur"] = "14 000"
    _, mode = modele.proposer_modele(tmp_path / "deck-brut.json", tmp_path / "deck.json", appeler=_faux_modele(tricher))
    assert mode.startswith("regles") and "14 000" in mode


def test_7b_le_modele_peut_corriger_l_orthographe(travail, tmp_path):
    shutil.copy(travail / "deck-brut.json", tmp_path / "deck-brut.json")
    def corriger(deck):
        etapes = next(d for d in deck["diapositives"] if d["gabarit"] == "etapes")
        etapes["etapes"][2]["texte"] = "Avis rendu sous 48 heures ouvrées"
        deck["corrections"].append({"diapositive": etapes["source"], "type": "orthographe", "avant": "heures ouvrés", "apres": "heures ouvrées"})
    _, mode = modele.proposer_modele(tmp_path / "deck-brut.json", tmp_path / "deck.json", appeler=_faux_modele(corriger))
    assert mode == "modele"


def test_7c_le_modele_ne_peut_pas_reformuler(travail, tmp_path):
    shutil.copy(travail / "deck-brut.json", tmp_path / "deck-brut.json")
    def reformuler(deck):
        next(d for d in deck["diapositives"] if d["gabarit"] == "grille")["cartes"][0]["texte"] = "Directement au bureau"
    _, mode = modele.proposer_modele(tmp_path / "deck-brut.json", tmp_path / "deck.json", appeler=_faux_modele(reformuler))
    assert mode.startswith("regles")


def test_8_la_demande_au_modele_ne_contient_aucune_image(travail):
    brut = json.loads((travail / "deck-brut.json").read_text(encoding="utf-8"))
    demande = json.dumps(modele.demande(brut, proposer.Proposition(brut).resultat()), ensure_ascii=False)
    assert "base64" not in demande and "\x89PNG" not in demande and len(demande) < 200_000
    assert all(set(i) <= {"fichier", "largeur_px", "hauteur_px", "x", "y", "l", "h"} for d in brut["diapositives"] for i in d["images"])


def test_9_sans_reseau_le_mode_modele_retombe_sur_les_regles(travail, tmp_path, monkeypatch):
    shutil.copy(travail / "deck-brut.json", tmp_path / "deck-brut.json")
    def coupe(contenu, erreur):
        raise ConnectionError("pas de réseau")
    _, mode = modele.proposer_modele(tmp_path / "deck-brut.json", tmp_path / "deck.json", appeler=coupe)
    assert mode.startswith("regles")
    assert json.loads((tmp_path / "deck.json").read_text(encoding="utf-8"))["diapositives"]


def test_10_une_capture_donne_toujours_donnees_patient(travail):
    deck = json.loads((travail / "deck.json").read_text(encoding="utf-8"))
    res = controles.controler(travail / "sortie.pptx", deck)
    assert any(c.code == "DONNEES_PATIENT" for c in res.constats) and res.acces == "hds"


def test_11_le_graphique_est_natif_et_modifiable(travail):
    prs = Presentation(travail / "sortie.pptx")
    graphiques = [f for s in prs.slides for f in s.shapes if f.has_chart]
    assert graphiques and graphiques[0].chart.part.chart_workbook.xlsx_part is not None


def test_12_aucune_image_reelle_dans_le_jeu():
    # Les seules images du jeu viennent du compte-rendu FICTIF du pack et du logo.
    z = zipfile.ZipFile(SOURCE)
    images = [n for n in z.namelist() if n.startswith("ppt/media/")]
    assert len(images) == 3


def test_regles_retrouvent_les_gabarits_attendus(travail):
    attendu = json.loads((JEU / "deck-attendu.json").read_text(encoding="utf-8"))
    obtenu = json.loads((travail / "deck.json").read_text(encoding="utf-8"))
    assert [d["gabarit"] for d in obtenu["diapositives"]] == [d["gabarit"] for d in attendu["diapositives"]]


def test_le_jeu_ecrit_a_la_main_passe_les_controles(tmp_path):
    shutil.copy(JEU / "deck-attendu.json", tmp_path / "deck.json")
    extraire.extraire(SOURCE, tmp_path)
    anomalies = generer.generer(tmp_path / "deck.json", tmp_path / "sortie.pptx")
    res = controles.executer(tmp_path / "sortie.pptx", tmp_path / "deck.json", anomalies, avec_planche=False)
    assert not res.erreurs, [c.message for c in res.erreurs]
    assert (tmp_path / "rapport.md").read_text(encoding="utf-8").count("heures ouvrées") == 1
