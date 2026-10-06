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
      admin_audit_logs: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      admin_broadcasts: {
        Row: {
          admin_id: string
          audience: string
          created_at: string
          id: string
          message: string
          recipient_count: number
        }
        Insert: {
          admin_id: string
          audience: string
          created_at?: string
          id?: string
          message: string
          recipient_count: number
        }
        Update: {
          admin_id?: string
          audience?: string
          created_at?: string
          id?: string
          message?: string
          recipient_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "admin_broadcasts_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      booking_assignments: {
        Row: {
          assigned_at: string
          assignment_version: number
          booking_id: string
          professional_id: string
        }
        Insert: {
          assigned_at?: string
          assignment_version: number
          booking_id: string
          professional_id: string
        }
        Update: {
          assigned_at?: string
          assignment_version?: number
          booking_id?: string
          professional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_assignments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["professional_id"]
          },
        ]
      }
      booking_disputes: {
        Row: {
          booking_id: string
          client_id: string
          created_at: string
          id: string
          reason: string
          resolution: string
          resolved_at: string | null
          status: string
        }
        Insert: {
          booking_id: string
          client_id: string
          created_at?: string
          id?: string
          reason: string
          resolution?: string
          resolved_at?: string | null
          status?: string
        }
        Update: {
          booking_id?: string
          client_id?: string
          created_at?: string
          id?: string
          reason?: string
          resolution?: string
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_disputes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_disputes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      booking_status_events: {
        Row: {
          booking_id: string
          changed_by: string | null
          created_at: string
          id: number
          note: string | null
          status: Database["public"]["Enums"]["booking_status"]
        }
        Insert: {
          booking_id: string
          changed_by?: string | null
          created_at?: string
          id?: never
          note?: string | null
          status: Database["public"]["Enums"]["booking_status"]
        }
        Update: {
          booking_id?: string
          changed_by?: string | null
          created_at?: string
          id?: never
          note?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_status_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_status_events_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      booking_tracking: {
        Row: {
          accuracy_meters: number | null
          booking_id: string
          heading: number | null
          latitude: number
          longitude: number
          professional_id: string
          recorded_at: string
          speed_mps: number | null
          updated_at: string
        }
        Insert: {
          accuracy_meters?: number | null
          booking_id: string
          heading?: number | null
          latitude: number
          longitude: number
          professional_id: string
          recorded_at: string
          speed_mps?: number | null
          updated_at?: string
        }
        Update: {
          accuracy_meters?: number | null
          booking_id?: string
          heading?: number | null
          latitude?: number
          longitude?: number
          professional_id?: string
          recorded_at?: string
          speed_mps?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_tracking_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_tracking_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      bookings: {
        Row: {
          accept_by: string
          accepted_at: string | null
          address_detail: string
          address_label: string
          address_zone: string
          arrived_at: string | null
          assignment_version: number
          cancellation_policy: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: Database["public"]["Enums"]["account_role"] | null
          client_id: string
          client_request_id: string
          commission_rate_bps: number
          completed_at: string | null
          created_at: string
          duration_minutes: number
          female_only: boolean
          id: string
          latitude: number | null
          longitude: number | null
          payment_method: Database["public"]["Enums"]["booking_payment_method"]
          payment_plan: string
          professional_id: string
          scheduled_start: string
          service_id: string
          service_name: string
          service_price: number
          started_at: string | null
          status: Database["public"]["Enums"]["booking_status"]
          total: number | null
          travel_fee: number
          travel_started_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          accept_by?: string
          accepted_at?: string | null
          address_detail: string
          address_label: string
          address_zone: string
          arrived_at?: string | null
          assignment_version?: number
          cancellation_policy?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: Database["public"]["Enums"]["account_role"] | null
          client_id: string
          client_request_id: string
          commission_rate_bps?: number
          completed_at?: string | null
          created_at?: string
          duration_minutes: number
          female_only?: boolean
          id?: string
          latitude?: number | null
          longitude?: number | null
          payment_method: Database["public"]["Enums"]["booking_payment_method"]
          payment_plan?: string
          professional_id: string
          scheduled_start: string
          service_id: string
          service_name: string
          service_price: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          total?: number | null
          travel_fee: number
          travel_started_at?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          accept_by?: string
          accepted_at?: string | null
          address_detail?: string
          address_label?: string
          address_zone?: string
          arrived_at?: string | null
          assignment_version?: number
          cancellation_policy?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: Database["public"]["Enums"]["account_role"] | null
          client_id?: string
          client_request_id?: string
          commission_rate_bps?: number
          completed_at?: string | null
          created_at?: string
          duration_minutes?: number
          female_only?: boolean
          id?: string
          latitude?: number | null
          longitude?: number | null
          payment_method?: Database["public"]["Enums"]["booking_payment_method"]
          payment_plan?: string
          professional_id?: string
          scheduled_start?: string
          service_id?: string
          service_name?: string
          service_price?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          total?: number | null
          travel_fee?: number
          travel_started_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "bookings_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "professional_services"
            referencedColumns: ["id"]
          },
        ]
      }
      client_addresses: {
        Row: {
          address_detail: string
          client_id: string
          created_at: string
          id: string
          is_default: boolean
          label: string
          latitude: number | null
          longitude: number | null
          updated_at: string
          zone_id: string
        }
        Insert: {
          address_detail: string
          client_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          label: string
          latitude?: number | null
          longitude?: number | null
          updated_at?: string
          zone_id: string
        }
        Update: {
          address_detail?: string
          client_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          latitude?: number | null
          longitude?: number | null
          updated_at?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_addresses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "client_addresses_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      client_identity_documents: {
        Row: {
          client_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["client_identity_document_kind"]
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["professional_document_status"]
          storage_path: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["client_identity_document_kind"]
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["professional_document_status"]
          storage_path: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["client_identity_document_kind"]
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["professional_document_status"]
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_identity_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "client_identity_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      client_identity_verifications: {
        Row: {
          client_id: string
          fayda_last_four: string | null
          verification_method: string
          verified_at: string
        }
        Insert: {
          client_id: string
          fayda_last_four?: string | null
          verification_method?: string
          verified_at?: string
        }
        Update: {
          client_id?: string
          fayda_last_four?: string | null
          verification_method?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_identity_verifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      device_registrations: {
        Row: {
          active: boolean
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      domain_event_outbox: {
        Row: {
          aggregate_id: string
          aggregate_type: string
          aggregate_version: number
          attempts: number
          available_at: string
          causation_id: string | null
          correlation_id: string
          created_at: string
          event_id: string
          event_type: string
          last_error: string | null
          locked_by: string | null
          locked_until: string | null
          occurred_at: string
          payload: Json
          processed_at: string | null
          schema_version: number
          status: string
        }
        Insert: {
          aggregate_id: string
          aggregate_type: string
          aggregate_version: number
          attempts?: number
          available_at?: string
          causation_id?: string | null
          correlation_id: string
          created_at?: string
          event_id?: string
          event_type: string
          last_error?: string | null
          locked_by?: string | null
          locked_until?: string | null
          occurred_at: string
          payload?: Json
          processed_at?: string | null
          schema_version: number
          status?: string
        }
        Update: {
          aggregate_id?: string
          aggregate_type?: string
          aggregate_version?: number
          attempts?: number
          available_at?: string
          causation_id?: string | null
          correlation_id?: string
          created_at?: string
          event_id?: string
          event_type?: string
          last_error?: string | null
          locked_by?: string | null
          locked_until?: string | null
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
          schema_version?: number
          status?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          client_id: string
          created_at: string
          professional_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          professional_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          professional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "favorites_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["professional_id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          account: string
          amount: number
          booking_id: string
          created_at: string
          entry_group: string
          id: string
          payment_intent_id: string
        }
        Insert: {
          account: string
          amount: number
          booking_id: string
          created_at?: string
          entry_group: string
          id?: string
          payment_intent_id: string
        }
        Update: {
          account?: string
          amount?: number
          booking_id?: string
          created_at?: string
          entry_group?: string
          id?: string
          payment_intent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempt: number
          created_at: string
          error_message: string | null
          id: string
          outbox_id: string
          provider_reference: string | null
          status: string
        }
        Insert: {
          attempt: number
          created_at?: string
          error_message?: string | null
          id?: string
          outbox_id: string
          provider_reference?: string | null
          status: string
        }
        Update: {
          attempt?: number
          created_at?: string
          error_message?: string | null
          id?: string
          outbox_id?: string
          provider_reference?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "notification_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          id: string
          idempotency_key: string
          next_attempt_at: string
          payload: Json
          push_destination: string | null
          push_ticket: string | null
          push_ticket_started_at: string | null
          read_at: string | null
          status: string
          template: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          channel: string
          created_at?: string
          id?: string
          idempotency_key: string
          next_attempt_at?: string
          payload?: Json
          push_destination?: string | null
          push_ticket?: string | null
          push_ticket_started_at?: string | null
          read_at?: string | null
          status?: string
          template: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          next_attempt_at?: string
          payload?: Json
          push_destination?: string | null
          push_ticket?: string | null
          push_ticket_started_at?: string | null
          read_at?: string | null
          status?: string
          template?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          booking_updates: boolean
          chat_messages: boolean
          client_id: string
          promotions: boolean
          sms_reminders: boolean
          updated_at: string
        }
        Insert: {
          booking_updates?: boolean
          chat_messages?: boolean
          client_id: string
          promotions?: boolean
          sms_reminders?: boolean
          updated_at?: string
        }
        Update: {
          booking_updates?: boolean
          chat_messages?: boolean
          client_id?: string
          promotions?: boolean
          sms_reminders?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      payment_events: {
        Row: {
          created_at: string
          event_id: string
          event_type: string
          payload_hash: string
          payment_intent_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          event_type: string
          payload_hash: string
          payment_intent_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          event_type?: string
          payload_hash?: string
          payment_intent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_intents: {
        Row: {
          amount: number
          attempt: number
          booking_id: string
          checkout_url: string | null
          client_id: string
          created_at: string
          currency: string
          id: string
          provider: Database["public"]["Enums"]["booking_payment_method"]
          provider_reference: string
          refunded_amount: number
          stage: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          version: number
        }
        Insert: {
          amount: number
          attempt?: number
          booking_id: string
          checkout_url?: string | null
          client_id: string
          created_at?: string
          currency?: string
          id?: string
          provider: Database["public"]["Enums"]["booking_payment_method"]
          provider_reference: string
          refunded_amount?: number
          stage?: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          amount?: number
          attempt?: number
          booking_id?: string
          checkout_url?: string | null
          client_id?: string
          created_at?: string
          currency?: string
          id?: string
          provider?: Database["public"]["Enums"]["booking_payment_method"]
          provider_reference?: string
          refunded_amount?: number
          stage?: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_intents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      payout_batches: {
        Row: {
          amount: number
          booking_count: number
          created_at: string
          id: string
          paid_at: string | null
          professional_id: string
          status: Database["public"]["Enums"]["payout_status"]
          version: number
        }
        Insert: {
          amount: number
          booking_count: number
          created_at?: string
          id?: string
          paid_at?: string | null
          professional_id: string
          status?: Database["public"]["Enums"]["payout_status"]
          version?: number
        }
        Update: {
          amount?: number
          booking_count?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          professional_id?: string
          status?: Database["public"]["Enums"]["payout_status"]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "payout_batches_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["professional_id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          value_integer: number
        }
        Insert: {
          key: string
          updated_at?: string
          value_integer: number
        }
        Update: {
          key?: string
          updated_at?: string
          value_integer?: number
        }
        Relationships: []
      }
      professional_applications: {
        Row: {
          admin_notes: string | null
          application_reference: string
          contact_email: string | null
          created_at: string
          education_level: string
          gender: string
          language_skills: Json
          legal_name: string
          preferred_language: string
          professional_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          same_day_bookings: boolean
          spoken_languages: string[]
          status: Database["public"]["Enums"]["professional_application_status"]
          submitted_at: string | null
          terms_accepted_at: string | null
          updated_at: string
          years_experience: number
        }
        Insert: {
          admin_notes?: string | null
          application_reference: string
          contact_email?: string | null
          created_at?: string
          education_level?: string
          gender?: string
          language_skills?: Json
          legal_name: string
          preferred_language?: string
          professional_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          same_day_bookings?: boolean
          spoken_languages?: string[]
          status?: Database["public"]["Enums"]["professional_application_status"]
          submitted_at?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
          years_experience?: number
        }
        Update: {
          admin_notes?: string | null
          application_reference?: string
          contact_email?: string | null
          created_at?: string
          education_level?: string
          gender?: string
          language_skills?: Json
          legal_name?: string
          preferred_language?: string
          professional_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          same_day_bookings?: boolean
          spoken_languages?: string[]
          status?: Database["public"]["Enums"]["professional_application_status"]
          submitted_at?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
          years_experience?: number
        }
        Relationships: [
          {
            foreignKeyName: "professional_applications_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "professional_profiles"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "professional_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      professional_documents: {
        Row: {
          created_at: string
          credential_type: string | null
          id: string
          kind: Database["public"]["Enums"]["professional_document_kind"]
          professional_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["professional_document_status"]
          storage_path: string
        }
        Insert: {
          created_at?: string
          credential_type?: string | null
          id?: string
          kind: Database["public"]["Enums"]["professional_document_kind"]
          professional_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["professional_document_status"]
          storage_path: string
        }
        Update: {
          created_at?: string
          credential_type?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["professional_document_kind"]
          professional_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["professional_document_status"]
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_documents_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "professional_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      professional_earnings: {
        Row: {
          booking_id: string
          commission_amount: number
          created_at: string
          gross_amount: number
          id: string
          net_amount: number
          payout_id: string | null
          professional_id: string
        }
        Insert: {
          booking_id: string
          commission_amount: number
          created_at?: string
          gross_amount: number
          id?: string
          net_amount: number
          payout_id?: string | null
          professional_id: string
        }
        Update: {
          booking_id?: string
          commission_amount?: number
          created_at?: string
          gross_amount?: number
          id?: string
          net_amount?: number
          payout_id?: string | null
          professional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_earnings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_earnings_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payout_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_earnings_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["professional_id"]
          },
        ]
      }
      professional_profiles: {
        Row: {
          approval_status: Database["public"]["Enums"]["professional_application_status"]
          average_rating: number | null
          base_zone_id: string | null
          bio: string
          created_at: string
          display_name: string
          featured: boolean
          female_only_eligible: boolean
          gender: string
          is_available: boolean
          is_hidden: boolean
          portfolio_count: number
          professional_id: string
          review_count: number
          specialty: string
          updated_at: string
        }
        Insert: {
          approval_status?: Database["public"]["Enums"]["professional_application_status"]
          average_rating?: number | null
          base_zone_id?: string | null
          bio?: string
          created_at?: string
          display_name: string
          featured?: boolean
          female_only_eligible?: boolean
          gender?: string
          is_available?: boolean
          is_hidden?: boolean
          portfolio_count?: number
          professional_id: string
          review_count?: number
          specialty: string
          updated_at?: string
        }
        Update: {
          approval_status?: Database["public"]["Enums"]["professional_application_status"]
          average_rating?: number | null
          base_zone_id?: string | null
          bio?: string
          created_at?: string
          display_name?: string
          featured?: boolean
          female_only_eligible?: boolean
          gender?: string
          is_available?: boolean
          is_hidden?: boolean
          portfolio_count?: number
          professional_id?: string
          review_count?: number
          specialty?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_profiles_base_zone_id_fkey"
            columns: ["base_zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_profiles_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      professional_quality_flags: {
        Row: {
          average_rating: number
          booking_id: string
          created_at: string
          id: string
          professional_id: string
          resolution: string
          resolved_at: string | null
          status: string
        }
        Insert: {
          average_rating: number
          booking_id: string
          created_at?: string
          id?: string
          professional_id: string
          resolution?: string
          resolved_at?: string | null
          status?: string
        }
        Update: {
          average_rating?: number
          booking_id?: string
          created_at?: string
          id?: string
          professional_id?: string
          resolution?: string
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_quality_flags_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_quality_flags_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["professional_id"]
          },
        ]
      }
      professional_registration_drafts: {
        Row: {
          draft: Json
          professional_id: string
          revision: number
          updated_at: string
        }
        Insert: {
          draft: Json
          professional_id: string
          revision?: number
          updated_at?: string
        }
        Update: {
          draft?: Json
          professional_id?: string
          revision?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_registration_drafts_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      professional_services: {
        Row: {
          active: boolean
          application_service_reference: string
          category_id: string
          created_at: string
          duration_minutes: number
          id: string
          name: string
          note: string
          popular: boolean
          price: number
          professional_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          application_service_reference: string
          category_id: string
          created_at?: string
          duration_minutes: number
          id?: string
          name: string
          note?: string
          popular?: boolean
          price: number
          professional_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          application_service_reference?: string
          category_id?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          name?: string
          note?: string
          popular?: boolean
          price?: number
          professional_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_services_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["professional_id"]
          },
        ]
      }
      professional_travel_zones: {
        Row: {
          active: boolean
          professional_id: string
          zone_id: string
        }
        Insert: {
          active?: boolean
          professional_id: string
          zone_id: string
        }
        Update: {
          active?: boolean
          professional_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_travel_zones_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "professional_travel_zones_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_working_hours: {
        Row: {
          display_hours: string
          enabled: boolean
          ends_at: string | null
          professional_id: string
          starts_at: string | null
          weekday: number
        }
        Insert: {
          display_hours?: string
          enabled?: boolean
          ends_at?: string | null
          professional_id: string
          starts_at?: string | null
          weekday: number
        }
        Update: {
          display_hours?: string
          enabled?: boolean
          ends_at?: string | null
          professional_id?: string
          starts_at?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "professional_working_hours_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["professional_id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_role: Database["public"]["Enums"]["account_role"]
          created_at: string
          email: string | null
          full_name: string
          onboarding_completed_at: string | null
          phone_number: string | null
          phone_verified_at: string | null
          preferred_language: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_role?: Database["public"]["Enums"]["account_role"]
          created_at?: string
          email?: string | null
          full_name?: string
          onboarding_completed_at?: string | null
          phone_number?: string | null
          phone_verified_at?: string | null
          preferred_language?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_role?: Database["public"]["Enums"]["account_role"]
          created_at?: string
          email?: string | null
          full_name?: string
          onboarding_completed_at?: string | null
          phone_number?: string | null
          phone_verified_at?: string | null
          preferred_language?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      promotions: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string
          discount_percent: number
          ends_at: string
          id: string
          starts_at: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description: string
          discount_percent: number
          ends_at: string
          id?: string
          starts_at: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string
          discount_percent?: number
          ends_at?: string
          id?: string
          starts_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          booking_id: string
          client_id: string
          created_at: string
          id: string
          moderation_status: Database["public"]["Enums"]["review_moderation_status"]
          professional_id: string
          professionalism_rating: number
          review_text: string
          tags: string[]
          technique_rating: number
          updated_at: string
        }
        Insert: {
          booking_id: string
          client_id: string
          created_at?: string
          id?: string
          moderation_status?: Database["public"]["Enums"]["review_moderation_status"]
          professional_id: string
          professionalism_rating: number
          review_text?: string
          tags?: string[]
          technique_rating: number
          updated_at?: string
        }
        Update: {
          booking_id?: string
          client_id?: string
          created_at?: string
          id?: string
          moderation_status?: Database["public"]["Enums"]["review_moderation_status"]
          professional_id?: string
          professionalism_rating?: number
          review_text?: string
          tags?: string[]
          technique_rating?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["professional_id"]
          },
        ]
      }
      safety_incidents: {
        Row: {
          accuracy_meters: number | null
          booking_id: string
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          reported_by_id: string
          reported_by_role: Database["public"]["Enums"]["account_role"]
          resolution: string
          resolved_at: string | null
          status: string
        }
        Insert: {
          accuracy_meters?: number | null
          booking_id: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          reported_by_id: string
          reported_by_role: Database["public"]["Enums"]["account_role"]
          resolution?: string
          resolved_at?: string | null
          status?: string
        }
        Update: {
          accuracy_meters?: number | null
          booking_id?: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          reported_by_id?: string
          reported_by_role?: Database["public"]["Enums"]["account_role"]
          resolution?: string
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_incidents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_reported_by_id_fkey"
            columns: ["reported_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      service_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      zones: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          slug: string
          travel_fee: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          slug: string
          travel_fee?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          slug?: string
          travel_fee?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      audit_client_payment_ledger: {
        Args: { p_client_id: string; p_payment_intent_id: string }
        Returns: Json
      }
      booking_requires_client_identity: {
        Args: { p_client_id: string; p_professional_id: string }
        Returns: boolean
      }
      cancel_client_booking: {
        Args: {
          p_booking_id: string
          p_client_id: string
          p_occurred_at: string
        }
        Returns: string
      }
      claim_domain_events: {
        Args: {
          p_limit: number
          p_locked_until: string
          p_now: string
          p_worker_id: string
        }
        Returns: Json
      }
      claim_due_notification_jobs: {
        Args: { p_limit: number; p_now: string }
        Returns: Json
      }
      commit_booking_payment_intent: {
        Args: {
          p_booking_id: string
          p_client_id: string
          p_occurred_at: string
          p_provider_intent: Json
        }
        Returns: Json
      }
      commit_marketplace_booking: {
        Args: { p_input: Json; p_quote: Json }
        Returns: Json
      }
      complete_client_onboarding: {
        Args: {
          p_address: Json
          p_client_id: string
          p_full_name: string
          p_occurred_at: string
          p_phone_number: string
          p_preferred_language: string
        }
        Returns: Json
      }
      complete_my_client_onboarding: {
        Args: {
          p_address?: Json
          p_full_name: string
          p_preferred_language: string
        }
        Returns: Json
      }
      create_admin_broadcast: {
        Args: {
          p_admin_id: string
          p_audience: string
          p_audit_id: string
          p_broadcast_id: string
          p_message: string
          p_occurred_at: string
        }
        Returns: Json
      }
      create_admin_promotion: {
        Args: {
          p_active: boolean
          p_admin_id: string
          p_audit_id: string
          p_code: string
          p_description: string
          p_discount_percent: number
          p_ends_at: string
          p_occurred_at: string
          p_promotion_id: string
          p_starts_at: string
        }
        Returns: Json
      }
      create_client_address: {
        Args: {
          p_address_id: string
          p_client_id: string
          p_detail: string
          p_label: string
          p_latitude?: number
          p_longitude?: number
          p_make_default: boolean
          p_occurred_at: string
          p_zone: string
        }
        Returns: Json
      }
      decline_professional_booking_request: {
        Args: {
          p_booking_id: string
          p_occurred_at: string
          p_professional_id: string
        }
        Returns: string
      }
      delete_client_address: {
        Args: {
          p_address_id: string
          p_client_id: string
          p_occurred_at: string
        }
        Returns: boolean
      }
      delete_konjo_account: {
        Args: {
          p_occurred_at: string
          p_role: Database["public"]["Enums"]["account_role"]
          p_user_id: string
        }
        Returns: boolean
      }
      enqueue_due_booking_reminders: {
        Args: { p_now: string }
        Returns: number
      }
      enqueue_notification: {
        Args: {
          p_channel: string
          p_idempotency_key: string
          p_now: string
          p_payload: Json
          p_template: string
          p_user_id: string
        }
        Returns: boolean
      }
      find_marketplace_booking_by_request: {
        Args: { p_client_id: string; p_request_id: string }
        Returns: Json
      }
      find_marketplace_zone: { Args: { p_zone: string }; Returns: Json }
      explain_marketplace_booking_quote: { Args: { p_input: Json }; Returns: string }
      get_admin_platform_settings: { Args: never; Returns: Json }
      get_admin_summary: { Args: never; Returns: Json }
      get_booking_payment_context: {
        Args: { p_booking_id: string; p_client_id: string }
        Returns: Json
      }
      get_booking_tracking: {
        Args: { p_booking_id: string; p_user_id: string }
        Returns: Json
      }
      get_client_data: { Args: { p_client_id: string }; Returns: Json }
      get_client_identity_verification: {
        Args: { p_client_id: string }
        Returns: Json
      }
      get_client_payment_intent: {
        Args: { p_client_id: string; p_payment_intent_id: string }
        Returns: Json
      }
      get_marketplace_professional_availability: {
        Args: {
          p_date: string
          p_exclude_booking_id?: string
          p_professional_id: string
          p_service_id?: string
        }
        Returns: Json
      }
      get_my_client_account: { Args: never; Returns: Json }
      get_my_professional_application: { Args: never; Returns: Json }
      get_professional_application: {
        Args: { p_professional_id: string }
        Returns: Json
      }
      get_professional_catalog_settings: {
        Args: { p_professional_id: string }
        Returns: Json
      }
      get_professional_dashboard: {
        Args: { p_earnings_since: string; p_professional_id: string }
        Returns: Json
      }
      list_active_zones: { Args: never; Returns: Json }
      list_admin_audit_logs: { Args: { p_limit: number }; Returns: Json }
      list_admin_bookings: {
        Args: { p_filters: Json; p_limit: number }
        Returns: Json
      }
      list_admin_broadcasts: { Args: never; Returns: Json }
      list_admin_disputes: { Args: never; Returns: Json }
      list_admin_payouts: { Args: never; Returns: Json }
      list_admin_professionals: { Args: never; Returns: Json }
      list_admin_quality_flags: { Args: never; Returns: Json }
      list_admin_revenue_rows: { Args: never; Returns: Json }
      list_admin_safety_incidents: { Args: never; Returns: Json }
      list_admin_zones: { Args: never; Returns: Json }
      list_approved_professional_portfolio_paths: {
        Args: { p_professional_id: string }
        Returns: Json
      }
      list_client_bookings: { Args: { p_client_id: string }; Returns: Json }
      list_client_notifications: {
        Args: { p_client_id: string }
        Returns: Json
      }
      list_failed_domain_events: { Args: { p_limit: number }; Returns: Json }
      list_marketplace_categories: {
        Args: { p_active_only?: boolean }
        Returns: Json
      }
      list_marketplace_professionals: {
        Args: { p_filters: Json; p_today: string }
        Returns: Json
      }
      list_marketplace_professionals_without_qualifications: {
        Args: { p_filters: Json; p_today: string }
        Returns: Json
      }
      list_marketplace_promotions: { Args: never; Returns: Json }
      list_marketplace_zones: { Args: never; Returns: Json }
      list_portfolio_feed: { Args: { p_limit?: number }; Returns: Json }
      list_professional_applications: {
        Args: {
          p_status?: Database["public"]["Enums"]["professional_application_status"]
        }
        Returns: Json
      }
      list_professional_payouts: {
        Args: { p_professional_id: string }
        Returns: Json
      }
      mark_domain_event_processed: {
        Args: {
          p_event_id: string
          p_processed_at: string
          p_worker_id: string
        }
        Returns: boolean
      }
      mark_my_notifications_read: {
        Args: { p_notification_ids: string[] }
        Returns: number
      }
      open_booking_dispute: {
        Args: {
          p_booking_id: string
          p_client_id: string
          p_dispute_id: string
          p_occurred_at: string
          p_reason: string
        }
        Returns: Json
      }
      open_safety_incident: {
        Args: {
          p_accuracy_meters: number
          p_booking_id: string
          p_incident_id: string
          p_latitude: number
          p_longitude: number
          p_occurred_at: string
          p_role: Database["public"]["Enums"]["account_role"]
          p_user_id: string
        }
        Returns: Json
      }
      process_provider_payment_event: {
        Args: {
          p_event_id: string
          p_occurred_at: string
          p_payload_hash: string
          p_provider: Database["public"]["Enums"]["booking_payment_method"]
          p_provider_reference: string
          p_status: Database["public"]["Enums"]["payment_status"]
        }
        Returns: Json
      }
      process_verified_provider_payment_event: {
        Args: {
          p_event_id: string
          p_occurred_at: string
          p_payload_hash: string
          p_provider: Database["public"]["Enums"]["booking_payment_method"]
          p_provider_reference: string
          p_status: Database["public"]["Enums"]["payment_status"]
          p_verified_amount: number
          p_verified_currency: string
        }
        Returns: Json
      }
      queue_professional_payout: {
        Args: {
          p_occurred_at: string
          p_payout_id: string
          p_professional_id: string
        }
        Returns: Json
      }
      quote_marketplace_booking: { Args: { p_input: Json }; Returns: Json }
      reassign_overdue_bookings: { Args: { p_now: string }; Returns: Json }
      record_admin_audit: {
        Args: {
          p_action: string
          p_admin_id: string
          p_audit_id: string
          p_metadata: Json
          p_occurred_at: string
          p_target_id: string
          p_target_type: string
        }
        Returns: undefined
      }
      record_booking_location: {
        Args: {
          p_accuracy_meters: number
          p_booking_id: string
          p_heading: number
          p_latitude: number
          p_longitude: number
          p_professional_id: string
          p_recorded_at: string
          p_speed_mps: number
        }
        Returns: string
      }
      record_client_identity_verification: {
        Args: {
          p_client_id: string
          p_last_four: string
          p_verified_at: string
        }
        Returns: Json
      }
      record_domain_event_failure: {
        Args: {
          p_available_at: string
          p_error_message: string
          p_event_id: string
          p_failed_at: string
          p_terminal: boolean
          p_worker_id: string
        }
        Returns: boolean
      }
      record_notification_delivery: {
        Args: { p_job: Json; p_recorded_at: string; p_result: Json }
        Returns: undefined
      }
      refund_admin_booking: {
        Args: {
          p_admin_id: string
          p_audit_id: string
          p_booking_id: string
          p_occurred_at: string
        }
        Returns: Json
      }
      register_client_device: {
        Args: {
          p_client_id: string
          p_occurred_at: string
          p_platform: string
          p_registration_id: string
          p_token: string
        }
        Returns: Json
      }
      replay_failed_domain_event: {
        Args: { p_admin_id: string; p_event_id: string; p_requested_at: string }
        Returns: string
      }
      reschedule_client_booking: {
        Args: {
          p_booking_id: string
          p_client_id: string
          p_date: string
          p_occurred_at: string
          p_time: string
        }
        Returns: Json
      }
      resolve_booking_dispute: {
        Args: {
          p_admin_id: string
          p_audit_id: string
          p_dispute_id: string
          p_occurred_at: string
          p_resolution: string
          p_status: string
        }
        Returns: Json
      }
      resolve_professional_quality_flag: {
        Args: {
          p_action: string
          p_admin_id: string
          p_audit_id: string
          p_flag_id: string
          p_occurred_at: string
          p_resolution: string
        }
        Returns: Json
      }
      resolve_safety_incident: {
        Args: {
          p_admin_id: string
          p_audit_id: string
          p_incident_id: string
          p_occurred_at: string
          p_resolution: string
        }
        Returns: Json
      }
      review_client_identity_document: {
        Args: {
          p_document_id: string
          p_rejection_reason?: string
          p_status: Database["public"]["Enums"]["professional_document_status"]
        }
        Returns: {
          client_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["client_identity_document_kind"]
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["professional_document_status"]
          storage_path: string
        }
        SetofOptions: {
          from: "*"
          to: "client_identity_documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_professional_application: {
        Args: {
          p_action: string
          p_admin_id: string
          p_occurred_at: string
          p_professional_id: string
          p_reason?: string
        }
        Returns: Json
      }
      review_professional_document: {
        Args: {
          p_document_id: string
          p_rejection_reason?: string
          p_status: Database["public"]["Enums"]["professional_document_status"]
        }
        Returns: {
          created_at: string
          credential_type: string | null
          id: string
          kind: Database["public"]["Enums"]["professional_document_kind"]
          professional_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["professional_document_status"]
          storage_path: string
        }
        SetofOptions: {
          from: "*"
          to: "professional_documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_my_professional_registration_draft: {
        Args: { p_draft: Json; p_expected_revision: number }
        Returns: number
      }
      set_admin_professional_state: {
        Args: {
          p_action: string
          p_admin_id: string
          p_audit_id: string
          p_occurred_at: string
          p_professional_id: string
        }
        Returns: Json
      }
      set_admin_promotion_active: {
        Args: {
          p_active: boolean
          p_admin_id: string
          p_audit_id: string
          p_occurred_at: string
          p_promotion_id: string
        }
        Returns: Json
      }
      set_client_favorite: {
        Args: {
          p_client_id: string
          p_favorite: boolean
          p_occurred_at: string
          p_professional_id: string
        }
        Returns: string
      }
      set_default_client_address: {
        Args: {
          p_address_id: string
          p_client_id: string
          p_occurred_at: string
        }
        Returns: boolean
      }
      set_professional_availability: {
        Args: {
          p_available: boolean
          p_occurred_at: string
          p_professional_id: string
        }
        Returns: boolean
      }
      settle_professional_payout: {
        Args: {
          p_occurred_at: string
          p_payout_id: string
          p_professional_id: string
        }
        Returns: Json
      }
      submit_client_booking_review: {
        Args: {
          p_booking_id: string
          p_client_id: string
          p_occurred_at: string
          p_professionalism_rating: number
          p_review_id: string
          p_review_text: string
          p_tags: string[]
          p_technique_rating: number
        }
        Returns: Json
      }
      submit_my_professional_application: {
        Args: { p_application_reference: string; p_payload: Json }
        Returns: Json
      }
      submit_professional_application: {
        Args: {
          p_application_reference: string
          p_payload: Json
          p_professional_id: string
          p_submitted_at: string
        }
        Returns: Json
      }
      submit_professional_application_without_gender: {
        Args: {
          p_application_reference: string
          p_payload: Json
          p_professional_id: string
          p_submitted_at: string
        }
        Returns: Json
      }
      submit_professional_application_without_qualifications: {
        Args: {
          p_application_reference: string
          p_payload: Json
          p_professional_id: string
          p_submitted_at: string
        }
        Returns: Json
      }
      transition_professional_booking: {
        Args: {
          p_action: string
          p_booking_id: string
          p_occurred_at: string
          p_professional_id: string
          p_travel_fee?: number
        }
        Returns: string
      }
      unregister_client_device: {
        Args: {
          p_client_id: string
          p_occurred_at: string
          p_registration_id: string
        }
        Returns: boolean
      }
      update_admin_commission: {
        Args: {
          p_admin_id: string
          p_audit_id: string
          p_commission_rate_bps: number
          p_occurred_at: string
        }
        Returns: Json
      }
      update_admin_travel_fee_cap: {
        Args: {
          p_admin_id: string
          p_audit_id: string
          p_occurred_at: string
          p_travel_fee_cap: number
        }
        Returns: Json
      }
      update_admin_professional: {
        Args: {
          p_admin_id: string
          p_audit_id: string
          p_featured: boolean
          p_female_only_eligible: boolean
          p_occurred_at: string
          p_professional_id: string
        }
        Returns: Json
      }
      update_client_address: {
        Args: {
          p_address_id: string
          p_client_id: string
          p_detail: string
          p_label: string
          p_latitude?: number
          p_longitude?: number
          p_occurred_at: string
          p_zone: string
        }
        Returns: Json
      }
      update_client_notification_preferences: {
        Args: {
          p_client_id: string
          p_occurred_at: string
          p_preferences: Json
        }
        Returns: Json
      }
      update_client_profile: {
        Args: {
          p_client_id: string
          p_full_name: string
          p_occurred_at: string
          p_phone_number: string
          p_preferred_language: string
        }
        Returns: Json
      }
      update_my_professional_profile: {
        Args: { p_payload: Json }
        Returns: Json
      }
      update_my_professional_profile_without_gender: {
        Args: { p_payload: Json }
        Returns: Json
      }
      update_my_professional_profile_without_qualifications: {
        Args: { p_payload: Json }
        Returns: Json
      }
      update_professional_catalog: {
        Args: {
          p_occurred_at: string
          p_professional_id: string
          p_settings: Json
        }
        Returns: Json
      }
      upsert_admin_service_category: {
        Args: {
          p_active: boolean
          p_admin_id: string
          p_audit_id: string
          p_id: string
          p_name: string
          p_occurred_at: string
          p_slug: string
          p_sort_order: number
        }
        Returns: Json
      }
      upsert_admin_zone: {
        Args: {
          p_active: boolean
          p_admin_id: string
          p_audit_id: string
          p_id: string
          p_label: string
          p_occurred_at: string
          p_travel_fee: number
        }
        Returns: Json
      }
    }
    Enums: {
      account_role: "client" | "professional" | "admin"
      booking_payment_method: "telebirr" | "cbe" | "card" | "cash"
      booking_status:
        | "requested"
        | "accepted"
        | "on_the_way"
        | "in_progress"
        | "completed"
        | "cancelled"
      client_identity_document_kind:
        | "national_id_front"
        | "national_id_back"
        | "passport"
      payment_status:
        | "pending"
        | "authorized"
        | "captured"
        | "cash_due"
        | "cash_collected"
        | "refunded"
        | "failed"
      payout_status: "queued" | "paid" | "failed"
      professional_application_status:
        | "draft"
        | "pending"
        | "approved"
        | "changes_requested"
        | "rejected"
        | "suspended"
      professional_document_kind:
        | "government_id"
        | "selfie"
        | "portfolio"
        | "certificate"
        | "national_id_front"
        | "national_id_back"
      professional_document_status: "pending" | "approved" | "rejected"
      review_moderation_status: "pending" | "published" | "hidden"
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
    Enums: {
      account_role: ["client", "professional", "admin"],
      booking_payment_method: ["telebirr", "cbe", "card", "cash"],
      booking_status: [
        "requested",
        "accepted",
        "on_the_way",
        "in_progress",
        "completed",
        "cancelled",
      ],
      client_identity_document_kind: [
        "national_id_front",
        "national_id_back",
        "passport",
      ],
      payment_status: [
        "pending",
        "authorized",
        "captured",
        "cash_due",
        "cash_collected",
        "refunded",
        "failed",
      ],
      payout_status: ["queued", "paid", "failed"],
      professional_application_status: [
        "draft",
        "pending",
        "approved",
        "changes_requested",
        "rejected",
        "suspended",
      ],
      professional_document_kind: [
        "government_id",
        "selfie",
        "portfolio",
        "certificate",
        "national_id_front",
        "national_id_back",
      ],
      professional_document_status: ["pending", "approved", "rejected"],
      review_moderation_status: ["pending", "published", "hidden"],
    },
  },
} as const
