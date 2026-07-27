#!/usr/bin/env python3
"""AvisDoc — chaîne documentaire. Point d'entrée unique.

    python3 build.py tout                          régénère tous les documents
    python3 build.py client ACME --logo acme.png   décline la chaîne pour un client
    python3 build.py controles                     contrôles qualité sur les sorties
    python3 build.py manifeste                     réécrit manifeste.json
    python3 build.py liste                         affiche le catalogue

Le CATALOGUE ci-dessous est la source de vérité : il alimente la génération,
les contrôles et le manifeste servi à la plateforme web. Toute évolution
(nouveau document, changement de niveau d'accès) se fait ici et nulle part ailleurs.
"""
import argparse
import json
import pathlib
import shutil
import subprocess
import sys

RACINE = pathlib.Path(__file__).parent.resolve()
SORTIE = RACINE / "documents"

# ---------------------------------------------------------------------------
# CATALOGUE
#
#   logo_client : l'emplacement est-il alimenté par le logo de l'entreprise ?
#                 False = document médical ou juridique, voir GUIDE §1.1
#   acces       : public | client | hds
#                 hds = données de santé, ne sort jamais de la plateforme certifiée
# ---------------------------------------------------------------------------
CATALOGUE = [
    dict(id="affiche-1", fichier="affiches/Affiche-1-Prenez-soin-de-votre-peau.pdf",
         titre="Affiche · Prenez soin de votre peau", format="A2", logo_client=True,
         acces="public", phase="annonce", moteur="affiches"),
    dict(id="affiche-2", fichier="affiches/Affiche-2-Preserver-sa-peau.pdf",
         titre="Affiche · Préserver sa peau, c'est aussi préserver sa santé", format="A2",
         logo_client=True, acces="public", phase="annonce", moteur="affiches"),
    dict(id="affiche-3", fichier="affiches/Affiche-3-Prenez-soin-de-votre-peau-2.pdf",
         titre="Affiche · Prenez soin de votre peau (variante)", format="A2", logo_client=True,
         acces="public", phase="annonce", moteur="affiches"),
    dict(id="affiche-4", fichier="affiches/Affiche-4-Difficultes-rendez-vous.pdf",
         titre="Affiche · Difficultés à prendre un rendez-vous ?", format="A2", logo_client=True,
         acces="public", phase="relance", moteur="affiches"),
    dict(id="affiche-5", fichier="affiches/Affiche-5-Difficultes-rendez-vous-2.pdf",
         titre="Affiche · Difficultés à prendre un rendez-vous ? (variante)", format="A2",
         logo_client=True, acces="public", phase="relance", moteur="affiches"),

    dict(id="kit-collaborateur", fichier="pdf/Kit-collaborateur-AvisDoc.pdf",
         titre="Kit collaborateur", format="A4", logo_client=True,
         acces="public", phase="preparation", moteur="generer"),
    dict(id="correspondants", fichier="pdf/Correspondants-Paris-AvisDoc.pdf",
         titre="Réseau d'aval · correspondants Paris", format="A4", logo_client=True,
         acces="client", phase="bilan", moteur="generer"),

    dict(id="kit-com-interne", fichier="pptx/KIT_COM_INTERNE_AvisDoc.pptx",
         titre="Mode d'emploi RH", format="16:9", logo_client=True,
         acces="client", phase="cadrage", moteur="pptx", script="gabarits/kitcom_ppt.js"),
    dict(id="kit-collaborateur-ppt", fichier="pptx/KIT_COLLABORATEUR_AvisDoc.pptx",
         titre="Kit collaborateur (présentation)", format="16:9", logo_client=True,
         acces="client", phase="preparation", moteur="pptx", script="gabarits/kit_ppt.js"),

    dict(id="emails", fichier="pdf/Recueil-emails-campagne-AvisDoc.pdf",
         titre="Recueil des e-mails de campagne", format="A4", logo_client=False,
         acces="client", phase="annonce", moteur="emails",
         note="Servir depuis gabarits/emails.json, pas depuis ce PDF."),

    dict(id="notice-consentement", fichier="pdf/Notice-information-consentement-AvisDoc.pdf",
         titre="Notice d'information et de consentement à un acte de télémédecine", format="A4",
         logo_client=False, acces="public", phase="preparation", moteur="consentement",
         note="Contenu juridique validé. Mise en page modifiable, texte non."),
    dict(id="formulaire-consentement", fichier="pdf/Formulaire-consentement-patient-AvisDoc.pdf",
         titre="Formulaire de consentement du patient", format="A4", logo_client=False,
         acces="client", phase="jour-j", moteur="consentement",
         note="À imprimer, environ 35 exemplaires par journée. Texte non modifiable."),

    dict(id="cr-1zone", fichier="pdf/CR-teleexpertise-AvisDoc.pdf",
         titre="Compte-rendu de téléexpertise · une zone", format="A4", logo_client=False,
         acces="hds", phase="bilan", moteur="generer",
         note="Données de santé. Jeu de démonstration fictif dans ce paquet."),
    dict(id="cr-2zones", fichier="pdf/CR-teleexpertise-AvisDoc-2zones.pdf",
         titre="Compte-rendu de téléexpertise · deux zones", format="A4", logo_client=False,
         acces="hds", phase="bilan", moteur="generer",
         note="Données de santé. Jeu de démonstration fictif dans ce paquet."),
    dict(id="lettre-adressage", fichier="pdf/Lettre-adressage.pdf",
         titre="Lettre d'adressage confraternelle", format="A4", logo_client=False,
         acces="hds", phase="bilan", moteur="generer",
         note="Neutre, sans marque. Ne pas ajouter de logo."),
]

