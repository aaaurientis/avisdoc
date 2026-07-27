#!/usr/bin/env python3
"""Produit le recueil des e-mails (PDF) à partir de build/emails.json.

Le JSON est la source unique : il alimente à la fois ce PDF, destiné aux RH,
et la plateforme web. Ne pas éditer le PDF, éditer le JSON.
"""
import base64
import html
import json
import pathlib

from weasyprint import HTML

RACINE = pathlib.Path(__file__).parent.parent
SORTIE = pathlib.Path(__file__).parent.parent / "documents/pdf"

CSS_SPEC = """
@page{ @bottom-right{content:"Recueil des e-mails · " counter(page) "/" counter(pages)} }
h1{font-size:22pt}
body{font-size:10pt}
.intro{font-size:11pt;color:var(--ardoise);line-height:1.55;margin:0 0 5mm;max-width:150mm}
.variables{background:var(--blanc);border:.5pt solid var(--filet-carte);border-radius:2mm;padding:4mm 4.5mm;margin-bottom:6mm}
.variables .k{font-size:7.5pt;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--taupe);margin-bottom:2.5mm}
.variables dl{display:grid;grid-template-columns:26mm 1fr;gap:1.6mm 4mm;margin:0;font-size:9.5pt}
.variables dt{font-family:var(--mono,inherit);font-weight:700;color:var(--cyan)}
.variables dd{margin:0;color:var(--ardoise)}

.seq{margin-bottom:3mm;break-inside:avoid}
.seq-tete{display:flex;align-items:baseline;gap:4mm;margin-bottom:3.5mm}
.seq-tete .quand{font-size:19pt;color:var(--cyan);font-weight:700;line-height:1}
.seq-tete .quoi{font-size:15pt;font-weight:700;color:var(--marine)}
.seq-tete .note{margin-left:auto;font-size:9.5pt;font-style:italic;color:var(--taupe)}

.mail{background:var(--blanc);border:.5pt solid var(--filet-carte);border-radius:2mm;
      padding:4mm 4.5mm;margin-bottom:3.5mm;break-inside:avoid}
.mail .angle{font-size:7.5pt;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--cyan);margin-bottom:2mm}
.mail .objet{font-size:11.5pt;font-weight:700;color:var(--marine);margin:0 0 3mm;padding-bottom:2.5mm;border-bottom:.5pt solid var(--beige)}
.mail .objet span{font-size:7.5pt;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--taupe);display:block;margin-bottom:1mm}
.mail p{margin:0 0 2.6mm;font-size:10pt;color:var(--ardoise);line-height:1.5}
.mail p:last-child{margin-bottom:0}
.mail .sign{margin-top:3mm;font-size:10pt;color:var(--marine)}
.mail table{border-collapse:collapse;margin:0 0 2.6mm;font-size:9.5pt}
.mail td{padding:1.4mm 5mm 1.4mm 0;color:var(--ardoise)}
.mail td:first-child{color:var(--marine);font-weight:600;white-space:nowrap}
.jeton{color:var(--cyan);font-weight:600}
"""


def rendre_corps(bloc, tableau):
    if bloc == "TABLEAU":
        lignes = "".join(f"<tr><td>{html.escape(k)}</td><td>{marquer(v)}</td></tr>" for k, v in tableau)
        return f"<table>{lignes}</table>"
    return f"<p>{marquer(bloc)}</p>"


def marquer(txt):
    t = html.escape(txt)
    for jeton in ("{{date}}", "{{lieu}}", "{{lien}}", "{{entreprise}}", "{{signature}}"):
        t = t.replace(jeton, f'<span class="jeton">{jeton}</span>')
    return t


def main():
    d = json.loads((RACINE / "scripts/gabarits/emails.json").read_text())
    charte = (RACINE / "scripts/gabarits/charte.css").read_text()
    logo = "data:image/png;base64," + json.load(open(RACINE / "assets/logos.json"))["bicolore"]

    corps = []
    for seq in d["sequences"]:
        corps.append('<section class="seq">')
        corps.append(f'<div class="seq-tete"><span class="quand">{seq["envoi"]}</span>'
                     f'<span class="quoi">{html.escape(seq["libelle"])}</span>'
                     f'<span class="note">{len(seq["options"])} options rédactionnelles</span></div>')
        for o in seq["options"]:
            blocs = "".join(rendre_corps(b, d["tableau_pratique"]) for b in o["corps"])
            corps.append(
                f'<div class="mail"><div class="angle">{html.escape(o["angle"])}</div>'
                f'<div class="objet"><span>Objet</span>{marquer(o["objet"])}</div>'
                f'{blocs}<p class="sign">{html.escape(d["signature_defaut"])}</p></div>')
        corps.append("</section>")

    variables = "".join(f"<dt>{html.escape(k)}</dt><dd>{html.escape(v)}</dd>" for k, v in d["variables"].items())

    page = f"""<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>AvisDoc — Recueil des e-mails</title><style>{charte}{CSS_SPEC}</style></head><body>
<div class="brandhead"><img src="{logo}" alt="">
  <span class="wordmark"><span class="a">Avis</span><span class="d">Doc</span></span>
  <span class="site">avisdoc.fr</span></div>
<div class="refhead">Kit de communication · Journée de dépistage</div>
<div class="brandfoot"><span class="wordmark"><span class="a">Avis</span><span class="d">Doc</span></span> · avisdoc.fr</div>

<div class="doc-head"><div>
  <div class="kicker">Kit de communication</div>
  <h1>Les e-mails de la campagne,<br><em>prêts à envoyer</em></h1>
  <p class="doc-sub">Trois envois, quatre options rédactionnelles chacun.</p>
</div></div>

<p class="intro">Choisissez une option par envoi, remplacez les champs signalés en cyan, puis envoyez depuis votre
messagerie habituelle. Les textes sont volontairement factuels : ils décrivent le dispositif sans le vendre.</p>

<div class="variables"><div class="k">Champs à remplacer</div><dl>{variables}</dl></div>

{''.join(corps)}

<div class="legal">
  <p><b>Ce que ces e-mails ne doivent pas dire.</b> La participation est volontaire : évitez toute formulation
  incitative ou tout rappel nominatif. L'employeur n'a accès à aucune information médicale individuelle, ni à la
  liste des résultats. Le suivi d'inscription doit rester à la seule main du prestataire ou du service de santé
  au travail.</p>
</div>
</body></html>"""

    out = SORTIE / "Recueil-emails-campagne-AvisDoc.pdf"
    doc = HTML(string=page).render()
    doc.write_pdf(out)
    print(f"  {out.name} — {len(doc.pages)} pages, "
          f"{sum(len(s['options']) for s in d['sequences'])} e-mails")


if __name__ == "__main__":
    main()
