"""Jeu fermé d'icônes au trait, dessinées par le code (donc versionnées avec lui).

Choisies par mot-clé dans deck.json. Un mot-clé absent du jeu donne une pastille sans icône et
l'anomalie ICONE_INCONNUE (voir generer.py). Dessin en marine sur fond transparent, 256 px.
"""
from __future__ import annotations

import io
import math

from PIL import Image, ImageDraw

T = 256
TRAIT = 18
COULEUR = (0x14, 0x2A, 0x33, 255)


def _toile():
    im = Image.new("RGBA", (T, T), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def _entreprise(d):
    d.rectangle((60, 70, 150, 210), outline=COULEUR, width=TRAIT)
    d.rectangle((150, 120, 200, 210), outline=COULEUR, width=TRAIT)
    for y in (100, 140, 175):
        d.line((85, y, 125, y), fill=COULEUR, width=TRAIT // 2)


def _euro(d):
    d.arc((60, 50, 210, 206), 40, 320, fill=COULEUR, width=TRAIT)
    d.line((40, 112, 150, 112), fill=COULEUR, width=TRAIT // 1)
    d.line((40, 148, 150, 148), fill=COULEUR, width=TRAIT // 1)


def _medecin(d):
    d.ellipse((98, 40, 158, 100), outline=COULEUR, width=TRAIT)
    d.arc((58, 120, 198, 260), 180, 360, fill=COULEUR, width=TRAIT)
    d.line((128, 150, 128, 200), fill=COULEUR, width=TRAIT // 2)
    d.line((103, 175, 153, 175), fill=COULEUR, width=TRAIT // 2)


def _cadenas(d):
    d.rounded_rectangle((60, 115, 196, 215), radius=14, outline=COULEUR, width=TRAIT)
    d.arc((83, 45, 173, 155), 180, 360, fill=COULEUR, width=TRAIT)
    d.line((128, 150, 128, 180), fill=COULEUR, width=TRAIT)


def _horloge(d):
    d.ellipse((48, 48, 208, 208), outline=COULEUR, width=TRAIT)
    d.line((128, 128, 128, 80), fill=COULEUR, width=TRAIT)
    d.line((128, 128, 165, 150), fill=COULEUR, width=TRAIT)


def _loupe(d):
    d.ellipse((50, 50, 160, 160), outline=COULEUR, width=TRAIT)
    d.line((150, 150, 210, 210), fill=COULEUR, width=TRAIT + 6)


def _fleche(d):
    d.line((50, 128, 200, 128), fill=COULEUR, width=TRAIT)
    d.line((150, 80, 205, 128), fill=COULEUR, width=TRAIT)
    d.line((150, 176, 205, 128), fill=COULEUR, width=TRAIT)


def _coche(d):
    d.line((55, 135, 105, 185), fill=COULEUR, width=TRAIT + 4)
    d.line((105, 185, 205, 75), fill=COULEUR, width=TRAIT + 4)


def _personnes(d):
    d.ellipse((60, 60, 115, 115), outline=COULEUR, width=TRAIT // 1)
    d.ellipse((140, 60, 195, 115), outline=COULEUR, width=TRAIT // 1)
    d.arc((35, 130, 140, 235), 180, 360, fill=COULEUR, width=TRAIT)
    d.arc((115, 130, 220, 235), 180, 360, fill=COULEUR, width=TRAIT)


def _calendrier(d):
    d.rounded_rectangle((50, 65, 206, 210), radius=12, outline=COULEUR, width=TRAIT)
    d.line((50, 110, 206, 110), fill=COULEUR, width=TRAIT)
    d.line((95, 45, 95, 85), fill=COULEUR, width=TRAIT)
    d.line((161, 45, 161, 85), fill=COULEUR, width=TRAIT)


def _coeur(d):
    pts = []
    for i in range(0, 360, 6):
        a = math.radians(i)
        x = 16 * math.sin(a) ** 3
        y = 13 * math.cos(a) - 5 * math.cos(2 * a) - 2 * math.cos(3 * a) - math.cos(4 * a)
        pts.append((128 + x * 5.5, 120 - y * 5.5))
    d.line(pts + [pts[0]], fill=COULEUR, width=TRAIT, joint="curve")


def _peau(d):
    d.ellipse((60, 60, 196, 196), outline=COULEUR, width=TRAIT)
    d.ellipse((108, 100, 150, 140), fill=COULEUR)


ICONES = {
    "entreprise": _entreprise, "euro": _euro, "medecin": _medecin, "cadenas": _cadenas,
    "horloge": _horloge, "loupe": _loupe, "fleche": _fleche, "coche": _coche,
    "personnes": _personnes, "calendrier": _calendrier, "coeur": _coeur, "peau": _peau,
}


def icone_png(nom: str) -> io.BytesIO | None:
    """PNG de l'icône, ou None si le mot-clé n'est pas dans le jeu."""
    dessin = ICONES.get(nom)
    if not dessin:
        return None
    im, d = _toile()
    dessin(d)
    tampon = io.BytesIO()
    im.save(tampon, format="PNG", optimize=False)
    tampon.seek(0)
    return tampon
