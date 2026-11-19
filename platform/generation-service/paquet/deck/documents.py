"""Mise à la charte AvisDoc des documents Word et PDF (décision du 19/11).

  - Word (.docx) : remis à la charte SUR PLACE. Styles (Georgia pour les titres, Calibri pour le
    texte, marine), mises en forme directes de police et de couleur retirées, tableaux à la charte,
    marges A4, en-tête (logo) et pied (signature, numéro de page) AvisDoc, typographie française.
    Le contenu, les images et l'ordre ne bougent pas.
  - PDF : la mise en page d'un PDF ne se modifie pas ; elle est RECONSTRUITE à la charte (titres,
    paragraphes, listes, tableaux, images repérés dans le fichier), puis le PDF est régénéré avec
    les polices de la charte (Newsreader, Hanken Grotesk). Mise en page à vérifier dans le rapport.

Comme pour les présentations : rien n'est reformulé ; seules la typographie et la graphie de la
marque (tracée) changent ; « dépistage » est signalé, jamais remplacé.
"""
from __future__ import annotations

import base64
import copy
import html
import io
import re
import statistics
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

from . import charte as C
from .typo import typographier

PAQUET = Path(__file__).resolve().parents[1]
LOGO = PAQUET / "assets/logos/logo_bicolore.png"
MARQUE = re.compile(r"(?<![\w./@-])(avis ?doc)(?![\w.-]*\.(?:fr|com))", re.I)
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


@dataclass
class Bilan:
    source: str
    sortie: str
    corrections: list[dict] = field(default_factory=list)
    anomalies: list[dict] = field(default_factory=list)   # {code, niveau, message}
    actions: list[str] = field(default_factory=list)

    @property
    def erreurs(self):
        return [a for a in self.anomalies if a["niveau"] == "erreur"]

    def signaler(self, code, message, niveau="avertissement"):
        self.anomalies.append({"code": code, "niveau": niveau, "message": message})

    def texte(self, t: str) -> str:
        """Typographie et marque (tracée) ; le fond n'est jamais touché."""
        def remplacer(m):
            if m.group(1) != "AvisDoc":
                self.corrections.append({"type": "marque", "avant": m.group(1), "apres": "AvisDoc"})
            return "AvisDoc"
        return typographier(MARQUE.sub(remplacer, t))

    def rapport(self, chemin: Path) -> Path:
        L = [f"# Rapport de mise à la charte : {self.source}", "",
             f"Fichier produit : `{self.sortie}`. La source n'est pas modifiée.", "",
             f"**{len(self.erreurs)} erreur(s), {len(self.anomalies) - len(self.erreurs)} avertissement(s).**", "",
             "## Ce qui a été fait", ""]
        L += [f"- {a}" for a in self.actions] or ["Rien."]
        L += ["", "## Corrections appliquées", ""]
        vues = {}
        for c in self.corrections:
            vues[(c["avant"], c["apres"])] = vues.get((c["avant"], c["apres"]), 0) + 1
        L += [f"- ({'marque'}) « {a} » → « {b} »" + (f" ({n} fois)" if n > 1 else "") for (a, b), n in vues.items()] or ["Aucune."]
        L += ["", "## Anomalies signalées, non corrigées", ""]
        L += [f"- `{a['code']}` ({a['niveau']}) : {a['message']}" for a in self.anomalies] or ["Aucune."]
        chemin.write_text("\n".join(L) + "\n", encoding="utf-8")
        return chemin


def _vocabulaire(bilan: Bilan, textes: list[str]) -> None:
    tout = "\n".join(textes)
    n = len(re.findall(r"\bd[ée]pist\w*", tout, re.I))
    if n:
        bilan.signaler("VOCABULAIRE", f"« dépistage » et dérivés ({n} fois) : terme attendu « repérage de lésions suspectes ». Signalé, non remplacé.")
    if "—" in tout:
        bilan.signaler("TIRET_CADRATIN", "Tiret cadratin restant dans le document.", "erreur")


# ── Word ─────────────────────────────────────────────────────────────────────

def _police(element_rpr, nom: str) -> None:
    from docx.oxml.ns import qn
    from lxml import etree
    rf = element_rpr.find(qn("w:rFonts"))
    if rf is None:
        rf = etree.SubElement(element_rpr, qn("w:rFonts"))
    for k in list(rf.attrib):
        del rf.attrib[k]
    for att in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        rf.set(qn(att), nom)


