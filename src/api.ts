import { supabase, type CommunityLevel, type Profile, type Solution } from './supabase';

// ——— Levels ———

export type LevelSort = 'newest' | 'top' | 'popular';

export async function fetchLevels(sort: LevelSort = 'newest', limit = 20, offset = 0): Promise<CommunityLevel[]> {
  let query = supabase
    .from('levels')
    .select('*, author:profiles!author_id(id, username, avatar_url)')
    .eq('status', 'active')
    .range(offset, offset + limit - 1);

  switch (sort) {
    case 'newest':
      query = query.order('created_at', { ascending: false });
      break;
    case 'top':
      query = query.order('upvotes', { ascending: false });
      break;
    case 'popular':
      query = query.order('play_count', { ascending: false });
      break;
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as CommunityLevel[];
}

export async function fetchLevel(id: string): Promise<CommunityLevel | null> {
  const { data, error } = await supabase
    .from('levels')
    .select('*, author:profiles!author_id(id, username, avatar_url)')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as CommunityLevel;
}

export async function createLevel(level: {
  title: string;
  expression: string;
  signature: string;
  canonical_signature: string;
  valid_count: number;
  author_best_length: number;
}): Promise<CommunityLevel> {
  const { data, error } = await supabase
    .from('levels')
    .insert(level)
    .select()
    .single();
  if (error) throw error;
  return data as CommunityLevel;
}

export async function incrementPlayCount(levelId: string): Promise<void> {
  await supabase.rpc('increment_play_count', { level_id: levelId });
}

// ——— Solutions ———

export async function submitSolution(levelId: string, expression: string, codeLength: number): Promise<void> {
  const { error } = await supabase
    .from('solutions')
    .upsert(
      { level_id: levelId, expression, code_length: codeLength },
      { onConflict: 'user_id,level_id' }
    );
  if (error) throw error;
}

export async function fetchMySolution(levelId: string): Promise<Solution | null> {
  const { data, error } = await supabase
    .from('solutions')
    .select('*')
    .eq('level_id', levelId)
    .maybeSingle();
  if (error) return null;
  return data as Solution | null;
}

export async function fetchLevelSolveCount(levelId: string): Promise<number> {
  const { count, error } = await supabase
    .from('solutions')
    .select('*', { count: 'exact', head: true })
    .eq('level_id', levelId);
  if (error) return 0;
  return count ?? 0;
}

// ——— Ratings ———

export async function rateLevel(levelId: string, value: 1 | -1): Promise<void> {
  const { error } = await supabase
    .from('ratings')
    .upsert(
      { level_id: levelId, value },
      { onConflict: 'user_id,level_id' }
    );
  if (error) throw error;
}

export async function removeRating(levelId: string): Promise<void> {
  const { error } = await supabase
    .from('ratings')
    .delete()
    .eq('level_id', levelId);
  if (error) throw error;
}

export async function fetchMyRating(levelId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('ratings')
    .select('value')
    .eq('level_id', levelId)
    .maybeSingle();
  if (error || !data) return null;
  return data.value;
}

// ——— Profiles ———

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data as Profile;
}

export async function updateUsername(username: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ username })
    .eq('id', (await supabase.auth.getUser()).data.user?.id);
  if (error) throw error;
}

// ——— Leaderboard ———

export async function fetchLeaderboard(limit = 20): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('builtin_stars', { ascending: false })
    .order('community_solved', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as Profile[];
}

// ——— Sync built-in progress ———

export async function syncBuiltinProgress(
  completions: { level_index: number; stars: number; best_length: number; expression?: string }[]
): Promise<void> {
  if (completions.length === 0) return;
  const { error } = await supabase
    .from('builtin_completions')
    .upsert(completions, { onConflict: 'user_id,level_index' });
  if (error) throw error;
}

// ——— Builtin completions ———

export async function fetchBuiltinCompletions(userId: string): Promise<{ level_index: number; stars: number; best_length: number }[]> {
  const { data, error } = await supabase
    .from('builtin_completions')
    .select('level_index, stars, best_length')
    .eq('user_id', userId);
  if (error) return [];
  return data;
}

// ——— My level count (for auto-naming) ———

export async function fetchMyLevelCount(): Promise<number> {
  const { count, error } = await supabase
    .from('levels')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');
  if (error) return 0;
  return count ?? 0;
}

// ——— Check duplicate canonical signature ———

export async function checkDuplicate(canonicalSignature: string): Promise<CommunityLevel | null> {
  const { data, error } = await supabase
    .from('levels')
    .select('id, title')
    .eq('canonical_signature', canonicalSignature)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as CommunityLevel;
}
