"""Fichier maître des présentations : thème AvisDoc et dix mises en page nommées.

Fabriqué par le code à chaque génération (rejouable, revu comme du code) ; `deck maitre`
l'enregistre dans gabarits/deck-avisdoc.pptx pour qui veut l'ouvrir. Les couleurs vivent dans le
THÈME : le fond clair (lt1) est le seul endroit qui change entre crème et blanc (meta.fond).
"""
from __future__ import annotations

import copy
from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.enum.dml import MSO_THEME_COLOR
from pptx.enum.shapes import PP_PLACEHOLDER
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.oxml.ns import qn
from pptx.oxml.shapes.autoshape import CT_Shape
from pptx.oxml.shapes.picture import CT_Picture

from . import charte as C

RACINE = Path(__file__).resolve().parents[1]  # paquet/
LOGO_BICOLORE = RACINE / "assets/logos/logo_bicolore.png"
LOGO_BLANC = RACINE / "assets/logos/logo_blanc.png"

GABARITS = ["couverture", "enonce_liste", "grille", "chiffres", "tableau", "etapes",
            "objectifs_questions", "captures", "cloture", "texte"]
SOMBRES = {"couverture", "cloture"}

A = "http://schemas.openxmlformats.org/drawingml/2006/main"

# Position du titre de chaque mise en page (x, y, largeur, hauteur), en pouces.
TITRES = {
    "couverture": (0.75, 2.75, 7.0, 2.5),
    "captures": (0.6, 1.0, 2.45, 4.5),
    "cloture": (0.6, 4.85, 12.13, 0.9),
}
TITRE_CONTENU = (C.MARGE, 0.5, 12.13, 0.9)


def _theme(prs, fond: str) -> None:
    recolorer(prs.slide_master.part.part_related_by(RT.THEME), fond)


def recolorer(part, fond: str) -> None:
    """Palette et polices AvisDoc dans une partie thème (masque des diapositives ou des notes)."""
    racine = etree.fromstring(part.blob)
    ns = {"a": A}
    couleurs = {
        "dk1": C.MARINE, "lt1": C.FONDS[fond], "dk2": C.ARDOISE, "lt2": C.CYAN_TRES_CLAIR,
        "accent1": C.CYAN, "accent2": C.ORANGE, "accent3": C.BEIGE, "accent4": C.TAUPE,
        "accent5": C.CYAN_CLAIR, "accent6": C.BLANC, "hlink": C.MARINE, "folHlink": C.ARDOISE,
    }
    schema = racine.find(".//a:clrScheme", ns)
    schema.set("name", "AvisDoc")
    for role, valeur in couleurs.items():
        el = schema.find(f"a:{role}", ns)
        for enfant in list(el):
            el.remove(enfant)
        etree.SubElement(el, f"{{{A}}}srgbClr", val=valeur)
    polices = racine.find(".//a:fontScheme", ns)
    polices.set("name", "AvisDoc")
    for groupe, nom in (("majorFont", C.POLICE_TITRE), ("minorFont", C.POLICE_CORPS)):
        g = polices.find(f"a:{groupe}", ns)
        g.find("a:latin", ns).set("typeface", nom)
        for el in g.findall("a:font", ns):  # pas de police de script exotique
            g.remove(el)
    # Ombres et effets du modèle par défaut : noir pur → marine.
    for el in racine.iter(f"{{{A}}}srgbClr"):
        if el.get("val", "").upper() not in C.PALETTE:
            el.set("val", C.MARINE)
    if hasattr(part, "_element"):  # partie XML (thème des notes, créé par python-pptx)
        from pptx.oxml import parse_xml
        part._element = parse_xml(etree.tostring(racine))
    else:
        part._blob = etree.tostring(racine, xml_declaration=True, encoding="UTF-8", standalone=True)


def _image(layout, chemin: Path, nom: str, desc: str, x: float, y: float, l: float, h: float) -> None:
    _, rid = layout.part.get_or_add_image_part(str(chemin))
    arbre = layout.shapes._spTree
    pic = CT_Picture.new_pic(arbre._next_shape_id, nom, desc, rid, C.emu(x), C.emu(y), C.emu(l), C.emu(h))
    arbre.append(pic)


