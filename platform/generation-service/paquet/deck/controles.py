"""Étape 4 : contrôles du fichier produit et rapport (brief §7).

Erreurs : le code de sortie est non nul. Avertissements : listés dans le rapport.
Le débordement est contrôlé par le calcul (formes dans la diapositive, texte dans sa forme) ; si
LibreOffice est présent, une planche de vignettes `controle.jpg` est produite pour l'œil humain.
"""
from __future__ import annotations

import io
import json
import re
import shutil
import subprocess
import tempfile
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

from lxml import etree
from PIL import Image
from pptx import Presentation
from pptx.enum.shapes import PP_PLACEHOLDER

from . import charte as C
from .generer import _hauteur_texte
from .maitre import SOMBRES
from .typo import fautes_typo

NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "c": "http://schemas.openxmlformats.org/drawingml/2006/chart",
}
EMU = 914400
ERREURS = {"COULEUR_HORS_PALETTE", "CONTRASTE", "POLICE", "TIRET_CADRATIN", "TYPO_FR", "TITRE_ABSENT",
           "ALT_ABSENT", "DEBORDEMENT", "TEXTE_GABARIT", "LOGO_CLIENT"}
SIGNATURE_THEME = {"accent1", "accent2", "accent5"}
RESIDUS = re.compile(r"cliquez pour|ajoutez le visuel|click to add|cliquez ici|titre de la présentation", re.I)
PETITS_AUTORISES = ("Sur-titre", "Signature", "Pied", "Tableau", "Légende", "chiffre")


@dataclass
class Constat:
    code: str
    message: str
    diapositive: int | None = None

    @property
    def niveau(self) -> str:
        return "erreur" if self.code in ERREURS else "avertissement"


@dataclass
class Resultat:
    constats: list[Constat] = field(default_factory=list)
    acces: str = "client"

    @property
    def erreurs(self):
        return [c for c in self.constats if c.niveau == "erreur"]

    def ajouter(self, code, message, diapo=None):
        self.constats.append(Constat(code, message, diapo))


def _couleurs_du_fichier(chemin: Path) -> set[str]:
    vues = set()
    with zipfile.ZipFile(chemin) as z:
        for nom in z.namelist():
            if nom.endswith(".xml") and nom.startswith(("ppt/slides/", "ppt/slideLayouts/", "ppt/slideMasters/", "ppt/theme/", "ppt/charts/")):
                vues |= {v.upper() for v in re.findall(rb'srgbClr val="([0-9A-Fa-f]{6})"', z.read(nom)) for v in [v.decode()]}
    return vues


def _polices_du_fichier(chemin: Path) -> set[str]:
    vues = set()
    with zipfile.ZipFile(chemin) as z:
        for nom in z.namelist():
            if nom.endswith(".xml") and nom.startswith(("ppt/slides/", "ppt/slideLayouts/", "ppt/slideMasters/", "ppt/theme/", "ppt/charts/")):
                vues |= {v.decode() for v in re.findall(rb'<a:latin typeface="([^"]*)"', z.read(nom))}
    return {v for v in vues if v}


def _paragraphes(forme) -> list[tuple[str, list]]:
    if not forme.has_text_frame:
        return []
    return [("".join(r.text for r in p.runs), p.runs) for p in forme.text_frame.paragraphs]


def _couleur_run(run) -> str | None:
    rpr = run._r.find("a:rPr", NS)
    if rpr is None:
        return None
    sc = rpr.find("a:solidFill/a:schemeClr", NS)
    if sc is not None:
        return sc.get("val")
    sr = rpr.find("a:solidFill/a:srgbClr", NS)
    return sr.get("val").upper() if sr is not None else None


def _sur_marine(forme, formes) -> bool:
    """La forme est-elle posée sur une carte marine (fond sombre local) ?"""
    cx, cy = forme.left + forme.width / 2, forme.top + forme.height / 2
    for f in formes:
        if f is forme or not getattr(f, "fill", None):
            continue
        try:
            if f.fill.type != 1:  # MSO_FILL.SOLID
                continue
            tc = f.fill.fore_color.theme_color
        except (AttributeError, TypeError, ValueError):
            continue
        if str(tc).startswith("TEXT_1") and f.left <= cx <= f.left + f.width and f.top <= cy <= f.top + f.height:
            return True
    return False