def word(source: Path, sortie: Path) -> Bilan:
    import docx
    from docx.enum.section import WD_ORIENT
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Mm, Pt, RGBColor

    bilan = Bilan(source.name, sortie.name)
    d = docx.Document(source)
    marine = RGBColor.from_string(C.MARINE)

    # 1. Styles : la charte en un seul endroit.
    reglages = {
        "Normal": (C.POLICE_CORPS, 11, False), "Title": (C.POLICE_TITRE, 26, False), "Subtitle": (C.POLICE_CORPS, 14, False),
        "Heading 1": (C.POLICE_TITRE, 20, False), "Heading 2": (C.POLICE_TITRE, 15, False), "Heading 3": (C.POLICE_CORPS, 12.5, True),
        "Heading 4": (C.POLICE_CORPS, 11, True), "List Paragraph": (C.POLICE_CORPS, 11, False), "Caption": (C.POLICE_CORPS, 9, False),
        "Quote": (C.POLICE_TITRE, 12, False), "Table Grid": (C.POLICE_CORPS, 10, False),
    }
    noms = {s.name for s in d.styles}
    for nom, (police, taille, gras) in reglages.items():
        if nom not in noms:
            continue
        st = d.styles[nom]
        st.font.name, st.font.size, st.font.color.rgb = police, Pt(taille), marine
        if gras:
            st.font.bold = True
        _police(st.element.get_or_add_rPr(), police)
    for st in d.styles:  # tout autre style de caractère ou de paragraphe : polices de la charte
        rpr = st.element.find(qn("w:rPr"))
        if rpr is not None and rpr.find(qn("w:rFonts")) is not None:
            _police(rpr, C.POLICE_TITRE if (st.name or "").startswith(("Heading", "Title")) else C.POLICE_CORPS)
        if rpr is not None:
            for c in rpr.findall(qn("w:color")):
                c.set(qn("w:val"), C.MARINE)
                for a in ("w:themeColor", "w:themeShade", "w:themeTint"):
                    c.attrib.pop(qn(a), None)
    bilan.actions.append("Styles : Georgia pour les titres, Calibri pour le texte, marine ; tailles de la charte.")

    # 2. Mises en forme directes : polices et couleurs retirées ; faux titres promus en titres.
    def paragraphes():
        yield from d.paragraphs
        for t in d.tables:
            for ligne in t.rows:
                for cel in ligne.cells:
                    yield from cel.paragraphs

    promus = 0
    textes = []
    for p in paragraphes():
        tailles = [r.font.size.pt for r in p.runs if r.font.size and r.text.strip()]
        tout_gras = p.runs and all((r.bold or False) for r in p.runs if r.text.strip())
        if p.style.name == "Normal" and p.text.strip() and len(p.text) < 120 and tailles and min(tailles) >= 14 and p._p.getparent().tag == qn("w:body"):
            p.style = d.styles["Heading 1" if min(tailles) >= 18 else "Heading 2"] if "Heading 1" in noms else p.style
            promus += 1
            for r in p.runs:
                r.font.size = None
        elif p.style.name == "Normal" and tout_gras and 0 < len(p.text) < 80 and p._p.getparent().tag == qn("w:body") and "Heading 3" in noms:
            nxt = p._p.getnext()
            if nxt is not None and nxt.tag == qn("w:p"):
                p.style = d.styles["Heading 3"]
                promus += 1
        for r in p.runs:
            rpr = r._r.find(qn("w:rPr"))
            if rpr is not None:
                for tag in ("w:rFonts", "w:color", "w:highlight", "w:shd"):
                    for el in rpr.findall(qn(tag)):
                        rpr.remove(el)
            if r.text:
                r.text = bilan.texte(r.text)
        textes.append(p.text)
    if promus:
        bilan.actions.append(f"{promus} paragraphe(s) en gros caractères ou en gras rattaché(s) aux styles de titre.")
    bilan.actions.append("Polices et couleurs posées à la main retirées : le texte suit les styles de la charte.")

    # 3. Tableaux : en-tête marine, lignes cyan très clair, filets beige.
    for t in d.tables:
        tbl_pr = t._tbl.tblPr
        for el in tbl_pr.findall(qn("w:tblBorders")):
            tbl_pr.remove(el)
        bords = OxmlElement("w:tblBorders")
        for cote in ("top", "left", "bottom", "right", "insideH", "insideV"):
            b = OxmlElement(f"w:{cote}")
            b.set(qn("w:val"), "single"); b.set(qn("w:sz"), "4"); b.set(qn("w:color"), C.BEIGE)
            bords.append(b)
        tbl_pr.append(bords)
        for i, ligne in enumerate(t.rows):
            for cel in ligne.cells:
                tc_pr = cel._tc.get_or_add_tcPr()
                for el in tc_pr.findall(qn("w:shd")):
                    tc_pr.remove(el)
                shd = OxmlElement("w:shd")
                shd.set(qn("w:val"), "clear"); shd.set(qn("w:color"), "auto"); shd.set(qn("w:fill"), C.MARINE if i == 0 else C.CYAN_TRES_CLAIR)
                tc_pr.append(shd)
                if i == 0:
                    for p in cel.paragraphs:
                        for r in p.runs:
                            r.font.bold, r.font.color.rgb = True, RGBColor.from_string(C.BLANC)
    if d.tables:
        bilan.actions.append(f"{len(d.tables)} tableau(x) : en-tête marine, lignes cyan très clair, filets beige.")

    # 4. Page, en-tête et pied.
    for s in d.sections:
        portrait = s.orientation == WD_ORIENT.PORTRAIT
        s.page_width, s.page_height = (Mm(210), Mm(297)) if portrait else (Mm(297), Mm(210))
        s.top_margin, s.bottom_margin, s.left_margin, s.right_margin = Mm(22), Mm(18), Mm(16), Mm(16)
        s.header_distance, s.footer_distance = Mm(8), Mm(8)
        for zone in (s.header, s.footer):
            zone.is_linked_to_previous = False
            for p in list(zone.paragraphs)[1:]:
                p._p.getparent().remove(p._p)
            for t in list(zone.tables):
                t._tbl.getparent().remove(t._tbl)
            p = zone.paragraphs[0]
            for r in list(p.runs):
                r._r.getparent().remove(r._r)
        s.header.paragraphs[0].add_run().add_picture(str(LOGO), height=Mm(9))
        pied = s.footer.paragraphs[0]
        r = pied.add_run(C.SIGNATURE_TEXTE.replace("'", "’") + "\t\t")
        r.font.size, r.font.color.rgb, r.font.name = Pt(8), RGBColor.from_string(C.ARDOISE), C.POLICE_CORPS
        for code, txt in (("begin", None), (None, " PAGE "), ("end", None)):
            r = pied.add_run()
            r.font.size, r.font.color.rgb = Pt(8), RGBColor.from_string(C.ARDOISE)
            if code:
                f = OxmlElement("w:fldChar"); f.set(qn("w:fldCharType"), code); r._r.append(f)
            else:
                it = OxmlElement("w:instrText"); it.set(qn("xml:space"), "preserve"); it.text = txt; r._r.append(it)
    bilan.actions.append("Page A4, marges de la charte ; en-tête (logo AvisDoc) et pied (signature, numéro de page) remplacés.")

    # 5. Thème du document : polices et couleurs de la charte.
    d.core_properties.author = d.core_properties.last_modified_by = "AvisDoc"
    d.save(sortie)
    _theme_docx(sortie)
    n = _styles_docx(sortie)
    if n:
        bilan.actions.append(f"{n} style(s) inutilisé(s) du modèle Word retiré(s) ; les autres ramenés sur la palette.")
    _vocabulaire(bilan, textes)
    _controler_docx(sortie, bilan)
    return bilan


