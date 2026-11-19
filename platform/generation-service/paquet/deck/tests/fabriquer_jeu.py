"""Fabrique le jeu de test fictif de la commande deck (lot 0).

Produit deck/tests/jeu/source-fictive.pptx : une présentation volontairement HORS charte,
qui reproduit les défauts de la présentation CNAM de novembre 2026 sans en reprendre le
contenu ni les images (brief §8.2) :

  - fond bleu nuit, titres orange, polices Helvetica World et Montserrat, aucune mise en
    page commune (tout est posé sur la mise en page vierge) ;
  - fautes et écarts à relever : « heures ouvrés », « Avisdoc », « dépistage », tiret
    cadratin, « 15% » sans espace, deux diapositives de même titre ;
  - une diapositive de captures : pages du compte-rendu FICTIF du pack (Marion Delaunay,
    lésions générées), jamais un dossier réel.

Déterministe : relancé, il produit le même contenu (dates du fichier figées).
Usage : python3 deck/tests/fabriquer_jeu.py   (depuis paquet/)
"""
from __future__ import annotations

import datetime as dt
import subprocess
import tempfile
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.util import Inches, Pt

RACINE = Path(__file__).resolve().parents[2]  # paquet/
SORTIE = Path(__file__).resolve().parent / "jeu" / "source-fictive.pptx"
CR_FICTIF = RACINE / "documents/pdf/CR-teleexpertise-AvisDoc.pdf"
LOGO = RACINE / "assets/logos/logo_blanc.png"

NUIT = RGBColor(0x0F, 0x1E, 0x3D)
ORANGE = RGBColor(0xF2, 0x8C, 0x28)
BLANC = RGBColor(0xFF, 0xFF, 0xFF)


def fond(diapo):
    remplissage = diapo.background.fill
    remplissage.solid()
    remplissage.fore_color.rgb = NUIT


def zone(diapo, x, y, l, h, lignes, police="Montserrat", taille=18, couleur=BLANC, gras=False):
    forme = diapo.shapes.add_textbox(Inches(x), Inches(y), Inches(l), Inches(h))
    tf = forme.text_frame
    tf.word_wrap = True
    for i, texte in enumerate(lignes):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        r = p.add_run()
        r.text = texte
        r.font.name = police
        r.font.size = Pt(taille)
        r.font.bold = gras
        r.font.color.rgb = couleur
    return forme


def titre(diapo, texte):
    return zone(diapo, 0.5, 0.35, 12.3, 1.0, [texte], police="Helvetica World", taille=32, couleur=ORANGE, gras=True)


def notes(diapo, texte):
    diapo.notes_slide.notes_text_frame.text = texte


def pages_cr(dossier: Path) -> list[Path]:
    """Pages 1 et 2 du compte-rendu fictif du pack, en PNG (110 ppp)."""
    subprocess.run(["pdftoppm", "-png", "-r", "110", "-f", "1", "-l", "2", str(CR_FICTIF), str(dossier / "cr")], check=True)
    return sorted(dossier.glob("cr-*.png"))


