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
      concrete_attachments: {
        Row: {
          category: string
          content_type: string | null
          created_at: string
          file_name: string
          file_size: number | null
          file_url: string
          id: number
          log_id: number
          storage_path: string
        }
        Insert: {
          category: string
          content_type?: string | null
          created_at?: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: number
          log_id: number
          storage_path: string
        }
        Update: {
          category?: string
          content_type?: string | null
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: number
          log_id?: number
          storage_path?: string
        }
        Relationships: []
      }
      concrete_delivery_testing_records: {
        Row: {
          actual_minutes: string | null
          air_content_percent: string | null
          air_temp_f: string | null
          arrival_time: string | null
          comments: string | null
          concrete_temp_f: string | null
          created_at: string | null
          cubic_yards: string | null
          field_cylinders: string | null
          finish_unload: string | null
          id: number
          j_ring_in: string | null
          lab_cylinders: string | null
          log_id: number | null
          mix_design: string | null
          placement_location: string | null
          set_number: string | null
          slump_in: string | null
          spread_in: string | null
          test_number: string | null
          ticket_number: string | null
          time_batched: string | null
          time_tested: string | null
          total_placed_qty: number | null
          truck_number: string | null
          unit_weight_lbs_ft3: string | null
          water_added_gal: string | null
        }
        Insert: {
          actual_minutes?: string | null
          air_content_percent?: string | null
          air_temp_f?: string | null
          arrival_time?: string | null
          comments?: string | null
          concrete_temp_f?: string | null
          created_at?: string | null
          cubic_yards?: string | null
          field_cylinders?: string | null
          finish_unload?: string | null
          id?: never
          j_ring_in?: string | null
          lab_cylinders?: string | null
          log_id?: number | null
          mix_design?: string | null
          placement_location?: string | null
          set_number?: string | null
          slump_in?: string | null
          spread_in?: string | null
          test_number?: string | null
          ticket_number?: string | null
          time_batched?: string | null
          time_tested?: string | null
          total_placed_qty?: number | null
          truck_number?: string | null
          unit_weight_lbs_ft3?: string | null
          water_added_gal?: string | null
        }
        Update: {
          actual_minutes?: string | null
          air_content_percent?: string | null
          air_temp_f?: string | null
          arrival_time?: string | null
          comments?: string | null
          concrete_temp_f?: string | null
          created_at?: string | null
          cubic_yards?: string | null
          field_cylinders?: string | null
          finish_unload?: string | null
          id?: never
          j_ring_in?: string | null
          lab_cylinders?: string | null
          log_id?: number | null
          mix_design?: string | null
          placement_location?: string | null
          set_number?: string | null
          slump_in?: string | null
          spread_in?: string | null
          test_number?: string | null
          ticket_number?: string | null
          time_batched?: string | null
          time_tested?: string | null
          total_placed_qty?: number | null
          truck_number?: string | null
          unit_weight_lbs_ft3?: string | null
          water_added_gal?: string | null
        }
        Relationships: []
      }
      concrete_specifications: {
        Row: {
          air_content: string | null
          comments: string | null
          concrete_temp: string | null
          created_at: string | null
          id: number
          j_ring: string | null
          log_id: number | null
          mix_no: string | null
          report_time: string | null
          slump: string | null
          speed_of_stress: string | null
          spread: string | null
          unit_weight: string | null
        }
        Insert: {
          air_content?: string | null
          comments?: string | null
          concrete_temp?: string | null
          created_at?: string | null
          id?: never
          j_ring?: string | null
          log_id?: number | null
          mix_no?: string | null
          report_time?: string | null
          slump?: string | null
          speed_of_stress?: string | null
          spread?: string | null
          unit_weight?: string | null
        }
        Update: {
          air_content?: string | null
          comments?: string | null
          concrete_temp?: string | null
          created_at?: string | null
          id?: never
          j_ring?: string | null
          log_id?: number | null
          mix_no?: string | null
          report_time?: string | null
          slump?: string | null
          speed_of_stress?: string | null
          spread?: string | null
          unit_weight?: string | null
        }
        Relationships: []
      }
      concrete_test_log_attachments: {
        Row: {
          content_type: string | null
          created_at: string
          file_name: string
          file_url: string
          id: number
          log_id: number
          row_id: number | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_name: string
          file_url: string
          id?: never
          log_id: number
          row_id?: number | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_name?: string
          file_url?: string
          id?: never
          log_id?: number
          row_id?: number | null
        }
        Relationships: []
      }
      concrete_test_log_rows: {
        Row: {
          actual_minutes: string | null
          air: string | null
          air_temp: string | null
          arrival_time: string | null
          comments: string | null
          concrete_temp: string | null
          created_at: string | null
          cubic_yards: string | null
          field_cylinders: string | null
          finish_unload: string | null
          id: number
          j_ring: string | null
          lab_cylinders: string | null
          log_id: number | null
          set_no: string | null
          slump: string | null
          spread: string | null
          start_placement: string | null
          test_no: string | null
          ticket_no: string | null
          time_batched: string | null
          time_sampled: string | null
          total_placed: string | null
          truck_no: string | null
          unit_weight: string | null
          water_added: string | null
        }
        Insert: {
          actual_minutes?: string | null
          air?: string | null
          air_temp?: string | null
          arrival_time?: string | null
          comments?: string | null
          concrete_temp?: string | null
          created_at?: string | null
          cubic_yards?: string | null
          field_cylinders?: string | null
          finish_unload?: string | null
          id?: never
          j_ring?: string | null
          lab_cylinders?: string | null
          log_id?: number | null
          set_no?: string | null
          slump?: string | null
          spread?: string | null
          start_placement?: string | null
          test_no?: string | null
          ticket_no?: string | null
          time_batched?: string | null
          time_sampled?: string | null
          total_placed?: string | null
          truck_no?: string | null
          unit_weight?: string | null
          water_added?: string | null
        }
        Update: {
          actual_minutes?: string | null
          air?: string | null
          air_temp?: string | null
          arrival_time?: string | null
          comments?: string | null
          concrete_temp?: string | null
          created_at?: string | null
          cubic_yards?: string | null
          field_cylinders?: string | null
          finish_unload?: string | null
          id?: never
          j_ring?: string | null
          lab_cylinders?: string | null
          log_id?: number | null
          set_no?: string | null
          slump?: string | null
          spread?: string | null
          start_placement?: string | null
          test_no?: string | null
          ticket_no?: string | null
          time_batched?: string | null
          time_sampled?: string | null
          total_placed?: string | null
          truck_no?: string | null
          unit_weight?: string | null
          water_added?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "concrete_test_log_rows_concrete_test_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "concrete_test_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concrete_test_log_rows_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "concrete_test_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      concrete_test_logs: {
        Row: {
          air_content_spec: string | null
          batch_plant: string | null
          created_at: string | null
          data_logger: string | null
          date_sampled: string | null
          dfr_number: string | null
          gc: string | null
          gc_rep: string | null
          id: number
          j_ring_spec: string | null
          location: string | null
          max_temp: string | null
          min_temp: string | null
          mix_no_spec: string | null
          project_id: number | null
          project_name: string | null
          project_number: string | null
          slump_spec: string | null
          spread_spec: string | null
          strength_spec: string | null
          sub_contractor: string | null
          time_in: string | null
          time_out: string | null
          total_quantity_placed: string | null
          unit_weight_spec: string | null
          weather: string | null
        }
        Insert: {
          air_content_spec?: string | null
          batch_plant?: string | null
          created_at?: string | null
          data_logger?: string | null
          date_sampled?: string | null
          dfr_number?: string | null
          gc?: string | null
          gc_rep?: string | null
          id?: never
          j_ring_spec?: string | null
          location?: string | null
          max_temp?: string | null
          min_temp?: string | null
          mix_no_spec?: string | null
          project_id?: number | null
          project_name?: string | null
          project_number?: string | null
          slump_spec?: string | null
          spread_spec?: string | null
          strength_spec?: string | null
          sub_contractor?: string | null
          time_in?: string | null
          time_out?: string | null
          total_quantity_placed?: string | null
          unit_weight_spec?: string | null
          weather?: string | null
        }
        Update: {
          air_content_spec?: string | null
          batch_plant?: string | null
          created_at?: string | null
          data_logger?: string | null
          date_sampled?: string | null
          dfr_number?: string | null
          gc?: string | null
          gc_rep?: string | null
          id?: never
          j_ring_spec?: string | null
          location?: string | null
          max_temp?: string | null
          min_temp?: string | null
          mix_no_spec?: string | null
          project_id?: number | null
          project_name?: string | null
          project_number?: string | null
          slump_spec?: string | null
          spread_spec?: string | null
          strength_spec?: string | null
          sub_contractor?: string | null
          time_in?: string | null
          time_out?: string | null
          total_quantity_placed?: string | null
          unit_weight_spec?: string | null
          weather?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          role: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          role?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          role?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          client_name: string
          client_representative: string | null
          created_at: string | null
          id: number
          project_location: string | null
          project_name: string
          project_number: string
          status: string | null
        }
        Insert: {
          client_name: string
          client_representative?: string | null
          created_at?: string | null
          id?: number
          project_location?: string | null
          project_name: string
          project_number: string
          status?: string | null
        }
        Update: {
          client_name?: string
          client_representative?: string | null
          created_at?: string | null
          id?: number
          project_location?: string | null
          project_name?: string
          project_number?: string
          status?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
