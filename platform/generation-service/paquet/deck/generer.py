"""Étape 3 : deck.json → sortie.pptx, de façon déterministe.

Chaque gabarit pose ses formes (nommées) sur sa mise en page ; le titre va dans l'espace réservé
« Titre ». Les couleurs sont des couleurs du THÈME. Un texte trop long pour sa forme fait échouer
la génération (Debordement) au lieu de déborder.
"""
from __future__ import annotations

import datetime as dt
import json
import math
import re
import uuid
from pathlib import Path

import jsonschema
from lxml import etree
from PIL import Image
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.enum.dml import MSO_THEME_COLOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Pt

from . import charte as C
from . import maitre
from .icones import icone_png
from .typo import typographier

SCHEMA = json.loads((Path(__file__).parent / "deck.schema.json").read_text(encoding="utf-8"))

# Rôles de couleur → couleurs du thème (voir maitre._theme).
MARINE, ARDOISE = MSO_THEME_COLOR.TEXT_1, MSO_THEME_COLOR.TEXT_2
FOND, CYAN_TC = MSO_THEME_COLOR.BACKGROUND_1, MSO_THEME_COLOR.BACKGROUND_2
CYAN, ORANGE, BEIGE = MSO_THEME_COLOR.ACCENT_1, MSO_THEME_COLOR.ACCENT_2, MSO_THEME_COLOR.ACCENT_3
BLANC = MSO_THEME_COLOR.ACCENT_6
CLAIR_SUR_MARINE = CYAN_TC  # légendes, chapô et phrase de clôture sur fond marine


class Debordement(Exception):
    def __init__(self, diapo: int, bloc: str, detail: str):
        super().__init__(f"Diapositive {diapo}, bloc « {bloc} » : {detail}")
        self.diapo, self.bloc = diapo, bloc


# ── Mesure du texte (estimation prudente : 10 % de marge, Georgia rendue plus large par LibreOffice) ──

def _hauteur_texte(paragraphes: list[str], taille: float, largeur: float, police: str) -> float:
    k = 0.56 if police == C.POLICE_TITRE else 0.5
    utile = max(0.1, largeur - 0.2)
    lignes = 0
    for p in paragraphes:
        mots, ligne, n = p.split(), 0.0, 1
        for m in mots:
            l = (len(m) + 1) * taille * k / 72
            if ligne + l > utile and ligne > 0:
                n, ligne = n + 1, l
            else:
                ligne += l
        lignes += n
    return lignes * taille * 1.2 / 72 * 1.1 + 0.1


