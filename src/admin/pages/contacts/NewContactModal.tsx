import { useState } from "react";
import type { ContactType } from "../../types";
import { TYPE_BADGE } from "../../lib/ui-tokens";
import { useAdminData } from "../../data/AdminDataContext";
import { Modal } from "../../components/ui";
import { cn } from "@/lib/utils";

const inputCls =
  "ad-input w-full rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm outline-none transition-colors focus:border-avisdoc-teal";

const TYPES: ContactType[] = ["Requérant", "Expert", "Réseau d'Aval"];

export default function NewContactModal({ onClose }: { onClose: () => void }) {
  const { addContact } = useAdminData();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState<ContactType>("Requérant");

  const save = () => {
    if (!name.trim()) return;
    addContact({ name, email, type });
    onClose();
  };

  return (
    <Modal onClose={onClose} width={440}>
      <h2 className="mb-1 font-display text-[22px] font-semibold text-avisdoc-ink">
        Nouveau contact
      </h2>
      <p className="mb-5 text-[13px] text-muted-foreground">
        Ajouter un professionnel au réseau AvisDoc.
      </p>

      <div className="flex flex-col gap-3.5">
        <input
          className={inputCls}
          placeholder="Nom complet"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={inputCls}
          placeholder="Email professionnel"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="flex gap-2">
          {TYPES.map((t) => {
            const on = type === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "flex-1 rounded-full py-2.5 text-center text-[12.5px] font-bold transition-colors",
                  on ? TYPE_BADGE[t] : "bg-muted/50 text-muted-foreground",
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="ad-btn-outline flex-1 rounded-full border-[1.5px] border-border py-3 text-sm font-bold text-muted-foreground transition-colors"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={save}
          className="ad-btn-accent flex-1 rounded-full bg-avisdoc-teal py-3 text-sm font-bold text-white"
        >
          Enregistrer
        </button>
      </div>
    </Modal>
  );
}
