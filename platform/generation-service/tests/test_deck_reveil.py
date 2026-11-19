"""Le webhook n'attend que quelques secondes : un conteneur en veille perd l'appel. Le service
doit répondre aussitôt, reprendre les jobs en attente au réveil, et ne jamais traiter deux fois."""
import os
import pathlib
import sys
import time

os.environ.setdefault("SUPABASE_URL", "https://exemple.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test")
os.environ["WEBHOOK_SECRET"] = "secret"
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import app  # noqa: E402
import sb  # noqa: E402


def test_reprise_au_reveil_et_reponse_immediate(monkeypatch):
    app.WEBHOOK_SECRET = "secret"
    pris, traites = set(), []
    def prendre(job_id, maintenant):
        if job_id in pris:
            return False
        pris.add(job_id)
        return True
    monkeypatch.setattr(sb, "prendre_job_deck", prendre)
    monkeypatch.setattr(sb, "jobs_deck_en_attente", lambda depuis: ["perdu-pendant-la-veille"])
    monkeypatch.setattr(app, "_traiter_deck", lambda job_id: traites.append(job_id))
    with TestClient(app.app) as client:
        r = client.post("/deck", json={"record": {"id": "j1", "statut": "en_attente"}}, headers={"X-Webhook-Secret": "secret"})
        assert r.status_code == 202
        assert client.post("/deck", json={"record": {"id": "j1"}}, headers={"X-Webhook-Secret": "faux"}).status_code == 401
        client.post("/deck", json={"record": {"id": "j1", "statut": "en_attente"}}, headers={"X-Webhook-Secret": "secret"})
        time.sleep(0.5)
    assert sorted(traites) == ["j1", "perdu-pendant-la-veille"]  # chacun une seule fois
