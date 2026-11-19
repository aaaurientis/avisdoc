"""Typographie française appliquée à la génération (brief §5) : espaces insécables,
apostrophe courbe, pas de tiret cadratin. Le fond du texte n'est jamais touché."""
from __future__ import annotations

import re

FINE = " "   # espace fine insécable : avant ? ! ; et dans les nombres
INSEC = " "  # espace insécable : avant : et %


def typographier(t: str) -> str:
    if not t:
        return t
    t = t.replace("—", "–")                      # tiret cadratin → demi-cadratin
    t = re.sub(r"(?<=\w)'(?=\w)", "’", t)              # apostrophe droite → courbe
    t = t.replace("'", "’")
    t = re.sub(r"[   ]*([?!;])", FINE + r"\1", t)  # ? ! ;
    t = re.sub(r"(?<=\S)[   ]*:(?!//)", INSEC + ":", t)  # : (pas dans une adresse web)
    t = re.sub(r"(?<=\d)[   ]*%", INSEC + "%", t)  # 15% → 15 %
    t = re.sub(r"(?<=\d)[  ](?=\d{3}\b)", FINE, t)     # 13 706 → 13 706 (fine)
    return t


def fautes_typo(t: str) -> list[str]:
    """Écarts restants dans un texte déjà généré (contrôle TYPO_FR)."""
    fautes = []
    if re.search(r"(?<=\w)'(?=\w)", t):
        fautes.append("apostrophe droite")
    if re.search(r"(?<![  ])[?!;]", t):
        fautes.append("espace insécable manquante avant ? ! ;")
    if re.search(r"(?<=\d)%|(?<=\d) %", t):
        fautes.append("espace insécable manquante avant %")
    if re.search(r"(?<=\S) ?:(?!//)", t.replace(INSEC + ":", "")):
        fautes.append("espace insécable manquante avant :")
    return fautes