def fabriquer() -> Path:
    p = Presentation()
    p.slide_width, p.slide_height = Inches(13.333), Inches(7.5)
    vierge = p.slide_layouts[6]
    nouvelle = lambda: (lambda d: (fond(d), d)[1])(p.slides.add_slide(vierge))  # noqa: E731

    # 1. Couverture
    d = nouvelle()
    zone(d, 0.8, 2.2, 11, 1.6, ["Repérage des lésions suspectes en entreprise"], police="Helvetica World", taille=40, couleur=ORANGE, gras=True)
    zone(d, 0.8, 4.0, 11, 1.0, ["Bilan de campagne 2026 — Mutuelle Exemple"], taille=20)
    notes(d, "Présentation fictive, jeu de test de la commande deck.")

    # 2. Un constat et une liste
    d = nouvelle()
    titre(d, "Le constat")
    zone(d, 0.8, 1.7, 5.5, 3, ["6 mois", "délai moyen pour voir un dermatologue"], taille=28, gras=True)
    zone(d, 6.8, 1.7, 6, 4, ["Des déserts médicaux étendus", "Des salariés peu suivis", "Des lésions repérées tard"], taille=18)

    # 3. Étapes numérotées (faute « heures ouvrés »)
    d = nouvelle()
    titre(d, "Le parcours")
    zone(d, 0.8, 1.7, 11.5, 4.5, [
        "1. Une infirmière photographie la lésion",
        "2. Un dermatologue du réseau donne son avis",
        "3. Avis rendu sous 48 heures ouvrés",
        "4. Orientation vers une consultation si besoin",
    ], taille=20)

    # 4. Puces courtes (grille)
    d = nouvelle()
    titre(d, "Nos atouts")
    zone(d, 0.8, 1.7, 11.5, 4.5, ["Sur le lieu de travail", "Sans avance de frais", "Avis d'un dermatologue", "Confidentiel", "Rapide"], taille=20)

    # 5. Objectifs et questions
    d = nouvelle()
    titre(d, "Objectifs et questions")
    zone(d, 0.8, 1.7, 5.5, 4.5, ["Objectif : repérer plus tôt", "Objectif : orienter sans délai"], taille=20, gras=True)
    zone(d, 6.8, 1.7, 6, 4.5, ["Qui peut en bénéficier ?", "Combien de temps dure l'examen ?", "Les résultats sont-ils confidentiels ?"], taille=18)

    # 6. Chiffres (« 15% » sans espace)
    d = nouvelle()
    titre(d, "Statistiques")
    zone(d, 0.8, 1.7, 11.5, 4.5, [
        "13 706 avis donnés",
        "15% de demandes de consultation dermatologique",
        "92 % de participants satisfaits",
        "3 jours de délai médian",
    ], taille=22)
    notes(d, "Chiffres fictifs.")

    # 7. Mêmes libellés sur plusieurs années (tableau)
    d = nouvelle()
    titre(d, "Évolution")
    zone(d, 0.8, 1.7, 11.5, 4.5, [
        "2024 : 3 120 avis, 410 consultations",
        "2025 : 5 870 avis, 820 consultations",
        "2026 : 4 716 avis, 690 consultations",
    ], taille=20)

    # 8. Captures (pages du compte-rendu fictif), sans autre texte que le titre
    d = nouvelle()
    titre(d, "Exemple de compte-rendu")
    with tempfile.TemporaryDirectory() as t:
        for i, page in enumerate(pages_cr(Path(t))):
            d.shapes.add_picture(str(page), Inches(1.0 + i * 6.0), Inches(1.5), height=Inches(5.6))

    # 9 et 10. Même titre (TITRE_DOUBLON) ; « dépistage », « Avisdoc », tiret cadratin
    d = nouvelle()
    titre(d, "Résultats")
    zone(d, 0.8, 1.7, 11.5, 4.5, ["Une participation en hausse", "Des orientations plus précoces"], taille=20)
    d = nouvelle()
    titre(d, "Résultats")
    zone(d, 0.8, 1.7, 11.5, 4.5, ["Le dépistage en entreprise a convaincu", "Avisdoc reconduit pour 2027 — trois sites"], taille=20)

    # 11. Clôture : le logo seul, sans texte propre
    d = nouvelle()
    d.shapes.add_picture(str(LOGO), Inches(5.4), Inches(2.0), height=Inches(3.0))

    # Fichier déterministe : métadonnées figées.
    fige = dt.datetime(2026, 11, 19, 0, 0, 0)
    cp = p.core_properties
    cp.author, cp.last_modified_by, cp.title = "jeu de test deck", "jeu de test deck", "Présentation fictive"
    cp.created = cp.modified = fige
    cp.revision = 1
    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    p.save(SORTIE)
    return SORTIE


if __name__ == "__main__":
    print(fabriquer())