MOTEURS = {
    "generer":      [sys.executable, "scripts/generer.py"],
    "affiches":     [sys.executable, "scripts/affiches.py"],
    "emails":       [sys.executable, "scripts/emails.py"],
    "consentement": [sys.executable, "scripts/consentement.py"],
}


def run(cmd, **kw):
    r = subprocess.run(cmd, cwd=RACINE, capture_output=True, text=True, **kw)
    if r.returncode:
        print(r.stdout[-2000:], r.stderr[-2000:], file=sys.stderr)
        sys.exit(f"échec : {' '.join(str(c) for c in cmd)}")
    return r.stdout


def moteurs_actifs(logo=None, suffixe=""):
    opts = (["--logo", str(logo)] if logo else []) + (["--suffixe=" + suffixe] if suffixe else [])
    for nom, base in MOTEURS.items():
        print(f"· {nom}")
        supporte = nom in ("generer", "affiches")
        run(base + (opts if supporte else []))
    for entree in CATALOGUE:
        if entree["moteur"] == "pptx":
            print(f"· pptx {entree['id']}")
            run(["node", "scripts/" + entree["script"]])


def cmd_tout(a):
    moteurs_actifs()
    ecrire_manifeste()
    print("\nTous les documents régénérés, emplacements logo client vides.")


def cmd_client(a):
    logo = pathlib.Path(a.logo).resolve()
    if not logo.exists():
        sys.exit(f"logo introuvable : {logo}")
    suffixe = "-" + a.nom.lower()
    moteurs_actifs(logo=logo, suffixe=suffixe)

    # PPTX : injection après génération, la forme est nommée LOGO_CLIENT
    for e in CATALOGUE:
        if e["moteur"] == "pptx" and e["logo_client"]:
            src = SORTIE / e["fichier"]
            out = src.with_name(src.stem + suffixe + src.suffix)
            run([sys.executable, "scripts/logo_client_pptx.py", str(src), str(logo), "-o", str(out)])
            print(f"· pptx {out.name}")

    # Les documents médicaux et juridiques ne portent pas le logo : on retire leurs déclinaisons
    retires = []
    for e in CATALOGUE:
        if not e["logo_client"]:
            p = SORTIE / e["fichier"]
            decline = p.with_name(p.stem + suffixe + p.suffix)
            if decline.exists():
                decline.unlink()
                retires.append(decline.name)
            for extra in p.parent.glob(p.stem + suffixe + "-source.html"):
                extra.unlink()
    if retires:
        print("\nRetirés (documents sans logo client, voir GUIDE §1.1) :")
        for r in retires:
            print(f"   {r}")
    print(f"\nChaîne déclinée pour « {a.nom} ».")


