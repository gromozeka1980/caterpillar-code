-- Trigger to update profile builtin stats when completions change
CREATE OR REPLACE FUNCTION update_profile_builtin_stats()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id UUID;
BEGIN
  target_user_id := COALESCE(NEW.user_id, OLD.user_id);
  UPDATE profiles SET
    builtin_solved = (SELECT COUNT(*) FROM builtin_completions WHERE user_id = target_user_id),
    builtin_stars = (SELECT COALESCE(SUM(stars), 0) FROM builtin_completions WHERE user_id = target_user_id)
  WHERE id = target_user_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_builtin_completion_change ON builtin_completions;
CREATE TRIGGER on_builtin_completion_change
  AFTER INSERT OR UPDATE OR DELETE ON builtin_completions
  FOR EACH ROW EXECUTE FUNCTION update_profile_builtin_stats();
