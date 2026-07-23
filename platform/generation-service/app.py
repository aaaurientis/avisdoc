"""Service de génération documentaire AvisDoc.

Déclenché par un Supabase Database Webhook sur INSERT dans generation_jobs
(voir docs/cadrage §5.1). Conçu pour Scaleway Serverless Containers
(scale-to-zero) : un appel = un job.

Sécurité : le webhook doit présenter l'en-tête X-Webhook-Secret == WEBHOOK_SECRET.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import FastAPI, Header, HTTPException
from fastapi.concurrency import run_in_threadpool

import sb
from generator import LogoInvalide, generer_pour_client

WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "").strip()


def _maintenant() -> str:
    return datetime.now(timezone.utc).isoformat()

app = FastAPI(title="AvisDoc — génération documentaire")


@app.get("/health")
def health() -> dict:
    return {"ok": True}


def _role_de_cle(cle: str) -> str:
    """Rôle encodé dans une clé JWT Supabase (service_role / anon), sans secret."""
    try:
        import base64
        import json as _json
        charge = cle.split(".")[1]
        charge += "=" * (-len(charge) % 4)
        return _json.loads(base64.urlsafe_b64decode(charge)).get("role", "?")
    except Exception:  # noqa: BLE001
        return "non-JWT"


@app.get("/debug")
def debug() -> dict:
    """Vérifie ce que le conteneur voit réellement (aucun secret révélé)."""
    cle = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    return {
        "service_key_len": len(cle),
        "service_key_role": _role_de_cle(cle),
        "webhook_secret_len": len(WEBHOOK_SECRET),
        "supabase_url_set": bool(os.environ.get("SUPABASE_URL")),
        "supabase_probe": sb.probe(),
    }


def _extraire_job(payload: dict) -> tuple[str, str]:
    """Accepte le format du webhook Supabase ({record:{...}}) ou un appel direct."""
    rec = payload.get("record") or payload
    job_id = rec.get("id") or rec.get("job_id")
    client_id = rec.get("client_id")
    if not job_id or not client_id:
        raise HTTPException(400, "job_id et client_id requis")
    # On ne traite que les jobs en attente (idempotence face aux relivraisons).
    if rec.get("statut") and rec["statut"] != "en_attente":
        raise HTTPException(409, f"job déjà au statut {rec['statut']}")
    return job_id, client_id


def _echec(job_id: str, message: str) -> None:
    """Écrit l'échec dans le job ; n'échoue jamais elle-même (best effort)."""
    try:
        sb.update_job(job_id, statut="echec", erreur=message[:1000], fini_le=_maintenant())
    except Exception:  # noqa: BLE001
        pass  # si même cette écriture échoue (clé rejetée), le détail reste dans la réponse HTTP


def _traiter(job_id: str, client_id: str) -> dict:
    """Travail bloquant (subprocess + I/O), exécuté hors de la boucle async.

    Tout est capturé : même une panne d'infra (clé rejetée, réseau…) renvoie un
    JSON lisible (visible dans net._http_response.content) au lieu d'un
    « Internal Server Error » opaque.
    """
    try:
        sb.update_job(job_id, statut="en_cours", demarre_le=_maintenant())
        resume = generer_pour_client(job_id, client_id)
        sb.update_job(job_id, statut="termine", fini_le=_maintenant())
        return {"job_id": job_id, **resume}
    except LogoInvalide as e:
        _echec(job_id, f"logo: {e}")
        raise HTTPException(422, f"logo invalide : {e}")
    except Exception as e:  # noqa: BLE001
        _echec(job_id, f"{type(e).__name__}: {e}")
        raise HTTPException(500, f"génération échouée : {type(e).__name__}: {e}")


@app.post("/generate")
async def generate(payload: dict, x_webhook_secret: str = Header(default="")) -> dict:
    if not WEBHOOK_SECRET or x_webhook_secret.strip() != WEBHOOK_SECRET:
        raise HTTPException(401, "secret webhook invalide")
    job_id, client_id = _extraire_job(payload)
    return await run_in_threadpool(_traiter, job_id, client_id)
