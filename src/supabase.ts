import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rralgdsnidvmivnxmofv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyYWxnZHNuaWR2bWl2bnhtb2Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTg4ODEsImV4cCI6MjA5MTA3NDg4MX0.3Jc79TFlq4ou7BtKh0Xlo1fC2ruX-5HAM7rUFCFDCOM';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser: User | null = null;

export function getUser(): User | null {
  return currentUser;
}

export function isSignedIn(): boolean {
  return currentUser !== null;
}

export function isSupabaseAvailable(): boolean {
  return supabase !== null;
}

/** Callback to re-render when auth state changes */
let onAuthChange: (() => void) | null = null;

export function setAuthChangeCallback(cb: () => void) {
  onAuthChange = cb;
}

export async function initAuth(): Promise<User | null> {
  if (!supabase) return null;

  // Subscribe to auth changes
  supabase.auth.onAuthStateChange((_event, session) => {
    const wasSignedIn = currentUser !== null;
    currentUser = session?.user ?? null;
    const isNowSignedIn = currentUser !== null;

    // If auth state actually changed, re-render
    if (wasSignedIn !== isNowSignedIn && onAuthChange) {
      onAuthChange();
    }
  });

  // Check for existing session
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user ?? null;

  return currentUser;
}

export async function signInWithGitHub() {
  if (!supabase) return;
  await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
}

export async function signInWithGoogle() {
  if (!supabase) return;
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
  currentUser = null;
}

// ——— Profile types ———

export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  builtin_solved: number;
  builtin_stars: number;
  community_solved: number;
  levels_created: number;
  total_upvotes_received: number;
  created_at: string;
}

export interface CommunityLevel {
  id: string;
  author_id: string;
  title: string;
  expression: string;
  signature: string;
  canonical_signature: string;
  valid_count: number;
  total_count: number;
  upvotes: number;
  downvotes: number;
  play_count: number;
  solve_count: number;
  status: string;
  author_best_length: number;
  created_at: string;
  // Joined fields
  author?: Profile;
}

export interface Solution {
  id: string;
  user_id: string;
  level_id: string;
  expression: string;
  code_length: number;
  created_at: string;
}
