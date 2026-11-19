"""Mise à la charte d'une présentation du module Documents (deck_job), Supabase simulé."""
import os
import pathlib
import sys

os.environ.setdefault("SUPABASE_URL", "https://exemple.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test")
os.environ.pop("ANTHROPIC_API_KEY", None)  # pas de réseau : le mode modèle retombe sur les règles

ICI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ICI.parent))

import deck_job  # noqa: E402
import sb  # noqa: E402

SOURCE = ICI.parent / "paquet/deck/tests/jeu/source-fictive.pptx"


def test_le_resultat_est_range_dans_documents_sans_toucher_la_source(monkeypatch):
    lignes = {
        ("admin_deck_jobs", "j1"): {"id": "j1", "document_id": "d1", "modele": True, "fond": "creme", "statut": "en_attente"},
        ("admin_documents", "d1"): {"id": "d1", "name": "Présentation CNAM.pptx", "storage_path": "d1/v1-source.pptx",
                                    "cat": "Prospection Clients", "cat_parent": "Doc. Profil", "tags": ["Groupama"]},
    }
    deposes, inseres = {}, []
    monkeypatch.setattr(sb, "get_row", lambda t, i: lignes.get((t, i)))
    monkeypatch.setattr(sb, "download_object", lambda b, p: SOURCE.read_bytes())
    monkeypatch.setattr(sb, "upload_object", lambda b, p, data, ct: deposes.__setitem__(p, data))
    monkeypatch.setattr(sb, "insert_row", lambda t, row: inseres.append((t, row)) or row)

    r = deck_job.traiter("j1")

    assert r["erreurs"] == 0 and r["acces"] == "hds" and r["mode"].startswith("regles")
    assert "d1/v1-source.pptx" not in deposes  # la source n'est jamais réécrite
    (table, doc), = inseres
    assert table == "admin_documents" and doc["name"] == "Présentation CNAM (charte AvisDoc).pptx"
    assert doc["cat_parent"] == "Doc. Profil" and doc["tags"] == ["Groupama"] and doc["ext"] == "PPT"
    assert doc["storage_path"] in deposes and r["rapport_path"] in deposes and r["pivot_path"] in deposes
    assert "DONNEES_PATIENT" in r["rapport"]


def test_sans_enregistrer_rien_ne_va_dans_documents(monkeypatch):
    job = {"id": "j2", "document_id": None, "source_path": "_charte-temp/abc/Bilan.pptx", "source_nom": "Bilan.pptx",
           "modele": False, "fond": "creme", "statut": "en_attente"}
    deposes, inseres, effaces = {}, [], []
    monkeypatch.setattr(sb, "get_row", lambda t, i: job if t == "admin_deck_jobs" else None)
    monkeypatch.setattr(sb, "download_object", lambda b, p: SOURCE.read_bytes())
    monkeypatch.setattr(sb, "upload_object", lambda b, p, data, ct: deposes.__setitem__(p, data))
    monkeypatch.setattr(sb, "insert_row", lambda t, row: inseres.append(row))
    monkeypatch.setattr(sb, "delete_object", lambda b, p: effaces.append(p))

    r = deck_job.traiter("j2")

    assert not inseres and effaces == ["_charte-temp/abc/Bilan.pptx"]
    assert r["resultat_path"] == "_charte-temp/j2/Bilan_charte_AvisDoc_.pptx" and list(deposes) == [r["resultat_path"]]
    assert r["mode"] == "regles" and r["erreurs"] == 0


def test_un_chemin_hors_du_dossier_temporaire_est_refuse(monkeypatch):
    job = {"id": "j3", "document_id": None, "source_path": "autre/doc.pptx", "source_nom": "x.pptx"}
    monkeypatch.setattr(sb, "get_row", lambda t, i: job)
    import pytest
    with pytest.raises(deck_job.DeckEchec):
        deck_job.traiter("j3")


def test_un_pdf_et_un_word_sont_mis_a_la_charte_sans_enregistrer(monkeypatch, tmp_path):
    import docx
    w = tmp_path / "note.docx"
    d = docx.Document(); d.add_heading("Note", 1); d.add_paragraph("Le dépistage Avisdoc — trois sites."); d.save(w)
    pdf = ICI.parent / "paquet/documents/pdf/Kit-collaborateur-AvisDoc.pdf"
    for nom, octets in (("note.docx", w.read_bytes()), ("kit.pdf", pdf.read_bytes())):
        job = {"id": "j9", "document_id": None, "source_path": f"_charte-temp/x/{nom}", "source_nom": nom}
        deposes = {}
        monkeypatch.setattr(sb, "get_row", lambda t, i: job)
        monkeypatch.setattr(sb, "download_object", lambda b, p: octets)
        monkeypatch.setattr(sb, "upload_object", lambda b, p, data, ct: deposes.__setitem__(p, data))
        monkeypatch.setattr(sb, "delete_object", lambda b, p: None)
        r = deck_job.traiter("j9")
        assert r["mode"] == "document" and r["erreurs"] == 0, r["rapport"]
        assert list(deposes) == [r["resultat_path"]] and r["resultat_path"].endswith(pathlib.Path(nom).suffix)
        assert "VOCABULAIRE" in r["rapport"]
