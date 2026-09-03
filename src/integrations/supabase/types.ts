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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      inventory_audit_log: {
        Row: {
          action: string
          actor_name: string
          actor_role: string
          created_at: string
          detail: string | null
          field_name: string | null
          id: string
          item_code: string | null
          new_value: string | null
          old_value: string | null
          record_label: string | null
          source: string
        }
        Insert: {
          action: string
          actor_name?: string
          actor_role?: string
          created_at?: string
          detail?: string | null
          field_name?: string | null
          id?: string
          item_code?: string | null
          new_value?: string | null
          old_value?: string | null
          record_label?: string | null
          source?: string
        }
        Update: {
          action?: string
          actor_name?: string
          actor_role?: string
          created_at?: string
          detail?: string | null
          field_name?: string | null
          id?: string
          item_code?: string | null
          new_value?: string | null
          old_value?: string | null
          record_label?: string | null
          source?: string
        }
        Relationships: []
      }
      inventory_imports: {
        Row: {
          actor_name: string
          created_at: string
          failure_reason: string | null
          file_name: string
          id: string
          rows_changed: number
          rows_conflicted: number
          rows_new: number
          rows_read: number
          rows_skipped: number
          rows_unchanged: number
          sheet_name: string | null
          status: string
        }
        Insert: {
          actor_name?: string
          created_at?: string
          failure_reason?: string | null
          file_name: string
          id?: string
          rows_changed?: number
          rows_conflicted?: number
          rows_new?: number
          rows_read?: number
          rows_skipped?: number
          rows_unchanged?: number
          sheet_name?: string | null
          status?: string
        }
        Update: {
          actor_name?: string
          created_at?: string
          failure_reason?: string | null
          file_name?: string
          id?: string
          rows_changed?: number
          rows_conflicted?: number
          rows_new?: number
          rows_read?: number
          rows_skipped?: number
          rows_unchanged?: number
          sheet_name?: string | null
          status?: string
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          created_at: string
          id: string
          item_code: string
          month_name: string
          quantity: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_code: string
          month_name: string
          quantity?: number
        }
        Update: {
          created_at?: string
          id?: string
          item_code?: string
          month_name?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_item_code_fkey"
            columns: ["item_code"]
            isOneToOne: false
            referencedRelation: "inventory_master"
            referencedColumns: ["item_code"]
          },
          {
            foreignKeyName: "inventory_movements_item_code_fkey"
            columns: ["item_code"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["item_code"]
          },
        ]
      }
      inventory_products: {
        Row: {
          batch: string | null
          created_at: string
          data_flags: string[]
          expiry_date: string | null
          item_code: string
          item_description: string
          last_updated: string
          monthly_target: number
          notes: string | null
          portfolio: string
          qty_on_hand: number
          unit_cost: number
        }
        Insert: {
          batch?: string | null
          created_at?: string
          data_flags?: string[]
          expiry_date?: string | null
          item_code: string
          item_description: string
          last_updated?: string
          monthly_target?: number
          notes?: string | null
          portfolio?: string
          qty_on_hand?: number
          unit_cost?: number
        }
        Update: {
          batch?: string | null
          created_at?: string
          data_flags?: string[]
          expiry_date?: string | null
          item_code?: string
          item_description?: string
          last_updated?: string
          monthly_target?: number
          notes?: string | null
          portfolio?: string
          qty_on_hand?: number
          unit_cost?: number
        }
        Relationships: []
      }
      inventory_settings: {
        Row: {
          id: boolean
          months_included: number
          updated_at: string
        }
        Insert: {
          id?: boolean
          months_included?: number
          updated_at?: string
        }
        Update: {
          id?: boolean
          months_included?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      inventory_master: {
        Row: {
          avg_monthly_movement: number | null
          batch: string | null
          data_flags: string[] | null
          expiry_date: string | null
          item_code: string | null
          item_description: string | null
          last_updated: string | null
          monthly_target: number | null
          months_holding: number | null
          months_to_expiry: number | null
          movement_status: string | null
          near_expiry: string | null
          notes: string | null
          portfolio: string | null
          priority_score: number | null
          qty_on_hand: number | null
          stock_status: string | null
          stock_value: number | null
          unit_cost: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
