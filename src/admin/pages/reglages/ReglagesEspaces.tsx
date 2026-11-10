// Admin › Réglages › CRM et Veille : pour chaque espace, qui en reçoit les mails et le Weekly (Olivier, 09/11).
// Qui voit chaque CRM se règle dans Admin › Droits d'accès, une case par CRM.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card } from "../../components/ui";
import { listerCollaborateurs, listerMembres, reglerMembre, type Espace, type Membre } from "../../lib/espaces";

const cle = (espace: Espace, email: string) => `${espace}|${email}`;
type Champ = "recoit_mails" | "recoit_weekly";
const DIT: Record<Champ, [string, string]> = {
  recoit_mails: ["reçoit les mails", "ne reçoit plus les mails"], recoit_weekly: ["reçoit le Weekly", "ne reçoit plus le Weekly"],
};

export default function ReglagesEspaces({ espaces, explication }: { espaces: { espace: Espace; label: string }[]; explication: string }) {
  const [gens, setGens] = useState<string[] | null>(null);
  const [membres, setMembres] = useState<Map<string, Membre>>(new Map());
  const [enCours, setEnCours] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([listerCollaborateurs(), listerMembres()]).then(([c, m]) => {
      setMembres(new Map(m.map((x) => [cle(x.espace, x.email), x])));
      // Les collaborateurs, plus ceux déjà réglés qui ne seraient plus dans la liste.
      setGens([...new Set([...c, ...m.map((x) => x.email)])].sort());
    }, (err) => {
      toast.error(err instanceof Error ? err.message : "Les réglages n'ont pas pu être lus.");
      setGens([]);
    });
  }, []);

  const etat = (espace: Espace, email: string): Membre => membres.get(cle(espace, email)) ?? { espace, email, voit: true, recoit_mails: false, recoit_weekly: false };

  const changer = async (m: Membre, champ: Champ, valeur: boolean) => {
    // Toute la ligne attend la fin de l'enregistrement : deux clics rapprochés ne s'écrasent pas.
    const k = cle(m.espace, m.email);
    if (enCours.has(k)) return;
    const nouveau = { ...m, [champ]: valeur };
    setEnCours((s) => new Set(s).add(k));
    try {
      await reglerMembre(nouveau);
      setMembres((x) => new Map(x).set(cle(m.espace, m.email), nouveau));
      toast.success(`Enregistré : ${m.email}, ${DIT[champ][valeur ? 0 : 1]}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Le réglage n'a pas été enregistré.");
    } finally {
      setEnCours((s) => { const n = new Set(s); n.delete(k); return n; });
    }
  };

  if (gens === null) {
    return <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin text-avisdoc-teal" /> Chargement…</div>;
  }

  const Case = ({ m, champ }: { m: Membre; champ: Champ }) => {
    const occupe = enCours.has(cle(m.espace, m.email));
    return (
      <td className="px-4 py-2 text-center">
        {occupe ? <Loader2 className="mx-auto size-4 animate-spin text-avisdoc-teal" /> : (
          <input type="checkbox" checked={m[champ]} onChange={(e) => changer(m, champ, e.target.checked)} className="size-4 cursor-pointer accent-avisdoc-teal" aria-label={DIT[champ][0]} />
        )}
      </td>
    );
  };

  return (
    <div className="flex max-w-[760px] flex-col gap-4">
      <p className="text-[13px] text-muted-foreground">{explication}</p>
      {/* Gemini, 09/11 : le passage de l'ancien envoi aux cases doit se voir avant le premier clic. */}
      <p className="rounded-xl border-2 border-avisdoc-ink/20 bg-muted/40 px-4 py-2.5 text-[13px] text-avisdoc-ink">
        {![...membres.values()].some((x) => x.espace !== "crm:synthese")
          ? <><b>Aujourd'hui, rien n'est réglé ici :</b> les mails de veille partent comme avant. Dès la première case touchée (CRM ou Veille), ce sont ces cases qui décident pour tous les CRM et la Veille Marché : seuls les cochés recevront les mails et le Weekly.</>
          : <><b>Ces cases décident :</b> pour tous les CRM et la Veille Marché, seuls les cochés reçoivent les mails, et le Weekly de chaque CRM part à ceux qui ont « Reçoit le Weekly ».</>}
      </p>
      {!gens.length && <p className="text-sm text-muted-foreground">Aucun collaborateur : ils se déclarent dans Admin › Droits d'accès.</p>}
      {gens.length > 0 && espaces.map(({ espace, label }) => (
        <Card key={espace} className="overflow-hidden">
          <h2 className="border-b border-border px-5 py-3 font-display text-lg font-semibold text-avisdoc-ink">{label}</h2>
          <table className="w-full text-sm">
            <thead className="text-[12px] text-muted-foreground">
              <tr>
                <th className="px-5 py-2 text-left font-semibold">Collaborateur</th>
                <th className="w-36 px-4 py-2 font-semibold">Reçoit les mails</th>
                <th className="w-36 px-4 py-2 font-semibold">Reçoit le Weekly</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {gens.map((email) => {
                const m = etat(espace, email);
                return (
                  <tr key={email}>
                    <td className="px-5 py-2 font-semibold text-avisdoc-ink">{email}</td>
                    <Case m={m} champ="recoit_mails" />
                    <Case m={m} champ="recoit_weekly" />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}
