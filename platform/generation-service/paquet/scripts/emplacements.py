"""Emplacement « logo client » — convention commune à tous les documents AvisDoc.

Chaque gabarit HTML porte un emplacement balisé :

    <span class="sep-client" data-slot="logo-client"></span>
    <img  class="logo-client" data-slot="logo-client" src="__LOGO_CLIENT__" alt="">

Trois états possibles au moment de la génération :

  logo fourni      → l'image est encodée en base64 dans le fichier, aucun lien externe
  aucun logo       → tous les éléments `data-slot="logo-client"` sont retirés :
                     le document ne montre ni cadre, ni trou, ni réserve d'espace
  mode aperçu      → un cadre pointillé « Logo client » matérialise l'emplacement,
                     pour contrôler la mise en page avant industrialisation

Le PPTX suit la même convention : la forme porte le nom d'objet LOGO_CLIENT
(voir logo_client_pptx.py).
"""
import base64
import io
import mimetypes
import pathlib
import re

JETON = "__LOGO_CLIENT__"
MARQUEUR = 'data-slot="logo-client"'

_RASTER = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


def _detourer(data):
    """Détoure et recentre un logo raster : retire les marges vides (transparentes
    ou de couleur de fond uniforme) et ajoute une fine marge régulière. Le logo
    remplit alors sa réserve et reste centré, quelle que soit sa mise en page
    d'origine. Renvoie un PNG (bytes). Silencieux : rend l'original en cas d'échec.
    """
    try:
        from PIL import Image, ImageChops
    except Exception:
        return None
    try:
        im = Image.open(io.BytesIO(data)).convert("RGBA")
    except Exception:
        return None

    # 1) marge transparente ; 2) sinon, marge de la couleur des coins.
    bbox = im.split()[3].getbbox()
    if bbox is None:
        fond = Image.new("RGBA", im.size, im.getpixel((0, 0)))
        bbox = ImageChops.difference(im, fond).getbbox()
    if bbox:
        im = im.crop(bbox)

    marge = max(2, round(0.03 * max(im.size)))
    toile = Image.new("RGBA", (im.width + 2 * marge, im.height + 2 * marge), (0, 0, 0, 0))
    toile.paste(im, (marge, marge))

    out = io.BytesIO()
    toile.save(out, "PNG")
    return out.getvalue()


def _data_uri(chemin):
    chemin = pathlib.Path(chemin)
    data = chemin.read_bytes()
    mime = mimetypes.guess_type(chemin.name)[0] or "image/png"
    if chemin.suffix.lower() in _RASTER:
        detoure = _detourer(data)
        if detoure is not None:
            data, mime = detoure, "image/png"
    return f"data:{mime};base64," + base64.b64encode(data).decode()


def injecter(html, logo=None, apercu=False):
    """Renvoie le HTML avec l'emplacement rempli, retiré, ou matérialisé."""
    if logo:
        return html.replace(JETON, _data_uri(logo))

    if apercu:
        html = html.replace('<body>', '<body class="apercu">', 1)
        html = re.sub(
            r'<img class="logo-client" ' + re.escape(MARQUEUR) + r' src="' + re.escape(JETON) + r'" alt="">',
            '<span class="logo-client-vide">Logo client</span>',
            html,
        )
        return html

    # Emplacement vide : on retire l'image et son séparateur, sans laisser de blanc
    html = re.sub(r'\s*<(?:img|span)[^>]*' + re.escape(MARQUEUR) + r'[^>]*>(?:</span>)?', '', html)
    return html


def controler(html, nom="", logo=False):
    """Garde-fou avant écriture d'un livrable.

    Le jeton ne doit jamais survivre. Le marqueur `data-slot`, lui, reste
    légitimement dans le HTML quand un logo a été injecté : il identifie
    l'emplacement pour une reprise ultérieure.
    """
    reste = [JETON] if JETON in html else []
    if not logo and MARQUEUR in html:
        reste.append(MARQUEUR)
    if reste:
        raise AssertionError(f"{nom} : emplacement non traité → {reste}")
    return html
