#!/usr/bin/env python3
"""Génère les cinq affiches AvisDoc, un fichier PDF par affiche.

    python3 affiches.py                       # emplacement logo client vide
    python3 affiches.py --logo acme.png       # logo client injecté
    python3 affiches.py --apercu              # emplacement matérialisé
    python3 affiches.py --sans-traits         # sans fond perdu ni traits de coupe
"""
import argparse
import base64
import json
import pathlib
import sys

from weasyprint import HTML

import emplacements

RACINE = pathlib.Path(__file__).parent.parent
SORTIE = pathlib.Path(__file__).parent.parent / "documents/affiches"

POLICES = {
    "__F_NR400__": "assets/fonts/NR-400.ttf",
    "__F_NR600__": "assets/fonts/NR-600.ttf",
    "__F_NRI400__": "assets/fonts/NRI-400.ttf",
    "__F_HG400__": "assets/fonts/HG-400.ttf",
    "__F_HG600__": "assets/fonts/HG-600.ttf",
    "__F_HG700__": "assets/fonts/HG-700.ttf",
}

ACCROCHE = "Le dépistage du cancer de la peau <em>vient à vous.</em>"
INFO = "Journée de dépistage organisée sur votre lieu de travail. Renseignements et inscription auprès de vos ressources humaines."

# nom de fichier · photo · titre · cadrage · hauteur du visuel · corps du titre · bas du titre
AFFICHES = [
    dict(fichier="Affiche-1-Prenez-soin-de-votre-peau",
         photo="p1", cadrage="50% 26%", h_visuel="401mm", bas_titre="212mm",
         t_titre="82pt", titre="Prenez soin<br>de votre <em>peau</em>."),
    dict(fichier="Affiche-2-Preserver-sa-peau",
         photo="p2", cadrage="50% 24%", h_visuel="401mm", bas_titre="212mm",
         t_titre="66pt", titre="Préserver sa <em>peau</em>,<br>c'est aussi préserver<br>sa <em>santé</em>."),
    dict(fichier="Affiche-3-Prenez-soin-de-votre-peau-2",
         photo="p3", cadrage="50% 30%", h_visuel="401mm", bas_titre="212mm",
         t_titre="82pt", titre="Prenez soin<br>de votre <em>peau</em>."),
    dict(fichier="Affiche-4-Difficultes-rendez-vous",
         photo="p4", cadrage="50% 34%", h_visuel="401mm", bas_titre="212mm",
         t_titre="60pt", titre="Difficultés à prendre<br>un rendez-vous avec<br>un <em>dermatologue</em>&nbsp;?"),
    dict(fichier="Affiche-5-Difficultes-rendez-vous-2",
         photo="p5", cadrage="50% 30%", h_visuel="401mm", bas_titre="212mm",
         t_titre="60pt", titre="Difficultés à prendre<br>un rendez-vous avec<br>un <em>dermatologue</em>&nbsp;?"),
]


def b64(chemin, mime):
    return f"data:{mime};base64," + base64.b64encode(pathlib.Path(RACINE / chemin).read_bytes()).decode()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--logo")
    ap.add_argument("--apercu", action="store_true")
    ap.add_argument("--sans-traits", action="store_true",
                    help="retire le fond perdu et les traits de coupe (relecture écran)")
    ap.add_argument("--suffixe", default="")
    a = ap.parse_args()

    if a.logo and not pathlib.Path(a.logo).exists():
        sys.exit(f"logo introuvable : {a.logo}")
    SORTIE.mkdir(parents=True, exist_ok=True)

    gabarit = (RACINE / "scripts/gabarits/affiche.html").read_text()
    for jeton, chemin in POLICES.items():
        gabarit = gabarit.replace(jeton, b64(chemin, "font/ttf"))
    gabarit = gabarit.replace("__LOGO__", "data:image/png;base64," + json.load(open(RACINE / "assets/logos.json"))["bicolore"])
    photos = json.load(open(RACINE / "assets/photos/photos.json"))

    bleed = "0" if a.sans_traits else "3mm"
    gabarit = gabarit.replace("__BLEED__", bleed)
    gabarit = gabarit.replace("__MARKS__", "none" if a.sans_traits else "crop cross")

    for af in AFFICHES:
        h = gabarit
        h = h.replace("__PHOTO__", photos[af["photo"]])
        h = h.replace("__TITRE_FICHIER__", af["fichier"])
        h = h.replace("__TITRE__", af["titre"])
        h = h.replace("__CADRAGE__", af["cadrage"])
        h = h.replace("__H_VISUEL__", af["h_visuel"])
        h = h.replace("__H_BANDEAU__", "186mm")
        h = h.replace("__BAS_TITRE__", af["bas_titre"])
        h = h.replace("__T_TITRE__", af["t_titre"])
        h = h.replace("__PAD_BANDEAU__", "30mm")
        h = h.replace("__T_ACCROCHE__", "40pt")
        h = h.replace("__ACCROCHE__", ACCROCHE)
        h = h.replace("__INFO__", INFO)

        h = emplacements.injecter(h, logo=a.logo, apercu=a.apercu)
        emplacements.controler(h, af["fichier"], logo=bool(a.logo) or a.apercu)
        assert "__" not in h.split("<body")[1], af["fichier"]

        pdf = SORTIE / f"{af['fichier']}{a.suffixe}.pdf"
        HTML(string=h).write_pdf(pdf)
        print(f"  {pdf.name}  ({pdf.stat().st_size//1024} ko)")

    etat = f"logo « {pathlib.Path(a.logo).name} »" if a.logo else ("aperçu" if a.apercu else "emplacement vide")
    traits = "sans traits de coupe" if a.sans_traits else "fond perdu 3 mm + traits de coupe"
    print(f"\n5 affiches A2 générées — {etat}, {traits}")


if __name__ == "__main__":
    main()
