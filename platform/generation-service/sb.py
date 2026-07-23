"""Accès Supabase (PostgREST + Storage) via la clé service_role.

Le service tourne côté serveur uniquement : la clé service_role contourne la
RLS, ce qui est nécessaire pour écrire dans documents/generation_jobs. Elle ne
doit jamais être exposée aux frontends.
"""
from __future__ import annotations

import os
import httpx

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

_HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
}


def _rest(path: str) -> str:
    return f"{SUPABASE_URL}/rest/v1/{path}"


def _storage(path: str) -> str:
    return f"{SUPABASE_URL}/storage/v1/{path}"


def probe() -> dict:
    """Diagnostic : que peut faire la clé du conteneur sur PostgREST ?

    200 + lignes -> clé service_role opérationnelle. 401 -> clé rejetée.
    [] -> clé soumise à la RLS (anon). Ne révèle aucun secret.
    """
    try:
        r = httpx.get(
            _rest("clients"),
            params={"select": "nom", "limit": "3"},
            headers=_HEADERS, timeout=15,
        )
        return {"http_status": r.status_code, "corps": r.text[:200]}
    except Exception as e:  # noqa: BLE001
        return {"erreur": str(e)[:200]}


def get_client(client_id: str) -> dict | None:
    r = httpx.get(
        _rest("clients"),
        params={"id": f"eq.{client_id}", "select": "*", "limit": "1"},
        headers=_HEADERS,
        timeout=30,
    )
    r.raise_for_status()
    rows = r.json()
    return rows[0] if rows else None


def download_object(bucket: str, path: str) -> bytes:
    r = httpx.get(_storage(f"object/{bucket}/{path}"), headers=_HEADERS, timeout=60)
    r.raise_for_status()
    return r.content


def upload_object(bucket: str, path: str, data: bytes, content_type: str) -> None:
    r = httpx.post(
        _storage(f"object/{bucket}/{path}"),
        headers={**_HEADERS, "Content-Type": content_type, "x-upsert": "true"},
        content=data,
        timeout=120,
    )
    r.raise_for_status()


def insert_document(row: dict) -> None:
    """Insère une ligne documents en ignorant les doublons (cache).

    Le conflit sur (client_id, doc_catalogue_id, logo_sha256, version) signifie
    que le document a déjà été généré : on n'écrase rien.
    """
    conflit = "client_id,doc_catalogue_id,logo_sha256,version"
    r = httpx.post(
        _rest("documents"),
        params={"on_conflict": conflit},
        headers={**_HEADERS, "Content-Type": "application/json",
                 "Prefer": "resolution=ignore-duplicates,return=minimal"},
        json=row,
        timeout=30,
    )
    r.raise_for_status()


def document_existe(client_id: str, doc_id: str, logo_sha256: str, version: str) -> bool:
    r = httpx.get(
        _rest("documents"),
        params={
            "client_id": f"eq.{client_id}",
            "doc_catalogue_id": f"eq.{doc_id}",
            "logo_sha256": f"eq.{logo_sha256}",
            "version": f"eq.{version}",
            "select": "id",
            "limit": "1",
        },
        headers=_HEADERS,
        timeout=30,
    )
    r.raise_for_status()
    return bool(r.json())


def update_job(job_id: str, **champs) -> None:
    r = httpx.patch(
        _rest("generation_jobs"),
        params={"id": f"eq.{job_id}"},
        headers={**_HEADERS, "Content-Type": "application/json", "Prefer": "return=minimal"},
        json=champs,
        timeout=30,
    )
    r.raise_for_status()
