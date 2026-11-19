"""Service de génération documentaire AvisDoc.

Déclenché par un Supabase Database Webhook sur INSERT dans generation_jobs
(voir docs/cadrage §5.1). Conçu pour Scaleway Serverless Containers
(scale-to-zero) : un appel = un job.

Sécurité : le webhook doit présenter l'en-tête X-Webhook-Secret == WEBHOOK_SECRET.
"""
from __future__ import annotations

import os
import threading
import time
from datetime import datetime, timedelta, timezone

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


def _traiter_deck(job_id: str) -> dict:
    """Mise à la charte d'un fichier (admin_deck_jobs), job déjà réservé (statut en_cours)."""
    import deck_job
    try:
        resultat = deck_job.traiter(job_id)
        sb.update_row("admin_deck_jobs", job_id, statut="termine", fini_le=_maintenant(), **resultat)
        return {"job_id": job_id, **{k: v for k, v in resultat.items() if k != "rapport"}}
    except Exception as e:  # noqa: BLE001
        message = str(e) if isinstance(e, deck_job.DeckEchec) else f"{type(e).__name__}: {e}"
        try:
            sb.update_row("admin_deck_jobs", job_id, statut="echec", erreur=message[:1000], fini_le=_maintenant())
        except Exception:  # noqa: BLE001
            pass
        raise HTTPException(500, f"mise à la charte échouée : {message}")


def _job_deck(payload: dict) -> str:
    rec = payload.get("record") or payload
    if not rec.get("id"):
        raise HTTPException(400, "id du job requis")
    if rec.get("statut") and rec["statut"] != "en_attente":
        raise HTTPException(409, f"job déjà au statut {rec['statut']}")
    return rec["id"]


# Le webhook Supabase n'attend que quelques secondes : un conteneur en veille ne répond pas à temps
# et l'appel est perdu (constaté le 19/11). D'où trois mécanismes :
#   1. /deck répond tout de suite et travaille en arrière-plan ;
#   2. au démarrage (le webhook, même expiré, a réveillé le conteneur), les jobs en attente sont repris ;
#   3. tant que le conteneur vit, il regarde toutes les 20 s s'il reste des jobs en attente.
# Chaque job est réservé de façon atomique (en_attente → en_cours) : jamais traité deux fois.
_verrou = threading.Lock()


def _executer_si_libre(job_id: str) -> None:
    try:
        if not sb.prendre_job_deck(job_id, _maintenant()):
            return  # déjà pris
    except Exception:  # noqa: BLE001
        return
    with _verrou:  # un traitement à la fois : LibreOffice et la mémoire du conteneur
        try:
            _traiter_deck(job_id)
        except HTTPException:
            pass  # l'échec est déjà écrit dans le job


def _balayer() -> None:
    while True:
        try:
            depuis = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
            for job_id in sb.jobs_deck_en_attente(depuis):
                _executer_si_libre(job_id)
        except Exception:  # noqa: BLE001 — réseau : on réessaie au tour suivant
            pass
        time.sleep(20)


@app.on_event("startup")
def _demarrage() -> None:
    threading.Thread(target=_balayer, name="balayage-deck", daemon=True).start()


@app.post("/deck", status_code=202)
async def deck(payload: dict, x_webhook_secret: str = Header(default="")) -> dict:
    """Webhook Supabase sur INSERT dans admin_deck_jobs : accepté aussitôt, traité en arrière-plan."""
    if not WEBHOOK_SECRET or x_webhook_secret.strip() != WEBHOOK_SECRET:
        raise HTTPException(401, "secret webhook invalide")
    job_id = _job_deck(payload)
    threading.Thread(target=_executer_si_libre, args=(job_id,), daemon=True).start()
    return {"job_id": job_id, "accepte": True}


@app.post("/generate")
async def generate(payload: dict, x_webhook_secret: str = Header(default="")) -> dict:
    if not WEBHOOK_SECRET or x_webhook_secret.strip() != WEBHOOK_SECRET:
        raise HTTPException(401, "secret webhook invalide")
    if payload.get("table") == "admin_deck_jobs":  # un seul webhook peut servir les deux tables
        job_id = _job_deck(payload)
        threading.Thread(target=_executer_si_libre, args=(job_id,), daemon=True).start()
        return {"job_id": job_id, "accepte": True}
    job_id, client_id = _extraire_job(payload)
    return await run_in_threadpool(_traiter, job_id, client_id)