def _styles_docx(chemin: Path) -> int:
    """Retire les styles inutilisés (le modèle Word en apporte des dizaines, avec leurs couleurs) et
    ramène les styles restants sur la palette et les polices de la charte. Renvoie le nombre retiré."""
    from lxml import etree
    ns = {"w": W}
    with zipfile.ZipFile(chemin) as z:
        contenu = {i.filename: z.read(i.filename) for i in z.infolist()}
    parties_styles = [k for k in ("word/styles.xml", "word/stylesWithEffects.xml") if k in contenu]
    textes = b"".join(v for k, v in contenu.items() if k.startswith("word/") and k.endswith(".xml") and k not in parties_styles)
    utilises = {m.decode() for m in re.findall(rb'w:(?:pStyle|rStyle|tblStyle|numStyleLink|styleLink) w:val="([^"]+)"', textes)}
    retires = 0
    for partie in parties_styles:
        contenu[partie], n = _nettoyer_styles(contenu[partie], utilises)
        retires = max(retires, n)
    tampon = io.BytesIO()
    with zipfile.ZipFile(chemin) as z, zipfile.ZipFile(tampon, "w", zipfile.ZIP_DEFLATED) as out:
        for item in z.infolist():
            out.writestr(item, contenu[item.filename])
    chemin.write_bytes(tampon.getvalue())
    return retires


