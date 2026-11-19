"""Mise à la charte d'une présentation du module Documents (commande deck du pack).

Un job admin_deck_jobs désigne un PPTX de admin_documents. Le service le télécharge, lance
`deck` (extraction, gabarits, génération, contrôles), puis range dans Documents, à côté de la
source (jamais modifiée), la présentation refaite ; le rapport, le pivot deck.json et la planche
de contrôle vont dans le même dossier du bucket et sont référencés par le job.

Rien ne sort de la machine, sauf le TEXTE envoyé au modèle en mode modèle (aucune image).
"""
from __future__ import annotations

import json
import re
import shutil
import sys
import tempfile
import unicodedata
import uuid
from datetime import datetime, timezone
from pathlib import Path

import sb

PAQUET = Path(__file__).resolve().parent / "paquet"
BUCKET = "admin-documents"
MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]


class DeckEchec(Exception):
    pass


def _nom_fichier(nom: str) -> str:
    n = unicodedata.normalize("NFD", nom).encode("ascii", "ignore").decode()
    return re.sub(r"_+", "_", re.sub(r"[^a-zA-Z0-9._-]+", "_", n)).strip("_") or "presentation"


def _taille(octets: int) -> str:
    ko = octets / 1024
    if ko < 1024:
        return f"{ko:.1f} Ko".replace(".", ",") if ko < 10 else f"{round(ko)} Ko"
    mo = ko / 1024
    return f"{mo:.1f} Mo".replace(".", ",") if mo < 10 else f"{round(mo)} Mo"


def _date() -> str:
    d = datetime.now(timezone.utc)
    return f"{d.day} {MOIS[d.month - 1]} {d.year}"


def traiter(job_id: str) -> dict:
    if str(PAQUET) not in sys.path:
        sys.path.insert(0, str(PAQUET))
    from deck import controles, extraire, generer, modele, proposer  # noqa: PLC0415 — le pack est vendorisé

    job = sb.get_row("admin_deck_jobs", job_id)
    if not job:
        raise DeckEchec("job introuvable")
    doc = sb.get_row("admin_documents", job["document_id"])
    if not doc or not doc.get("storage_path"):
        raise DeckEchec("document source introuvable")
    if not str(doc["name"]).lower().endswith(".pptx"):
        raise DeckEchec("seuls les fichiers .pptx peuvent être mis à la charte")

    with tempfile.TemporaryDirectory() as t:
        racine = Path(t)
        source = racine / "source" / _nom_fichier(doc["name"])
        source.parent.mkdir()
        source.write_bytes(sb.download_object(BUCKET, doc["storage_path"]))
        travail = racine / "travail"
        brut = extraire.extraire(source, travail)
        pivot = travail / "deck.json"
        if job.get("modele"):
            _, mode = modele.proposer_modele(brut, pivot)
        else:
            proposer.proposer(brut, pivot)
            mode = "regles"
        deck = json.loads(pivot.read_text(encoding="utf-8"))
        deck["meta"]["fond"] = job.get("fond") or "creme"
        pivot.write_text(json.dumps(deck, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        try:
            anomalies = generer.generer(pivot, travail / "sortie.pptx")
        except generer.Debordement as e:
            raise DeckEchec(f"génération refusée : {e}") from e
        res = controles.executer(travail / "sortie.pptx", pivot, anomalies, avec_planche=bool(shutil.which("soffice")))

        # Dépôt dans Documents, à côté de la source.
        nouveau = str(uuid.uuid4())
        base = Path(doc["name"]).stem
        nom = f"{base} (charte AvisDoc).pptx"
        dossier = f"{nouveau}"
        sortie = (travail / "sortie.pptx").read_bytes()
        sb.upload_object(BUCKET, f"{dossier}/v1-{_nom_fichier(nom)}", sortie,
                         "application/vnd.openxmlformats-officedocument.presentationml.presentation")
        sb.upload_object(BUCKET, f"{dossier}/charte/deck.json", pivot.read_bytes(), "application/json")
        sb.upload_object(BUCKET, f"{dossier}/charte/rapport.md", (travail / "rapport.md").read_bytes(), "text/markdown")
        planche = travail / "controle.jpg"
        if planche.exists():
            sb.upload_object(BUCKET, f"{dossier}/charte/controle.jpg", planche.read_bytes(), "image/jpeg")
        sb.insert_row("admin_documents", {
            "id": nouveau, "name": nom, "ext": "PPT", "cat": doc.get("cat") or "", "cat_parent": doc.get("cat_parent") or "",
            "tags": doc.get("tags") or [], "size": _taille(len(sortie)), "date_label": _date(),
            "owner": "Mise à la charte", "version": 1, "storage_path": f"{dossier}/v1-{_nom_fichier(nom)}",
        })
        return {
            "mode": mode, "resultat_document_id": nouveau, "acces": res.acces,
            "erreurs": len(res.erreurs), "avertissements": len(res.constats) - len(res.erreurs),
            "rapport": (travail / "rapport.md").read_text(encoding="utf-8")[:20000],
            "pivot_path": f"{dossier}/charte/deck.json", "rapport_path": f"{dossier}/charte/rapport.md",
            "planche_path": f"{dossier}/charte/controle.jpg" if planche.exists() else None,
        }
