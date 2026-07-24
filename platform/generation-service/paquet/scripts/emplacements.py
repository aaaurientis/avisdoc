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
import mimetypes
import pathlib
import re

JETON = "__LOGO_CLIENT__"
MARQUEUR = 'data-slot="logo-client"'


def _data_uri(chemin):
    chemin = pathlib.Path(chemin)
    mime = mimetypes.guess_type(chemin.name)[0] or "image/png"
    return f"data:{mime};base64," + base64.b64encode(chemin.read_bytes()).decode()


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
