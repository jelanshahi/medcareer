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
      employers: {
        Row: {
          ats_config: Json | null
          ats_platform: string | null
          created_at: string
          default_city: string
          facility_type: string | null
          id: string
          is_active: boolean
          name: string
          province: string
          slug: string
          website: string | null
        }
        Insert: {
          ats_config?: Json | null
          ats_platform?: string | null
          created_at?: string
          default_city: string
          facility_type?: string | null
          id?: string
          is_active?: boolean
          name: string
          province: string
          slug: string
          website?: string | null
        }
        Update: {
          ats_config?: Json | null
          ats_platform?: string | null
          created_at?: string
          default_city?: string
          facility_type?: string | null
          id?: string
          is_active?: boolean
          name?: string
          province?: string
          slug?: string
          website?: string | null
        }
        Relationships: []
      }
      expired_slugs: {
        Row: {
          expired_at: string
          slug: string
        }
        Insert: {
          expired_at?: string
          slug: string
        }
        Update: {
          expired_at?: string
          slug?: string
        }
        Relationships: []
      }
      ingest_runs: {
        Row: {
          error: string | null
          fetched: number | null
          finished_at: string | null
          id: string
          inserted: number | null
          source_id: string
          started_at: string
          status: string
          updated: number | null
        }
        Insert: {
          error?: string | null
          fetched?: number | null
          finished_at?: string | null
          id?: string
          inserted?: number | null
          source_id: string
          started_at?: string
          status: string
          updated?: number | null
        }
        Update: {
          error?: string | null
          fetched?: number | null
          finished_at?: string | null
          id?: string
          inserted?: number | null
          source_id?: string
          started_at?: string
          status?: string
          updated?: number | null
        }
        Relationships: []
      }
      job_alerts: {
        Row: {
          category: string | null
          city: string | null
          confirmation_sent_at: string | null
          confirmed_at: string | null
          created_at: string
          last_sent_at: string | null
          email: string
          id: string
          is_active: boolean
          unsubscribe_token: string
        }
        Insert: {
          category?: string | null
          city?: string | null
          confirmation_sent_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          last_sent_at?: string | null
          email: string
          id?: string
          is_active?: boolean
          unsubscribe_token?: string
        }
        Update: {
          category?: string | null
          city?: string | null
          confirmation_sent_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          last_sent_at?: string | null
          email?: string
          id?: string
          is_active?: boolean
          unsubscribe_token?: string
        }
        Relationships: []
      }
      job_sources: {
        Row: {
          job_id: string
          raw_posting_id: string
        }
        Insert: {
          job_id: string
          raw_posting_id: string
        }
        Update: {
          job_id?: string
          raw_posting_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_sources_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_sources_raw_posting_id_fkey"
            columns: ["raw_posting_id"]
            isOneToOne: false
            referencedRelation: "raw_postings"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          apply_url: string
          canonical_source: string
          category: string | null
          city: string
          closes_at: string | null
          created_at: string
          dedupe_key: string
          description: string
          employer_id: string | null
          employer_name: string
          employment_type: string | null
          expires_at: string
          facility_name: string | null
          fingerprint: string
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          noc_code: string | null
          posted_at: string
          province: string
          salary_max: number | null
          salary_min: number | null
          salary_period: string | null
          search_vector: unknown
          shift_type: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          apply_url: string
          canonical_source: string
          category?: string | null
          city: string
          closes_at?: string | null
          created_at?: string
          dedupe_key: string
          description: string
          employer_id?: string | null
          employer_name: string
          employment_type?: string | null
          expires_at: string
          facility_name?: string | null
          fingerprint: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          noc_code?: string | null
          posted_at: string
          province: string
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          search_vector?: unknown
          shift_type?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          apply_url?: string
          canonical_source?: string
          category?: string | null
          city?: string
          closes_at?: string | null
          created_at?: string
          dedupe_key?: string
          description?: string
          employer_id?: string | null
          employer_name?: string
          employment_type?: string | null
          expires_at?: string
          facility_name?: string | null
          fingerprint?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          noc_code?: string | null
          posted_at?: string
          province?: string
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          search_vector?: unknown
          shift_type?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_postings: {
        Row: {
          content_hash: string
          fingerprint: string
          first_seen_at: string
          id: string
          last_seen_at: string
          normalized: Json
          payload: Json
          source_id: string
          source_job_id: string
          source_url: string
        }
        Insert: {
          content_hash: string
          fingerprint: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          normalized: Json
          payload: Json
          source_id: string
          source_job_id: string
          source_url: string
        }
        Update: {
          content_hash?: string
          fingerprint?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          normalized?: Json
          payload?: Json
          source_id?: string
          source_job_id?: string
          source_url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      confirm_job_alert: {
        Args: { token: string }
        Returns: string
      }
      expire_stale_jobs: {
        Args: never
        Returns: {
          hard_expired: number
          unseen_expired: number
        }[]
      }
      purge_expired_jobs: {
        Args: { retention_days?: number }
        Returns: {
          jobs_purged: number
          raw_postings_purged: number
        }[]
      }
      purge_jobs: {
        Args: { max_age_days?: number; retention_days?: number }
        Returns: {
          jobs_purged: number
          raw_postings_purged: number
        }[]
      }
      request_job_alert: {
        Args: { p_email: string; p_token: string }
        Returns: string
      }
      unsubscribe_job_alert: {
        Args: { token: string }
        Returns: string
      }
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