def cmd_controles(a):
    manquants, defauts = [], []
    for e in CATALOGUE:
        p = SORTIE / e["fichier"]
        if not p.exists():
            manquants.append(e["fichier"]); continue
        if p.suffix == ".pdf":
            defauts += controler_pdf(p, e)
        elif p.suffix == ".pptx":
            r = subprocess.run([sys.executable, "scripts/validateur/validate.py", str(p)],
                               cwd=RACINE, capture_output=True, text=True)
            if "PASSED" not in r.stdout:
                defauts.append(f"{e['fichier']} : validation PPTX")
    print(f"{len(CATALOGUE) - len(manquants)}/{len(CATALOGUE)} documents présents")
    for m in manquants:
        print(f"   MANQUANT  {m}")
    for d in defauts:
        print(f"   DÉFAUT    {d}")
    if not manquants and not defauts:
        print("Aucun défaut détecté.")


def controler_pdf(chemin, entree):
    import itertools
    try:
        import pdfplumber
    except ImportError:
        return []
    pb = []
    with pdfplumber.open(chemin) as pdf:
        for i, page in enumerate(pdf.pages, 1):
            mots = page.extract_words()
            chev = sum(1 for a, b in itertools.combinations(mots, 2)
                       if min(a["x1"], b["x1"]) - max(a["x0"], b["x0"]) > 2
                       and min(a["bottom"], b["bottom"]) - max(a["top"], b["top"]) > 2)
            if chev:
                pb.append(f"{entree['fichier']} p.{i} : {chev} chevauchement(s)")
    return pb


def ecrire_manifeste():
    docs = []
    for e in CATALOGUE:
        p = SORTIE / e["fichier"]
        d = {k: v for k, v in e.items() if k not in ("moteur", "script")}
        d["existe"] = p.exists()
        d["octets"] = p.stat().st_size if p.exists() else None
        docs.append(d)
    m = {
        "version": "2026.1",
        "genere_par": "build.py",
        "niveaux_acces": {
            "public": "diffusable sans authentification",
            "client": "espace client authentifié",
            "hds": "données de santé, plateforme certifiée HDS uniquement, jamais sur le web",
        },
        "phases": ["cadrage", "annonce", "relance", "preparation", "jour-j", "bilan"],
        "documents": docs,
    }
    (RACINE / "manifeste.json").write_text(json.dumps(m, ensure_ascii=False, indent=2))
    print(f"manifeste.json : {len(docs)} documents")


def cmd_manifeste(a):
    ecrire_manifeste()


def cmd_liste(a):
    print(f"{'id':26s} {'accès':8s} {'logo':5s} {'phase':13s} titre")
    print("-" * 108)
    for e in CATALOGUE:
        print(f"{e['id']:26s} {e['acces']:8s} {'oui' if e['logo_client'] else 'non':5s} "
              f"{e['phase']:13s} {e['titre']}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("tout").set_defaults(f=cmd_tout)
    c = sub.add_parser("client"); c.add_argument("nom"); c.add_argument("--logo", required=True)
    c.set_defaults(f=cmd_client)
    sub.add_parser("controles").set_defaults(f=cmd_controles)
    sub.add_parser("manifeste").set_defaults(f=cmd_manifeste)
    sub.add_parser("liste").set_defaults(f=cmd_liste)
    a = ap.parse_args()
    a.f(a)