def _nettoyer_styles(xml: bytes, utilises: set[str]) -> tuple[bytes, int]:
    from lxml import etree
    ns = {"w": W}
    racine = etree.fromstring(xml)
    par_id = {st.get(f"{{{W}}}styleId"): st for st in racine.findall("w:style", ns)}
    garder = set(utilises) | {i for i, st in par_id.items() if st.get(f"{{{W}}}default") == "1"}
    pile = list(garder)
    while pile:  # styles parents, liés et suivants des styles gardés
        st = par_id.get(pile.pop())
        if st is None:
            continue
        for tag in ("basedOn", "link", "next"):
            el = st.find(f"w:{tag}", ns)
            if el is not None and el.get(f"{{{W}}}val") not in garder:
                garder.add(el.get(f"{{{W}}}val")); pile.append(el.get(f"{{{W}}}val"))
    retires = 0
    for i, st in par_id.items():
        if i not in garder:
            racine.remove(st); retires += 1
    for el in racine.iter(f"{{{W}}}color"):
        if (el.get(f"{{{W}}}val") or "auto").upper() not in C.PALETTE | {"AUTO"}:
            el.set(f"{{{W}}}val", C.MARINE)
    for el in racine.iter(f"{{{W}}}shd"):
        if (el.get(f"{{{W}}}fill") or "auto").upper() not in C.PALETTE | {"AUTO"}:
            el.set(f"{{{W}}}fill", C.CYAN_TRES_CLAIR)
    for el in racine.iter(f"{{{W}}}rFonts"):
        for att in ("ascii", "hAnsi", "cs", "eastAsia"):
            v = el.get(f"{{{W}}}{att}")
            if v and v not in (C.POLICE_TITRE, C.POLICE_CORPS):
                el.set(f"{{{W}}}{att}", C.POLICE_CORPS)
    return etree.tostring(racine, xml_declaration=True, encoding="UTF-8", standalone=True), retires


def _theme_docx(chemin: Path) -> None:
    """Le thème Office d'origine (couleurs, polices) est remplacé par celui de la charte."""
    from lxml import etree
    from .maitre import A
    tampon = io.BytesIO()
    with zipfile.ZipFile(chemin) as z, zipfile.ZipFile(tampon, "w", zipfile.ZIP_DEFLATED) as out:
        for item in z.infolist():
            data = z.read(item.filename)
            if item.filename.startswith("word/theme/") and item.filename.endswith(".xml"):
                racine = etree.fromstring(data)
                for el in racine.iter(f"{{{A}}}srgbClr"):
                    if el.get("val", "").upper() not in C.PALETTE:
                        el.set("val", C.MARINE)
                for el in racine.iter(f"{{{A}}}sysClr"):
                    el.set("lastClr", C.MARINE if el.get("val") == "windowText" else C.BLANC)
                for groupe, nom in (("majorFont", C.POLICE_TITRE), ("minorFont", C.POLICE_CORPS)):
                    g = racine.find(f".//{{{A}}}{groupe}")
                    if g is not None and g.find(f"{{{A}}}latin") is not None:
                        g.find(f"{{{A}}}latin").set("typeface", nom)
                data = etree.tostring(racine, xml_declaration=True, encoding="UTF-8", standalone=True)
            out.writestr(item, data)
    chemin.write_bytes(tampon.getvalue())