def controler(sortie: Path, deck: dict) -> Resultat:
    res = Resultat()
    prs = Presentation(sortie)
    l_diapo, h_diapo = prs.slide_width, prs.slide_height
    sources = [d["source"] for d in deck["diapositives"]]

    for c in sorted(_couleurs_du_fichier(sortie) - C.PALETTE):
        res.ajouter("COULEUR_HORS_PALETTE", f"Couleur #{c} hors palette.")
    for p in sorted(_polices_du_fichier(sortie) - C.POLICES):
        res.ajouter("POLICE", f"Police « {p} » : seules Georgia et Calibri sont admises.")

    # Le pivot lui-même : la typographie y est normalisée par l'étape 2 (recette 6).
    def chaines(x):
        if isinstance(x, str):
            yield x
        elif isinstance(x, dict):
            for v in x.values():
                yield from chaines(v)
        elif isinstance(x, list):
            for v in x:
                yield from chaines(v)
    for d in deck["diapositives"]:
        for t in chaines(d):
            if "\u2014" in t:
                res.ajouter("TIRET_CADRATIN", f"Tiret cadratin dans deck.json : « {t[:60]} ».", d["source"])

    titres: dict[str, int] = {}
    for i, diapo in enumerate(prs.slides):
        n = sources[i] if i < len(sources) else i + 1
        gabarit = diapo.slide_layout.name
        sombre = gabarit in SOMBRES
        formes = list(diapo.shapes)

        # Titre
        titre = next((f for f in diapo.placeholders if f.placeholder_format.type in (PP_PLACEHOLDER.TITLE, PP_PLACEHOLDER.CENTER_TITLE)), None)
        texte_titre = titre.text_frame.text.strip() if titre is not None else ""
        if not texte_titre:
            res.ajouter("TITRE_ABSENT", "Diapositive sans titre.", n)
        elif texte_titre in titres:
            res.ajouter("TITRE_DOUBLON", f"Même titre que la diapositive {titres[texte_titre]}.", n)
        else:
            titres[texte_titre] = n

        for f in formes:
            # Formes hors de la diapositive
            if f.left < 0 or f.top < 0 or f.left + f.width > l_diapo or f.top + f.height > h_diapo:
                res.ajouter("DEBORDEMENT", f"Forme « {f.name} » hors de la diapositive.", n)
            # Logo client
            if f.name == "LOGO_CLIENT" and not deck["meta"].get("logo_client"):
                visible = f.shape_type == 13 or (getattr(f, "fill", None) is not None and f.fill.type == 1)
                if visible:
                    res.ajouter("LOGO_CLIENT", "Emplacement LOGO_CLIENT visible alors que logo_client est faux.", n)
            # Images : texte alternatif, définition
            el = f._element
            cnv = el.find(".//p:cNvPr", NS)
            if f.shape_type == 13 or el.find(".//c:chart", NS) is not None:
                if cnv is None or not (cnv.get("descr") or "").strip():
                    res.ajouter("ALT_ABSENT", f"« {f.name} » sans texte alternatif.", n)
            if f.shape_type == 13 and not f.name.endswith("icône") and "Pied" not in f.name:
                try:
                    largeur_px = Image.open(io.BytesIO(f.image.blob)).size[0]
                    ppp = largeur_px / (f.width / EMU)
                    if ppp < 100:
                        res.ajouter("IMAGE_BASSE_DEF", f"« {f.name} » : {ppp:.0f} ppp à sa taille d'affichage.", n)
                except Exception:  # noqa: BLE001 — image illisible : le contrôle ne doit pas planter
                    pass
            # Textes
            for texte, runs in _paragraphes(f):
                if not texte:
                    continue
                if "—" in texte:
                    res.ajouter("TIRET_CADRATIN", f"Tiret cadratin dans « {texte[:60]} ».", n)
                for faute in fautes_typo(texte):
                    res.ajouter("TYPO_FR", f"{faute} : « {texte[:60]} ».", n)
                if RESIDUS.search(texte):
                    res.ajouter("TEXTE_GABARIT", f"Texte de modèle résiduel : « {texte[:60]} ».", n)
                if re.search(r"\bd[ée]pist", texte, re.I):
                    res.ajouter("VOCABULAIRE", f"« dépistage » : terme attendu « repérage de lésions suspectes » (« {texte[:60]} »).", n)
                for m in re.finditer(r"(?<![\w./@-])avis ?doc(?![\w.-]*\.(fr|com))", texte, re.I):
                    if m.group(0) != "AvisDoc":
                        res.ajouter("MARQUE", f"Graphie « {m.group(0)} » : attendu « AvisDoc ».", n)
                for r in runs:
                    couleur = _couleur_run(r)
                    if not sombre and couleur in (SIGNATURE_THEME | C.SIGNATURE) and not _sur_marine(f, formes):
                        res.ajouter("CONTRASTE", f"Cyan ou orange en texte sur fond clair : « {texte[:60]} ».", n)
                        break
                for r in runs:
                    taille = r.font.size.pt if r.font.size else None
                    if taille and (taille < 10 or (taille < 14 and not any(k in f.name for k in PETITS_AUTORISES))):
                        res.ajouter("CORPS_TROP_PETIT", f"« {f.name} » en {taille:g} pt.", n)
                        break
            # Texte dans sa forme (estimation)
            if f.has_text_frame and f.name != "Titre" and f.text_frame.text.strip():
                paragraphes = [p for p, _ in _paragraphes(f)]
                tailles = [r.font.size.pt for _, rs in _paragraphes(f) for r in rs if r.font.size]
                police = next((r.font.name for _, rs in _paragraphes(f) for r in rs if r.font.name), C.POLICE_CORPS)
                if tailles and _hauteur_texte(paragraphes, max(tailles), f.width / EMU, police) > f.height / EMU * 1.02:
                    res.ajouter("DEBORDEMENT", f"Texte de « {f.name} » plus haut que sa forme.", n)

        if gabarit == "captures":
            levee = any(a.get("code") == "DONNEES_PATIENT" and a.get("diapositive") == n and a.get("levee")
                        for a in deck.get("anomalies", []))
            if not levee:
                res.ajouter("DONNEES_PATIENT", "Captures : vérification humaine exigée avant publication.", n)
                res.acces = "hds"
    return res


