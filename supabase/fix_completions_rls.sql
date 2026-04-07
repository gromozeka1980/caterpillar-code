-- Allow anyone to read builtin_completions (for shared progress)
DROP POLICY IF EXISTS "Users manage own completions" ON builtin_completions;
CREATE POLICY "Anyone can read completions" ON builtin_completions FOR SELECT USING (true);
CREATE POLICY "Users insert own completions" ON builtin_completions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own completions" ON builtin_completions FOR UPDATE USING (auth.uid() = user_id);
