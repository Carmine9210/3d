// Generato dallo schema (supabase/migrations). Rigenera con `npm run db:types` dopo ogni migrazione.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
      addresses: {
        Row: {
          id: string;
          user_id: string;
          full_name: string;
          line1: string;
          line2: string | null;
          city: string;
          postal_code: string;
          province: string | null;
          country: string;
          phone: string | null;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          full_name: string;
          line1: string;
          line2?: string | null;
          city: string;
          postal_code: string;
          province?: string | null;
          country?: string;
          phone?: string | null;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          full_name?: string;
          line1?: string;
          line2?: string | null;
          city?: string;
          postal_code?: string;
          province?: string | null;
          country?: string;
          phone?: string | null;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      app_config: {
        Row: {
          id: string;
          key: string;
          value: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          value: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          value?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          target_type: string | null;
          target_id: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          target_type?: string | null;
          target_id?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string | null;
          action?: string;
          target_type?: string | null;
          target_id?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      cart_items: {
        Row: {
          id: string;
          user_id: string;
          variant_id: string;
          quantity: number;
          customization_text: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          variant_id: string;
          quantity?: number;
          customization_text?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          variant_id?: string;
          quantity?: number;
          customization_text?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "cart_items_variant_id_fkey"; columns: ["variant_id"]; isOneToOne: false; referencedRelation: "product_variants"; referencedColumns: ["id"] },
        ];
      };
      categories: {
        Row: {
          id: string;
          parent_id: string | null;
          slug: string;
          name_it: string;
          name_en: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          parent_id?: string | null;
          slug: string;
          name_it: string;
          name_en: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          parent_id?: string | null;
          slug?: string;
          name_it?: string;
          name_en?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "categories_parent_id_fkey"; columns: ["parent_id"]; isOneToOne: false; referencedRelation: "categories"; referencedColumns: ["id"] },
        ];
      };
      coupons: {
        Row: {
          id: string;
          store_id: string;
          code: string;
          kind: string;
          value: number;
          min_subtotal_cents: number;
          starts_at: string | null;
          expires_at: string | null;
          max_uses: number | null;
          uses: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          code: string;
          kind: string;
          value: number;
          min_subtotal_cents?: number;
          starts_at?: string | null;
          expires_at?: string | null;
          max_uses?: number | null;
          uses?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          code?: string;
          kind?: string;
          value?: number;
          min_subtotal_cents?: number;
          starts_at?: string | null;
          expires_at?: string | null;
          max_uses?: number | null;
          uses?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "coupons_store_id_fkey"; columns: ["store_id"]; isOneToOne: false; referencedRelation: "stores"; referencedColumns: ["id"] },
        ];
      };
      favorites: {
        Row: {
          id: string;
          user_id: string;
          product_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          product_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          product_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "favorites_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] },
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string | null;
          variant_id: string | null;
          title_snapshot: string;
          variant_snapshot: string | null;
          unit_price_cents: number;
          quantity: number;
          customization_text: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id?: string | null;
          variant_id?: string | null;
          title_snapshot: string;
          variant_snapshot?: string | null;
          unit_price_cents: number;
          quantity: number;
          customization_text?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string | null;
          variant_id?: string | null;
          title_snapshot?: string;
          variant_snapshot?: string | null;
          unit_price_cents?: number;
          quantity?: number;
          customization_text?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "order_items_order_id_fkey"; columns: ["order_id"]; isOneToOne: false; referencedRelation: "orders"; referencedColumns: ["id"] },
          { foreignKeyName: "order_items_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] },
          { foreignKeyName: "order_items_variant_id_fkey"; columns: ["variant_id"]; isOneToOne: false; referencedRelation: "product_variants"; referencedColumns: ["id"] },
        ];
      };
      order_messages: {
        Row: {
          id: string;
          order_id: string;
          sender_id: string | null;
          sender_role: string;
          body: string;
          read_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          sender_id?: string | null;
          sender_role: string;
          body: string;
          read_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          sender_id?: string | null;
          sender_role?: string;
          body?: string;
          read_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "order_messages_order_id_fkey"; columns: ["order_id"]; isOneToOne: false; referencedRelation: "orders"; referencedColumns: ["id"] },
        ];
      };
      orders: {
        Row: {
          id: string;
          customer_id: string;
          store_id: string;
          status: Database["public"]["Enums"]["order_status"];
          subtotal_cents: number;
          shipping_cents: number;
          platform_fee_cents: number;
          total_cents: number;
          currency: string;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          shipping_address: Json | null;
          pickup: boolean;
          tracking_code: string | null;
          carrier: string | null;
          paid_at: string | null;
          created_at: string;
          updated_at: string;
          refunded_cents: number;
          pre_dispute_status: Database["public"]["Enums"]["order_status"] | null;
          coupon_id: string | null;
          coupon_code: string | null;
          discount_cents: number;
        };
        Insert: {
          id?: string;
          customer_id: string;
          store_id: string;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal_cents: number;
          shipping_cents?: number;
          platform_fee_cents?: number;
          total_cents: number;
          currency?: string;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          shipping_address?: Json | null;
          pickup?: boolean;
          tracking_code?: string | null;
          carrier?: string | null;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
          refunded_cents?: number;
          pre_dispute_status?: Database["public"]["Enums"]["order_status"] | null;
          coupon_id?: string | null;
          coupon_code?: string | null;
          discount_cents?: number;
        };
        Update: {
          id?: string;
          customer_id?: string;
          store_id?: string;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal_cents?: number;
          shipping_cents?: number;
          platform_fee_cents?: number;
          total_cents?: number;
          currency?: string;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          shipping_address?: Json | null;
          pickup?: boolean;
          tracking_code?: string | null;
          carrier?: string | null;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
          refunded_cents?: number;
          pre_dispute_status?: Database["public"]["Enums"]["order_status"] | null;
          coupon_id?: string | null;
          coupon_code?: string | null;
          discount_cents?: number;
        };
        Relationships: [
          { foreignKeyName: "orders_coupon_id_fkey"; columns: ["coupon_id"]; isOneToOne: false; referencedRelation: "coupons"; referencedColumns: ["id"] },
          { foreignKeyName: "orders_store_id_fkey"; columns: ["store_id"]; isOneToOne: false; referencedRelation: "stores"; referencedColumns: ["id"] },
        ];
      };
      product_images: {
        Row: {
          id: string;
          product_id: string;
          storage_path: string;
          alt: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          storage_path: string;
          alt?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          storage_path?: string;
          alt?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "product_images_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] },
        ];
      };
      product_variants: {
        Row: {
          id: string;
          product_id: string;
          sku: string | null;
          material: string | null;
          color: string | null;
          size: string | null;
          finish: string | null;
          price_delta_cents: number;
          stock: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          sku?: string | null;
          material?: string | null;
          color?: string | null;
          size?: string | null;
          finish?: string | null;
          price_delta_cents?: number;
          stock?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          sku?: string | null;
          material?: string | null;
          color?: string | null;
          size?: string | null;
          finish?: string | null;
          price_delta_cents?: number;
          stock?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "product_variants_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] },
        ];
      };
      product_view_daily: {
        Row: {
          product_id: string;
          day: string;
          views: number;
        };
        Insert: {
          product_id: string;
          day?: string;
          views?: number;
        };
        Update: {
          product_id?: string;
          day?: string;
          views?: number;
        };
        Relationships: [
          { foreignKeyName: "product_view_daily_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] },
        ];
      };
      products: {
        Row: {
          id: string;
          store_id: string;
          category_id: string | null;
          slug: string;
          title_it: string;
          title_en: string;
          description_it: string;
          description_en: string;
          base_price_cents: number;
          currency: string;
          production_days: number;
          is_customizable: boolean;
          customization_note: string | null;
          local_pickup: boolean;
          status: Database["public"]["Enums"]["product_status"];
          avg_rating: number;
          review_count: number;
          search_vector: unknown | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          category_id?: string | null;
          slug: string;
          title_it?: string;
          title_en?: string;
          description_it?: string;
          description_en?: string;
          base_price_cents: number;
          currency?: string;
          production_days?: number;
          is_customizable?: boolean;
          customization_note?: string | null;
          local_pickup?: boolean;
          status?: Database["public"]["Enums"]["product_status"];
          avg_rating?: number;
          review_count?: number;
          search_vector?: unknown | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          category_id?: string | null;
          slug?: string;
          title_it?: string;
          title_en?: string;
          description_it?: string;
          description_en?: string;
          base_price_cents?: number;
          currency?: string;
          production_days?: number;
          is_customizable?: boolean;
          customization_note?: string | null;
          local_pickup?: boolean;
          status?: Database["public"]["Enums"]["product_status"];
          avg_rating?: number;
          review_count?: number;
          search_vector?: unknown | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "products_category_id_fkey"; columns: ["category_id"]; isOneToOne: false; referencedRelation: "categories"; referencedColumns: ["id"] },
          { foreignKeyName: "products_store_id_fkey"; columns: ["store_id"]; isOneToOne: false; referencedRelation: "stores"; referencedColumns: ["id"] },
        ];
      };
      profiles: {
        Row: {
          id: string;
          user_id: string;
          display_name: string;
          role: Database["public"]["Enums"]["user_role"];
          locale: string;
          phone: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          display_name?: string;
          role?: Database["public"]["Enums"]["user_role"];
          locale?: string;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          display_name?: string;
          role?: Database["public"]["Enums"]["user_role"];
          locale?: string;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      rate_limits: {
        Row: {
          key: string;
          count: number;
          reset_at: string;
        };
        Insert: {
          key: string;
          count?: number;
          reset_at: string;
        };
        Update: {
          key?: string;
          count?: number;
          reset_at?: string;
        };
        Relationships: [
        ];
      };
      refund_requests: {
        Row: {
          id: string;
          order_id: string;
          customer_id: string;
          reason: string;
          details: string | null;
          status: Database["public"]["Enums"]["refund_request_status"];
          refund_amount_cents: number | null;
          stripe_refund_id: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          customer_id: string;
          reason: string;
          details?: string | null;
          status?: Database["public"]["Enums"]["refund_request_status"];
          refund_amount_cents?: number | null;
          stripe_refund_id?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          customer_id?: string;
          reason?: string;
          details?: string | null;
          status?: Database["public"]["Enums"]["refund_request_status"];
          refund_amount_cents?: number | null;
          stripe_refund_id?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "refund_requests_order_id_fkey"; columns: ["order_id"]; isOneToOne: false; referencedRelation: "orders"; referencedColumns: ["id"] },
        ];
      };
      reports: {
        Row: {
          id: string;
          reporter_id: string | null;
          target_type: string;
          target_id: string;
          reason: string;
          details: string | null;
          status: Database["public"]["Enums"]["report_status"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          reporter_id?: string | null;
          target_type: string;
          target_id: string;
          reason: string;
          details?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          reporter_id?: string | null;
          target_type?: string;
          target_id?: string;
          reason?: string;
          details?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      reviews: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          store_id: string;
          customer_id: string;
          rating: number;
          comment: string;
          status: string;
          created_at: string;
          updated_at: string;
          seller_reply: string | null;
          seller_replied_at: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          store_id: string;
          customer_id: string;
          rating: number;
          comment?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
          seller_reply?: string | null;
          seller_replied_at?: string | null;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string;
          store_id?: string;
          customer_id?: string;
          rating?: number;
          comment?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
          seller_reply?: string | null;
          seller_replied_at?: string | null;
        };
        Relationships: [
          { foreignKeyName: "reviews_order_id_fkey"; columns: ["order_id"]; isOneToOne: false; referencedRelation: "orders"; referencedColumns: ["id"] },
          { foreignKeyName: "reviews_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] },
          { foreignKeyName: "reviews_store_id_fkey"; columns: ["store_id"]; isOneToOne: false; referencedRelation: "stores"; referencedColumns: ["id"] },
        ];
      };
      store_funnel_daily: {
        Row: {
          store_id: string;
          day: string;
          cart_adds: number;
          checkouts: number;
        };
        Insert: {
          store_id: string;
          day?: string;
          cart_adds?: number;
          checkouts?: number;
        };
        Update: {
          store_id?: string;
          day?: string;
          cart_adds?: number;
          checkouts?: number;
        };
        Relationships: [
          { foreignKeyName: "store_funnel_daily_store_id_fkey"; columns: ["store_id"]; isOneToOne: false; referencedRelation: "stores"; referencedColumns: ["id"] },
        ];
      };
      stores: {
        Row: {
          id: string;
          vendor_id: string;
          slug: string;
          name: string;
          description_it: string;
          description_en: string;
          logo_url: string | null;
          cover_url: string | null;
          city: string | null;
          region: string | null;
          country: string;
          lat: number | null;
          lng: number | null;
          avg_production_days: number | null;
          return_policy: string | null;
          avg_rating: number;
          review_count: number;
          status: Database["public"]["Enums"]["store_status"];
          created_at: string;
          updated_at: string;
          vacation_mode: boolean;
          vacation_message: string | null;
          low_stock_threshold: number;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          slug: string;
          name: string;
          description_it?: string;
          description_en?: string;
          logo_url?: string | null;
          cover_url?: string | null;
          city?: string | null;
          region?: string | null;
          country?: string;
          lat?: number | null;
          lng?: number | null;
          avg_production_days?: number | null;
          return_policy?: string | null;
          avg_rating?: number;
          review_count?: number;
          status?: Database["public"]["Enums"]["store_status"];
          created_at?: string;
          updated_at?: string;
          vacation_mode?: boolean;
          vacation_message?: string | null;
          low_stock_threshold?: number;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          slug?: string;
          name?: string;
          description_it?: string;
          description_en?: string;
          logo_url?: string | null;
          cover_url?: string | null;
          city?: string | null;
          region?: string | null;
          country?: string;
          lat?: number | null;
          lng?: number | null;
          avg_production_days?: number | null;
          return_policy?: string | null;
          avg_rating?: number;
          review_count?: number;
          status?: Database["public"]["Enums"]["store_status"];
          created_at?: string;
          updated_at?: string;
          vacation_mode?: boolean;
          vacation_message?: string | null;
          low_stock_threshold?: number;
        };
        Relationships: [
          { foreignKeyName: "stores_vendor_id_fkey"; columns: ["vendor_id"]; isOneToOne: true; referencedRelation: "vendors"; referencedColumns: ["id"] },
        ];
      };
      stripe_events: {
        Row: {
          id: string;
          event_id: string;
          type: string;
          processed_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          type: string;
          processed_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          type?: string;
          processed_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      vendors: {
        Row: {
          id: string;
          user_id: string;
          type: Database["public"]["Enums"]["vendor_type"];
          status: Database["public"]["Enums"]["vendor_status"];
          stripe_account_id: string | null;
          charges_enabled: boolean;
          payouts_enabled: boolean;
          tax_data: Json;
          commission_bps: number;
          accepted_terms_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type?: Database["public"]["Enums"]["vendor_type"];
          status?: Database["public"]["Enums"]["vendor_status"];
          stripe_account_id?: string | null;
          charges_enabled?: boolean;
          payouts_enabled?: boolean;
          tax_data?: Json;
          commission_bps?: number;
          accepted_terms_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: Database["public"]["Enums"]["vendor_type"];
          status?: Database["public"]["Enums"]["vendor_status"];
          stripe_account_id?: string | null;
          charges_enabled?: boolean;
          payouts_enabled?: boolean;
          tax_data?: Json;
          commission_bps?: number;
          accepted_terms_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      caller_is_privileged: { Args: never; Returns: boolean };
      cleanup_stale: { Args: { p_hours: number }; Returns: number };
      is_admin: { Args: never; Returns: boolean };
      mark_order_paid: { Args: { p_order_id: string; p_payment_intent: string }; Returns: boolean };
      owns_product: { Args: { p_product_id: string }; Returns: boolean };
      owns_store: { Args: { p_store_id: string }; Returns: boolean };
      product_is_public: { Args: { p_product_id: string }; Returns: boolean };
      rate_limit_hit: { Args: { p_key: string; p_limit: number; p_window_seconds: number }; Returns: boolean };
      rate_limit_peek: { Args: { p_key: string; p_limit: number }; Returns: boolean };
      restock_order: { Args: { p_order_id: string }; Returns: undefined };
      seller_has_order_items: { Args: { p_order_id: string }; Returns: boolean };
      track_funnel: { Args: { p_store_id: string; p_event: string; p_n: number }; Returns: undefined };
      track_product_view: { Args: { p_product_id: string }; Returns: undefined };
    };
    Enums: {
      order_status: "pending_payment" | "paid" | "in_production" | "shipped" | "delivered" | "cancelled" | "refunded" | "disputed";
      product_status: "draft" | "pending" | "published" | "suspended";
      refund_request_status: "open" | "approved" | "rejected";
      report_status: "open" | "reviewing" | "resolved" | "dismissed";
      store_status: "active" | "suspended";
      user_role: "customer" | "seller" | "admin";
      vendor_status: "pending" | "active" | "suspended";
      vendor_type: "private" | "professional" | "company";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database['public'];
export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update'];
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];

