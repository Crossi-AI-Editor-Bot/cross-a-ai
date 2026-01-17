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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_folders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          path: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          path: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          path?: string
        }
        Relationships: []
      }
      advent_claims: {
        Row: {
          claimed_at: string
          credits_awarded: number
          day_number: number
          id: string
          user_id: string
          year: number
        }
        Insert: {
          claimed_at?: string
          credits_awarded: number
          day_number: number
          id?: string
          user_id: string
          year?: number
        }
        Update: {
          claimed_at?: string
          credits_awarded?: number
          day_number?: number
          id?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      model_costs: {
        Row: {
          bronze_access: boolean
          copper_access: boolean
          cost: number
          diamond_access: boolean
          enabled: boolean
          folder: string | null
          gold_access: boolean
          id: string
          image_cost: number | null
          label: string
          model_id: string
          platinum_access: boolean
          public_access: boolean
          silver_access: boolean
          system_prompt: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bronze_access?: boolean
          copper_access?: boolean
          cost: number
          diamond_access?: boolean
          enabled?: boolean
          folder?: string | null
          gold_access?: boolean
          id?: string
          image_cost?: number | null
          label: string
          model_id: string
          platinum_access?: boolean
          public_access?: boolean
          silver_access?: boolean
          system_prompt?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bronze_access?: boolean
          copper_access?: boolean
          cost?: number
          diamond_access?: boolean
          enabled?: boolean
          folder?: string | null
          gold_access?: boolean
          id?: string
          image_cost?: number | null
          label?: string
          model_id?: string
          platinum_access?: boolean
          public_access?: boolean
          silver_access?: boolean
          system_prompt?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          created_at: string
          credits: number
          id: string
          last_reset_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits?: number
          id?: string
          last_reset_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits?: number
          id?: string
          last_reset_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_image_credits: {
        Row: {
          created_at: string
          credits: number
          id: string
          last_reset_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits?: number
          id?: string
          last_reset_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits?: number
          id?: string
          last_reset_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vip_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          requested_tier: Database["public"]["Enums"]["vip_tier"]
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
          user_message: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          requested_tier: Database["public"]["Enums"]["vip_tier"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
          user_message?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          requested_tier?: Database["public"]["Enums"]["vip_tier"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
          user_message?: string | null
        }
        Relationships: []
      }
      vip_status: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          tier: Database["public"]["Enums"]["vip_tier"]
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          tier?: Database["public"]["Enums"]["vip_tier"]
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          tier?: Database["public"]["Enums"]["vip_tier"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      reset_daily_credits: { Args: { p_user_id: string }; Returns: undefined }
      reset_weekly_image_credits: {
        Args: { p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
      vip_tier: "copper" | "bronze" | "silver" | "gold" | "platinum" | "diamond"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      vip_tier: ["copper", "bronze", "silver", "gold", "platinum", "diamond"],
    },
  },
} as const
