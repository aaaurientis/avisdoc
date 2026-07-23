#!/usr/bin/env python3
"""Génère la notice d'information et le formulaire de consentement.

Ces deux documents ne portent jamais le logo d'un client : leur contenu est
juridique et les responsables de traitement y sont nommément identifiés.
Le script n'accepte donc volontairement aucune option --logo.
"""
import json
import pathlib

from weasyprint import HTML

RACINE = pathlib.Path(__file__).parent.parent
SORTIE = RACINE / "documents/pdf"

DOCS = [
    ("scripts/gabarits/consentement-notice.html", "Notice-information-consentement-AvisDoc.pdf"),
    ("scripts/gabarits/consentement-formulaire.html", "Formulaire-consentement-patient-AvisDoc.pdf"),
]


def main():
    SORTIE.mkdir(parents=True, exist_ok=True)
    charte = (RACINE / "scripts/gabarits/charte.css").read_text()
    logo = "data:image/png;base64," + json.load(open(RACINE / "assets/logos.json"))["bicolore"]
    for src, out in DOCS:
        h = (RACINE / src).read_text().replace("__CHARTE__", charte).replace("__LOGO__", logo)
        assert "__" not in h.split("<body>")[1], src
        doc = HTML(string=h).render()
        doc.write_pdf(SORTIE / out)
        print(f"  {out} — {len(doc.pages)} pages")


if __name__ == "__main__":
    main()
