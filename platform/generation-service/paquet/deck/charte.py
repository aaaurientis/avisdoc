"""Charte des présentations : palette du thème, polices, géométrie (annexe A du brief).

La charte du dépôt fait foi (assets/charte/Charte-AvisDoc.md, décision du 19/11) : les couleurs
« lisibles » et les gris de l'annexe A, absents de la charte, sont remplacés par des couleurs
de la palette.
"""
from __future__ import annotations

from pptx.util import Emu, Inches

# Palette (charte du dépôt). Rôle dans le thème entre parenthèses.
MARINE = "142A33"         # texte 1 (dk1)
CREME = "F7F4EF"          # fond 1 (lt1) si meta.fond = creme
BLANC = "FFFFFF"          # fond 1 si meta.fond = blanc ; accent 6 (texte sur fond sombre)
ARDOISE = "5C6A6E"        # texte 2 (dk2)
CYAN_TRES_CLAIR = "EAF6FB"  # fond 2 (lt2)
CYAN = "0CA6DF"           # accent 1 : jamais en texte sur fond clair
ORANGE = "EC7735"         # accent 2 : jamais en texte sur fond clair
BEIGE = "E3DCD2"          # accent 3
TAUPE = "9A8E7F"          # accent 4
CYAN_CLAIR = "29B1E0"     # accent 5

PALETTE = {MARINE, CREME, BLANC, ARDOISE, CYAN_TRES_CLAIR, CYAN, ORANGE, BEIGE, TAUPE, CYAN_CLAIR}
# Couleurs signature interdites en texte sur fond clair (contraste).
SIGNATURE = {CYAN, ORANGE, CYAN_CLAIR}
FONDS = {"creme": CREME, "blanc": BLANC}

POLICE_TITRE = "Georgia"
POLICE_CORPS = "Calibri"
POLICES = {POLICE_TITRE, POLICE_CORPS, "+mj-lt", "+mn-lt"}

SIGNATURE_TEXTE = "La dermatologie n'attend pas."

# Géométrie, en pouces (diapositive 13,333 × 7,5).
LARGEUR, HAUTEUR = 13.333, 7.5
MARGE = 0.6
HAUT_CONTENU, BAS_CONTENU = 1.75, 6.6
GOUTTIERE = 0.3
DROITE = LARGEUR - MARGE  # 12,733


def emu(pouces: float) -> Emu:
    return Inches(pouces)
