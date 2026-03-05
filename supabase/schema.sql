-- TeSiMok Database Schema
-- Run this in your Supabase SQL Editor

-- ============================================
-- 1. Questions table (seeded by crop script)
-- ============================================
CREATE TABLE IF NOT EXISTS questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fragment_url TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  options TEXT[] NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_questions_category ON questions(category);

-- ============================================
-- 2. Game sessions table (anti-cheat)
-- ============================================
CREATE TABLE IF NOT EXISTS game_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT now(),
  current_question_idx INTEGER DEFAULT 0,
  score INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  total_answered INTEGER DEFAULT 0,
  question_ids UUID[] NOT NULL,
  question_started_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_game_sessions_user ON game_sessions(user_id);
CREATE INDEX idx_game_sessions_status ON game_sessions(status);

-- ============================================
-- 3. Leaderboard table
-- ============================================
CREATE TABLE IF NOT EXISTS leaderboard (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_leaderboard_score ON leaderboard(score DESC);
CREATE INDEX idx_leaderboard_user ON leaderboard(user_id);
-- Unique constraint to prevent duplicate user entries at database level (run this manually via Supabase CLI/UI later if starting fresh)
-- ALTER TABLE leaderboard ADD CONSTRAINT leaderboard_user_id_key UNIQUE (user_id);

-- ============================================
-- 4. Row Level Security (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;

-- Questions: everyone can read (needed for fragment URLs)
CREATE POLICY "Questions are publicly readable"
  ON questions FOR SELECT
  USING (true);

-- Game sessions: users can only access their own
CREATE POLICY "Users can insert their own sessions"
  ON game_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own sessions"
  ON game_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions"
  ON game_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- Leaderboard: public read, authenticated insert own
CREATE POLICY "Leaderboard is publicly readable"
  ON leaderboard FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own scores"
  ON leaderboard FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 5. Helper function for Edge Functions
-- ============================================
-- Allow service role to update game_sessions (used by Edge Functions)
CREATE OR REPLACE FUNCTION get_random_questions(count INTEGER DEFAULT 10)
RETURNS SETOF questions
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM questions ORDER BY random() LIMIT count;
$$;
