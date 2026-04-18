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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      account_activities: {
        Row: {
          account_id: string
          activity_type: string
          actor_id: string
          changes: Json
          created_at: string
          id: string
          metadata: Json
          title: string
        }
        Insert: {
          account_id: string
          activity_type: string
          actor_id: string
          changes?: Json
          created_at?: string
          id?: string
          metadata?: Json
          title: string
        }
        Update: {
          account_id?: string
          activity_type?: string
          actor_id?: string
          changes?: Json
          created_at?: string
          id?: string
          metadata?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_activities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_notes: {
        Row: {
          account_id: string
          author_id: string
          contact_date: string | null
          content: string
          created_at: string
          deleted_at: string | null
          duration_minutes: number | null
          id: string
          next_step: string | null
          note_type: string
          outcome: string | null
        }
        Insert: {
          account_id: string
          author_id: string
          contact_date?: string | null
          content: string
          created_at?: string
          deleted_at?: string | null
          duration_minutes?: number | null
          id?: string
          next_step?: string | null
          note_type?: string
          outcome?: string | null
        }
        Update: {
          account_id?: string
          author_id?: string
          contact_date?: string | null
          content?: string
          created_at?: string
          deleted_at?: string | null
          duration_minutes?: number | null
          id?: string
          next_step?: string | null
          note_type?: string
          outcome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_notes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          account_health: string
          account_status: string
          account_type: string
          city: string | null
          country: string | null
          country_code: string | null
          country_name: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          email: string | null
          id: string
          industry: string | null
          name: string
          notes: string | null
          owner: string
          phone: string | null
          source_lead_id: string | null
          state_province: string | null
          tags: string[]
          updated_at: string
          website: string | null
        }
        Insert: {
          account_health?: string
          account_status?: string
          account_type?: string
          city?: string | null
          country?: string | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          name: string
          notes?: string | null
          owner: string
          phone?: string | null
          source_lead_id?: string | null
          state_province?: string | null
          tags?: string[]
          updated_at?: string
          website?: string | null
        }
        Update: {
          account_health?: string
          account_status?: string
          account_type?: string
          city?: string | null
          country?: string | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          name?: string
          notes?: string | null
          owner?: string
          phone?: string | null
          source_lead_id?: string | null
          state_province?: string | null
          tags?: string[]
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_source_lead_id_fkey"
            columns: ["source_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          content_type: string
          created_at: string
          deleted_at: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_size: number
          id: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          content_type: string
          created_at?: string
          deleted_at?: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_size: number
          id?: string
          storage_path: string
          uploaded_by: string
        }
        Update: {
          content_type?: string
          created_at?: string
          deleted_at?: string | null
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_size?: number
          id?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          account_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          email: string | null
          first_name: string
          id: string
          job_title: string | null
          last_name: string
          notes: string | null
          owner: string
          phone: string | null
          secondary_phone: string | null
          source_lead_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          job_title?: string | null
          last_name: string
          notes?: string | null
          owner: string
          phone?: string | null
          secondary_phone?: string | null
          source_lead_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          job_title?: string | null
          last_name?: string
          notes?: string | null
          owner?: string
          phone?: string | null
          secondary_phone?: string | null
          source_lead_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_source_lead_id_fkey"
            columns: ["source_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          created_at: string
          head_user_id: string | null
          id: string
          name: string
          parent_department_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          head_user_id?: string | null
          id?: string
          name: string
          parent_department_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          head_user_id?: string | null
          id?: string
          name?: string
          parent_department_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_parent_department_id_fkey"
            columns: ["parent_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          activity_type: string
          actor_id: string
          changes: Json
          created_at: string
          id: string
          lead_id: string
          metadata: Json
          title: string
        }
        Insert: {
          activity_type: string
          actor_id: string
          changes?: Json
          created_at?: string
          id?: string
          lead_id: string
          metadata?: Json
          title: string
        }
        Update: {
          activity_type?: string
          actor_id?: string
          changes?: Json
          created_at?: string
          id?: string
          lead_id?: string
          metadata?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          author_id: string
          contact_date: string | null
          content: string
          created_at: string
          deleted_at: string | null
          duration_minutes: number | null
          id: string
          lead_id: string
          next_step: string | null
          note_type: string
          outcome: string | null
        }
        Insert: {
          author_id: string
          contact_date?: string | null
          content: string
          created_at?: string
          deleted_at?: string | null
          duration_minutes?: number | null
          id?: string
          lead_id: string
          next_step?: string | null
          note_type?: string
          outcome?: string | null
        }
        Update: {
          author_id?: string
          contact_date?: string | null
          content?: string
          created_at?: string
          deleted_at?: string | null
          duration_minutes?: number | null
          id?: string
          lead_id?: string
          next_step?: string | null
          note_type?: string
          outcome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_saved_views: {
        Row: {
          created_at: string
          filters: Json
          id: string
          is_default: boolean
          is_shared: boolean
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          is_default?: boolean
          is_shared?: boolean
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          is_default?: boolean
          is_shared?: boolean
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_services: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          expiry_date: string
          id: string
          lead_id: string
          service_name: string
          start_date: string | null
          status: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          expiry_date: string
          id?: string
          lead_id: string
          service_name: string
          start_date?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          expiry_date?: string
          id?: string
          lead_id?: string
          service_name?: string
          start_date?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_services_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          city: string | null
          company_name: string
          contact_email: string | null
          contact_name: string
          contact_phone: string | null
          converted_at: string | null
          converted_to_id: string | null
          converted_to_type: string | null
          country: string | null
          country_code: string | null
          country_name: string | null
          created_at: string
          created_by: string
          currency: string
          deleted_at: string | null
          estimated_value: number | null
          expected_close_date: string | null
          id: string
          industry: string | null
          last_contacted_at: string | null
          lost_notes: string | null
          lost_reason_code:
            | Database["public"]["Enums"]["lead_lost_reason"]
            | null
          next_follow_up_at: string | null
          normalized_company: string | null
          normalized_email: string | null
          normalized_phone: string | null
          notes: string | null
          probability_percent: number
          score: number
          score_band: string
          score_updated_at: string | null
          secondary_phone: string | null
          source: string | null
          stage: Database["public"]["Enums"]["lead_stage"]
          state_province: string | null
          status: string
          tags: string[]
          updated_at: string
          website: string | null
          weighted_forecast: number | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          city?: string | null
          company_name: string
          contact_email?: string | null
          contact_name: string
          contact_phone?: string | null
          converted_at?: string | null
          converted_to_id?: string | null
          converted_to_type?: string | null
          country?: string | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string
          created_by: string
          currency?: string
          deleted_at?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          industry?: string | null
          last_contacted_at?: string | null
          lost_notes?: string | null
          lost_reason_code?:
            | Database["public"]["Enums"]["lead_lost_reason"]
            | null
          next_follow_up_at?: string | null
          normalized_company?: string | null
          normalized_email?: string | null
          normalized_phone?: string | null
          notes?: string | null
          probability_percent?: number
          score?: number
          score_band?: string
          score_updated_at?: string | null
          secondary_phone?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          state_province?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          website?: string | null
          weighted_forecast?: number | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          city?: string | null
          company_name?: string
          contact_email?: string | null
          contact_name?: string
          contact_phone?: string | null
          converted_at?: string | null
          converted_to_id?: string | null
          converted_to_type?: string | null
          country?: string | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          deleted_at?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          industry?: string | null
          last_contacted_at?: string | null
          lost_notes?: string | null
          lost_reason_code?:
            | Database["public"]["Enums"]["lead_lost_reason"]
            | null
          next_follow_up_at?: string | null
          normalized_company?: string | null
          normalized_email?: string | null
          normalized_phone?: string | null
          notes?: string | null
          probability_percent?: number
          score?: number
          score_band?: string
          score_updated_at?: string | null
          secondary_phone?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          state_province?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          website?: string | null
          weighted_forecast?: number | null
        }
        Relationships: []
      }
      leave_balances: {
        Row: {
          annual: number
          id: string
          personal: number
          sick: number
          updated_at: string
          used_annual: number
          used_personal: number
          used_sick: number
          user_id: string
          year: number
        }
        Insert: {
          annual?: number
          id?: string
          personal?: number
          sick?: number
          updated_at?: string
          used_annual?: number
          used_personal?: number
          used_sick?: number
          user_id: string
          year?: number
        }
        Update: {
          annual?: number
          id?: string
          personal?: number
          sick?: number
          updated_at?: string
          used_annual?: number
          used_personal?: number
          used_sick?: number
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      leaves: {
        Row: {
          created_at: string
          deleted_at: string | null
          end_date: string
          id: string
          leave_type: string
          reason: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_note: string | null
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          end_date: string
          id?: string
          leave_type?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_note?: string | null
          start_date: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          end_date?: string
          id?: string
          leave_type?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_note?: string | null
          start_date?: string
          status?: string
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
          deleted_at: string | null
          id: string
          sender_id: string
          updated_at: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sender_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sender_id?: string
          updated_at?: string
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
      notifications: {
        Row: {
          body: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_read: boolean
          reference_id: string | null
          reference_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_read?: boolean
          reference_id?: string | null
          reference_type?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_read?: boolean
          reference_id?: string | null
          reference_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      opportunities: {
        Row: {
          account_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          currency: string
          deleted_at: string | null
          estimated_value: number | null
          expected_close_date: string | null
          id: string
          name: string
          notes: string | null
          owner: string
          probability_percent: number
          source_lead_id: string | null
          stage: string
          updated_at: string
          weighted_forecast: number | null
          won_at: string | null
        }
        Insert: {
          account_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by: string
          currency?: string
          deleted_at?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          name: string
          notes?: string | null
          owner: string
          probability_percent?: number
          source_lead_id?: string | null
          stage?: string
          updated_at?: string
          weighted_forecast?: number | null
          won_at?: string | null
        }
        Update: {
          account_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          deleted_at?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner?: string
          probability_percent?: number
          source_lead_id?: string | null
          stage?: string
          updated_at?: string
          weighted_forecast?: number | null
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_source_lead_id_fkey"
            columns: ["source_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          department_id: string | null
          display_name: string | null
          email: string | null
          id: string
          manager_user_id: string | null
          phone: string | null
          status: string
          team_id: string | null
          updated_at: string
          user_id: string
          working_hours: Json | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          department_id?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          manager_user_id?: string | null
          phone?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
          user_id: string
          working_hours?: Json | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          department_id?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          manager_user_id?: string | null
          phone?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
          user_id?: string
          working_hours?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      task_activity_logs: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          new_status: string | null
          note: string | null
          old_status: string | null
          task_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          new_status?: string | null
          note?: string | null
          old_status?: string | null
          task_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          new_status?: string | null
          note?: string | null
          old_status?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          account_id: string | null
          actual_duration: string | null
          assigned_to: string | null
          challenges: string | null
          completed_at: string | null
          completion_notes: string | null
          created_at: string
          created_by: string
          decline_reason: string | null
          description: string | null
          due_date: string | null
          estimated_duration: string | null
          feedback: string | null
          id: string
          mark_done_at: string | null
          mark_done_by: string | null
          mark_undone_at: string | null
          mark_undone_by: string | null
          pinned: boolean
          priority: string
          progress_percent: number
          sort_order: number
          started_at: string | null
          status: string
          task_type: string
          team_id: string | null
          ticket_id: string | null
          title: string
          updated_at: string
          visible_scope: string
        }
        Insert: {
          account_id?: string | null
          actual_duration?: string | null
          assigned_to?: string | null
          challenges?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by: string
          decline_reason?: string | null
          description?: string | null
          due_date?: string | null
          estimated_duration?: string | null
          feedback?: string | null
          id?: string
          mark_done_at?: string | null
          mark_done_by?: string | null
          mark_undone_at?: string | null
          mark_undone_by?: string | null
          pinned?: boolean
          priority?: string
          progress_percent?: number
          sort_order?: number
          started_at?: string | null
          status?: string
          task_type?: string
          team_id?: string | null
          ticket_id?: string | null
          title: string
          updated_at?: string
          visible_scope?: string
        }
        Update: {
          account_id?: string | null
          actual_duration?: string | null
          assigned_to?: string | null
          challenges?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by?: string
          decline_reason?: string | null
          description?: string | null
          due_date?: string | null
          estimated_duration?: string | null
          feedback?: string | null
          id?: string
          mark_done_at?: string | null
          mark_done_by?: string | null
          mark_undone_at?: string | null
          mark_undone_by?: string | null
          pinned?: boolean
          priority?: string
          progress_percent?: number
          sort_order?: number
          started_at?: string | null
          status?: string
          task_type?: string
          team_id?: string | null
          ticket_id?: string | null
          title?: string
          updated_at?: string
          visible_scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: string
          joined_at: string
          team_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          team_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          deleted_at: string | null
          department: string
          id: string
          lead_user_id: string | null
          name: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          department: string
          id?: string
          lead_user_id?: string | null
          name: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          department?: string
          id?: string
          lead_user_id?: string | null
          name?: string
        }
        Relationships: []
      }
      ticket_activities: {
        Row: {
          activity_type: string
          actor_id: string
          changes: Json
          created_at: string
          id: string
          metadata: Json
          ticket_id: string
          title: string
        }
        Insert: {
          activity_type: string
          actor_id: string
          changes?: Json
          created_at?: string
          id?: string
          metadata?: Json
          ticket_id: string
          title: string
        }
        Update: {
          activity_type?: string
          actor_id?: string
          changes?: Json
          created_at?: string
          id?: string
          metadata?: Json
          ticket_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_activities_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          is_redacted: boolean
          redacted_at: string | null
          redacted_by: string | null
          redaction_reason: string | null
          ticket_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          is_redacted?: boolean
          redacted_at?: string | null
          redacted_by?: string | null
          redaction_reason?: string | null
          ticket_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          is_redacted?: boolean
          redacted_at?: string | null
          redacted_by?: string | null
          redaction_reason?: string | null
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          account_id: string | null
          assigned_to: string | null
          closed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          opened_at: string
          priority: Database["public"]["Enums"]["ticket_priority_enum"]
          resolution_summary: string | null
          source_channel: Database["public"]["Enums"]["ticket_source_enum"]
          status: Database["public"]["Enums"]["ticket_status_enum"]
          support_duration_actual_hours: number | null
          support_duration_estimate_hours: number | null
          technical_owner_id: string | null
          ticket_type: Database["public"]["Enums"]["ticket_type_enum"]
          title: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          assigned_to?: string | null
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          opened_at?: string
          priority?: Database["public"]["Enums"]["ticket_priority_enum"]
          resolution_summary?: string | null
          source_channel?: Database["public"]["Enums"]["ticket_source_enum"]
          status?: Database["public"]["Enums"]["ticket_status_enum"]
          support_duration_actual_hours?: number | null
          support_duration_estimate_hours?: number | null
          technical_owner_id?: string | null
          ticket_type?: Database["public"]["Enums"]["ticket_type_enum"]
          title: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          assigned_to?: string | null
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          opened_at?: string
          priority?: Database["public"]["Enums"]["ticket_priority_enum"]
          resolution_summary?: string | null
          source_channel?: Database["public"]["Enums"]["ticket_source_enum"]
          status?: Database["public"]["Enums"]["ticket_status_enum"]
          support_duration_actual_hours?: number | null
          support_duration_estimate_hours?: number | null
          technical_owner_id?: string | null
          ticket_type?: Database["public"]["Enums"]["ticket_type_enum"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_visible_user_ids: {
        Args: { _user_id: string }
        Returns: {
          uid: string
        }[]
      }
      has_leads_access_scoped: {
        Args: { _lead_assigned_to: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_task_access: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      has_ticket_access: {
        Args: { _ticket_id: string; _user_id: string }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "chairman"
        | "vice_president"
        | "hr"
        | "head_of_operations"
        | "operations_employee"
        | "team_development_lead"
        | "developer_employee"
        | "technical_lead"
        | "technical_employee"
        | "head_of_accounting"
        | "accounting_employee"
        | "head_of_marketing"
        | "marketing_employee"
        | "sales_lead"
        | "sales_employee"
        | "driver"
      lead_lost_reason:
        | "competitor"
        | "price_issue"
        | "no_response"
        | "timing"
        | "budget"
        | "invalid"
        | "duplicate"
        | "deprioritized"
        | "other"
      lead_stage:
        | "new"
        | "contacted"
        | "qualified"
        | "proposal"
        | "negotiation"
        | "won"
        | "lost"
      ticket_priority_enum: "low" | "medium" | "high" | "urgent"
      ticket_source_enum:
        | "internal"
        | "client"
        | "email"
        | "phone"
        | "whatsapp"
        | "portal"
        | "other"
      ticket_status_enum:
        | "open"
        | "in_progress"
        | "waiting"
        | "resolved"
        | "closed"
        | "archived"
      ticket_type_enum:
        | "support"
        | "incident"
        | "service_request"
        | "maintenance"
        | "deployment"
        | "bug_fix"
        | "other"
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
      app_role: [
        "chairman",
        "vice_president",
        "hr",
        "head_of_operations",
        "operations_employee",
        "team_development_lead",
        "developer_employee",
        "technical_lead",
        "technical_employee",
        "head_of_accounting",
        "accounting_employee",
        "head_of_marketing",
        "marketing_employee",
        "sales_lead",
        "sales_employee",
        "driver",
      ],
      lead_lost_reason: [
        "competitor",
        "price_issue",
        "no_response",
        "timing",
        "budget",
        "invalid",
        "duplicate",
        "deprioritized",
        "other",
      ],
      lead_stage: [
        "new",
        "contacted",
        "qualified",
        "proposal",
        "negotiation",
        "won",
        "lost",
      ],
      ticket_priority_enum: ["low", "medium", "high", "urgent"],
      ticket_source_enum: [
        "internal",
        "client",
        "email",
        "phone",
        "whatsapp",
        "portal",
        "other",
      ],
      ticket_status_enum: [
        "open",
        "in_progress",
        "waiting",
        "resolved",
        "closed",
        "archived",
      ],
      ticket_type_enum: [
        "support",
        "incident",
        "service_request",
        "maintenance",
        "deployment",
        "bug_fix",
        "other",
      ],
    },
  },
} as const
