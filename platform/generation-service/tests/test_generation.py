"""Test d'intégration de la génération.

Exécute la VRAIE chaîne (build.py client + WeasyPrint + pptxgenjs) et vérifie
les garde-fous de sécurité et de charte, en mockant l'accès Supabase (sb).

Prérequis : dépendances Python (requirements.txt) + Node avec pptxgenjs
résolvable (NODE_PATH). Le test est lent (~30 s) : il régénère les documents.
"""
import io
import os
import sys
import pathlib

import pytest
from PIL import Image

# sb lit ses variables au chargement : on les fournit avant l'import.
os.environ.setdefault("SUPABASE_URL", "https://exemple.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test")

ICI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ICI.parent))

import sb  # noqa: E402
import generator  # noqa: E402

CLIENT_ID = "11111111-1111-1111-1111-111111111111"

# Répartition attendue, dérivée du CATALOGUE (source de vérité).
LOGOTES = {e["id"] for e in generator.build.CATALOGUE if e["logo_client"] and e["acces"] != "hds"}
NON_LOGO_NON_HDS = {
    e["id"] for e in generator.build.CATALOGUE
    if not e["logo_client"] and e["acces"] != "hds"
}
HDS = {e["id"] for e in generator.build.CATALOGUE if e["acces"] == "hds"}


def _logo_valide() -> bytes:
    img = Image.new("RGBA", (600, 240), (0, 0, 0, 0))
    for x in range(20, 580):
        for y in range(60, 180):
            img.putpixel((x, y), (12, 42, 51, 255))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


@pytest.fixture
def capture(monkeypatch):
    """Mocke sb : capture les upload/insert, court-circuite le réseau."""
    logo = _logo_valide()
    etat = {"uploads": [], "inserts": []}

    monkeypatch.setattr(sb, "get_client", lambda cid: {
        "id": cid, "nom": "ACME", "logo_path": f"{cid}/logo.png",
        "logo_sha256": generator.sha256(logo),
    })
    monkeypatch.setattr(sb, "download_object", lambda bucket, path: logo)
    monkeypatch.setattr(sb, "document_existe", lambda *a, **k: False)
    monkeypatch.setattr(sb, "upload_object",
                        lambda bucket, path, data, ct: etat["uploads"].append((bucket, path)))
    monkeypatch.setattr(sb, "insert_document", lambda row: etat["inserts"].append(row))
    return etat


def test_repartition_et_cloisonnement(capture):
    resume = generator.generer_pour_client("job-1", CLIENT_ID)
    ids = {r["doc_catalogue_id"] for r in capture["inserts"]}

    # 1) Tous les logotés non-hds + tous les non-logo non-hds sont publiés.
    assert LOGOTES.issubset(ids), f"logotés manquants : {LOGOTES - ids}"
    assert NON_LOGO_NON_HDS.issubset(ids), f"non-logotés manquants : {NON_LOGO_NON_HDS - ids}"

    # 2) AUCUN document hds n'est publié ni enregistré (garde-fou critique).
    assert HDS.isdisjoint(ids), f"HDS exposé : {HDS & ids}"
    assert all("hds" not in b for b, _ in capture["uploads"])
    assert set(resume["hds_ignores"]) == HDS

    # 3) Mapping des buckets par niveau d'accès.
    par_id = {e["id"]: e for e in generator.build.CATALOGUE}
    for row in capture["inserts"]:
        attendu = "documents-public" if par_id[row["doc_catalogue_id"]]["acces"] == "public" \
            else "documents-client"
        assert row["storage_bucket"] == attendu, row["doc_catalogue_id"]

    # 4) Empreinte du logo : réelle sur les logotés, 'sans-logo' sinon.
    for row in capture["inserts"]:
        if row["logo_client"]:
            assert row["logo_sha256"] == resume["logo_sha256"]
        else:
            assert row["logo_sha256"] == "sans-logo"


def test_logo_invalide_rejete(monkeypatch):
    petit = io.BytesIO()
    Image.new("RGBA", (100, 100), (0, 0, 0, 0)).save(petit, "PNG")
    monkeypatch.setattr(sb, "get_client", lambda cid: {
        "id": cid, "nom": "ACME", "logo_path": f"{cid}/logo.png", "logo_sha256": "x",
    })
    monkeypatch.setattr(sb, "download_object", lambda b, p: petit.getvalue())
    with pytest.raises(generator.LogoInvalide):
        generator.generer_pour_client("job-2", CLIENT_ID)


def test_cache_saute_les_documents_existants(capture, monkeypatch):
    # Tout est déjà en cache -> rien n'est publié.
    monkeypatch.setattr(sb, "document_existe", lambda *a, **k: True)
    resume = generator.generer_pour_client("job-3", CLIENT_ID)
    assert capture["inserts"] == []
    assert capture["uploads"] == []
    assert set(resume["caches"]) == LOGOTES | NON_LOGO_NON_HDS
