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


TYPES = {
    ".pptx": ("PPT", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    ".docx": ("DOC", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ".pdf": ("PDF", "application/pdf"),
}


class DeckEchec(Exception):
    pass


def _document(job_id: str, doc: dict, source: Path, travail: Path, ephemere: bool) -> dict:
    from deck import documents  # noqa: PLC0415

    try:
        sortie, bilan = documents.mettre_a_la_charte(source, travail)
    except ValueError as e:
        raise DeckEchec(str(e)) from e
    ext = source.suffix.lower()
    code, type_mime = TYPES[ext]
    nom = f"{Path(doc['name']).stem} (charte AvisDoc){ext}"
    donnees = sortie.read_bytes()
    rapport = (travail / "rapport.md").read_text(encoding="utf-8")[:20000]
    commun = {"mode": "document", "acces": "client", "erreurs": len(bilan.erreurs),
              "avertissements": len(bilan.anomalies) - len(bilan.erreurs), "rapport": rapport}
    if ephemere:
        chemin = f"_charte-temp/{job_id}/{_nom_fichier(nom)}"
        sb.upload_object(BUCKET, chemin, donnees, type_mime)
        return {**commun, "resultat_path": chemin}
    nouveau = str(uuid.uuid4())
    chemin = f"{nouveau}/v1-{_nom_fichier(nom)}"
    sb.upload_object(BUCKET, chemin, donnees, type_mime)
    sb.upload_object(BUCKET, f"{nouveau}/charte/rapport.md", rapport.encode("utf-8"), "text/markdown")
    sb.insert_row("admin_documents", {
        "id": nouveau, "name": nom, "ext": code, "cat": doc.get("cat") or "", "cat_parent": doc.get("cat_parent") or "",
        "tags": doc.get("tags") or [], "size": _taille(len(donnees)), "date_label": _date(),
        "owner": "Mise à la charte", "version": 1, "storage_path": chemin,
    })
    return {**commun, "resultat_document_id": nouveau, "rapport_path": f"{nouveau}/charte/rapport.md"}


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
    ephemere = not job.get("document_id")
    if ephemere:  # « sans enregistrer » : fichier déposé dans _charte-temp/, rien dans Documents
        if not str(job.get("source_path") or "").startswith("_charte-temp/"):
            raise DeckEchec("chemin de dépôt invalide")
        doc = {"name": job.get("source_nom") or "presentation.pptx", "storage_path": job["source_path"]}
    else:
        doc = sb.get_row("admin_documents", job["document_id"])
    if not doc or not doc.get("storage_path"):
        raise DeckEchec("document source introuvable")
    ext = Path(str(doc["name"])).suffix.lower()
    if ext not in TYPES:
        raise DeckEchec("formats pris en charge : PowerPoint (.pptx), Word (.docx) et PDF")

    with tempfile.TemporaryDirectory() as t:
        racine = Path(t)
        source = racine / "source" / _nom_fichier(doc["name"])
        source.parent.mkdir()
        source.write_bytes(sb.download_object(BUCKET, doc["storage_path"]))
        if ephemere:
            try:
                sb.delete_object(BUCKET, doc["storage_path"])  # la source déposée n'est pas conservée
            except Exception:  # noqa: BLE001
                pass
        travail = racine / "travail"
        if ext != ".pptx":  # Word et PDF : remis à la charte sans passer par les gabarits de diapositives
            return _document(job_id, doc, source, travail, ephemere)
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
        res = controles.executer(travail / "sortie.pptx", pivot, anomalies, avec_planche=bool(shutil.which("soffice")) and not ephemere)

        if ephemere:
            dossier = f"_charte-temp/{job_id}"
            nom = f"{Path(doc['name']).stem} (charte AvisDoc).pptx"
            chemin = f"{dossier}/{_nom_fichier(nom)}"
            sb.upload_object(BUCKET, chemin, (travail / "sortie.pptx").read_bytes(),
                             "application/vnd.openxmlformats-officedocument.presentationml.presentation")
            return {
                "mode": mode, "resultat_path": chemin, "acces": res.acces,
                "erreurs": len(res.erreurs), "avertissements": len(res.constats) - len(res.erreurs),
                "rapport": (travail / "rapport.md").read_text(encoding="utf-8")[:20000],
            }

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