def planche(sortie: Path, destination: Path) -> Path | None:
    """Rendu LibreOffice → planche de vignettes. Rien n'est envoyé hors de la machine."""
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice or not shutil.which("pdftoppm"):
        return None
    with tempfile.TemporaryDirectory() as t:
        subprocess.run([soffice, "--headless", "--convert-to", "pdf", "--outdir", t, str(sortie)],
                       check=True, capture_output=True, timeout=300)
        pdf = Path(t) / (sortie.stem + ".pdf")
        subprocess.run(["pdftoppm", "-png", "-r", "36", str(pdf), str(Path(t) / "v")], check=True, timeout=300)
        vignettes = [Image.open(v).convert("RGB") for v in sorted(Path(t).glob("v-*.png"))]
    if not vignettes:
        return None
    w, h = vignettes[0].size
    cols = 3
    lignes = -(-len(vignettes) // cols)
    toile = Image.new("RGB", (cols * w + (cols + 1) * 8, lignes * h + (lignes + 1) * 8), "#E3DCD2")
    for i, v in enumerate(vignettes):
        toile.paste(v, (8 + (i % cols) * (w + 8), 8 + (i // cols) * (h + 8)))
    toile.save(destination, quality=85)
    return destination


def rapport(deck: dict, res: Resultat, anomalies_generation: list[dict], destination: Path, planche_ok: bool) -> Path:
    L = [f"# Rapport de mise à la charte : {deck['meta'].get('titre') or deck['meta']['source']}", ""]
    L += [f"Source : `{deck['meta']['source']}` (non modifiée). Fond : {deck['meta']['fond']}. "
          f"Logo client : {'oui' if deck['meta'].get('logo_client') else 'non'}. Accès : **{res.acces}**.", ""]
    erreurs, avert = res.erreurs, [c for c in res.constats if c.niveau != "erreur"]
    L += [f"**{len(erreurs)} erreur(s), {len(avert)} avertissement(s).**" + (" Planche de contrôle : `controle.jpg`." if planche_ok else ""), ""]
    L += ["## Corrections appliquées", ""]
    L += [f"- Diapositive {c['diapositive']} ({c['type']}) : « {c['avant']} » → « {c['apres']} »" for c in deck.get("corrections", [])] or ["Aucune."]
    L += ["", "## Anomalies signalées, non corrigées", ""]
    lignes = [f"- Diapositive {a.get('diapositive', '—')} · `{a['code']}` : {a['message']}" + (" (levée)" if a.get("levee") else "")
              for a in deck.get("anomalies", []) + anomalies_generation]
    lignes += [f"- Diapositive {c.diapositive or '—'} · `{c.code}` ({c.niveau}) : {c.message}" for c in res.constats]
    L += lignes or ["Aucune."]
    L += ["", "## Décisions de gabarit", ""]
    L += [f"- Diapositive {d['diapositive']} : `{d['gabarit']}` ({d['motif']})" for d in deck.get("decisions", [])] or ["Non renseignées."]
    destination.write_text("\n".join(L) + "\n", encoding="utf-8")
    return destination


def executer(sortie: Path, chemin_deck: Path, anomalies_generation: list[dict] | None = None, avec_planche: bool = True) -> Resultat:
    deck = json.loads(chemin_deck.read_text(encoding="utf-8"))
    res = controler(sortie, deck)
    p = planche(sortie, sortie.parent / "controle.jpg") if avec_planche else None
    rapport(deck, res, anomalies_generation or [], sortie.parent / "rapport.md", p is not None)
    return res