class Gen:
    def __init__(self, deck: dict, base: Path):
        self.deck, self.base = deck, base
        self.prs = maitre.construire(deck["meta"]["fond"])
        self.anomalies: list[dict] = []
        self.n = 0  # numéro de diapositive source en cours

    # ── Formes ──
    def boite(self, d, nom, x, y, l, h, couleur, forme=MSO_SHAPE.ROUNDED_RECTANGLE):
        s = d.shapes.add_shape(forme, C.emu(x), C.emu(y), C.emu(l), C.emu(h))
        s.name = nom
        if forme == MSO_SHAPE.ROUNDED_RECTANGLE:
            s.adjustments[0] = min(0.5, 0.1 / min(l, h))
        s.fill.solid()
        s.fill.fore_color.theme_color = couleur
        s.line.fill.background()
        style = s._element.find(qn("p:style"))  # le style par défaut ajoute une ombre et un contour
        if style is not None:
            s._element.remove(style)
        s.text_frame.text = ""
        return s

    def texte(self, d, nom, x, y, l, h, paragraphes, taille, couleur, police=C.POLICE_CORPS, gras=False,
              italique=False, align=PP_ALIGN.LEFT, ancre=MSO_ANCHOR.TOP, bloc=None, capitales=False, amorces=None):
        paragraphes = [typographier(p) for p in paragraphes if p is not None]
        if _hauteur_texte(paragraphes, taille, l, police) > h:
            raise Debordement(self.n, bloc or nom, f"texte trop long pour sa zone ({l:.2f} × {h:.2f} po)")
        s = d.shapes.add_textbox(C.emu(x), C.emu(y), C.emu(l), C.emu(h))
        s.name = nom
        tf = s.text_frame
        tf.word_wrap = True
        tf.vertical_anchor = ancre
        for i, texte in enumerate(paragraphes):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            p.alignment = align
            amorce = (amorces or [None] * len(paragraphes))[i]
            if amorce:
                self._run(p, typographier(amorce) + " ", taille, couleur, police, True, italique)
            self._run(p, texte.upper() if capitales else texte, taille, couleur, police, gras, italique)
        return s

    @staticmethod
    def _run(p, texte, taille, couleur, police, gras, italique):
        r = p.add_run()
        r.text = texte
        f = r.font
        f.size, f.bold, f.italic, f.name = Pt(taille), gras, italique, police
        f.color.theme_color = couleur
        return r

    def image(self, d, nom, chemin: Path, x, y, l, h, alt: str, cadre=False):
        """Image inscrite dans (x, y, l, h), proportions conservées, centrée."""
        lw, lh = Image.open(chemin).size
        r = lw / lh
        w, hh = (l, l / r) if l / h < r else (h * r, h)
        px, py = x + (l - w) / 2, y + (h - hh) / 2
        if cadre:
            m = 0.08
            self.boite(d, f"Cadre {nom}", px - m, py - m, w + 2 * m, hh + 2 * m, BEIGE)
        pic = d.shapes.add_picture(str(chemin), C.emu(px), C.emu(py), C.emu(w), C.emu(hh))
        pic.name = nom
        pic._element.nvPicPr.cNvPr.set("descr", alt)
        return pic

    def pastille(self, d, nom, x, y, diam, icone=None, chiffre=None):
        self.boite(d, nom, x, y, diam, diam, CYAN, MSO_SHAPE.OVAL)
        if chiffre is not None:
            self.texte(d, f"{nom} chiffre", x, y, diam, diam, [str(chiffre)], 22, MARINE, gras=True,
                       align=PP_ALIGN.CENTER, ancre=MSO_ANCHOR.MIDDLE)
        elif icone:
            png = icone_png(icone)
            if png is None:
                self.anomalies.append({"diapositive": self.n, "code": "ICONE_INCONNUE",
                                       "message": f"Icône « {icone} » absente du jeu : pastille sans icône."})
            else:
                t = diam * 0.52
                pic = d.shapes.add_picture(png, C.emu(x + (diam - t) / 2), C.emu(y + (diam - t) / 2), C.emu(t), C.emu(t))
                pic.name = f"{nom} icône"
                pic._element.nvPicPr.cNvPr.set("descr", f"Icône {icone}")

    def puce(self, d, nom, x, y):
        self.boite(d, nom, x, y, 0.14, 0.14, CYAN, MSO_SHAPE.RECTANGLE)

    def titre(self, d, texte, taille=34, couleur=MARINE, italique=False, align=PP_ALIGN.LEFT, accent=None):
        ph = d.shapes.title
        ph.name = "Titre"
        texte = typographier(texte)
        if _hauteur_texte([texte], taille, ph.width / 914400, C.POLICE_TITRE) > ph.height / 914400:
            raise Debordement(self.n, "titre", "titre trop long")
        tf = ph.text_frame
        tf.word_wrap = True
        tf.vertical_anchor = MSO_ANCHOR.TOP
        p = tf.paragraphs[0]
        p.alignment = align
        accent = typographier(accent) if accent else None
        if accent and texte.endswith(accent):
            self._run(p, texte[: -len(accent)], taille, couleur, C.POLICE_TITRE, False, italique)
            self._run(p, accent, taille, CYAN, C.POLICE_TITRE, False, True)
        else:
            self._run(p, texte, taille, couleur, C.POLICE_TITRE, False, italique)

    # ── Gabarits ──
    def couverture(self, d, s):
        logo = maitre.LOGO_BLANC
        lw, lh = Image.open(logo).size
        pic = d.shapes.add_picture(str(logo), C.emu(0.75), C.emu(0.6), height=C.emu(1.1))
        pic.name = "Logo AvisDoc"
        pic._element.nvPicPr.cNvPr.set("descr", "AvisDoc")
        if s.get("surtitre"):
            self.texte(d, "Sur-titre", 0.75, 2.25, 7.0, 0.45, [s["surtitre"]], 12, CYAN, gras=True, capitales=True)
        self.titre(d, s["titre"], 42, BLANC, accent=s.get("accent"))
        if s.get("chapo"):
            self.texte(d, "Chapô", 0.75, 5.45, 7.0, 1.0, [s["chapo"]], 18, CLAIR_SUR_MARINE, bloc="chapo")
        self.texte(d, "Signature", 0.75, 6.72, 7.0, 0.4, [C.SIGNATURE_TEXTE], 11, CLAIR_SUR_MARINE)
        if s.get("image"):
            i = s["image"]
            self.image(d, "Image de couverture", self.base / i["fichier"], 8.35, 1.75, 4.0, 4.0, i["alt"])
        if self.deck["meta"].get("logo_client"):
            cadre = d.shapes.add_shape(MSO_SHAPE.RECTANGLE, C.emu(10.6), C.emu(0.6), C.emu(2.0), C.emu(1.0))
            cadre.name = "LOGO_CLIENT"
            cadre.fill.background()
            cadre.line.fill.background()

    def enonce_liste(self, d, s):
        self.titre(d, s["titre"])
        self.boite(d, "Carte énoncé", C.MARGE, 1.75, 5.6, 4.8, MARINE)
        y = 2.1
        if s.get("cle"):
            self.texte(d, "Mot clé", 0.95, y, 4.9, 1.2, [s["cle"]], 54, CYAN, C.POLICE_TITRE, bloc="cle")
            y += 1.25
        if s.get("legende"):
            self.texte(d, "Légende", 0.95, y, 4.9, 0.6, [s["legende"]], 15, CLAIR_SUR_MARINE, bloc="legende")
            y += 0.65
        self.texte(d, "Énoncé", 0.95, y, 4.9, 6.3 - y, [s["enonce"]], 24, BLANC, C.POLICE_TITRE, bloc="enonce")
        x, y = 6.7, 1.75
        if s.get("surtitre"):
            self.texte(d, "Sur-titre liste", x, y, 6.03, 0.4, [s["surtitre"]], 12, ARDOISE, gras=True, capitales=True)
            y += 0.45
        for i, e in enumerate(s["elements"], 1):
            self.boite(d, f"Carte élément {i}", x, y, 6.03, 0.95, CYAN_TC)
            self.puce(d, f"Puce {i}", x + 0.3, y + 0.405)
            self.texte(d, f"Élément {i}", x + 0.6, y, 5.3, 0.95, [e], 17, MARINE, ancre=MSO_ANCHOR.MIDDLE, bloc=f"elements[{i}]")
            y += 0.95 + 0.165

    def _colonnes(self, n, par_ligne):
        larg = (C.DROITE - C.MARGE - C.GOUTTIERE * (par_ligne - 1)) / par_ligne
        return [(C.MARGE + (i % par_ligne) * (larg + C.GOUTTIERE), i // par_ligne, larg) for i in range(n)]

    def grille(self, d, s):
        self.titre(d, s["titre"])
        n = len(s["cartes"])
        par_ligne = 2 if n == 4 else 3
        h = 2.3 if n > par_ligne else 3.0
        for i, ((x, rang, l), c) in enumerate(zip(self._colonnes(n, par_ligne), s["cartes"]), 1):
            y = 1.75 + rang * (h + 0.25)
            self.boite(d, f"Carte atout {i}", x, y, l, h, CYAN_TC)
            self.pastille(d, f"Pastille atout {i}", x + 0.3, y + 0.3, 0.7, icone=c.get("icone"))
            self.texte(d, f"Texte atout {i}", x + 0.3, y + 1.2, l - 0.6, h - 1.3, [c["texte"]], 17, MARINE, bloc=f"cartes[{i}]")

    def chiffres(self, d, s):
        self.titre(d, s["titre"])
        hauts = [b for b in s["blocs"] if b.get("accent")][:2]
        bas = [b for b in s["blocs"] if b not in hauts]
        y = 1.75
        if hauts:
            for i, ((x, _, l), b) in enumerate(zip(self._colonnes(len(hauts), len(hauts)), hauts), 1):
                self.boite(d, f"Carte chiffre clé {i}", x, y, l, 2.25, MARINE)
                self.texte(d, f"Valeur clé {i}", x + 0.35, y + 0.15, l - 0.7, 1.2, [b["valeur"]], 54, CYAN, C.POLICE_TITRE, bloc=f"blocs[{i}].valeur")
                self.texte(d, f"Libellé clé {i}", x + 0.35, y + 1.35, l - 0.7, 0.85, [b["libelle"]], 18, BLANC, bloc=f"blocs[{i}].libelle")
            y = 4.3
        if bas:
            h = 2.3 if hauts else 4.85
            for i, ((x, _, l), b) in enumerate(zip(self._colonnes(len(bas), len(bas)), bas), 1):
                self.boite(d, f"Carte chiffre {i}", x, y, l, h, CYAN_TC)
                self.texte(d, f"Valeur {i}", x + 0.3, y + 0.15, l - 0.6, 1.05, [b["valeur"]], 44, MARINE, C.POLICE_TITRE, bloc=f"chiffre {i} valeur")
                self.texte(d, f"Libellé {i}", x + 0.3, y + 1.25, l - 0.6, h - 1.35, [b["libelle"]], 16, ARDOISE, bloc=f"chiffre {i} libellé")

    def tableau(self, d, s):
        self.titre(d, s["titre"])
        cols, lignes = s["colonnes"], s["lignes"]
        graphique = s.get("graphique")
        largeur = 5.5 if graphique else 12.13
        h_ligne = 0.6
        forme = d.shapes.add_table(len(lignes) + 1, len(cols), C.emu(C.MARGE), C.emu(2.4), C.emu(largeur), C.emu(h_ligne * (len(lignes) + 1)))
        forme.name = "Tableau"
        t = forme.table
        t.first_row = True
        tbl_pr = forme._element.graphic.graphicData.tbl.tblPr
        for enfant in list(tbl_pr):  # pas de style de tableau : tout est explicite
            tbl_pr.remove(enfant)
        for j, nom in enumerate(cols):
            self._cellule(t.cell(0, j), nom, 13, BLANC, MARINE, gras=True, capitales=True)
        for i, ligne in enumerate(lignes, 1):
            for j in range(len(cols)):
                v = ligne[j] if j < len(ligne) else ""
                if j == 0:
                    self._cellule(t.cell(i, j), v, 16, MARINE, CYAN_TC, gras=True)
                else:
                    self._cellule(t.cell(i, j), v, 20, MARINE, CYAN_TC, police=C.POLICE_TITRE, align=PP_ALIGN.RIGHT)
        if graphique:
            self._graphique(d, cols, lignes, graphique)

    def _cellule(self, cellule, texte, taille, couleur, fond, police=C.POLICE_CORPS, gras=False, align=PP_ALIGN.LEFT, capitales=False):
        cellule.fill.solid()
        cellule.fill.fore_color.theme_color = fond
        cellule.vertical_anchor = MSO_ANCHOR.MIDDLE
        tf = cellule.text_frame
        p = tf.paragraphs[0]
        p.alignment = align
        texte = typographier(texte)
        self._run(p, texte.upper() if capitales else texte, taille, couleur, police, gras, False)
        tc_pr = cellule._tc.get_or_add_tcPr()
        for cote in ("a:lnL", "a:lnR", "a:lnT", "a:lnB"):  # filet de la couleur du fond, 2 pt
            ln = etree.SubElement(tc_pr, qn(cote), w="25400")
            sf = etree.SubElement(ln, qn("a:solidFill"))
            etree.SubElement(sf, qn("a:schemeClr"), val="bg1")
        # l'ordre du schéma impose les traits avant le remplissage
        remplissage = tc_pr.find(qn("a:solidFill"))
        if remplissage is not None:
            tc_pr.remove(remplissage)
            tc_pr.append(remplissage)

    def _graphique(self, d, cols, lignes, g):
        def nombre(v):
            v = re.sub(r"[\s  %]", "", str(v)).replace(",", ".")
            return float(v)
        try:
            donnees = CategoryChartData()
            donnees.categories = [l[0] for l in lignes]
            series = g.get("series") or cols[1:]
            for nom in series:
                j = cols.index(nom)
                donnees.add_series(nom, [nombre(l[j]) for l in lignes])
        except (ValueError, IndexError):
            raise Debordement(self.n, "graphique", "valeurs non numériques : graphique impossible")
        gf = d.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, C.emu(6.6), C.emu(1.75), C.emu(6.13), C.emu(4.85), donnees)
        gf.name = "Graphique"
        gf._element.nvGraphicFramePr.cNvPr.set("descr", g["alt"])
        ch = gf.chart
        ch.has_legend = True
        ch.legend.position = XL_LEGEND_POSITION.BOTTOM
        ch.legend.include_in_layout = False
        ch.legend.font.size, ch.legend.font.name = Pt(14), C.POLICE_CORPS
        ch.legend.font.color.theme_color = MARINE
        ch.value_axis.visible = False
        ch.value_axis.has_major_gridlines = False
        ch.category_axis.tick_labels.font.size = Pt(14)
        ch.category_axis.tick_labels.font.color.theme_color = MARINE
        ch.category_axis.format.line.fill.background()
        plot = ch.plots[0]
        plot.has_data_labels = True
        plot.data_labels.font.size, plot.data_labels.font.name = Pt(14), C.POLICE_CORPS
        plot.data_labels.font.color.theme_color = MARINE
        plot.data_labels.number_format = "# ##0"
        plot.data_labels.number_format_is_linked = False
        for serie, couleur in zip(plot.series, [MARINE, CYAN, ARDOISE, BEIGE]):
            serie.format.fill.solid()
            serie.format.fill.fore_color.theme_color = couleur

    def etapes(self, d, s):
        self.titre(d, s["titre"])
        n = len(s["etapes"])
        par_ligne = 2 if n <= 4 else 3
        h = 2.3 if n > par_ligne else 4.85
        taille = 20 if par_ligne == 2 else 17
        for i, ((x, rang, l), e) in enumerate(zip(self._colonnes(n, par_ligne), s["etapes"]), 1):
            y = 1.75 + rang * (h + 0.25)
            self.boite(d, f"Carte étape {i}", x, y, l, h, CYAN_TC)
            self.pastille(d, f"Pastille étape {i}", x + 0.3, y + (h - 0.7) / 2, 0.7, chiffre=i)
            self.texte(d, f"Texte étape {i}", x + 1.25, y + 0.15, l - 1.55, h - 0.3, [e["texte"]], taille, MARINE,
                       ancre=MSO_ANCHOR.MIDDLE, bloc=f"etapes[{i}]", amorces=[e.get("amorce")])

    def objectifs_questions(self, d, s):
        self.titre(d, s["titre"])
        for i, o in enumerate(s["objectifs"], 1):
            y = 1.75 + (i - 1) * 2.55
            self.boite(d, f"Carte objectif {i}", C.MARGE, y, 4.9, 2.25, CYAN_TC)
            self.pastille(d, f"Pastille objectif {i}", C.MARGE + 0.3, y + 0.3, 0.7, icone=o.get("icone"))
            self.texte(d, f"Objectif {i}", C.MARGE + 0.3, y + 1.1, 4.3, 1.05, [o["texte"]], 19, MARINE, C.POLICE_TITRE, bloc=f"objectifs[{i}]")
        self.boite(d, "Carte questions", 5.8, 1.75, 6.93, 4.8, MARINE)
        y = 2.05
        if s.get("surtitre"):
            self.texte(d, "Sur-titre questions", 6.15, y, 6.2, 0.4, [s["surtitre"]], 12, CYAN, gras=True, capitales=True)
            y += 0.55
        for i, q in enumerate(s["questions"], 1):
            self.puce(d, f"Puce question {i}", 6.15, y + 0.2)
            self.texte(d, f"Question {i}", 6.45, y, 5.95, 0.85, [q], 18, BLANC, bloc=f"questions[{i}]")
            y += 0.93

    def captures(self, d, s):
        if s.get("surtitre"):
            self.texte(d, "Sur-titre", C.MARGE, 0.55, 2.45, 0.4, [s["surtitre"]], 12, ARDOISE, gras=True, capitales=True)
        self.titre(d, s["titre"], 22)
        images = s["images"]
        zone_x, zone_l = 3.3, C.DROITE - 3.3
        l = (zone_l - 0.25 * (len(images) - 1)) / len(images)
        for i, im in enumerate(images, 1):
            self.image(d, f"Capture {i}", self.base / im["fichier"], zone_x + (i - 1) * (l + 0.25), 0.55, l, 5.7, im["alt"], cadre=True)

    def cloture(self, d, s):
        logo = maitre.LOGO_BLANC
        lw, lh = Image.open(logo).size
        h = 3.3
        w = h * lw / lh
        pic = d.shapes.add_picture(str(logo), C.emu((C.LARGEUR - w) / 2), C.emu(1.35), C.emu(w), C.emu(h))
        pic.name = "Logo AvisDoc"
        pic._element.nvPicPr.cNvPr.set("descr", "AvisDoc")
        self.titre(d, s["phrase"], 26, CLAIR_SUR_MARINE, italique=True, align=PP_ALIGN.CENTER)

    def texte_simple(self, d, s):
        self.titre(d, s["titre"])
        y = 1.75
        for i, ligne in enumerate(s["lignes"], 1):
            hauteur = _hauteur_texte([typographier(ligne)], 20, 11.6, C.POLICE_CORPS)
            if y + hauteur > C.BAS_CONTENU:
                raise Debordement(self.n, f"lignes[{i}]", "liste trop longue pour la diapositive")
            self.puce(d, f"Puce {i}", C.MARGE, y + 0.17)
            self.texte(d, f"Ligne {i}", C.MARGE + 0.35, y, 11.78, hauteur, [ligne], 20, MARINE, bloc=f"lignes[{i}]")
            y += hauteur + 0.1

    # ── Assemblage ──
    def produire(self, sortie: Path) -> list[dict]:
        sections: list[tuple[str, list]] = []
        for s in self.deck["diapositives"]:
            self.n = s["source"]
            d = self.prs.slides.add_slide(maitre.disposition(self.prs, s["gabarit"]))
            getattr(self, "texte_simple" if s["gabarit"] == "texte" else s["gabarit"])(d, s)
            if s.get("notes"):
                d.notes_slide.notes_text_frame.text = s["notes"]
            nom = s.get("section") or (sections[-1][0] if sections else "Présentation")
            if not sections or sections[-1][0] != nom:
                sections.append((nom, []))
            sections[-1][1].append(d.slide_id)
        if len(sections) > 1:
            self._sections(sections)
        if any(s.get("notes") for s in self.deck["diapositives"]):  # thème du masque des notes, créé à la volée
            from pptx.opc.constants import RELATIONSHIP_TYPE as RT
            maitre.recolorer(self.prs.notes_master.part.part_related_by(RT.THEME), self.deck["meta"]["fond"])
        cp = self.prs.core_properties
        cp.title = self.deck["meta"].get("titre", "")
        cp.author = cp.last_modified_by = "AvisDoc"
        cp.created = cp.modified = dt.datetime(2026, 1, 1)
        cp.revision = 1
        sortie.parent.mkdir(parents=True, exist_ok=True)
        self.prs.save(sortie)
        return self.anomalies

    def _sections(self, sections):
        P, P14 = "http://schemas.openxmlformats.org/presentationml/2006/main", "http://schemas.microsoft.com/office/powerpoint/2010/main"
        racine = self.prs.part._element
        ext_lst = racine.find(qn("p:extLst"))
        if ext_lst is None:
            ext_lst = etree.SubElement(racine, f"{{{P}}}extLst")
        ext = etree.SubElement(ext_lst, f"{{{P}}}ext", uri="{521415D9-36F7-43E2-AB2F-B90AF26B5E84}")
        lst = etree.SubElement(ext, f"{{{P14}}}sectionLst", nsmap={"p14": P14})
        for i, (nom, ids) in enumerate(sections):
            sid = "{" + str(uuid.uuid5(uuid.NAMESPACE_URL, f"deck/{i}/{nom}")).upper() + "}"
            sec = etree.SubElement(lst, f"{{{P14}}}section", name=nom, id=sid)
            sl = etree.SubElement(sec, f"{{{P14}}}sldIdLst")
            for x in ids:
                etree.SubElement(sl, f"{{{P14}}}sldId", id=str(x))


def generer(chemin_deck: Path, sortie: Path) -> list[dict]:
    """Génère sortie.pptx ; renvoie les anomalies constatées à la génération (icônes inconnues)."""
    deck = json.loads(chemin_deck.read_text(encoding="utf-8"))
    jsonschema.validate(deck, SCHEMA)
    return Gen(deck, chemin_deck.parent).produire(sortie)