def _texte(layout, nom: str, x: float, y: float, l: float, h: float, paragraphe_xml: str) -> None:
    arbre = layout.shapes._spTree
    sp = CT_Shape.new_textbox_sp(arbre._next_shape_id, nom, C.emu(x), C.emu(y), C.emu(l), C.emu(h))
    corps = sp.find(qn("p:txBody"))
    for p in corps.findall(qn("a:p")):
        corps.remove(p)
    corps.append(etree.fromstring(f'<a:p xmlns:a="{A}">{paragraphe_xml}</a:p>'))
    arbre.append(sp)


def _run(texte: str, taille: int, couleur: str) -> str:
    return (f'<a:rPr lang="fr-FR" sz="{taille * 100}"><a:solidFill><a:srgbClr val="{couleur}"/></a:solidFill>'
            f'<a:latin typeface="{C.POLICE_CORPS}"/></a:rPr>')


def _pied(layout) -> None:
    """Logo, signature et numéro : sur la mise en page, jamais recopiés sur la diapositive."""
    _image(layout, LOGO_BICOLORE, "Pied logo AvisDoc", "AvisDoc", C.MARGE, 6.82, 0.41, 0.46)
    _texte(layout, "Pied signature", 1.15, 6.86, 6.0, 0.36,
           f'<a:r>{_run("", 10, C.ARDOISE)}<a:t>{C.SIGNATURE_TEXTE}</a:t></a:r>')
    _texte(layout, "Pied numéro", C.DROITE - 1.5, 6.86, 1.5, 0.36,
           f'<a:pPr algn="r"/><a:fld id="{{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}}" type="slidenum">'
           f'{_run("", 10, C.ARDOISE)}<a:t>‹N°›</a:t></a:fld>')


def construire(fond: str = "creme") -> Presentation:
    prs = Presentation()
    prs.slide_width, prs.slide_height = C.emu(C.LARGEUR), C.emu(C.HAUTEUR)
    _theme(prs, fond)
    dispositions = list(prs.slide_layouts)
    for nom, layout in zip(GABARITS, dispositions):
        layout.name = nom
        titre = None
        for ph in list(layout.placeholders):
            if ph.placeholder_format.type in (PP_PLACEHOLDER.TITLE, PP_PLACEHOLDER.CENTER_TITLE) and titre is None:
                titre = ph
            else:
                ph._element.getparent().remove(ph._element)
        if titre is None:  # mise en page sans titre : on en recopie un depuis le masque
            source = next(p for p in prs.slide_master.placeholders if p.placeholder_format.type == PP_PLACEHOLDER.TITLE)
            el = copy.deepcopy(source._element)
            layout.shapes._spTree.append(el)
            titre = next(p for p in layout.placeholders if p.placeholder_format.type == PP_PLACEHOLDER.TITLE)
        titre.name = "Titre"
        # Aucun style hérité du modèle par défaut (capitales, centrage) : tout est posé à la génération.
        corps = titre._element.find(qn("p:txBody"))
        if corps is not None:
            styles = corps.find(qn("a:lstStyle"))
            if styles is not None:
                for enfant in list(styles):
                    styles.remove(enfant)
        x, y, l, h = TITRES.get(nom, TITRE_CONTENU)
        titre.left, titre.top, titre.width, titre.height = C.emu(x), C.emu(y), C.emu(l), C.emu(h)
        if nom in SOMBRES:
            layout.background.fill.solid()
            layout.background.fill.fore_color.theme_color = MSO_THEME_COLOR.TEXT_1
        else:
            _pied(layout)
    for layout in dispositions[len(GABARITS):]:  # mises en page du modèle par défaut, inutiles
        prs.slide_layouts.remove(layout)
    return prs


def disposition(prs, nom: str):
    return next(l for l in prs.slide_layouts if l.name == nom)


def enregistrer(chemin: Path, fond: str = "creme") -> Path:
    chemin.parent.mkdir(parents=True, exist_ok=True)
    construire(fond).save(chemin)
    return chemin
