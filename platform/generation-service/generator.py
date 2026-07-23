"""Cœur de la génération : exécute le pack (build.py) et publie les sorties.

Principes (voir docs/cadrage §6 et le BRIEF du pack) :
- On passe TOUJOURS par les générateurs du pack (jamais de réécriture de PDF
  côté serveur : sinon perte des polices embarquées, du fond perdu et des
  traits de coupe).
- Les documents de niveau 'hds' ne sont jamais publiés ni enregistrés.
- La règle logo 9/15 vient du CATALOGUE (champ logo_client) : on ne la
  contourne pas ici.
- Cache par (client, document, empreinte du logo, version).
"""
from __future__ import annotations

import hashlib
import io
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

import sb

ICI = pathlib.Path(__file__).parent.resolve()
PAQUET = ICI / "paquet"

# Le CATALOGUE de build.py est la source de vérité (ids, accès, règle logo…).
sys.path.insert(0, str(PAQUET))
import build  # noqa: E402  (le paquet est vendorisé à côté)

VERSION = json.loads((PAQUET / "manifeste.json").read_text())["version"]

CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}
BUCKET = {"public": "documents-public", "client": "documents-client"}
SANS_LOGO = "sans-logo"


class LogoInvalide(Exception):
    """Logo non conforme (cf. contraintes du brief §Validation)."""


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def valider_logo(data: bytes) -> None:
    """Contrôles du brief : fond transparent et hauteur suffisante.

    - Sans canal alpha (ex. JPEG), un carré blanc apparaîtra sur le crème.
    - Sous 200 px de haut, l'impression A2 sera floue.
    """
    try:
        img = Image.open(io.BytesIO(data))
    except Exception as e:  # noqa: BLE001
        raise LogoInvalide(f"fichier logo illisible : {e}") from e

    if img.height < 200:
        raise LogoInvalide(
            f"logo trop petit ({img.width}x{img.height}) : hauteur >= 200 px requise "
            "pour l'impression A2."
        )

    a_alpha = img.mode in ("RGBA", "LA") or (
        img.mode == "P" and "transparency" in img.info
    )
    if not a_alpha:
        raise LogoInvalide(
            "logo sans fond transparent : un aplat opaque apparaîtrait sur le crème. "
            "Fournir un PNG/SVG à fond transparent."
        )


def _fichier_produit(sortie: pathlib.Path, entree: dict, suffixe: str) -> pathlib.Path:
    """Chemin du fichier généré pour une entrée du catalogue.

    Documents logotés -> déclinaison suffixée (-<client>). Sinon -> fichier de
    base, identique pour tous les clients.
    """
    base = sortie / entree["fichier"]
    if entree["logo_client"]:
        return base.with_name(base.stem + suffixe + base.suffix)
    return base


def generer_pour_client(job_id: str, client_id: str) -> dict:
    client = sb.get_client(client_id)
    if not client:
        raise RuntimeError(f"client introuvable : {client_id}")
    if not client.get("logo_path"):
        raise LogoInvalide("aucun logo téléversé pour ce client.")

    logo_bytes = sb.download_object("logos", client["logo_path"])
    valider_logo(logo_bytes)
    empreinte = sha256(logo_bytes)

    nom = client["nom"]
    suffixe = "-" + nom.lower()

    # Copie de travail isolée : build.py écrit dans paquet/documents/, on évite
    # toute course entre jobs concurrents.
    with tempfile.TemporaryDirectory() as tmp:
        travail = pathlib.Path(tmp) / "paquet"
        shutil.copytree(PAQUET, travail)
        logo_fichier = pathlib.Path(tmp) / "logo.png"
        logo_fichier.write_bytes(logo_bytes)

        proc = subprocess.run(
            [sys.executable, "build.py", "client", nom, "--logo", str(logo_fichier)],
            cwd=travail, capture_output=True, text=True,
        )
        if proc.returncode != 0:
            raise RuntimeError(
                "échec build.py client :\n" + proc.stdout[-1500:] + proc.stderr[-1500:]
            )

        sortie = travail / "documents"
        publies, caches, ignores_hds = [], [], []

        for e in build.CATALOGUE:
            if e["acces"] == "hds":
                ignores_hds.append(e["id"])  # jamais publié (données de santé)
                continue

            logo_sha = empreinte if e["logo_client"] else SANS_LOGO
            if sb.document_existe(client_id, e["id"], logo_sha, VERSION):
                caches.append(e["id"])
                continue

            fichier = _fichier_produit(sortie, e, suffixe)
            if not fichier.exists():
                # Ne pas planter tout le job pour un document manquant : on le
                # signale, les autres passent.
                caches.append(e["id"] + " (manquant, ignoré)")
                continue

            data = fichier.read_bytes()
            ext = fichier.suffix
            bucket = BUCKET[e["acces"]]
            chemin = f"{client_id}/{e['id']}-{VERSION}{ext}"
            sb.upload_object(bucket, chemin, data, CONTENT_TYPES.get(ext, "application/octet-stream"))
            sb.insert_document({
                "client_id": client_id,
                "doc_catalogue_id": e["id"],
                "titre": e["titre"],
                "acces": e["acces"],
                "logo_client": e["logo_client"],
                "phase": e["phase"],
                "format": e["format"],
                "version": VERSION,
                "storage_bucket": bucket,
                "storage_path": chemin,
                "octets": len(data),
                "logo_sha256": logo_sha,
            })
            publies.append(e["id"])

    return {
        "publies": publies,
        "caches": caches,
        "hds_ignores": ignores_hds,
        "version": VERSION,
        "logo_sha256": empreinte,
    }
