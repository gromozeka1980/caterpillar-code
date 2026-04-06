-- ============================================================
-- Caterpillar Code — Database Schema
-- ============================================================

-- Profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  builtin_solved INT DEFAULT 0,
  builtin_stars INT DEFAULT 0,
  community_solved INT DEFAULT 0,
  levels_created INT DEFAULT 0,
  total_upvotes_received INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'user_name',
      NEW.raw_user_meta_data->>'name',
      'user_' || substr(NEW.id::text, 1, 8)
    ),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Community Levels
-- ============================================================

CREATE TABLE levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 60),
  expression TEXT NOT NULL CHECK (char_length(expression) BETWEEN 3 AND 120),
  signature TEXT NOT NULL,
  canonical_signature TEXT NOT NULL,
  valid_count INT NOT NULL,
  total_count INT NOT NULL DEFAULT 21844,
  upvotes INT DEFAULT 0,
  downvotes INT DEFAULT 0,
  play_count INT DEFAULT 0,
  solve_count INT DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'flagged')),
  author_best_length INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_levels_author ON levels(author_id);
CREATE INDEX idx_levels_created ON levels(created_at DESC);
CREATE INDEX idx_levels_upvotes ON levels(upvotes DESC);
CREATE INDEX idx_levels_canonical ON levels(canonical_signature);
CREATE INDEX idx_levels_status ON levels(status) WHERE status = 'active';

ALTER TABLE levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active levels" ON levels FOR SELECT USING (status = 'active');
CREATE POLICY "Authors can insert own levels" ON levels FOR INSERT WITH CHECK (auth.uid() = author_id);

-- ============================================================
-- Solutions
-- ============================================================

CREATE TABLE solutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE DEFAULT auth.uid(),
  level_id UUID NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  expression TEXT NOT NULL,
  code_length INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, level_id)
);

CREATE INDEX idx_solutions_level ON solutions(level_id);
CREATE INDEX idx_solutions_user ON solutions(user_id);

ALTER TABLE solutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read solutions" ON solutions FOR SELECT USING (true);
CREATE POLICY "Users insert own solutions" ON solutions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own solutions" ON solutions FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- Ratings
-- ============================================================

CREATE TABLE ratings (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE DEFAULT auth.uid(),
  level_id UUID NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  value INT NOT NULL CHECK (value IN (-1, 1)),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, level_id)
);

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read ratings" ON ratings FOR SELECT USING (true);
CREATE POLICY "Users manage own ratings" ON ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own ratings" ON ratings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own ratings" ON ratings FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Built-in Completions (sync localStorage to server)
-- ============================================================

CREATE TABLE builtin_completions (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE DEFAULT auth.uid(),
  level_index INT NOT NULL CHECK (level_index BETWEEN 0 AND 19),
  stars INT NOT NULL CHECK (stars BETWEEN 1 AND 3),
  best_length INT NOT NULL,
  expression TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, level_index)
);

ALTER TABLE builtin_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own completions" ON builtin_completions FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- Triggers for denormalized counters
-- ============================================================

-- Update level upvote/downvote counts on rating change
CREATE OR REPLACE FUNCTION update_level_rating_counts()
RETURNS TRIGGER AS $$
DECLARE
  target_level_id UUID;
BEGIN
  target_level_id := COALESCE(NEW.level_id, OLD.level_id);
  UPDATE levels SET
    upvotes = (SELECT COUNT(*) FROM ratings WHERE level_id = target_level_id AND value = 1),
    downvotes = (SELECT COUNT(*) FROM ratings WHERE level_id = target_level_id AND value = -1),
    updated_at = now()
  WHERE id = target_level_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_rating_change
  AFTER INSERT OR UPDATE OR DELETE ON ratings
  FOR EACH ROW EXECUTE FUNCTION update_level_rating_counts();

-- Update level solve_count on solution insert
CREATE OR REPLACE FUNCTION update_level_solve_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE levels SET
    solve_count = (SELECT COUNT(*) FROM solutions WHERE level_id = NEW.level_id),
    updated_at = now()
  WHERE id = NEW.level_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_solution_insert
  AFTER INSERT ON solutions
  FOR EACH ROW EXECUTE FUNCTION update_level_solve_count();

-- Update profile stats on solution insert
CREATE OR REPLACE FUNCTION update_profile_community_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles SET
    community_solved = (SELECT COUNT(*) FROM solutions WHERE user_id = NEW.user_id)
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_solution_profile_update
  AFTER INSERT ON solutions
  FOR EACH ROW EXECUTE FUNCTION update_profile_community_stats();

-- Update profile stats on level creation
CREATE OR REPLACE FUNCTION update_profile_level_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles SET
    levels_created = (SELECT COUNT(*) FROM levels WHERE author_id = NEW.author_id AND status = 'active')
  WHERE id = NEW.author_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_level_created
  AFTER INSERT ON levels
  FOR EACH ROW EXECUTE FUNCTION update_profile_level_count();

-- Increment play count RPC (avoids race conditions)
CREATE OR REPLACE FUNCTION increment_play_count(level_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE levels SET play_count = play_count + 1 WHERE id = level_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
