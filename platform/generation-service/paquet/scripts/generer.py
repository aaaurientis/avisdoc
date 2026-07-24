#!/usr/bin/env python3
"""Génère toute la famille documentaire AvisDoc.

    python3 generer.py                          # emplacements vides, invisibles
    python3 generer.py --logo acme.png          # logo client injecté partout
    python3 generer.py --apercu                 # emplacements matérialisés
    python3 generer.py --logo acme.png --suffixe -acme
"""
import argparse
import base64
import json
import pathlib
import sys

from weasyprint import HTML

import emplacements

RACINE = pathlib.Path(__file__).parent.parent
SORTIE = pathlib.Path(__file__).parent.parent / "documents/pdf"

DOCS = [
    ("scripts/gabarits/avisdoc-aptos.html",  "CR-teleexpertise-AvisDoc",        "cr"),
    ("scripts/gabarits/avisdoc-2zones.html", "CR-teleexpertise-AvisDoc-2zones", "cr2"),
    ("scripts/gabarits/contacts.html",       "Correspondants-Paris-AvisDoc",    "simple"),
    ("scripts/gabarits/kit.html",            "Kit-collaborateur-AvisDoc",       "kit"),
    ("scripts/gabarits/lettre.html",         "Lettre-adressage",                "lettre"),
]


def b64(chemin, mime):
    return f"data:{mime};base64," + base64.b64encode(pathlib.Path(chemin).read_bytes()).decode()


def construire(src, profil):
    h = pathlib.Path(RACINE / src).read_text()
    h = h.replace("__CHARTE__", (RACINE / "scripts/gabarits/charte.css").read_text())
    h = h.replace("__LOGO__", "data:image/png;base64," + json.load(open(RACINE / "assets/logos.json"))["bicolore"])

    if profil in ("cr", "cr2"):
        f = json.load(open(RACINE / "assets/faux_imgs.json"))
        for jeton, cle in (("__Z1D__", "z1_derm"), ("__Z1C__", "z1_clin"),
                           ("__Z2D__", "z2_derm"), ("__Z2C__", "z2_clin"),
                           ("__IMG1__", "z1_derm"), ("__IMG2__", "z1_clin")):
            h = h.replace(jeton, f[cle])
    if profil == "kit":
        k = json.load(open(RACINE / "assets/kit_imgs.json"))
        for jeton, cle in (("__ABCDE__", "abcde"), ("__AUTOEX__", "autoex"),
                           ("__GRAIN__", "grain"), ("__PICTO__", "picto")):
            h = h.replace(jeton, k[cle])
    return h


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--logo", help="fichier image du logo client (png, jpg, svg)")
    ap.add_argument("--apercu", action="store_true", help="matérialiser les emplacements vides")
    ap.add_argument("--suffixe", default="", help="suffixe ajouté aux noms de fichiers")
    a = ap.parse_args()

    if a.logo and not pathlib.Path(a.logo).exists():
        sys.exit(f"logo introuvable : {a.logo}")

    for src, nom, profil in DOCS:
        h = construire(src, profil)
        h = emplacements.injecter(h, logo=a.logo, apercu=a.apercu)
        emplacements.controler(h, nom, logo=bool(a.logo) or a.apercu)
        assert "__" not in h.split("<body")[1], f"{nom} : jeton non remplacé"

        pdf = SORTIE / f"{nom}{a.suffixe}.pdf"
        HTML(string=h).write_pdf(pdf)
        src_dir = SORTIE.parent / "_sources"; src_dir.mkdir(exist_ok=True)
        (src_dir / f"{nom}{a.suffixe}.html").write_text(h)
        print(f"  {pdf.name}")

    etat = f"logo « {pathlib.Path(a.logo).name} »" if a.logo else ("aperçu" if a.apercu else "emplacements vides")
    print(f"\n5 documents générés — {etat}")


if __name__ == "__main__":
    main()
