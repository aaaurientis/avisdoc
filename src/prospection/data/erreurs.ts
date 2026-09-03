// Erreur nommée de la couche data : code serveur (raise exception 'code') + détail.
export class ErreurRepo extends Error {
  constructor(public readonly code: string, message: string, public readonly detail?: string) {
    super(message);
    this.name = "ErreurRepo";
  }
}
