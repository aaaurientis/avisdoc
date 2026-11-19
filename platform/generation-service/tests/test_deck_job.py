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
