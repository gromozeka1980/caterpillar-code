UPDATE profiles SET
  builtin_solved = (SELECT COUNT(*) FROM builtin_completions WHERE user_id = profiles.id),
  builtin_stars = (SELECT COALESCE(SUM(stars), 0) FROM builtin_completions WHERE user_id = profiles.id);
