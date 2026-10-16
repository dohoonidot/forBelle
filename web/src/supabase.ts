import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { auth } from "./firebase";

// These are public browser identifiers, not privileged credentials. Keeping a
// known-good fallback prevents GitHub Pages builds from losing the album when
// build-time environment variables are unavailable. Never place a secret or
// service_role key in this client file.
const fallbackSupabaseUrl = "https://lkxlxddaomehnnbiwesg.supabase.co";
const fallbackSupabasePublishableKey = "sb_publishable_R4YsPRtZSjzO3eWvyyFxdQ_yXa2zTxu";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || fallbackSupabaseUrl).trim();
const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || fallbackSupabasePublishableKey).trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl.startsWith("https://") &&
  supabaseKey &&
  !supabaseUrl.includes("YOUR_PROJECT_REF") &&
  !supabaseKey.includes("YOUR_PUBLISHABLE")
);

export const ALBUM_BUCKET = "couple-album";

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      accessToken: async () => auth?.currentUser?.getIdToken(false) ?? null,
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    })
  : null;

