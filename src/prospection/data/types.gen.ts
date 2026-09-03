// Types du schéma « prospection », au format de `supabase gen types typescript`.
// Régénérer après toute migration :
//   npm run types:prospection
// (= supabase gen types typescript --project-id fmchuaxxchghfagfpvwn --schema prospection)
// Ce fichier n'est pas édité à la main ; les alias lisibles vivent dans ./types.ts.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  prospection: {
    Tables: {
      compte: {
        Row: {
          cercle: number | null
          cree_le: string
          effectif_max: number | null
          effectif_min: number | null
          expose: boolean
          id: string
          import_id: string | null
          linkedin_url: string | null
          maj_le: string
          nom: string
          region: string | null
          score: number
          secteur: string | null
          site_web: string | null
          statut: Database["prospection"]["Enums"]["statut_compte"]
          type: Database["prospection"]["Enums"]["type_compte"]
        }
        Insert: {
          cercle?: number | null
          cree_le?: string
          effectif_max?: number | null
          effectif_min?: number | null
          expose?: boolean
          id?: string
          import_id?: string | null
          linkedin_url?: string | null
          maj_le?: string
          nom: string
          region?: string | null
          score?: number
          secteur?: string | null
          site_web?: string | null
          statut?: Database["prospection"]["Enums"]["statut_compte"]
          type?: Database["prospection"]["Enums"]["type_compte"]
        }
        Update: {
          cercle?: number | null
          cree_le?: string
          effectif_max?: number | null
          effectif_min?: number | null
          expose?: boolean
          id?: string
          import_id?: string | null
          linkedin_url?: string | null
          maj_le?: string
          nom?: string
          region?: string | null
          score?: number
          secteur?: string | null
          site_web?: string | null
          statut?: Database["prospection"]["Enums"]["statut_compte"]
          type?: Database["prospection"]["Enums"]["type_compte"]
        }
        Relationships: [
          {
            foreignKeyName: "compte_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "import"
            referencedColumns: ["id"]
          },
        ]
      }
      contact: {
        Row: {
          anciennete_poste_mois: number | null
          compte_id: string | null
          cree_le: string
          email: string | null
          fonction: string | null
          id: string
          import_id: string | null
          jeton_opposition: string
          linkedin_url: string | null
          maj_le: string
          niveau: Database["prospection"]["Enums"]["niveau_contact"] | null
          nom: string
          prenom: string
          score: number
          signaux: Json
          statut: Database["prospection"]["Enums"]["statut_contact"]
        }
        Insert: {
          anciennete_poste_mois?: number | null
          compte_id?: string | null
          cree_le?: string
          email?: string | null
          fonction?: string | null
          id?: string
          import_id?: string | null
          jeton_opposition?: string
          linkedin_url?: string | null
          maj_le?: string
          niveau?: Database["prospection"]["Enums"]["niveau_contact"] | null
          nom: string
          prenom?: string
          score?: number
          signaux?: Json
          statut?: Database["prospection"]["Enums"]["statut_contact"]
        }
        Update: {
          anciennete_poste_mois?: number | null
          compte_id?: string | null
          cree_le?: string
          email?: string | null
          fonction?: string | null
          id?: string
          import_id?: string | null
          jeton_opposition?: string
          linkedin_url?: string | null
          maj_le?: string
          niveau?: Database["prospection"]["Enums"]["niveau_contact"] | null
          nom?: string
          prenom?: string
          score?: number
          signaux?: Json
          statut?: Database["prospection"]["Enums"]["statut_contact"]
        }
        Relationships: [
          {
            foreignKeyName: "contact_compte_id_fkey"
            columns: ["compte_id"]
            isOneToOne: false
            referencedRelation: "compte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "import"
            referencedColumns: ["id"]
          },
        ]
      }
      exclusion: {
        Row: {
          cree_le: string
          email: string | null
          id: string
          linkedin_url: string | null
          motif: Database["prospection"]["Enums"]["motif_exclusion"]
        }
        Insert: {
          cree_le?: string
          email?: string | null
          id?: string
          linkedin_url?: string | null
          motif: Database["prospection"]["Enums"]["motif_exclusion"]
        }
        Update: {
          cree_le?: string
          email?: string | null
          id?: string
          linkedin_url?: string | null
          motif?: Database["prospection"]["Enums"]["motif_exclusion"]
        }
        Relationships: []
      }
      import: {
        Row: {
          detail_ignorees: Json
          fichier_nom: string
          id: string
          importe_le: string
          importe_par: string
          libelle_liste: string
          lignes_creees: number
          lignes_ignorees: number
          lignes_lues: number
          lignes_maj: number
        }
        Insert: {
          detail_ignorees?: Json
          fichier_nom: string
          id?: string
          importe_le?: string
          importe_par?: string
          libelle_liste: string
          lignes_creees?: number
          lignes_ignorees?: number
          lignes_lues?: number
          lignes_maj?: number
        }
        Update: {
          detail_ignorees?: Json
          fichier_nom?: string
          id?: string
          importe_le?: string
          importe_par?: string
          libelle_liste?: string
          lignes_creees?: number
          lignes_ignorees?: number
          lignes_lues?: number
          lignes_maj?: number
        }
        Relationships: []
      }
      interaction: {
        Row: {
          canal: Database["prospection"]["Enums"]["canal"]
          contact_id: string
          contenu: string
          cree_le: string
          cree_par: string
          email_message_id: string | null
          email_thread_id: string | null
          id: string
          objet: string | null
          sens: Database["prospection"]["Enums"]["sens"]
          survenu_le: string
          traitee_le: string | null
          type: Database["prospection"]["Enums"]["type_interaction"]
        }
        Insert: {
          canal: Database["prospection"]["Enums"]["canal"]
          contact_id: string
          contenu?: string
          cree_le?: string
          cree_par?: string
          email_message_id?: string | null
          email_thread_id?: string | null
          id?: string
          objet?: string | null
          sens: Database["prospection"]["Enums"]["sens"]
          survenu_le?: string
          traitee_le?: string | null
          type: Database["prospection"]["Enums"]["type_interaction"]
        }
        Update: {
          canal?: Database["prospection"]["Enums"]["canal"]
          contact_id?: string
          contenu?: string
          cree_le?: string
          cree_par?: string
          email_message_id?: string | null
          email_thread_id?: string | null
          id?: string
          objet?: string | null
          sens?: Database["prospection"]["Enums"]["sens"]
          survenu_le?: string
          traitee_le?: string | null
          type?: Database["prospection"]["Enums"]["type_interaction"]
        }
        Relationships: [
          {
            foreignKeyName: "interaction_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
        ]
      }
      journal: {
        Row: {
          acteur: string
          detail: Json
          evenement: string
          id: string
          survenu_le: string
        }
        Insert: {
          acteur?: string
          detail?: Json
          evenement: string
          id?: string
          survenu_le?: string
        }
        Update: {
          acteur?: string
          detail?: Json
          evenement?: string
          id?: string
          survenu_le?: string
        }
        Relationships: []
      }
      relance: {
        Row: {
          contact_id: string
          cree_le: string
          du_le: string
          echeance: Database["prospection"]["Enums"]["echeance"]
          etat: Database["prospection"]["Enums"]["etat_relance"]
          id: string
          interaction_id: string | null
        }
        Insert: {
          contact_id: string
          cree_le?: string
          du_le: string
          echeance: Database["prospection"]["Enums"]["echeance"]
          etat?: Database["prospection"]["Enums"]["etat_relance"]
          id?: string
          interaction_id?: string | null
        }
        Update: {
          contact_id?: string
          cree_le?: string
          du_le?: string
          echeance?: Database["prospection"]["Enums"]["echeance"]
          etat?: Database["prospection"]["Enums"]["etat_relance"]
          id?: string
          interaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "relance_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relance_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "interaction"
            referencedColumns: ["id"]
          },
        ]
      }
      synthese_hebdo: {
        Row: {
          acceptations: number
          conversations_ouvertes: number
          genere_le: string
          id: string
          invitations: number
          par_cercle: Json
          partenariats: number
          relances_oubliees: number
          semaine: string
          taux_acceptation: number | null
        }
        Insert: {
          acceptations?: number
          conversations_ouvertes?: number
          genere_le?: string
          id?: string
          invitations?: number
          par_cercle?: Json
          partenariats?: number
          relances_oubliees?: number
          semaine: string
          taux_acceptation?: number | null
        }
        Update: {
          acceptations?: number
          conversations_ouvertes?: number
          genere_le?: string
          id?: string
          invitations?: number
          par_cercle?: Json
          partenariats?: number
          relances_oubliees?: number
          semaine?: string
          taux_acceptation?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      v_par_cercle: {
        Row: {
          cercle: number | null
          nombre: number | null
          statut: Database["prospection"]["Enums"]["statut_contact"] | null
        }
        Relationships: []
      }
      v_relances_a_faire: {
        Row: {
          cercle: number | null
          compte_nom: string | null
          contact_id: string | null
          du_le: string | null
          echeance: Database["prospection"]["Enums"]["echeance"] | null
          etat: Database["prospection"]["Enums"]["etat_relance"] | null
          fonction: string | null
          id: string | null
          linkedin_url: string | null
          nom: string | null
          prenom: string | null
          retard_jours: number | null
          score: number | null
          statut: Database["prospection"]["Enums"]["statut_contact"] | null
        }
        Relationships: []
      }
      v_reponses_non_traitees: {
        Row: {
          canal: Database["prospection"]["Enums"]["canal"] | null
          cercle: number | null
          compte_nom: string | null
          contact_id: string | null
          contenu: string | null
          fonction: string | null
          id: string | null
          nom: string | null
          objet: string | null
          prenom: string | null
          statut: Database["prospection"]["Enums"]["statut_contact"] | null
          survenu_le: string | null
          type: Database["prospection"]["Enums"]["type_interaction"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      acteur: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      ajouter_note: {
        Args: {
          p_canal: Database["prospection"]["Enums"]["canal"]
          p_contact_id: string
          p_contenu: string
        }
        Returns: string
      }
      enregistrer_reponse: {
        Args: {
          p_canal: Database["prospection"]["Enums"]["canal"]
          p_contact_id: string
          p_contenu?: string
          p_email_message_id?: string
          p_email_thread_id?: string
          p_objet?: string
          p_survenu_le?: string
        }
        Returns: Json
      }
      est_membre: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      est_membre_ou_service: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      generer_synthese_hebdo: {
        Args: { p_lundi?: string }
        Returns: {
          acceptations: number
          conversations_ouvertes: number
          genere_le: string
          id: string
          invitations: number
          par_cercle: Json
          partenariats: number
          relances_oubliees: number
          semaine: string
          taux_acceptation: number | null
        }
      }
      importer: {
        Args: {
          p_ecrire?: boolean
          p_fichier: string
          p_libelle: string
          p_lignes: Json
        }
        Returns: Json
      }
      importer_compte: {
        Args: { p: Json; p_import_id: string }
        Returns: string
      }
      invitations_du_jour: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      marquer_envoye: {
        Args: {
          p_contact_id: string
          p_contenu: string
          p_survenu_le?: string
          p_type: Database["prospection"]["Enums"]["type_interaction"]
        }
        Returns: Json
      }
      marquer_traitee: {
        Args: { p_interaction_id: string }
        Returns: undefined
      }
      normaliser_email: {
        Args: { p: string }
        Returns: string
      }
      normaliser_linkedin: {
        Args: { p: string }
        Returns: string
      }
      opposition: {
        Args: { p_jeton: string }
        Returns: boolean
      }
      plafond_invitations: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      purger_inactifs: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      transition_autorisee: {
        Args: {
          p_de: Database["prospection"]["Enums"]["statut_contact"]
          p_vers: Database["prospection"]["Enums"]["statut_contact"]
        }
        Returns: boolean
      }
      transition_contact: {
        Args: {
          p_contact_id: string
          p_vers: Database["prospection"]["Enums"]["statut_contact"]
        }
        Returns: Database["prospection"]["Enums"]["statut_contact"]
      }
      valider_signaux: {
        Args: { p: Json }
        Returns: boolean
      }
    }
    Enums: {
      canal: "linkedin" | "email" | "telephone" | "salon"
      echeance: "j5" | "j12" | "j21"
      etat_relance: "en_attente" | "fait" | "annule"
      motif_exclusion: "opposition" | "client_existant" | "portefeuille_tiers" | "autre"
      niveau_contact: "associe" | "directeur" | "vp" | "responsable" | "charge"
      sens: "sortant" | "entrant"
      statut_compte: "a_qualifier" | "cible" | "ecarte"
      statut_contact:
        | "a_qualifier"
        | "a_contacter"
        | "invite"
        | "accepte"
        | "en_conversation"
        | "partenaire"
        | "refus"
        | "arrete"
      type_compte:
        | "courtier"
        | "qvct"
        | "evenementiel"
        | "entreprise"
        | "mutuelle"
        | "grossiste"
      type_interaction:
        | "invitation"
        | "message_valeur"
        | "partage_contenu"
        | "proposition"
        | "reponse"
        | "note"
        | "email"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export const Constants = {
  prospection: {
    Enums: {
      canal: ["linkedin", "email", "telephone", "salon"],
      echeance: ["j5", "j12", "j21"],
      etat_relance: ["en_attente", "fait", "annule"],
      motif_exclusion: ["opposition", "client_existant", "portefeuille_tiers", "autre"],
      niveau_contact: ["associe", "directeur", "vp", "responsable", "charge"],
      sens: ["sortant", "entrant"],
      statut_compte: ["a_qualifier", "cible", "ecarte"],
      statut_contact: [
        "a_qualifier",
        "a_contacter",
        "invite",
        "accepte",
        "en_conversation",
        "partenaire",
        "refus",
        "arrete",
      ],
      type_compte: ["courtier", "qvct", "evenementiel", "entreprise", "mutuelle", "grossiste"],
      type_interaction: [
        "invitation",
        "message_valeur",
        "partage_contenu",
        "proposition",
        "reponse",
        "note",
        "email",
      ],
    },
  },
} as const
