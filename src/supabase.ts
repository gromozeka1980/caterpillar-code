import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

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

export async function initAuth(): Promise<User | null> {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user ?? null;

  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
  });

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
