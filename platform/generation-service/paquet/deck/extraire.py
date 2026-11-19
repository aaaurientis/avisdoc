"""Étape 1 : source.pptx → deck-brut.json et dossier images/ (déterministe, rien ne sort de la machine).

Le brut garde, par diapositive : le titre détecté, les zones de texte (position, taille de police,
paragraphes), les tableaux, les images (fichier, dimensions, position) et les notes.
"""
from __future__ import annotations

import io
import json
from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE, PP_PLACEHOLDER

EMU = 914400


def _formes(conteneur):
    """Toutes les formes, groupes dépliés."""
    for f in conteneur:
        if f.shape_type == MSO_SHAPE_TYPE.GROUP:
            yield from _formes(f.shapes)
        else:
            yield f


def _taille(forme) -> float:
    tailles = [r.font.size.pt for p in forme.text_frame.paragraphs for r in p.runs if r.font.size]
    return max(tailles) if tailles else 18.0


def _paragraphes(forme) -> list[str]:
    return [t for t in ("".join(r.text for r in p.runs).strip() for p in forme.text_frame.paragraphs) if t]


def _pos(f) -> dict:
    return {"x": round((f.left or 0) / EMU, 3), "y": round((f.top or 0) / EMU, 3),
            "l": round((f.width or 0) / EMU, 3), "h": round((f.height or 0) / EMU, 3)}


def extraire(source: Path, dossier: Path) -> Path:
    prs = Presentation(source)
    (dossier / "images").mkdir(parents=True, exist_ok=True)
    diapositives = []
    for n, diapo in enumerate(prs.slides, 1):
        zones, tableaux, images, titre = [], [], [], None
        k = 0
        for f in _formes(diapo.shapes):
            if f.is_placeholder and f.placeholder_format.type in (PP_PLACEHOLDER.TITLE, PP_PLACEHOLDER.CENTER_TITLE) and f.has_text_frame:
                t = " ".join(_paragraphes(f))
                if t:
                    titre = t
                    continue
            if f.shape_type == MSO_SHAPE_TYPE.PICTURE or (f.is_placeholder and hasattr(f, "image")):
                try:
                    blob, ext = f.image.blob, f.image.ext
                except (AttributeError, ValueError):
                    continue
                k += 1
                nom = f"images/diapo{n:02d}-{k}.{ext}"
                (dossier / nom).write_bytes(blob)
                lw, lh = Image.open(io.BytesIO(blob)).size
                images.append({"fichier": nom, "largeur_px": lw, "hauteur_px": lh, **_pos(f)})
            elif f.has_table:
                tableaux.append([[c.text.strip() for c in ligne.cells] for ligne in f.table.rows])
            elif f.has_text_frame:
                p = _paragraphes(f)
                if p:
                    zones.append({"taille": _taille(f), **_pos(f), "paragraphes": p})
        zones.sort(key=lambda z: (round(z["y"], 1), z["x"]))
        # Pas d'espace réservé de titre : la plus grande police dans le haut de la diapositive.
        if titre is None and zones:
            hautes = [z for z in zones if z["y"] < 1.6] or zones
            z = max(hautes, key=lambda z: (z["taille"], -z["y"]))
            if len(z["paragraphes"]) == 1 or z["y"] < 1.6:
                titre = z["paragraphes"][0]
                z["paragraphes"] = z["paragraphes"][1:]
                zones = [x for x in zones if x["paragraphes"]]
        notes = diapo.notes_slide.notes_text_frame.text if diapo.has_notes_slide else ""
        diapositives.append({"source": n, "titre": titre, "zones": zones, "tableaux": tableaux,
                             "images": images, "notes": notes})
    brut = {"version": 1, "brut": True, "meta": {"source": source.name}, "diapositives": diapositives}
    chemin = dossier / "deck-brut.json"
    chemin.write_text(json.dumps(brut, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return chemin
