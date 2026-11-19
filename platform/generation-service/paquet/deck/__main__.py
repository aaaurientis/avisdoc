"""Commande deck (depuis paquet/) :

    python3 -m deck extraire  source.pptx  -d dossier/
    python3 -m deck proposer  dossier/deck-brut.json [--modele]
    python3 -m deck generer   dossier/deck.json
    python3 -m deck controles dossier/sortie.pptx dossier/deck.json
    python3 -m deck tout      source.pptx -d dossier/ [--modele] [--fond blanc] [--sans-planche]
    python3 -m deck maitre    [gabarits/deck-avisdoc.pptx]

Le fichier source n'est jamais modifié. Code de sortie non nul si un contrôle est en erreur.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import controles, extraire, generer, maitre, modele, proposer


def _proposer(brut: Path, avec_modele: bool) -> Path:
    sortie = brut.parent / "deck.json"
    if avec_modele:
        _, mode = modele.proposer_modele(brut, sortie)
        print(f"Étape 2 : mode {mode}")
        return sortie
    return proposer.proposer(brut, sortie)


def _controles(sortie: Path, deck: Path, anomalies=None, planche=True) -> int:
    res = controles.executer(sortie, deck, anomalies, avec_planche=planche)
    for c in res.constats:
        print(f"{c.niveau:13} {c.code:22} diapositive {c.diapositive or '—'} : {c.message}")
    print(f"{len(res.erreurs)} erreur(s). Accès : {res.acces}. Rapport : {sortie.parent / 'rapport.md'}")
    return 1 if res.erreurs else 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="deck", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("extraire"); e.add_argument("source", type=Path); e.add_argument("-d", "--dossier", type=Path, required=True)
    p = sub.add_parser("proposer"); p.add_argument("brut", type=Path); p.add_argument("--modele", action="store_true")
    g = sub.add_parser("generer"); g.add_argument("deck", type=Path)
    c = sub.add_parser("controles"); c.add_argument("sortie", type=Path); c.add_argument("deck", type=Path); c.add_argument("--sans-planche", action="store_true")
    t = sub.add_parser("tout"); t.add_argument("source", type=Path); t.add_argument("-d", "--dossier", type=Path, required=True)
    t.add_argument("--modele", action="store_true"); t.add_argument("--fond", choices=["creme", "blanc"]); t.add_argument("--sans-planche", action="store_true")
    m = sub.add_parser("maitre"); m.add_argument("chemin", type=Path, nargs="?", default=Path("gabarits/deck-avisdoc.pptx"))
    a = ap.parse_args(argv)

    if a.cmd == "extraire":
        print(extraire.extraire(a.source, a.dossier)); return 0
    if a.cmd == "proposer":
        print(_proposer(a.brut, a.modele)); return 0
    if a.cmd == "generer":
        try:
            anomalies = generer.generer(a.deck, a.deck.parent / "sortie.pptx")
        except generer.Debordement as err:
            print(f"Génération refusée : {err}", file=sys.stderr); return 2
        (a.deck.parent / "anomalies-generation.json").write_text(json.dumps(anomalies, ensure_ascii=False, indent=2), encoding="utf-8")
        print(a.deck.parent / "sortie.pptx"); return 0
    if a.cmd == "controles":
        f = a.sortie.parent / "anomalies-generation.json"
        return _controles(a.sortie, a.deck, json.loads(f.read_text(encoding="utf-8")) if f.exists() else [], not a.sans_planche)
    if a.cmd == "maitre":
        print(maitre.enregistrer(a.chemin)); return 0
    # tout
    if a.source.resolve().parent == a.dossier.resolve():
        print("Le dossier de travail doit être distinct de celui de la source.", file=sys.stderr); return 2
    brut = extraire.extraire(a.source, a.dossier)
    deck = _proposer(brut, a.modele)
    if a.fond:
        d = json.loads(deck.read_text(encoding="utf-8")); d["meta"]["fond"] = a.fond
        deck.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    try:
        anomalies = generer.generer(deck, a.dossier / "sortie.pptx")
    except generer.Debordement as err:
        print(f"Génération refusée : {err}", file=sys.stderr); return 2
    (a.dossier / "anomalies-generation.json").write_text(json.dumps(anomalies, ensure_ascii=False, indent=2), encoding="utf-8")
    return _controles(a.dossier / "sortie.pptx", deck, anomalies, not a.sans_planche)


if __name__ == "__main__":
    sys.exit(main())
