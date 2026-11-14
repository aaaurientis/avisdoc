// Filet de sécurité : une erreur dans un écran n'efface plus tout le Hub (page
// blanche). On affiche ce qui s'est passé, avec de quoi repartir, et le menu reste
// utilisable. L'erreur part aussi dans la console pour le diagnostic.

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props { children: ReactNode; /** Change de valeur → on réessaie (changement d'écran). */ cle?: string }
interface Etat { erreur: Error | null }

export default class FiletErreur extends Component<Props, Etat> {
  state: Etat = { erreur: null };

  static getDerivedStateFromError(erreur: Error): Etat {
    return { erreur };
  }

  componentDidCatch(erreur: Error, info: ErrorInfo) {
    console.error("[Hub] Erreur d'affichage", erreur, info.componentStack);
  }

  componentDidUpdate(avant: Props) {
    if (avant.cle !== this.props.cle && this.state.erreur) this.setState({ erreur: null });
  }

  render() {
    const { erreur } = this.state;
    if (!erreur) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-10 max-w-xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-[14px] text-rose-900">
        <div className="flex items-center gap-2 font-display text-lg font-semibold">
          <AlertTriangle className="size-5" /> Cet écran a rencontré une erreur
        </div>
        <p className="mt-2">Rien n'est perdu : vos données sont enregistrées. Rechargez la page ; si l'erreur revient, transmettez le message ci-dessous.</p>
        <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-white/70 p-3 text-[12px] text-rose-800">{erreur.message}</pre>
        <div className="mt-4 flex gap-3">
          <button type="button" onClick={() => window.location.reload()} className="rounded-full bg-rose-700 px-4 py-2 text-[13px] font-bold text-white">Recharger</button>
          <a href="#/dashboard" onClick={() => this.setState({ erreur: null })} className="rounded-full border border-rose-300 px-4 py-2 text-[13px] font-semibold">Revenir au tableau de bord</a>
        </div>
      </div>
    );
  }
}