def _controler_docx(chemin: Path, bilan: Bilan) -> None:
    with zipfile.ZipFile(chemin) as z:
        parties = {n: z.read(n) for n in z.namelist() if n.startswith("word/") and n.endswith(".xml") and "theme" not in n}
    polices, couleurs, sans_alt = set(), set(), 0
    for n, data in parties.items():
        polices |= {p.decode() for p in re.findall(rb'w:(?:ascii|hAnsi)="([^"]+)"', data)}
        couleurs |= {c.decode().upper() for c in re.findall(rb'w:(?:color w:val|fill)="([0-9A-Fa-f]{6})"', data)}
        couleurs |= {c.decode().upper() for c in re.findall(rb'<w:color w:val="([0-9A-Fa-f]{6})"', data)}
        if n == "word/document.xml":
            sans_alt = len(re.findall(rb'<wp:docPr [^>]*?(?<!descr="[^"])/?>', data)) - len(re.findall(rb'<wp:docPr [^>]*descr="[^"]+"', data))
    hors = sorted(p for p in polices if p not in {C.POLICE_TITRE, C.POLICE_CORPS, "Symbol", "Wingdings", "Courier New"})
    if hors:
        bilan.signaler("POLICE", f"Polices encore présentes : {', '.join(hors)}.", "erreur")
    hors = sorted(couleurs - C.PALETTE)
    if hors:
        bilan.signaler("COULEUR_HORS_PALETTE", f"Couleurs encore présentes : {', '.join('#' + c for c in hors)}.", "erreur")
    if sans_alt > 0:
        bilan.signaler("ALT_ABSENT", f"{sans_alt} image(s) sans texte alternatif : à décrire dans Word (Format de l'image › Texte de remplacement).")


# ── PDF ──────────────────────────────────────────────────────────────────────

PUCE = re.compile(r"^\s*([•▪◦●■\-–]|\d{1,2}[.)])\s+")


def _lignes_pdf(pdf):
    """Lignes de texte de chaque page (taille, gras, position), hors tableaux ; tableaux ; images."""
    pages = []
    for page in pdf.pages:
        tableaux = page.find_tables()
        boites = [t.bbox for t in tableaux]
        mots = [m for m in page.extract_words(extra_attrs=["size", "fontname"], use_text_flow=True, keep_blank_chars=False)
                if not any(b[0] - 1 <= m["x0"] and m["x1"] <= b[2] + 1 and b[1] - 1 <= m["top"] and m["bottom"] <= b[3] + 1 for b in boites)]
        lignes = []
        for m in mots:
            if lignes and abs(lignes[-1]["top"] - m["top"]) < m["size"] * 0.5:
                lignes[-1]["mots"].append(m)
            else:
                lignes.append({"top": m["top"], "mots": [m]})
        out = []
        for l in lignes:
            ms = sorted(l["mots"], key=lambda m: m["x0"])
            out.append({"top": l["top"], "bottom": max(m["bottom"] for m in ms), "x0": ms[0]["x0"],
                        "texte": " ".join(m["text"] for m in ms), "taille": statistics.median(m["size"] for m in ms),
                        "gras": all(re.search(r"bold|black|semibold|heavy", m["fontname"], re.I) for m in ms)})
        images = []
        for im in page.images:
            l, h = im["x1"] - im["x0"], im["bottom"] - im["top"]
            if l > 40 and h > 40:
                try:
                    rendu = page.crop((max(0, im["x0"]), max(0, im["top"]), min(page.width, im["x1"]), min(page.height, im["bottom"])))
                    pil = rendu.to_image(resolution=150).original
                    t = io.BytesIO(); pil.save(t, format="PNG")
                    images.append({"top": im["top"], "png": t.getvalue(), "largeur": l})
                except Exception:  # noqa: BLE001 — image illisible : signalée plus bas
                    images.append({"top": im["top"], "png": None, "largeur": l})
        pages.append({"hauteur": page.height, "lignes": out, "tableaux": [(t.bbox[1], t.extract()) for t in tableaux], "images": images})
    return pages


