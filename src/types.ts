export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      group_members: {
        Row: {
          group_id: string;
          id: string;
          joined_at: string;
          user_id: string;
        };
        Insert: {
          group_id: string;
          id?: string;
          joined_at?: string;
          user_id: string;
        };
        Update: {
          group_id?: string;
          id?: string;
          joined_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      groups: {
        Row: {
          created_at: string;
          id: string;
          join_code: string;
          name: string;
          owner_id: string;
          owner_notice_pending: boolean;
        };
        Insert: {
          created_at?: string;
          id?: string;
          join_code?: string;
          name: string;
          owner_id: string;
          owner_notice_pending?: boolean;
        };
        Update: {
          created_at?: string;
          id?: string;
          join_code?: string;
          name?: string;
          owner_id?: string;
          owner_notice_pending?: boolean;
        };
        Relationships: [];
      };
      nicknames: {
        Row: {
          created_at: string;
          nickname: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          nickname: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          nickname?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          p256dh: string;
          user_id: string;
        };
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          p256dh: string;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          p256dh?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      reminder_secret: {
        Row: {
          hash: string;
          id: boolean;
        };
        Insert: {
          hash: string;
          id?: boolean;
        };
        Update: {
          hash?: string;
          id?: boolean;
        };
        Relationships: [];
      };
      task_checkoffs: {
        Row: {
          checked_at: string;
          period: string;
          task_id: string;
          user_id: string;
        };
        Insert: {
          checked_at?: string;
          period: string;
          task_id: string;
          user_id: string;
        };
        Update: {
          checked_at?: string;
          period?: string;
          task_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_checkoffs_task_id_user_id_fkey";
            columns: ["task_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "task_participants";
            referencedColumns: ["task_id", "user_id"];
          },
        ];
      };
      task_participants: {
        Row: {
          joined_at: string;
          task_id: string;
          user_id: string;
        };
        Insert: {
          joined_at?: string;
          task_id: string;
          user_id: string;
        };
        Update: {
          joined_at?: string;
          task_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_participants_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          created_at: string;
          created_by: string;
          group_id: string;
          id: string;
          recurrence: string;
          title: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          group_id: string;
          id?: string;
          recurrence: string;
          title: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          group_id?: string;
          id?: string;
          recurrence?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      task_checkoff_periods: {
        Row: {
          periods: string[] | null;
          task_id: string | null;
          user_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "task_checkoffs_task_id_user_id_fkey";
            columns: ["task_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "task_participants";
            referencedColumns: ["task_id", "user_id"];
          },
        ];
      };
    };
    Functions: {
      check_reminder_secret: { Args: { p_secret: string }; Returns: undefined };
      delete_account: {
        Args: { p_successor?: string; p_user_id: string };
        Returns: undefined;
      };
      delete_own_account: { Args: { p_successor?: string }; Returns: undefined };
      due_reminders: {
        Args: { p_secret: string; p_today: string; p_week: string };
        Returns: {
          auth: string;
          endpoint: string;
          p256dh: string;
          task_names: string[];
        }[];
      };
      is_group_member: { Args: { p_group_id: string }; Returns: boolean };
      join_group: { Args: { p_join_code: string }; Returns: string };
      list_group_members: {
        Args: { p_group_id: string };
        Returns: {
          is_owner: boolean;
          joined_at: string;
          nickname: string;
          user_id: string;
        }[];
      };
      preview_group: { Args: { p_join_code: string }; Returns: string };
      prune_push_subscriptions: {
        Args: { p_endpoints: string[]; p_secret: string };
        Returns: undefined;
      };
      set_nickname: { Args: { p_nickname: string }; Returns: undefined };
      subscribe_push: {
        Args: { p_auth: string; p_endpoint: string; p_p256dh: string };
        Returns: undefined;
      };
      transfer_group_ownership: {
        Args: { p_new_owner: string };
        Returns: undefined;
      };
      transfer_group_ownership_for: {
        Args: { p_new_owner: string; p_owner: string };
        Returns: undefined;
      };
      unsubscribe_all_push: { Args: never; Returns: undefined };
      unsubscribe_push: { Args: { p_endpoint: string }; Returns: undefined };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