def pdf(source: Path, sortie: Path) -> Bilan:
    import pdfplumber
    from weasyprint import HTML

    bilan = Bilan(source.name, sortie.name)
    with pdfplumber.open(source) as f:
        pages = _lignes_pdf(f)
    toutes = [l for p in pages for l in p["lignes"]]
    if not toutes:
        raise ValueError("aucun texte lisible dans ce PDF (document scanné ?) : mise à la charte impossible")
    corps = statistics.median(l["taille"] for l in toutes)
    # En-têtes et pieds répétés (numéros de page, mentions) : retirés, la charte pose les siens.
    repetes = {}
    for p in pages:
        for l in p["lignes"]:
            if l["top"] < 50 or l["bottom"] > p["hauteur"] - 50:
                cle = re.sub(r"\d+", "#", l["texte"])
                repetes[cle] = repetes.get(cle, 0) + 1
    a_retirer = {k for k, n in repetes.items() if n >= max(2, len(pages) // 2) or re.fullmatch(r"[#\s/|.-]*(page)?[#\s/|.-]*", k, re.I)}

    blocs, retires, images_ko = [], 0, 0
    for p in pages:
        elements = [("ligne", l["top"], l) for l in p["lignes"]] + [("tableau", t, x) for t, x in p["tableaux"]] + \
                   [("image", i["top"], i) for i in p["images"]]
        precedente, puce_suivante = None, False
        for genre, _, x in sorted(elements, key=lambda e: e[1]):
            if genre == "tableau":
                blocs.append(("tableau", [[bilan.texte(c or "") for c in rang] for rang in x if any(rang)])); precedente = None; continue
            if genre == "image":
                if x["png"]:
                    blocs.append(("image", x))
                else:
                    images_ko += 1
                precedente = None
                continue
            l = x
            if (l["top"] < 50 or l["bottom"] > p["hauteur"] - 50) and re.sub(r"\d+", "#", l["texte"]) in a_retirer:
                retires += 1; continue
            brut = re.sub(r"\s+([,.])(?=\s|$)", r"\1", l["texte"])
            # Puce posée en fin de ligne par l'ordre de lecture du PDF : elle annonce la ligne suivante.
            puce_ici, puce_suivante = puce_suivante, bool(re.search(r"\s[•▪◦●■]$", brut))
            brut = re.sub(r"\s*[•▪◦●■]$", "", brut).strip()
            if not brut:
                continue
            texte = bilan.texte(brut)
            if puce_ici and not PUCE.match(texte):
                texte = "• " + texte
            if l["taille"] >= corps * 1.5:
                genre_b = "h1"
            elif l["taille"] >= corps * 1.2:
                genre_b = "h2"
            elif l["gras"] and len(texte) < 90:
                genre_b = "h3"
            elif PUCE.match(texte):
                genre_b = "li"
                texte = PUCE.sub("", texte)
            else:
                genre_b = "p"
            ecart = (l["top"] - precedente["bottom"]) if precedente else 99
            if blocs and precedente and blocs[-1][0] == genre_b and genre_b in ("p", "h1", "h2") and ecart < l["taille"] * 0.9:
                blocs[-1] = (genre_b, blocs[-1][1] + " " + texte)
            elif blocs and precedente and blocs[-1][0] == "li" and genre_b == "p" and ecart < l["taille"] * 0.9 and l["x0"] > precedente["x0"] + 2:
                blocs[-1] = ("li", blocs[-1][1] + " " + texte)  # suite d'un élément de liste
            else:
                blocs.append((genre_b, texte))
            precedente = l

    titre = next((t for g, t in blocs if g == "h1"), Path(source.name).stem)
    sortie.write_bytes(HTML(string=_html(blocs, titre), base_url=str(PAQUET)).write_pdf())
    bilan.actions += [
        "Mise en page reconstruite à la charte : titres en Newsreader, texte en Hanken Grotesk, marine ; en-tête et pied AvisDoc.",
        f"{sum(1 for g, _ in blocs if g in ('h1', 'h2', 'h3'))} titre(s), {sum(1 for g, _ in blocs if g == 'p')} paragraphe(s), "
        f"{sum(1 for g, _ in blocs if g == 'li')} élément(s) de liste, {sum(1 for g, _ in blocs if g == 'tableau')} tableau(x), "
        f"{sum(1 for g, _ in blocs if g == 'image')} image(s) repris.",
    ]
    if retires:
        bilan.actions.append(f"{retires} ligne(s) d'en-tête ou de pied d'origine (numéros de page, mentions répétées) retirée(s).")
    bilan.signaler("MISE_EN_PAGE", "PDF reconstruit à partir de son contenu : vérifier la hiérarchie des titres, les listes et les tableaux.")
    if images_ko:
        bilan.signaler("IMAGE_ILLISIBLE", f"{images_ko} image(s) n'ont pas pu être reprises.")
    if any(g == "image" for g, _ in blocs):
        bilan.signaler("DONNEES_PATIENT", "Le document contient des images : vérifier qu'aucune donnée patient réelle n'y apparaît.")
    _vocabulaire(bilan, [t for g, t in blocs if isinstance(t, str)] + [c for g, t in blocs if g == "tableau" for r in t for c in r])
    return bilan


def _html(blocs, titre: str) -> str:
    def police(fichier):
        return (PAQUET / "assets/fonts" / fichier).as_uri()
    logo = "data:image/png;base64," + base64.b64encode(LOGO.read_bytes()).decode()
    corps = []
    liste = False
    for genre, x in blocs:
        if genre != "li" and liste:
            corps.append("</ul>"); liste = False
        if genre in ("h1", "h2", "h3", "p"):
            corps.append(f"<{genre}>{html.escape(x)}</{genre}>")
        elif genre == "li":
            if not liste:
                corps.append("<ul>"); liste = True
            corps.append(f"<li>{html.escape(x)}</li>")
        elif genre == "tableau" and x:
            tete, *reste = x
            corps.append("<table><thead><tr>" + "".join(f"<th>{html.escape(c)}</th>" for c in tete) + "</tr></thead><tbody>"
                         + "".join("<tr>" + "".join(f"<td>{html.escape(c)}</td>" for c in r) + "</tr>" for r in reste) + "</tbody></table>")
        elif genre == "image":
            src = "data:image/png;base64," + base64.b64encode(x["png"]).decode()
            corps.append(f'<figure><img src="{src}" alt="Image du document d’origine" style="width:{min(100, x["largeur"] / 5.0):.0f}%"></figure>')
    if liste:
        corps.append("</ul>")
    return f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>{html.escape(titre)}</title><style>
@font-face{{font-family:Newsreader;src:url({police('NR-400.ttf')});font-weight:400}}
@font-face{{font-family:Newsreader;src:url({police('NR-600.ttf')});font-weight:600}}
@font-face{{font-family:Hanken;src:url({police('HG-400.ttf')});font-weight:400}}
@font-face{{font-family:Hanken;src:url({police('HG-600.ttf')});font-weight:600}}
@font-face{{font-family:Hanken;src:url({police('HG-700.ttf')});font-weight:700}}
@page{{size:A4;margin:24mm 18mm 20mm;background:#{C.BLANC};
  @top-left{{content:element(tete);vertical-align:bottom;padding-bottom:4mm}}
  @bottom-left{{content:"{C.SIGNATURE_TEXTE.replace("'", "’")}";font:8pt Hanken;color:#{C.ARDOISE};vertical-align:top;padding-top:3mm}}
  @bottom-right{{content:counter(page);font:8pt Hanken;color:#{C.ARDOISE};vertical-align:top;padding-top:3mm}}}}
.tete{{position:running(tete)}} .tete img{{height:9mm}}
body{{font-family:Hanken;font-size:10.5pt;line-height:1.5;color:#{C.MARINE}}}
h1{{font-family:Newsreader;font-weight:600;font-size:24pt;line-height:1.15;margin:0 0 5mm}}
h2{{font-family:Newsreader;font-weight:600;font-size:16pt;margin:7mm 0 2.5mm;padding-top:2mm;border-top:1px solid #{C.BEIGE}}}
h3{{font-family:Hanken;font-weight:700;font-size:11.5pt;margin:5mm 0 1.5mm}}
p{{margin:0 0 2.5mm}} ul{{margin:0 0 3mm;padding-left:5mm}} li{{margin:0 0 1mm}} li::marker{{color:#{C.CYAN}}}
table{{border-collapse:collapse;width:100%;margin:3mm 0 5mm;font-size:9.5pt}}
th{{background:#{C.MARINE};color:#{C.BLANC};text-align:left;padding:2mm 2.5mm;font-weight:600}}
td{{background:#{C.CYAN_TRES_CLAIR};padding:1.8mm 2.5mm;border-bottom:2px solid #{C.BLANC}}}
figure{{margin:3mm 0;text-align:center}} img{{max-width:100%}}
</style></head><body><div class="tete"><img src="{logo}" alt="AvisDoc"></div>{''.join(corps)}</body></html>"""


def mettre_a_la_charte(source: Path, dossier: Path) -> tuple[Path, Bilan]:
    """Word ou PDF → fichier à la charte + rapport.md dans `dossier`."""
    dossier.mkdir(parents=True, exist_ok=True)
    ext = source.suffix.lower()
    sortie = dossier / f"{source.stem} (charte AvisDoc){ext}"
    if ext == ".docx":
        bilan = word(source, sortie)
    elif ext == ".pdf":
        bilan = pdf(source, sortie)
    else:
        raise ValueError(f"format non pris en charge : {ext} (Word .docx, PDF ou PowerPoint .pptx)")
    bilan.rapport(dossier / "rapport.md")
    return sortie, bilan
